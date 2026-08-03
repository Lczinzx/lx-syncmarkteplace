import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_STORAGE_VERSION,
  LEGACY_ACCOUNT_KEYS,
  migrateAccountsStorageV5,
  isLegacyTimestampAccountId,
  filterObsoleteAccountIds,
  extractAccountsFromResponse,
  normalizeAccountFromApi,
  normalizeAccountsFromApi,
  isAccountNotFoundError
} from '../services/account-source.js';
import { StorageService } from '../services/storage.js';

function createMockStore(initial) {
  const data = new Map(Object.entries(initial || {}));
  const order = [];
  for (const k of data.keys()) order.push(k);
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => {
      if (!data.has(k)) order.push(k);
      data.set(k, String(v));
    },
    removeItem: (k) => {
      const idx = order.indexOf(k);
      if (idx !== -1) order.splice(idx, 1);
      data.delete(k);
    },
    key: (i) => order[i] || null,
    get length() {
      return order.length;
    },
    dump: () => Object.fromEntries(data)
  };
}

test('[1] Consulta de origem: acc-shopee-1785758705262 é reconhecido como ID local legado', () => {
  assert.equal(isLegacyTimestampAccountId('acc-shopee-1785758705262'), true);
  assert.equal(isLegacyTimestampAccountId('acc-meli-1700000000000'), true);
  assert.equal(isLegacyTimestampAccountId('acc-shopee-demo'), false);
  assert.equal(isLegacyTimestampAccountId('acc-0a1b2c3d-0000-4000-8000-000000000000'), false);
  assert.equal(isLegacyTimestampAccountId(null), false);
  assert.equal(isLegacyTimestampAccountId(''), false);
});

test('[2] filterObsoleteAccountIds remove IDs legados e preserva reais', () => {
  const list = [
    { id: 'acc-shopee-1785758705262', platform: 'shopee' },
    { id: 'acc-shopee-demo', platform: 'shopee' }
  ];
  const kept = filterObsoleteAccountIds(list);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].id, 'acc-shopee-demo');
  assert.equal(filterObsoleteAccountIds(undefined).length, 0);
});

test('[3] extractAccountsFromResponse: lista vazia/ausente => [], nunca cria DEMO local', () => {
  assert.deepEqual(extractAccountsFromResponse(null), []);
  assert.deepEqual(extractAccountsFromResponse({}), []);
  assert.deepEqual(extractAccountsFromResponse({ accounts: undefined }), []);
  assert.deepEqual(extractAccountsFromResponse({ accounts: [] }), []);
  const raw = extractAccountsFromResponse({ accounts: [{ id: 'acc-shopee-demo', marketplace: 'shopee' }] });
  assert.equal(raw.length, 1);
  assert.equal(raw[0].isDemo, undefined); // nunca é criado no front
});

test('[4] normalizeAccountFromApi: mapeamento completo e isDemo somente quando true', () => {
  const apiAcc = {
    id: 'acc-shopee-demo',
    marketplace: 'shopee',
    accountName: 'Festum Decor',
    sellerId: 'shop-999',
    shopId: 'shop-999',
    externalAccountId: 'ext-999',
    status: 'CONNECTED',
    isDemo: true,
    lastSyncAt: '2026-08-03T10:00:00.000Z'
  };
  const view = normalizeAccountFromApi(apiAcc);
  assert.equal(view.id, 'acc-shopee-demo');
  assert.equal(view.platform, 'shopee');
  assert.equal(view.platformName, 'Shopee');
  assert.equal(view.accountName, 'Festum Decor');
  assert.equal(view.sellerId, 'shop-999');
  assert.equal(view.isDemo, true);
  assert.equal(view.connected, true);

  const real = normalizeAccountFromApi({ id: 'x', marketplace: 'meli', isDemo: false });
  assert.equal(real.isDemo, false);

  const implicit = normalizeAccountFromApi({ id: 'y', marketplace: 'tiktok' }); // sem isDemo
  assert.equal(implicit.isDemo, false);

  assert.equal(normalizeAccountFromApi(null), null);
});

test('[5] Mesma lista normalizada para Dashboard, Canais e Publicador', () => {
  const list = [
    { id: 'acc-shopee-demo', marketplace: 'shopee', accountName: 'Festum Decor', isDemo: true, status: 'CONNECTED' },
    { id: 'acc-meli-x', marketplace: 'meli', accountName: 'Loja ML', status: 'DISCONNECTED' }
  ];
  const normalized = normalizeAccountsFromApi(list);
  assert.equal(normalized.length, 2);
  for (const view of normalized) {
    assert.equal(typeof view.id, 'string');
    assert.equal('id' in view, true);
    assert.equal('platform' in view, true);
    assert.equal('accountName' in view, true);
    assert.equal('isDemo' in view, true);
    assert.equal('connected' in view, true);
  }
  assert.equal(normalized.find(a => a.id === 'acc-meli-x').connected, false);
});

test('[6] StorageService já não rende contas (fonte única: API)', async () => {
  assert.deepEqual(await StorageService.getAccounts(), []);
  assert.equal(await StorageService.getAccountById('acc-shopee-1785758705262'), null);
  assert.equal(await StorageService.addAccount({ platform: 'shopee' }), null);
  assert.equal(await StorageService.saveAccounts([{ id: 'x' }]), true);
});

test('[7] Migração v5 remove chaves legadas e o ID acc-shopee-1785758705262', () => {
  const store = createMockStore({
    lx_storage_version: '4',
    lx_accounts: '[{"id":"acc-shopee-1785758705262","platform":"shopee"}]',
    marketplaceAccounts: '[]',
    selectedAccountId: 'acc-shopee-1785758705262',
    lx_skus: '[]'
  });
  const result = migrateAccountsStorageV5(store);
  assert.equal(result.removedKeys.includes('lx_accounts'), true);
  assert.equal(result.removedKeys.includes('marketplaceAccounts'), true);
  assert.equal(result.removedKeys.includes('selectedAccountId'), true);
  assert.equal(result.removedTimestampIds >= 1, true);
  const after = store.getItem('lx_accounts');
  assert.equal(after, null);
  assert.equal(store.getItem('lx_skus'), '[]'); // SKUs preservados
});

test('[8] Migrate preserva armazenamentos sem contas e com store malformado', () => {
  const store = createMockStore({ lx_storage_version: '4', lx_skus: '[]' });
  const result = migrateAccountsStorageV5(store);
  assert.equal(result.removedKeys.length, 0);
  assert.equal(result.removedTimestampIds, 0);

  const onBadStore = migrateAccountsStorageV5(null);
  assert.deepEqual(onBadStore, { removedKeys: [], removedTimestampIds: 0 });
});

test('[9] Tratamento 404 MARKETPLACE_ACCOUNT_NOT_FOUND é detectado (API/UI)', () => {
  assert.equal(isAccountNotFoundError({ error: { code: 'MARKETPLACE_ACCOUNT_NOT_FOUND' } }), true);
  assert.equal(isAccountNotFoundError({ message: 'Account not found: MARKETPLACE_ACCOUNT_NOT_FOUND' }), true);
  assert.equal(isAccountNotFoundError({ message: 'Falha na importação' }), false);
  assert.equal(isAccountNotFoundError(undefined), false);
  assert.equal(isAccountNotFoundError({ error: { code: 'ACCOUNT_UPDATE_FAILED' } }), false);
});

test('[10] Demo account aparece só se backend enviar isDemo=true (visão/checkbox)', () => {
  const view = normalizeAccountFromApi({ id: 'acc-shopee-demo', marketplace: 'shopee', isDemo: true });
  assert.equal(view.isDemo, true);
  // um conta REAL da API não é marcada como demo
  assert.equal(normalizeAccountFromApi({ id: 'r1', marketplace: 'shopee', isDemo: undefined }).isDemo, false);
  // lista vazia => sem contas locais recriadas
  assert.deepEqual(normalizeAccountsFromApi(extractAccountsFromResponse({ accounts: [] })), []);
});