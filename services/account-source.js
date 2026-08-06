/**
 * Account Source - LX Sync Marketplace
 * Fonte ÚNICA de contas de marketplace: GET /api/marketplace-accounts.
 * Nenhum fallback para localStorage/chrome.storage.
 */

export const APP_STORAGE_VERSION = 5;

// Chaves legadas de contas que devem ser removidas na migração v5
export const LEGACY_ACCOUNT_KEYS = [
  'lx_accounts',
  'marketplaceAccounts',
  'connectedAccounts',
  'selectedAccountId',
  'publisherSelectedAccounts',
  'demoAccounts',
  'accounts'
];

/**
 * IDs criados localmente no padrão antigo acc-<marketplace>-<timestamp>
 * (ex: acc-shopee-1785758705262). NUNCA mais usados.
 */
export function isLegacyTimestampAccountId(id) {
  if (!id || typeof id !== 'string') return false;
  return /^acc-[a-z0-9]+-\d{10,}$/i.test(id);
}

/**
 * Remove contas obsoletas de uma lista (IDs com timestamp legado).
 */
export function filterObsoleteAccountIds(accounts) {
  if (!Array.isArray(accounts)) return [];
  return accounts.filter(acc => !isLegacyTimestampAccountId(acc && acc.id));
}

/**
 * Extrai as contas da resposta da API. Lista vazia ou ausente => [].
 * NUNCA recria contas de demonstração localmente.
 */
export function extractAccountsFromResponse(res) {
  if (!res || !Array.isArray(res.accounts)) return [];
  return res.accounts;
}

/**
 * Normaliza a conta vinda do backend (PostgreSQL) para o modelo de exibição
 * usado em dashboard, Canais & APIs e Publicador Multi-Post (mesma lista).
 */
export function normalizeAccountFromApi(acc) {
  if (!acc) return null;
  const rawPlatform = String(acc.marketplace || acc.platform || 'meli').toLowerCase();
  const shopIdVal = acc.shopId || acc.sellerId || acc.externalAccountId || '';
  const maskedShopId = shopIdVal.length > 4 ? `${shopIdVal.slice(0, 3)}****${shopIdVal.slice(-2)}` : shopIdVal;

  return {
    id: acc.id,
    platform: rawPlatform,
    marketplace: rawPlatform,
    platformName: platformLabel(rawPlatform),
    accountName: acc.accountName || acc.sellerName || acc.name || platformLabel(rawPlatform),
    sellerName: acc.accountName || acc.sellerName || acc.name || platformLabel(rawPlatform),
    sellerId: acc.sellerId || acc.shopId || acc.externalAccountId || '',
    shopId: acc.shopId || null,
    shopIdMasked: maskedShopId,
    status: acc.status || 'CONNECTED',
    connected: (acc.status || 'CONNECTED') === 'CONNECTED',
    isDemo: acc.isDemo === true,
    environment: acc.environment || 'sandbox',
    lastAuthorizedAt: acc.lastAuthorizedAt || null,
    lastSyncAt: acc.lastSyncAt || acc.lastSync || null,
    lastImportAt: acc.lastImportAt || null,
    externalAccountId: acc.externalAccountId || null
  };
}

export function normalizeAccountsFromApi(accounts) {
  if (!Array.isArray(accounts)) return [];
  return accounts.map(normalizeAccountFromApi).filter(Boolean);
}

function platformLabel(platform) {
  const labels = {
    meli: 'Mercado Livre',
    shopee: 'Shopee',
    tiktok: 'TikTok Shop',
    amazon: 'Amazon BR'
  };
  return labels[platform] || String(platform || 'Marketplace');
}

/**
 * Detecta o erro de "conta de marketplace não encontrada" retornado
 * pelo backend (GET/POST/PUT/DELETE /api/marketplace-accounts/:id).
 * Usado para o tratamento 404: remover card, recarregar lista e avisar.
 */
export function isAccountNotFoundError(err) {
  if (!err) return false;
  const code = err.code || (err.error && err.error.code) || '';
  const message = err.message || String(err);
  return code === 'MARKETPLACE_ACCOUNT_NOT_FOUND' || message.includes('MARKETPLACE_ACCOUNT_NOT_FOUND');
}

/**
 * Migração v5: remove do armazenamento todas as chaves obsoletas de contas
 * e qualquer cache antigo de lista de contas (inclui IDs acc-<mp>-<timestamp>).
 *
 * @param {object} store - abstração do armazenamento: { getItem, setItem, removeItem, key(index), length }
 * @returns {{ removedKeys: string[], removedTimestampIds: number }}
 */
export function migrateAccountsStorageV5(store) {
  const removedKeys = [];
  let removedTimestampIds = 0;

  if (!store || typeof store.getItem !== 'function' || typeof store.length !== 'number') {
    return { removedKeys, removedTimestampIds };
  }

  // 1. Chaves legadas fixas
  LEGACY_ACCOUNT_KEYS.forEach(key => {
    const raw = store.getItem(key);
    if (raw === null) return;

    const matches = String(raw).match(/acc-[a-z0-9]+-\d{10,}/gi);
    if (matches) {
      removedTimestampIds += matches.length;
    }

    store.removeItem(key);
    removedKeys.push(key);
  });

  // 2. Varredura geral: remove qualquer chave de conta legada
  const keysToScan = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && !removedKeys.includes(k)) keysToScan.push(k);
  }

  keysToScan.forEach(k => {
    const normalized = String(k).toLowerCase();
    const isAccountish =
      normalized.includes('account') ||
      normalized.includes('conta') ||
      normalized.includes('marketplace');
    if (!isAccountish) return;

    const raw = store.getItem(k);
    if (raw === null) return;

    // Conta IDs legados presentes no conteúdo (inclui JSON/arrays)
    const matches = String(raw).match(/acc-[a-z0-9]+-\d{10,}/gi);
    if (matches) {
      removedTimestampIds += matches.length;
    }

    store.removeItem(k);
    removedKeys.push(k);
  });

  return { removedKeys, removedTimestampIds };
}
