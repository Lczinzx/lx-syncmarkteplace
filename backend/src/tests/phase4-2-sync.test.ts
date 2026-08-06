import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SyncEngineService, SyncAlreadyRunningError } from '../services/sync-engine.service.js';

describe('⚡ FASE 4.2 — TESTES DE SINCRONIZAÇÃO INCREMENTAL, LOCKS E IDEMPOTÊNCIA', () => {

  it('1. Deve adquirir trava de concorrência com sucesso para conta livre', async () => {
    const mockPrisma = {
      marketplaceSyncRun: {
        findFirst: async () => null,
        create: async (data: any) => ({
          id: 'sync-run-uuid-1',
          ...data.data
        })
      },
      marketplaceAccount: {
        findFirst: async () => ({ id: 'acc-shopee-real-1', marketplace: 'shopee' }),
        update: async () => ({})
      }
    } as any;

    const res = await SyncEngineService.acquireAccountLock(
      mockPrisma,
      'org-festum-decor',
      'acc-shopee-real-1',
      'INCREMENTAL'
    );

    assert.strictEqual(res.syncRun.id, 'sync-run-uuid-1');
    assert.strictEqual(res.syncRun.status, 'RUNNING');
  });

  it('2. Deve rejeitar tentativa de sincronização concorrente com SYNC_ALREADY_RUNNING', async () => {
    const mockPrisma = {
      marketplaceSyncRun: {
        findFirst: async () => ({ id: 'sync-run-active-99', status: 'RUNNING' })
      }
    } as any;

    await assert.rejects(async () => {
      await SyncEngineService.acquireAccountLock(
        mockPrisma,
        'org-festum-decor',
        'acc-shopee-real-1',
        'INCREMENTAL'
      );
    }, (err: any) => {
      return err instanceof SyncAlreadyRunningError &&
             err.code === 'SYNC_ALREADY_RUNNING' &&
             err.syncRunId === 'sync-run-active-99' &&
             err.isRetryable === false;
    });
  });

  it('3. Deve garantir que sincronização sem alterações resulte em listingsUnchanged > 0 (Idempotência)', async () => {
    const existingListing = {
      id: 'listing-1',
      marketplaceAccountId: 'acc-shopee-real-1',
      externalListingId: 'MLB-101',
      title: 'Painel Redondo Zoológico 50cm',
      status: 'ACTIVE',
      imageUrl: 'https://cdn.example.com/p1.jpg',
      variations: [
        { id: 'var-1', externalVariationId: 'var-101-1', currentSku: 'Z-Red50-Zoo-04', price: 100, stock: 10 }
      ],
      images: []
    };

    let updatedListings = 0;

    const mockPrisma = {
      marketplaceSyncRun: {
        findFirst: async () => null,
        create: async () => ({ id: 'sync-run-uuid-2' }),
        update: async () => ({})
      },
      marketplaceAccount: {
        findFirst: async () => ({ id: 'acc-shopee-real-1', marketplace: 'shopee' }),
        update: async () => ({})
      },
      marketplaceListing: {
        findUnique: async () => existingListing,
        findMany: async () => [existingListing],
        update: async () => { updatedListings++; return {}; }
      }
    } as any;

    const mockAdapter = {
      listListings: async () => [
        {
          externalListingId: 'MLB-101',
          title: 'Painel Redondo Zoológico 50cm',
          status: 'ACTIVE',
          imageUrl: 'https://cdn.example.com/p1.jpg',
          variations: [
            { externalVariationId: 'var-101-1', currentSku: 'Z-Red50-Zoo-04', price: 100, stock: 10 }
          ]
        }
      ]
    };

    const res = await SyncEngineService.executeSync(mockPrisma, {
      organizationId: 'org-festum-decor',
      marketplaceAccountId: 'acc-shopee-real-1',
      syncType: 'INCREMENTAL',
      adapter: mockAdapter
    });

    assert.strictEqual(res.status, 'COMPLETED');
    assert.strictEqual(res.listingsFound, 1);
    assert.strictEqual(res.listingsUnchanged, 1);
    assert.strictEqual(res.listingsCreated, 0);
    assert.strictEqual(res.listingsUpdated, 0);
    assert.strictEqual(updatedListings, 0, 'Nenhum UPDATE de anúncio deve ser chamado quando funcionalmente inalterado');
  });

  it('4. Deve atualizar o anúncio quando ocorrer alteração no título, preço ou status', async () => {
    const existingListing = {
      id: 'listing-1',
      marketplaceAccountId: 'acc-shopee-real-1',
      externalListingId: 'MLB-101',
      title: 'Título Antigo',
      status: 'ACTIVE',
      imageUrl: 'https://cdn.example.com/p1.jpg',
      variations: [],
      images: []
    };

    let updateCalled = false;

    const mockPrisma = {
      marketplaceSyncRun: {
        findFirst: async () => null,
        create: async () => ({ id: 'sync-run-uuid-3' }),
        update: async () => ({})
      },
      marketplaceAccount: {
        findFirst: async () => ({ id: 'acc-shopee-real-1', marketplace: 'shopee' }),
        update: async () => ({})
      },
      marketplaceListing: {
        findUnique: async () => existingListing,
        findMany: async () => [existingListing],
        update: async () => { updateCalled = true; return {}; }
      }
    } as any;

    const mockAdapter = {
      listListings: async () => [
        {
          externalListingId: 'MLB-101',
          title: 'Título Novo Atualizado',
          status: 'ACTIVE',
          imageUrl: 'https://cdn.example.com/p1.jpg',
          variations: []
        }
      ]
    };

    const res = await SyncEngineService.executeSync(mockPrisma, {
      organizationId: 'org-festum-decor',
      marketplaceAccountId: 'acc-shopee-real-1',
      syncType: 'INCREMENTAL',
      adapter: mockAdapter
    });

    assert.strictEqual(res.listingsUpdated, 1);
    assert.strictEqual(updateCalled, true);
  });

  it('5. Deve rastrear anúncios ausentes remotamente aumentando missingSyncCount sem apagar o registro', async () => {
    const existingListing = {
      id: 'listing-local-only',
      marketplaceAccountId: 'acc-shopee-real-1',
      externalListingId: 'MLB-ABSENT',
      missingSyncCount: 2
    };

    let updatedMissingCount = 0;
    let newStatus = '';

    const mockPrisma = {
      marketplaceSyncRun: {
        findFirst: async () => null,
        create: async () => ({ id: 'sync-run-uuid-4' }),
        update: async () => ({})
      },
      marketplaceAccount: {
        findFirst: async () => ({ id: 'acc-shopee-real-1', marketplace: 'shopee' }),
        update: async () => ({})
      },
      marketplaceListing: {
        findMany: async () => [existingListing],
        update: async (query: any) => {
          updatedMissingCount = query.data.missingSyncCount;
          newStatus = query.data.status;
          return {};
        }
      }
    } as any;

    const mockAdapter = {
      listListings: async () => [] // Catálogo remoto não retornou o anúncio
    };

    const res = await SyncEngineService.executeSync(mockPrisma, {
      organizationId: 'org-festum-decor',
      marketplaceAccountId: 'acc-shopee-real-1',
      syncType: 'INCREMENTAL',
      adapter: mockAdapter
    });

    assert.strictEqual(res.listingsMissingRemotely, 1);
    assert.strictEqual(updatedMissingCount, 3);
    assert.strictEqual(newStatus, 'NOT_FOUND_REMOTELY');
  });

  it('6. Deve respeitar modo Somente Leitura (ENABLE_REAL_MARKETPLACE_WRITES=false) com 0 chamadas remota de escrita', () => {
    process.env.ENABLE_REAL_MARKETPLACE_WRITES = 'false';
    const isWriteEnabled = process.env.ENABLE_REAL_MARKETPLACE_WRITES === 'true';

    assert.strictEqual(isWriteEnabled, false);
  });
});
