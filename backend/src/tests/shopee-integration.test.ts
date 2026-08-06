import { describe, it } from 'node:test';
import assert from 'assert';
import { ShopeeApiClient } from '../marketplaces/shopee-api.client.js';
import { ShopeeAuthService } from '../services/shopee-auth.service.js';
import { ShopeeMarketplaceAdapter } from '../marketplaces/shopee.adapter.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';
import { toAccountView } from '../services/accounts.service.js';

describe('⚡ FASE 4.1.1 — TESTES INTEGRADOS DA SHOPEE (OAUTH DURÁVEL NO POSTGRESQL & SEGURANÇA)', () => {
  const samplePartnerId = 2005884;
  const samplePartnerKey = 'shopee_test_partner_key_99887766554433221100';

  it('1. Deve gerar assinatura HMAC-SHA256 compatível com a Shopee Open API v2', () => {
    const client = new ShopeeApiClient({ partnerId: samplePartnerId, partnerKey: samplePartnerKey });
    const path = '/api/v2/shop/auth_partner';
    const timestamp = 1700000000;
    const sign = client.generateSign(path, timestamp);

    assert.strictEqual(typeof sign, 'string');
    assert.strictEqual(sign.length, 64);
  });

  it('2. Deve montar a URL de autorização OAuth contendo partner_id, timestamp, sign, redirect e state', async () => {
    process.env.SHOPEE_PARTNER_ID = String(samplePartnerId);
    process.env.SHOPEE_PARTNER_KEY = samplePartnerKey;
    process.env.SHOPEE_ENVIRONMENT = 'sandbox';

    const mockPrisma = {
      marketplaceOAuthState: {
        create: async (data: any) => data
      },
      auditLog: {
        create: async (data: any) => data
      }
    } as any;

    const authUrl = await ShopeeAuthService.generateAuthorizeUrl(mockPrisma, 'org-festum-decor', 'user-admin-123');

    assert.ok(authUrl.includes('/api/v2/shop/auth_partner'));
    assert.ok(authUrl.includes(`partner_id=${samplePartnerId}`));
    assert.ok(authUrl.includes('timestamp='));
    assert.ok(authUrl.includes('sign='));
    assert.ok(authUrl.includes('state=shopee_state_'));
  });

  it('3. Deve validar state legítimo e simular resiliência a reinício via consulta ao banco de dados', async () => {
    const createdStateRecord = {
      id: 'oauth-state-uuid-101',
      provider: 'shopee',
      stateHash: '',
      organizationId: 'org-festum-decor',
      userId: 'user-admin-123',
      expiresAt: new Date(Date.now() + 600000),
      usedAt: null,
      invalidatedAt: null
    };

    const mockTxPrisma = {
      marketplaceOAuthState: {
        findUnique: async (query: any) => {
          createdStateRecord.stateHash = query.where.stateHash;
          return createdStateRecord;
        },
        update: async (query: any) => {
          createdStateRecord.usedAt = query.data.usedAt;
          return createdStateRecord;
        }
      },
      auditLog: {
        create: async () => {}
      }
    };

    const mockPrisma = {
      $transaction: async (cb: any) => await cb(mockTxPrisma)
    } as any;

    const rawState = `shopee_state_test_hex_1234567890`;
    const payload = await ShopeeAuthService.validateAndConsumeState(mockPrisma, rawState);

    assert.strictEqual(payload.organizationId, 'org-festum-decor');
    assert.strictEqual(payload.userId, 'user-admin-123');
    assert.ok(createdStateRecord.usedAt !== null); // Confirmar marcação atômica de consumo
  });

  it('4. Deve rejeitar tentativa de Replay Attack (State já utilizado) com OAUTH_STATE_ALREADY_USED', async () => {
    const mockTxPrisma = {
      marketplaceOAuthState: {
        findUnique: async () => ({
          id: 'oauth-state-uuid-101',
          organizationId: 'org-festum-decor',
          userId: 'user-admin-123',
          expiresAt: new Date(Date.now() + 600000),
          usedAt: new Date(Date.now() - 5000), // Já consumido há 5 segundos
          invalidatedAt: null
        })
      },
      auditLog: {
        create: async () => {}
      }
    };

    const mockPrisma = {
      $transaction: async (cb: any) => await cb(mockTxPrisma)
    } as any;

    await assert.rejects(async () => {
      await ShopeeAuthService.validateAndConsumeState(mockPrisma, 'shopee_state_replayed_123');
    }, (err: any) => {
      return err.code === 'OAUTH_STATE_ALREADY_USED';
    });
  });

  it('5. Deve validar estritamente a configuração de ambiente de boot (sandbox vs production)', () => {
    process.env.SHOPEE_ENVIRONMENT = 'sandbox';
    process.env.SHOPEE_PARTNER_ID = '2005884';
    process.env.SHOPEE_PARTNER_KEY = 'key123';
    process.env.SHOPEE_REDIRECT_URL = 'https://lx-sync-api.onrender.com/api/marketplaces/shopee/callback';
    process.env.ENABLE_REAL_MARKETPLACE_WRITES = 'false';

    const validCfg = ShopeeApiClient.validateEnvironmentConfig();
    assert.strictEqual(validCfg.valid, true);
    assert.strictEqual(validCfg.environment, 'sandbox');

    // Testar rejeição de ambiente inválido
    process.env.SHOPEE_ENVIRONMENT = 'invalid_env';
    assert.throws(() => {
      ShopeeApiClient.validateEnvironmentConfig();
    }, /SHOPEE_ENVIRONMENT inválido ou ausente/);

    // Restaurar ambiente sandbox seguro
    process.env.SHOPEE_ENVIRONMENT = 'sandbox';
  });

  it('6. Deve formatar DTO de MarketplaceAccount expondo apenas metadata seguro sem vazar segredos', () => {
    const acc = {
      id: 'acc-shopee-real-123',
      organizationId: 'org-festum-decor',
      marketplace: 'shopee',
      accountName: 'Festum Decor - Shopee Real',
      sellerId: '2035668',
      shopId: '2035668',
      externalAccountId: 'shopee-2035668',
      status: 'CONNECTED' as const,
      isDemo: false,
      accessTokenEncrypted: 'enc_access_token_secret',
      refreshTokenEncrypted: 'enc_refresh_token_secret',
      tokenExpiresAt: new Date(),
      environment: 'sandbox',
      lastAuthorizedAt: new Date(),
      scopesJson: null,
      connectionMetadataJson: null,
      lastSyncAt: new Date(),
      lastImportAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const view = toAccountView(acc);

    assert.strictEqual(view.id, 'acc-shopee-real-123');
    assert.strictEqual(view.isDemo, false);
    assert.strictEqual(view.environment, 'sandbox');
    assert.ok(view.lastAuthorizedAt !== null);

    // Confirmar que tokens criptografados NUNCA aparecem na view
    assert.strictEqual((view as any).accessTokenEncrypted, undefined);
    assert.strictEqual((view as any).refreshTokenEncrypted, undefined);
  });

  it('7. Deve bloquear todas as tentativas de escrita remota em contas reais com REAL_MARKETPLACE_WRITES_DISABLED', async () => {
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

    await assert.rejects(async () => {
      await adapter.updateListingSku({ externalListingId: '101', oldSku: 'OLD', newSku: 'NEW', idempotencyKey: 'k1' });
    }, (err: any) => {
      return err.code === 'REAL_MARKETPLACE_WRITES_DISABLED' && err.message.includes('Modo Somente Leitura');
    });
  });
});
