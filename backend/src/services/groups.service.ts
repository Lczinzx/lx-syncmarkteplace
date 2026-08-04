import { PrismaClient } from '@prisma/client';
import { calculateMatchConfidence } from './matching.service.js';

export interface GroupedProductView {
  id: string;
  masterSku: string;
  name: string;
  category?: string;
  totalStock: number;
  marketplacesCount: number;
  listingsCount: number;
  variationsCount: number;
  priceMin: number;
  priceMax: number;
  hasPriceDivergence: boolean;
  hasStockDivergence: boolean;
  hasTitleDivergence: boolean;
  hasSkuDivergence: boolean;
  divergences: string[];
  listings: Array<{
    id: string;
    externalListingId: string;
    title: string;
    marketplace: string;
    accountName: string;
    status: string;
    confidenceScore: number;
    confirmedByUser: boolean;
    variations: Array<{
      id: string;
      externalVariationId: string;
      variationName: string;
      sku: string;
      price: number;
      stock: number;
      status: string;
    }>;
  }>;
}

export interface PendingMatchView {
  mappingId: string;
  confidenceScore: number;
  matchStatus: string;
  reason: string;
  compatibilities: string[];
  divergences: string[];
  masterProduct: {
    id: string;
    masterSku: string;
    name: string;
  };
  listing: {
    id: string;
    externalListingId: string;
    title: string;
    marketplace: string;
    accountName: string;
  };
  variation?: {
    id: string;
    variationName: string;
    sku: string;
  };
}

export class GroupsService {
  /**
   * Retorna os produtos agrupados da organização com cálculo de divergências e anúncios vinculados.
   */
  static async listGroupedProducts(client: PrismaClient, organizationId: string, filters?: { search?: string; marketplace?: string; status?: string }): Promise<{ groupedProducts: GroupedProductView[]; totalCount: number }> {
    const masterProducts = await client.masterProduct.findMany({
      where: { organizationId },
      include: {
        inventory: true,
        mappings: {
          include: {
            account: true,
            listing: {
              include: {
                variations: true
              }
            },
            variation: true
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    const groupedProducts: GroupedProductView[] = [];

    for (const mp of masterProducts) {
      const confirmedMappings = mp.mappings.filter(m => m.confirmedByUser !== false);

      const listingsMap = new Map<string, any>();
      const marketplacesSet = new Set<string>();
      const prices: number[] = [];
      const stocks: number[] = [];
      const titlesSet = new Set<string>();
      const skusSet = new Set<string>();
      const divergences: string[] = [];

      for (const mapItem of confirmedMappings) {
        if (!mapItem.listing) continue;
        const listing = mapItem.listing;
        const account = mapItem.account;
        marketplacesSet.add(account.marketplace);
        titlesSet.add(listing.title);

        const varsList = listing.variations.map(v => {
          if (v.price) prices.push(v.price);
          stocks.push(v.stock);
          if (v.currentSku) skusSet.add(v.currentSku);
          return {
            id: v.id,
            externalVariationId: v.externalVariationId,
            variationName: v.variationName,
            sku: v.currentSku,
            price: v.price,
            stock: v.stock,
            status: v.status
          };
        });

        listingsMap.set(listing.id, {
          id: listing.id,
          externalListingId: listing.externalListingId,
          title: listing.title,
          marketplace: account.marketplace,
          accountName: account.accountName,
          status: listing.status,
          confidenceScore: mapItem.confidenceScore || 1.0,
          confirmedByUser: mapItem.confirmedByUser,
          variations: varsList
        });
      }

      const listings = Array.from(listingsMap.values());
      const variationsCount = listings.reduce((sum, l) => sum + l.variations.length, 0);

      const priceMin = prices.length > 0 ? Math.min(...prices) : 0;
      const priceMax = prices.length > 0 ? Math.max(...prices) : 0;
      const hasPriceDivergence = prices.length > 1 && priceMin !== priceMax;
      if (hasPriceDivergence) {
        divergences.push(`Divergência de preço entre canais: R$ ${priceMin.toFixed(2)} vs R$ ${priceMax.toFixed(2)}`);
      }

      const totalStock = mp.inventory ? mp.inventory.totalStock : stocks.reduce((a, b) => a + b, 0);
      const hasTitleDivergence = titlesSet.size > 1;
      if (hasTitleDivergence) {
        divergences.push(`Títulos divergentes entre marketplaces (${titlesSet.size} variações)`);
      }

      const hasSkuDivergence = skusSet.size > 1;
      if (hasSkuDivergence) {
        divergences.push(`SKUs divergentes (${Array.from(skusSet).join(', ')})`);
      }

      // Aplica filtros se passados
      let matchesSearch = true;
      if (filters?.search) {
        const s = filters.search.toLowerCase();
        matchesSearch = mp.name.toLowerCase().includes(s) ||
          mp.masterSku.toLowerCase().includes(s) ||
          listings.some(l => l.title.toLowerCase().includes(s) || l.externalListingId.toLowerCase().includes(s));
      }

      let matchesMarketplace = true;
      if (filters?.marketplace && filters.marketplace !== 'all') {
        matchesMarketplace = listings.some(l => l.marketplace === filters.marketplace);
      }

      if (matchesSearch && matchesMarketplace) {
        groupedProducts.push({
          id: mp.id,
          masterSku: mp.masterSku,
          name: mp.name,
          category: mp.productType || 'Geral',
          totalStock,
          marketplacesCount: marketplacesSet.size,
          listingsCount: listings.length,
          variationsCount,
          priceMin,
          priceMax,
          hasPriceDivergence,
          hasStockDivergence: false,
          hasTitleDivergence,
          hasSkuDivergence,
          divergences,
          listings
        });
      }
    }

    return {
      groupedProducts,
      totalCount: groupedProducts.length
    };
  }

  /**
   * Retorna os vínculos pendentes de confirmação (confiança entre 70% e 89% ou sugestões de IA).
   */
  static async getPendingMatches(client: PrismaClient, organizationId: string): Promise<PendingMatchView[]> {
    const pendingMappings = await client.productMapping.findMany({
      where: {
        organizationId,
        confirmedByUser: false
      },
      include: {
        masterProduct: true,
        account: true,
        listing: true,
        variation: true
      }
    });

    return pendingMappings.map(m => {
      const matchEval = calculateMatchConfidence(
        { sku: m.masterProduct.masterSku, title: m.masterProduct.name },
        { sku: m.currentMarketplaceSku, title: m.listing.title }
      );

      return {
        mappingId: m.id,
        confidenceScore: m.confidenceScore || matchEval.confidenceScore,
        matchStatus: m.mappingType || 'SUGGESTED',
        reason: matchEval.reason,
        compatibilities: matchEval.compatibilities,
        divergences: matchEval.divergences,
        masterProduct: {
          id: m.masterProduct.id,
          masterSku: m.masterProduct.masterSku,
          name: m.masterProduct.name
        },
        listing: {
          id: m.listing.id,
          externalListingId: m.listing.externalListingId,
          title: m.listing.title,
          marketplace: m.account.marketplace,
          accountName: m.account.accountName
        },
        variation: m.variation ? {
          id: m.variation.id,
          variationName: m.variation.variationName,
          sku: m.variation.currentSku
        } : undefined
      };
    });
  }

  /**
   * Confirma manualmente um vínculo sugerido pelo MatchingService.
   */
  static async confirmMapping(client: PrismaClient, mappingId: string): Promise<boolean> {
    await client.productMapping.update({
      where: { id: mappingId },
      data: { confirmedByUser: true, mappingType: 'MANUAL_CONFIRMED', updatedAt: new Date() }
    });
    return true;
  }

  /**
   * Rejeita um vínculo de sugestão.
   */
  static async rejectMapping(client: PrismaClient, mappingId: string): Promise<boolean> {
    await client.productMapping.delete({
      where: { id: mappingId }
    });
    return true;
  }

  /**
   * Cria um vínculo manual entre um MasterProduct e um anúncio.
   */
  static async linkListing(client: PrismaClient, organizationId: string, masterProductId: string, marketplaceListingId: string): Promise<boolean> {
    const listing = await client.marketplaceListing.findUnique({
      where: { id: marketplaceListingId },
      include: { account: true, variations: true }
    });
    if (!listing) throw new Error('Anúncio não encontrado.');

    await client.productMapping.upsert({
      where: { id: `map-${masterProductId}-${listing.id}` },
      update: { confirmedByUser: true, mappingType: 'MANUAL', updatedAt: new Date() },
      create: {
        id: `map-${masterProductId}-${listing.id}`,
        organizationId,
        masterProductId,
        marketplaceAccountId: listing.marketplaceAccountId,
        marketplaceListingId: listing.id,
        currentMarketplaceSku: listing.variations[0]?.currentSku || listing.externalListingId,
        confirmedByUser: true,
        confidenceScore: 1.0,
        mappingType: 'MANUAL'
      }
    });

    return true;
  }

  /**
   * Reanalisa as correspondências de toda a organização usando o MatchingService.
   */
  static async runRematching(client: PrismaClient, organizationId: string): Promise<{ processed: number; newMatchesFound: number }> {
    const listings = await client.marketplaceListing.findMany({
      where: { organizationId },
      include: { account: true, variations: true }
    });

    const masterProducts = await client.masterProduct.findMany({
      where: { organizationId }
    });

    let newMatchesFound = 0;

    for (const listing of listings) {
      for (const varItem of listing.variations) {
        for (const mp of masterProducts) {
          const evalResult = calculateMatchConfidence(
            { sku: mp.masterSku, title: mp.name },
            { sku: varItem.currentSku, title: listing.title }
          );

          if (evalResult.confidenceScore >= 70) {
            const isConfirmed = evalResult.confidenceScore >= 90;
            await client.productMapping.upsert({
              where: { id: `map-${mp.id}-${listing.id}-${varItem.id}` },
              update: {
                confidenceScore: evalResult.confidenceScore / 100,
                mappingMetadataJson: JSON.stringify({ compatibilities: evalResult.compatibilities, divergences: evalResult.divergences }),
                updatedAt: new Date()
              },
              create: {
                id: `map-${mp.id}-${listing.id}-${varItem.id}`,
                organizationId,
                masterProductId: mp.id,
                marketplaceAccountId: listing.marketplaceAccountId,
                marketplaceListingId: listing.id,
                marketplaceVariationId: varItem.id,
                currentMarketplaceSku: varItem.currentSku,
                confidenceScore: evalResult.confidenceScore / 100,
                mappingType: isConfirmed ? 'AUTOMATIC' : 'SUGGESTED',
                confirmedByUser: isConfirmed,
                mappingMetadataJson: JSON.stringify({ compatibilities: evalResult.compatibilities, divergences: evalResult.divergences })
              }
            });
            newMatchesFound++;
          }
        }
      }
    }

    return { processed: listings.length, newMatchesFound };
  }
}
