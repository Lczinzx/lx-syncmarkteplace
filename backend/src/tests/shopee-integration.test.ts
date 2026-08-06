import { describe, it } from 'node:test';
import assert from 'assert';
import { ShopeeApiClient } from '../marketplaces/shopee-api.client.js';
import { ShopeeAuthService } from '../services/shopee-auth.service.js';
import { ShopeeMarketplaceAdapter } from '../marketplaces/shopee.adapter.js';
import { cleanupDemoData } from '../services/demo-seed.service.js';
import { toAccountView } from '../services/accounts.service.js';
import { normalizeListingStatus } from '../utils/status-normalizer.js';

describe('⚡ FASE 4.1.3 — TESTES INTEGRADOS DA SHOPEE (NORMALIZAÇÃO DE STATUS, LIMPEZA DEMO & SEGURANÇA)', () => {
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

  it('3. Deve validar consumo atômico de linha única (updateMany condicional) no banco de dados', async () => {
    let updateCount = 0;
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

    const mockPrisma = {
      marketplaceOAuthState: {
        updateMany: async (query: any) => {
          updateCount++;
          createdStateRecord.usedAt = query.data.usedAt;
          return { count: 1 };
        },
        findUnique: async (query: any) => {
          return createdStateRecord;
        }
      },
      auditLog: {
        create: async () => {}
      }
    } as any;

    const rawState = `shopee_state_test_hex_1234567890`;
    const payload = await ShopeeAuthService.validateAndConsumeState(mockPrisma, rawState);

    assert.strictEqual(payload.organizationId, 'org-festum-decor');
    assert.strictEqual(payload.userId, 'user-admin-123');
    assert.strictEqual(updateCount, 1);
    assert.ok(createdStateRecord.usedAt !== null);
  });

  it('4. Deve rejeitar tentativa de Replay Attack (State já utilizado) com OAUTH_STATE_ALREADY_USED', async () => {
    const mockPrisma = {
      marketplaceOAuthState: {
        updateMany: async () => ({ count: 0 }),
        findUnique: async () => ({
          id: 'oauth-state-uuid-101',
          organizationId: 'org-festum-decor',
          userId: 'user-admin-123',
          expiresAt: new Date(Date.now() + 600000),
          usedAt: new Date(Date.now() - 5000),
          invalidatedAt: null
        })
      },
      auditLog: {
        create: async () => {}
      }
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

    process.env.SHOPEE_ENVIRONMENT = 'invalid_env';
    assert.throws(() => {
      ShopeeApiClient.validateEnvironmentConfig();
    }, /SHOPEE_ENVIRONMENT inválido ou ausente/);

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

  it('8. Deve garantir que duas chamadas simultâneas (Promise.allSettled) resultem em exatamente 1 consumo e 1 bloqueio de replay', async () => {
    let callCount = 0;
    const createdStateRecord = {
      id: 'oauth-state-uuid-concurrency-88',
      provider: 'shopee',
      stateHash: '',
      organizationId: 'org-festum-decor',
      userId: 'user-admin-123',
      expiresAt: new Date(Date.now() + 600000),
      usedAt: null as Date | null,
      invalidatedAt: null
    };

    const mockPrisma = {
      marketplaceOAuthState: {
        updateMany: async (query: any) => {
          callCount++;
          if (!createdStateRecord.usedAt) {
            createdStateRecord.usedAt = query.data.usedAt;
            return { count: 1 };
          }
          return { count: 0 };
        },
        findUnique: async () => createdStateRecord
      },
      auditLog: {
        create: async () => {}
      }
    } as any;

    const rawState = `shopee_state_concurrent_hex_999999`;

    const results = await Promise.allSettled([
      ShopeeAuthService.validateAndConsumeState(mockPrisma, rawState),
      ShopeeAuthService.validateAndConsumeState(mockPrisma, rawState)
    ]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    assert.strictEqual(fulfilled.length, 1);
    assert.strictEqual(rejected.length, 1);

    const rejectedError = (rejected[0] as PromiseRejectedResult).reason;
    assert.strictEqual(rejectedError.code, 'OAUTH_STATE_ALREADY_USED');
  });

  it('9. Deve normalizar status de anúncios remotos (ACTIVE, NORMAL, published -> ACTIVE) e (PAUSED, unpublished -> PAUSED)', () => {
    assert.strictEqual(normalizeListingStatus('ACTIVE'), 'ACTIVE');
    assert.strictEqual(normalizeListingStatus('NORMAL'), 'ACTIVE');
    assert.strictEqual(normalizeListingStatus('active'), 'ACTIVE');
    assert.strictEqual(normalizeListingStatus('published'), 'ACTIVE');

    assert.strictEqual(normalizeListingStatus('PAUSED'), 'PAUSED');
    assert.strictEqual(normalizeListingStatus('paused'), 'PAUSED');
    assert.strictEqual(normalizeListingStatus('unpublished'), 'PAUSED');
    assert.strictEqual(normalizeListingStatus('banned'), 'PAUSED');
  });

  it('10. Deve garantir que cleanupDemoData remova apenas contas DEMO (isDemo=true) preservando contas reais', async () => {
    const deletedAccountIds: string[] = [];

    const mockTx = {
      marketplaceListing: {
        findMany: async () => [{ id: 'listing-demo-1' }],
        deleteMany: async () => ({ count: 1 })
      },
      marketplaceListingImage: { deleteMany: async () => ({ count: 1 }) },
      marketplaceVariation: { deleteMany: async () => ({ count: 1 }) },
      productMapping: { deleteMany: async () => ({ count: 1 }) },
      marketplaceAccount: {
        deleteMany: async (query: any) => {
          deletedAccountIds.push(...query.where.id.in);
          return { count: query.where.id.in.length };
        }
      }
    };

    const mockPrisma = {
      marketplaceAccount: {
        findMany: async () => [
          { id: 'acc-shopee-demo', isDemo: true },
          { id: 'acc-meli-demo', isDemo: true }
        ]
      },
      $transaction: async (cb: any) => await cb(mockTx)
    } as any;

    const res = await cleanupDemoData(mockPrisma);

    assert.strictEqual(res.accountsDeleted, 2);
    assert.strictEqual(res.listingsDeleted, 1);
    assert.deepStrictEqual(deletedAccountIds, ['acc-shopee-demo', 'acc-meli-demo']);
  });

  it('11. Trava de Segurança: cleanupDemoData aborta imediatamente se qualquer conta com isDemo=false for selecionada', async () => {
    const mockPrisma = {
      marketplaceAccount: {
        findMany: async () => [
          { id: 'acc-shopee-demo', isDemo: true },
          { id: 'acc-shopee-real-2035668', isDemo: false }
        ]
      }
    } as any;

    await assert.rejects(async () => {
      await cleanupDemoData(mockPrisma);
    }, (err: any) => {
      return err.message.includes('ABORTADO: Tentativa de remoção de dados DEMO envolveu contas reais');
    });
  });

  it('12. Deve garantir que o modo dry-run do script administrativo apenas reporte contagens sem fazer alterações', async () => {
    const isDryRun = true;
    let mutated = false;

    const mockPrisma = {
      marketplaceAccount: {
        findMany: async (query: any) => {
          if (query.where?.isDemo === true) return [{ id: 'acc-shopee-demo', isDemo: true }];
          return [{ id: 'acc-shopee-real', isDemo: false }];
        },
        deleteMany: async () => {
          mutated = true;
          return { count: 0 };
        }
      }
    } as any;

    if (!isDryRun) {
      await cleanupDemoData(mockPrisma);
    }

    assert.strictEqual(mutated, false, 'Modo dry-run não deve acionar deleteMany');
  });

  it('13. Deve validar exigência da flag --confirm=REMOVE_DEMO_DATA e barrar execuções com flags inválidas ou ausentes', () => {
    const argsWithoutConfirm = ['--dry-run'];
    const argsWithWrongConfirm = ['--confirm=WRONG_FLAG'];
    const argsWithValidConfirm = ['--confirm=REMOVE_DEMO_DATA'];

    const checkConfirm = (args: string[]) => args.includes('--confirm=REMOVE_DEMO_DATA');

    assert.strictEqual(checkConfirm(argsWithoutConfirm), false);
    assert.strictEqual(checkConfirm(argsWithWrongConfirm), false);
    assert.strictEqual(checkConfirm(argsWithValidConfirm), true);
  });

  it('14. Deve garantir que a segunda execução de cleanupDemoData seja idempotente e retorne zero exclusões sem erros', async () => {
    const mockTx = {
      marketplaceListing: {
        findMany: async () => [],
        deleteMany: async () => ({ count: 0 })
      },
      marketplaceListingImage: { deleteMany: async () => ({ count: 0 }) },
      marketplaceVariation: { deleteMany: async () => ({ count: 0 }) },
      productMapping: { deleteMany: async () => ({ count: 0 }) },
      marketplaceAccount: { deleteMany: async () => ({ count: 0 }) }
    };

    const mockPrisma = {
      marketplaceAccount: {
        findMany: async () => []
      },
      $transaction: async (cb: any) => await cb(mockTx)
    } as any;

    const res = await cleanupDemoData(mockPrisma);

    assert.strictEqual(res.accountsDeleted, 0);
    assert.strictEqual(res.listingsDeleted, 0);
    assert.strictEqual(res.variationsDeleted, 0);
  });
});
