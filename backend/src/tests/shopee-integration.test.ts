import { describe, it } from 'node:test';
import assert from 'assert';
import { ShopeeApiClient } from '../marketplaces/shopee-api.client.js';
import { ShopeeAuthService } from '../services/shopee-auth.service.js';
import { ShopeeMarketplaceAdapter } from '../marketplaces/shopee.adapter.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';

describe('⚡ FASE 4.1 — TESTES INTEGRADOS DA SHOPEE OPEN API V2 (MODO SOMENTE LEITURA)', () => {
  const samplePartnerId = 2005884;
  const samplePartnerKey = 'shopee_test_partner_key_99887766554433221100';

  it('1. Deve gerar assinatura HMAC-SHA256 compatível com o algoritmo da Shopee Open API v2', () => {
    const client = new ShopeeApiClient({ partnerId: samplePartnerId, partnerKey: samplePartnerKey });
    const path = '/api/v2/shop/auth_partner';
    const timestamp = 1700000000;
    const sign = client.generateSign(path, timestamp);

    assert.strictEqual(typeof sign, 'string');
    assert.strictEqual(sign.length, 64); // SHA-256 hex string (64 caracteres)
  });

  it('2. Deve montar a URL de autorização OAuth contendo partner_id, timestamp, sign, redirect e state', () => {
    process.env.SHOPEE_PARTNER_ID = String(samplePartnerId);
    process.env.SHOPEE_PARTNER_KEY = samplePartnerKey;

    const authUrl = ShopeeAuthService.generateAuthorizeUrl('org-festum-decor', 'user-admin-123');

    assert.ok(authUrl.includes('/api/v2/shop/auth_partner'));
    assert.ok(authUrl.includes(`partner_id=${samplePartnerId}`));
    assert.ok(authUrl.includes('timestamp='));
    assert.ok(authUrl.includes('sign='));
    assert.ok(authUrl.includes('state=shopee_state_'));
  });

  it('3. Deve validar state legítimo e rejeitar state inválido, expirado ou reutilizado (CSRF Protection)', () => {
    const stateUrl = ShopeeAuthService.generateAuthorizeUrl('org-festum-decor', 'user-admin-123');
    const stateMatch = stateUrl.match(/state=([^&]+)/);
    assert.ok(stateMatch);

    const rawState = decodeURIComponent(stateMatch[1]);

    // Primeira validação (deve ter sucesso)
    const payload = ShopeeAuthService.validateState(rawState);
    assert.ok(payload);
    assert.strictEqual(payload?.organizationId, 'org-festum-decor');

    // Reutilização imediata (deve falhar por consumo único)
    const replayed = ShopeeAuthService.validateState(rawState);
    assert.strictEqual(replayed, null);

    // State forjado/inválido (deve falhar)
    const invalidState = ShopeeAuthService.validateState('shopee_state_fake_hash_12345');
    assert.strictEqual(invalidState, null);
  });

  it('4. Deve criptografar e descriptografar tokens de acesso e refresh via AES-256-GCM sem expor segredos', () => {
    const accessToken = 'shopee_live_access_token_abc123xyz';
    const encrypted = encryptSecret(accessToken);

    assert.notStrictEqual(encrypted, accessToken);
    assert.ok(!encrypted.includes('shopee_live_access_token_abc123xyz'));

    const decrypted = decryptSecret(encrypted);
    assert.strictEqual(decrypted, accessToken);
  });

  it('5. Deve impedir a instanciação do ShopeeMarketplaceAdapter para contas DEMO', () => {
    const demoAccount = {
      id: 'acc-shopee-demo',
      organizationId: 'org-festum-decor',
      marketplace: 'shopee',
      accountName: 'Festum Decor - Shopee',
      externalAccountId: 'demo-shopee',
      shopId: '2035668',
      sellerId: '2035668',
      status: 'CONNECTED',
      isDemo: true,
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } as any;

    const mockPrisma = {} as any;

    assert.throws(() => {
      new ShopeeMarketplaceAdapter(demoAccount, mockPrisma);
    }, /ShopeeMarketplaceAdapter não pode ser instanciado para contas DEMO/);
  });

  it('6. Deve bloquear todas as tentativas de escrita remota em contas reais quando ENABLE_REAL_MARKETPLACE_WRITES=false', async () => {
    process.env.ENABLE_REAL_MARKETPLACE_WRITES = 'false';

    const realAccount = {
      id: 'acc-shopee-real-99',
      organizationId: 'org-festum-decor',
      marketplace: 'shopee',
      accountName: 'Festum Decor - Shopee Real',
      shopId: '998877',
      isDemo: false,
      status: 'CONNECTED'
    } as any;

    const mockPrisma = {} as any;
    const adapter = new ShopeeMarketplaceAdapter(realAccount, mockPrisma);

    await assert.rejects(async () => {
      await adapter.updateListingSku({ externalListingId: '101', oldSku: 'OLD', newSku: 'NEW', idempotencyKey: 'k1' });
    }, (err: any) => {
      return err.code === 'REAL_MARKETPLACE_WRITES_DISABLED' && err.message.includes('Modo Somente Leitura');
    });

    await assert.rejects(async () => {
      await adapter.updateStock({ externalListingId: '101', newStock: 50 });
    }, (err: any) => {
      return err.code === 'REAL_MARKETPLACE_WRITES_DISABLED';
    });

    await assert.rejects(async () => {
      await adapter.createListing({ title: 'Novo Anúncio', sku: 'SKU', price: 10, stock: 5 });
    }, (err: any) => {
      return err.code === 'REAL_MARKETPLACE_WRITES_DISABLED';
    });
  });

  it('7. Deve verificar capabilities do adapter indicando gravações desativadas em Modo Somente Leitura', async () => {
    process.env.ENABLE_REAL_MARKETPLACE_WRITES = 'false';

    const realAccount = {
      id: 'acc-shopee-real-99',
      organizationId: 'org-festum-decor',
      marketplace: 'shopee',
      shopId: '998877',
      isDemo: false,
      status: 'CONNECTED'
    } as any;

    const adapter = new ShopeeMarketplaceAdapter(realAccount, {} as any);
    const caps = await adapter.getCapabilities();

    assert.strictEqual(caps.canEditListingSku, false);
    assert.strictEqual(caps.canEditVariationSku, false);
    assert.strictEqual(caps.canEditPrice, false);
    assert.strictEqual(caps.canEditStock, false);
  });
});
