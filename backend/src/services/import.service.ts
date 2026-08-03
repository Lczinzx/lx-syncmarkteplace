import { FakeMarketplaceAdapter } from '../marketplaces/fake-marketplace.adapter.js';

export interface ListingImportData {
  externalListingId: string;
  externalProductId?: string;
  title: string;
  description?: string;
  imageUrl?: string;
  categoryId?: string;
  status: string;
  listingUrl?: string;
  variations: Array<{
    externalVariationId: string;
    externalModelId?: string;
    variationName: string;
    attributes?: Record<string, string>;
    currentSku: string;
    price: number;
    stock: number;
    status: string;
  }>;
}

export class ImportService {
  /**
   * Executa a importação idempotente de anúncios e variações de uma conta de marketplace
   */
  static async executeImportJob(
    accountConfig: { id: string; organizationId: string; marketplace: string; accountName: string },
    requestedByEmail: string
  ) {
    const jobId = `job-imp-${Date.now()}`;
    const adapter = new FakeMarketplaceAdapter(accountConfig.marketplace, accountConfig.id);

    // Busca anúncios do adapter (MODO DEMONSTRAÇÃO / SIMULADO)
    const listingsRes = await adapter.listListings({ limit: 50 });
    const listingsWithVars: ListingImportData[] = [];

    for (const listing of listingsRes.listings) {
      const vars = await adapter.listVariations(listing.externalListingId);
      listingsWithVars.push({
        ...listing,
        variations: vars
      });
    }

    let createdListings = 0;
    let updatedListings = 0;
    let totalVariations = 0;

    listingsWithVars.forEach(l => {
      totalVariations += l.variations.length;
      createdListings++;
    });

    const summary = {
      jobId,
      organizationId: accountConfig.organizationId,
      accountId: accountConfig.id,
      requestedBy: requestedByEmail,
      status: 'COMPLETED',
      totalListings: listingsWithVars.length,
      processedListings: listingsWithVars.length,
      createdListings,
      updatedListings,
      totalVariations,
      processedVariations: totalVariations,
      listings: listingsWithVars,
      completedAt: new Date().toISOString()
    };

    return summary;
  }
}
