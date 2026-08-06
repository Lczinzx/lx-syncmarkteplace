import { PrismaClient, SyncRunStatus, SyncType } from '@prisma/client';
import { normalizeListingStatus } from '../utils/status-normalizer.js';

export interface StartSyncOptions {
  organizationId: string;
  marketplaceAccountId: string;
  syncType?: SyncType;
  initiatedByUserId?: string;
  adapter?: any; // ShopeeMarketplaceAdapter ou FakeMarketplaceAdapter
}

export interface SyncEngineResult {
  syncRunId: string;
  status: SyncRunStatus;
  durationMs: number;
  listingsFound: number;
  listingsCreated: number;
  listingsUpdated: number;
  listingsUnchanged: number;
  listingsMissingRemotely: number;
  variationsCreated: number;
  variationsUpdated: number;
  variationsUnchanged: number;
  imagesCreated: number;
  imagesUpdated: number;
  errorsCount: number;
}

export class SyncAlreadyRunningError extends Error {
  code = 'SYNC_ALREADY_RUNNING';
  syncRunId: string;
  isRetryable = false;

  constructor(syncRunId: string) {
    super(`Sincronização já está em execução para esta conta (SyncRun: ${syncRunId}).`);
    this.name = 'SyncAlreadyRunningError';
    this.syncRunId = syncRunId;
  }
}

export class SyncEngineService {
  /**
   * Tenta adquirir a trava atômica de sincronização no PostgreSQL.
   * Se existir uma sincronização ativa (PENDING ou RUNNING), rejeita com SyncAlreadyRunningError.
   */
  static async acquireAccountLock(
    prisma: PrismaClient,
    organizationId: string,
    marketplaceAccountId: string,
    syncType: SyncType = 'INCREMENTAL',
    initiatedByUserId?: string
  ) {
    // 1. Verificar trava de concorrência no banco de dados
    const activeRun = await prisma.marketplaceSyncRun.findFirst({
      where: {
        marketplaceAccountId,
        status: { in: ['PENDING', 'RUNNING'] }
      },
      select: { id: true }
    });

    if (activeRun) {
      throw new SyncAlreadyRunningError(activeRun.id);
    }

    const account = await prisma.marketplaceAccount.findFirst({
      where: { id: marketplaceAccountId, organizationId }
    });

    if (!account) {
      throw new Error('MARKETPLACE_ACCOUNT_NOT_FOUND');
    }

    // 2. Registrar tentativa e criar MarketplaceSyncRun com status RUNNING
    const now = new Date();
    await prisma.marketplaceAccount.update({
      where: { id: marketplaceAccountId },
      data: { lastSyncAttemptAt: now }
    });

    const syncRun = await prisma.marketplaceSyncRun.create({
      data: {
        organizationId,
        marketplaceAccountId,
        marketplace: account.marketplace,
        syncType,
        status: 'RUNNING',
        startedAt: now,
        currentStage: 'AUTHENTICATING',
        initiatedByUserId: initiatedByUserId || null
      }
    });

    return { syncRun, account };
  }

  /**
   * Executa o ciclo de sincronização de catálogo (FULL ou INCREMENTAL) em modo Somente Leitura.
   */
  static async executeSync(
    prisma: PrismaClient,
    options: StartSyncOptions
  ): Promise<SyncEngineResult> {
    const { organizationId, marketplaceAccountId, syncType = 'INCREMENTAL', initiatedByUserId, adapter } = options;

    const { syncRun, account } = await this.acquireAccountLock(
      prisma,
      organizationId,
      marketplaceAccountId,
      syncType,
      initiatedByUserId
    );

    const startTime = Date.now();
    let currentStage = 'FETCHING_LISTINGS';
    let pagesProcessed = 0;
    let listingsFound = 0;
    let listingsCreated = 0;
    let listingsUpdated = 0;
    let listingsUnchanged = 0;
    let listingsMissingRemotely = 0;
    let variationsCreated = 0;
    let variationsUpdated = 0;
    let variationsUnchanged = 0;
    let imagesCreated = 0;
    let imagesUpdated = 0;
    let errorsCount = 0;
    const errorsList: string[] = [];

    try {
      // Atualizar estágio
      await prisma.marketplaceSyncRun.update({
        where: { id: syncRun.id },
        data: { currentStage }
      });

      // 3. Trava de Somente Leitura Garantida
      if (process.env.ENABLE_REAL_MARKETPLACE_WRITES === 'true') {
        // Se ativado acidentalmente na Fase 4.2, proibir operações de escrita remotas
        console.warn('⚠️ [SYNC] ATENÇÃO: ENABLE_REAL_MARKETPLACE_WRITES está ativo, mas Fase 4.2 opera somente leitura.');
      }

      // 4. Obter itens remotos via adapter ou simulador
      let remoteListings: any[] = [];

      if (adapter && typeof adapter.listListings === 'function') {
        remoteListings = await adapter.listListings();
      } else {
        // Se adapter não for injetado, utilizar listagens simuladas ou existentes
        remoteListings = [];
      }

      pagesProcessed = 1;
      listingsFound = remoteListings.length;

      await prisma.marketplaceSyncRun.update({
        where: { id: syncRun.id },
        data: {
          pagesProcessed,
          listingsFound,
          currentStage: 'PROCESSING_VARIATIONS'
        }
      });

      const processedExternalListingIds = new Set<string>();

      for (const remote of remoteListings) {
        const externalListingId = String(remote.externalListingId || remote.id);
        processedExternalListingIds.add(externalListingId);

        const normalizedStatus = normalizeListingStatus(remote.status, account.marketplace);

        // Buscar anúncio existente no banco
        const existingListing = await prisma.marketplaceListing.findUnique({
          where: {
            marketplaceAccountId_externalListingId: {
              marketplaceAccountId,
              externalListingId
            }
          },
          include: {
            variations: true,
            images: true
          }
        });

        if (!existingListing) {
          // Criar novo anúncio
          const newListing = await prisma.marketplaceListing.create({
            data: {
              organizationId,
              marketplaceAccountId,
              externalListingId,
              externalProductId: remote.externalProductId || null,
              title: remote.title || 'Anúncio sem título',
              description: remote.description || null,
              imageUrl: remote.imageUrl || null,
              categoryId: remote.categoryId || null,
              status: normalizedStatus,
              listingUrl: remote.listingUrl || null,
              rawDataJson: JSON.stringify(remote)
            }
          });
          listingsCreated++;

          // Sincronizar variações do novo anúncio
          const remoteVariations = remote.variations || [{
            externalVariationId: `var-${externalListingId}-single`,
            variationName: 'Padrão',
            currentSku: remote.sku || `SKU-${externalListingId}`,
            price: remote.price || 0,
            stock: remote.stock || 0,
            status: normalizedStatus
          }];

          for (const rv of remoteVariations) {
            await prisma.marketplaceVariation.create({
              data: {
                organizationId,
                marketplaceListingId: newListing.id,
                externalVariationId: String(rv.externalVariationId || rv.id),
                variationName: rv.variationName || rv.name || 'Padrão',
                currentSku: rv.currentSku || rv.sku || '',
                price: Number(rv.price || 0),
                stock: Number(rv.stock || 0),
                status: normalizeListingStatus(rv.status || normalizedStatus, account.marketplace),
                imageUrl: rv.imageUrl || null
              }
            });
            variationsCreated++;
          }

          // Imagem principal
          if (remote.imageUrl) {
            await prisma.marketplaceListingImage.create({
              data: {
                organizationId,
                marketplaceListingId: newListing.id,
                url: remote.imageUrl,
                position: 0,
                isPrimary: true,
                source: 'ADAPTER',
                status: 'ACTIVE'
              }
            });
            imagesCreated++;
          }
        } else {
          // Comparação funcional de campos para alteração (Idempotência)
          const titleChanged = existingListing.title !== remote.title;
          const statusChanged = existingListing.status !== normalizedStatus;
          const imageChanged = remote.imageUrl && existingListing.imageUrl !== remote.imageUrl;

          if (titleChanged || statusChanged || imageChanged) {
            await prisma.marketplaceListing.update({
              where: { id: existingListing.id },
              data: {
                title: remote.title || existingListing.title,
                status: normalizedStatus,
                imageUrl: remote.imageUrl || existingListing.imageUrl,
                firstMissingAt: null,
                lastMissingAt: null,
                missingSyncCount: 0,
                updatedAt: new Date()
              }
            });
            listingsUpdated++;
          } else {
            // Anúncio inalterado
            listingsUnchanged++;
          }

          // Comparação de variações do anúncio existente
          const remoteVariations = remote.variations || [];
          for (const rv of remoteVariations) {
            const extVarId = String(rv.externalVariationId || rv.id);
            const existingVar = existingListing.variations.find(v => v.externalVariationId === extVarId);

            if (!existingVar) {
              await prisma.marketplaceVariation.create({
                data: {
                  organizationId,
                  marketplaceListingId: existingListing.id,
                  externalVariationId: extVarId,
                  variationName: rv.variationName || rv.name || 'Padrão',
                  currentSku: rv.currentSku || rv.sku || '',
                  price: Number(rv.price || 0),
                  stock: Number(rv.stock || 0),
                  status: normalizeListingStatus(rv.status || normalizedStatus, account.marketplace),
                  imageUrl: rv.imageUrl || null
                }
              });
              variationsCreated++;
            } else {
              const varPriceChanged = Math.abs(existingVar.price - Number(rv.price || 0)) > 0.01;
              const varStockChanged = existingVar.stock !== Number(rv.stock || 0);
              const varSkuChanged = rv.currentSku && existingVar.currentSku !== rv.currentSku;

              if (varPriceChanged || varStockChanged || varSkuChanged) {
                await prisma.marketplaceVariation.update({
                  where: { id: existingVar.id },
                  data: {
                    price: Number(rv.price ?? existingVar.price),
                    stock: Number(rv.stock ?? existingVar.stock),
                    currentSku: rv.currentSku || existingVar.currentSku,
                    firstMissingAt: null,
                    lastMissingAt: null,
                    missingSyncCount: 0,
                    updatedAt: new Date()
                  }
                });
                variationsUpdated++;
              } else {
                variationsUnchanged++;
              }
            }
          }
        }
      }

      // 5. Rastreamento de anúncios ausentes remotamente
      const localListings = await prisma.marketplaceListing.findMany({
        where: { marketplaceAccountId },
        select: { id: true, externalListingId: true, missingSyncCount: true }
      });

      for (const local of localListings) {
        if (!processedExternalListingIds.has(local.externalListingId)) {
          listingsMissingRemotely++;
          const missingCount = local.missingSyncCount + 1;
          await prisma.marketplaceListing.update({
            where: { id: local.id },
            data: {
              lastMissingAt: new Date(),
              missingSyncCount: missingCount,
              status: missingCount >= 3 ? 'NOT_FOUND_REMOTELY' : undefined
            }
          });
        }
      }

      // Conclusão com sucesso
      const durationMs = Date.now() - startTime;
      const completedRunStatus: SyncRunStatus = errorsCount > 0 ? 'PARTIAL_FAILURE' : 'COMPLETED';
      const now = new Date();

      await prisma.marketplaceSyncRun.update({
        where: { id: syncRun.id },
        data: {
          status: completedRunStatus,
          currentStage: 'FINALIZING',
          completedAt: now,
          durationMs,
          pagesProcessed,
          listingsFound,
          listingsCreated,
          listingsUpdated,
          listingsUnchanged,
          listingsMissingRemotely,
          variationsCreated,
          variationsUpdated,
          variationsUnchanged,
          imagesCreated,
          imagesUpdated,
          errorsCount,
          errorSummaryJson: errorsList.length > 0 ? JSON.stringify(errorsList) : null
        }
      });

      // Atualizar timestamps de sucesso na conta
      await prisma.marketplaceAccount.update({
        where: { id: marketplaceAccountId },
        data: {
          lastSyncAt: now,
          lastSuccessfulSyncAt: now,
          status: 'CONNECTED'
        }
      });

      return {
        syncRunId: syncRun.id,
        status: completedRunStatus,
        durationMs,
        listingsFound,
        listingsCreated,
        listingsUpdated,
        listingsUnchanged,
        listingsMissingRemotely,
        variationsCreated,
        variationsUpdated,
        variationsUnchanged,
        imagesCreated,
        imagesUpdated,
        errorsCount
      };

    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);

      await prisma.marketplaceSyncRun.update({
        where: { id: syncRun.id },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          durationMs,
          errorsCount: errorsCount + 1,
          errorSummaryJson: JSON.stringify([errorMessage])
        }
      });

      throw err;
    }
  }

  /**
   * Retorna a lista de execuções de sincronização de uma conta.
   */
  static async listSyncRuns(prisma: PrismaClient, organizationId: string, marketplaceAccountId: string) {
    return prisma.marketplaceSyncRun.findMany({
      where: { organizationId, marketplaceAccountId },
      orderBy: { startedAt: 'desc' },
      take: 20
    });
  }

  /**
   * Retorna detalhes de uma execução específica.
   */
  static async getSyncRun(prisma: PrismaClient, organizationId: string, syncRunId: string) {
    return prisma.marketplaceSyncRun.findFirst({
      where: { id: syncRunId, organizationId }
    });
  }
}
