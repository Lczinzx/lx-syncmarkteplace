import { PrismaClient } from '@prisma/client';
import { FakeMarketplaceAdapter } from '../marketplaces/fake-marketplace.adapter.js';
import { MarketplaceAdapter } from '../marketplaces/marketplace-adapter.interface.js';

export interface ImportAccountConfig {
  id: string;
  organizationId: string;
  marketplace: string;
  accountName: string;
}

export interface ImportJobSummary {
  jobId: string;
  accountId: string;
  organizationId: string;
  requestedBy: string;
  status: string;
  totalListings: number;
  processedListings: number;
  createdListings: number;
  updatedListings: number;
  totalVariations: number;
  processedVariations: number;
  listings: Array<Record<string, unknown>>;
  completedAt: string;
  message: string;
}

/**
 * Executa a importação idempotente de anúncios e variações de uma conta de
 * marketplace (FakeMarketplaceAdapter em modo demonstração) e PERSISTE no
 * PostgreSQL: ImportJob, MarketplaceListing e MarketplaceVariation (upsert).
 */
export class ImportService {
  static async executeImportJob(
    client: PrismaClient,
    accountConfig: ImportAccountConfig,
    requestedByEmail: string,
    adapterOverride?: MarketplaceAdapter
  ): Promise<ImportJobSummary> {
    const jobId = `job-imp-${Date.now()}`;
    const adapter = adapterOverride || new FakeMarketplaceAdapter(accountConfig.marketplace, accountConfig.id);

    // 1. Busca anúncios e variações no adapter (MODO DEMONSTRAÇÃO)
    const listingsRes = await adapter.listListings({ limit: 100 });
    const listingsWithVars: Array<Record<string, unknown>> = [];

    for (const listing of listingsRes.listings) {
      const vars = await adapter.listVariations(listing.externalListingId);
      listingsWithVars.push({ ...listing, variations: vars });
    }

    // 2. Persistência idempotente (upsert por marketplaceAccountId + externalListingId)
    let createdListings = 0;
    let updatedListings = 0;
    let totalVariations = 0;

    for (const listing of listingsWithVars) {
      const externalListingId = listing.externalListingId as string;
      const existing = await client.marketplaceListing.findFirst({
        where: { marketplaceAccountId: accountConfig.id, externalListingId }
      });

      const persistedListing = await client.marketplaceListing.upsert({
        where: {
          marketplaceAccountId_externalListingId: {
            marketplaceAccountId: accountConfig.id,
            externalListingId
          }
        },
        update: {
          title: listing.title as string,
          description: (listing.description as string) || null,
          imageUrl: (listing.imageUrl as string) || null,
          categoryId: (listing.categoryId as string) || null,
          status: (listing.status as string) || 'ACTIVE',
          listingUrl: (listing.listingUrl as string) || null,
          updatedAt: new Date()
        },
        create: {
          id: `list-${accountConfig.id}-${externalListingId}`,
          organizationId: accountConfig.organizationId,
          marketplaceAccountId: accountConfig.id,
          externalListingId,
          externalProductId: (listing.externalProductId as string) || null,
          title: listing.title as string,
          description: (listing.description as string) || null,
          imageUrl: (listing.imageUrl as string) || null,
          categoryId: (listing.categoryId as string) || null,
          status: (listing.status as string) || 'ACTIVE',
          listingUrl: (listing.listingUrl as string) || null
        }
      });

      if (existing) {
        updatedListings++;
      } else {
        createdListings++;
      }

      const variations = (listing.variations as Array<Record<string, unknown>>) || [];
      for (const v of variations) {
        const externalVariationId = v.externalVariationId as string;
        await client.marketplaceVariation.upsert({
          where: {
            marketplaceListingId_externalVariationId: {
              marketplaceListingId: persistedListing.id,
              externalVariationId
            }
          },
          update: {
            variationName: v.variationName as string,
            currentSku: v.currentSku as string,
            price: Number(v.price),
            stock: Number(v.stock),
            status: (v.status as string) || 'ACTIVE',
            imageUrl: (v.imageUrl as string) || null,
            updatedAt: new Date()
          },
          create: {
            id: `var-${persistedListing.id}-${externalVariationId}`,
            organizationId: accountConfig.organizationId,
            marketplaceListingId: persistedListing.id,
            externalVariationId,
            variationName: v.variationName as string,
            currentSku: v.currentSku as string,
            price: Number(v.price),
            stock: Number(v.stock),
            status: (v.status as string) || 'ACTIVE',
            imageUrl: (v.imageUrl as string) || null
          }
        });
        totalVariations++;
      }
    }

    const completedAt = new Date();

    // 3. Registro do ImportJob no PostgreSQL
    const importJob = await client.importJob.create({
      data: {
        organizationId: accountConfig.organizationId,
        marketplaceAccountId: accountConfig.id,
        requestedBy: requestedByEmail,
        status: 'COMPLETED',
        totalListings: listingsWithVars.length,
        processedListings: listingsWithVars.length,
        totalVariations,
        processedVariations: totalVariations,
        createdListings,
        updatedListings,
        failedListings: 0,
        startedAt: completedAt,
        completedAt
      }
    });

    // 4. Audit log
    await client.auditLog.create({
      data: {
        organizationId: accountConfig.organizationId,
        userId: null,
        action: 'IMPORT_LISTINGS',
        resourceType: 'MARKETPLACE_ACCOUNT',
        resourceId: accountConfig.id,
        marketplace: accountConfig.marketplace,
        marketplaceAccountId: accountConfig.id,
        status: 'SUCCESS'
      }
    });

    // 5. Atualiza lastImportAt da conta
    await client.marketplaceAccount.update({
      where: { id: accountConfig.id },
      data: { lastImportAt: completedAt, lastSyncAt: completedAt }
    });

    return {
      jobId: importJob.id,
      accountId: accountConfig.id,
      organizationId: accountConfig.organizationId,
      requestedBy: requestedByEmail,
      status: 'COMPLETED',
      totalListings: listingsWithVars.length,
      processedListings: listingsWithVars.length,
      createdListings,
      updatedListings,
      totalVariations,
      processedVariations: totalVariations,
      listings: listingsWithVars,
      completedAt: completedAt.toISOString(),
      message: `Importação concluída: ${createdListings} anúncios criados, ${updatedListings} atualizados e ${totalVariations} variações sincronizadas.`
    };
  }
}
