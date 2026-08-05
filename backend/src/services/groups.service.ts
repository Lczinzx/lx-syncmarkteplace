import { PrismaClient } from '@prisma/client';
import { calculateMatchConfidence } from './matching.service.js';

export interface GroupedProductView {
  id: string;
  masterSku: string;
  name: string;
  imageUrl?: string | null;
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
    imageUrl?: string | null;
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
      imageUrl?: string | null;
    }>;
  }>;
}

export interface UnlinkedListingView {
  id: string;
  externalListingId: string;
  title: string;
  marketplace: string;
  accountName: string;
  status: string;
  imageUrl?: string | null;
  variationsCount: number;
  variations: Array<{
    id: string;
    externalVariationId: string;
    variationName: string;
    sku: string;
    price: number;
    stock: number;
    status: string;
    imageUrl?: string | null;
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
    imageUrl?: string | null;
  };
  listing: {
    id: string;
    externalListingId: string;
    title: string;
    marketplace: string;
    accountName: string;
    imageUrl?: string | null;
  };
  variation?: {
    id: string;
    variationName: string;
    sku: string;
    imageUrl?: string | null;
  };
}

export interface ProductGroupsResponse {
  success: boolean;
  groups: GroupedProductView[];
  groupedProducts?: GroupedProductView[]; // alias para retrocompatibilidade
  unlinkedListings: UnlinkedListingView[];
  reviewSuggestions: PendingMatchView[];
  summary: {
    totalListings: number;
    totalVariations: number;
    totalGroups: number;
    linkedListings: number;
    unlinkedListings: number;
    pendingReviews: number;
  };
}

export class GroupsService {
  /**
   * Retorna os produtos agrupados, anúncios não vinculados, sugestões e resumo global.
   */
  static async listGroupedProducts(
    client: PrismaClient,
    organizationId: string,
    filters?: { search?: string; marketplace?: string; status?: string }
  ): Promise<ProductGroupsResponse> {
    // 1. Buscar todas as publicações da organização com conta e variações
    const allListings = await client.marketplaceListing.findMany({
      where: { organizationId },
      include: {
        account: true,
        variations: true
      },
      orderBy: { externalListingId: 'asc' }
    });

    const totalListings = allListings.length;
    const totalVariations = allListings.reduce((sum, l) => sum + l.variations.length, 0);

    // 2. Buscar produtos mestre com seus mapeamentos
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

    const groups: GroupedProductView[] = [];
    const linkedListingIdsSet = new Set<string>();

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
        linkedListingIdsSet.add(listing.id);
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
            status: v.status,
            imageUrl: v.imageUrl || null
          };
        });

        listingsMap.set(listing.id, {
          id: listing.id,
          externalListingId: listing.externalListingId,
          title: listing.title,
          imageUrl: listing.imageUrl || null,
          marketplace: account.marketplace,
          accountName: account.accountName,
          status: listing.status,
          confidenceScore: mapItem.confidenceScore || 1.0,
          confirmedByUser: mapItem.confirmedByUser,
          variations: varsList
        });
      }

      const listings = Array.from(listingsMap.values());
      if (listings.length === 0) continue; // Pula grupos sem anúncios vinculados

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
        const groupImageUrl = mp.imageUrl || (listings.find(l => l.imageUrl)?.imageUrl) || null;
        groups.push({
          id: mp.id,
          masterSku: mp.masterSku,
          name: mp.name,
          imageUrl: groupImageUrl,
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

    // 3. Montar lista de Anúncios Não Vinculados
    const unlinkedListings: UnlinkedListingView[] = allListings
      .filter(l => !linkedListingIdsSet.has(l.id))
      .map(l => ({
        id: l.id,
        externalListingId: l.externalListingId,
        title: l.title,
        marketplace: l.account.marketplace,
        accountName: l.account.accountName,
        status: l.status,
        imageUrl: l.imageUrl || null,
        variationsCount: l.variations.length,
        variations: l.variations.map(v => ({
          id: v.id,
          externalVariationId: v.externalVariationId,
          variationName: v.variationName,
          sku: v.currentSku,
          price: v.price,
          stock: v.stock,
          status: v.status,
          imageUrl: v.imageUrl || null
        }))
      }));

    // 4. Buscar sugestões de revisão (vínculos com confirmedByUser = false)
    const reviewSuggestions = await this.getPendingMatches(client, organizationId);

    return {
      success: true,
      groups,
      groupedProducts: groups, // para compatibilidade de clientes
      unlinkedListings,
      reviewSuggestions,
      summary: {
        totalListings,
        totalVariations,
        totalGroups: groups.length,
        linkedListings: linkedListingIdsSet.size,
        unlinkedListings: unlinkedListings.length,
        pendingReviews: reviewSuggestions.length
      }
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
        matchStatus: m.mappingType || matchEval.matchLevel,
        reason: matchEval.reason || 'Sugestão de correspondência inteligente',
        compatibilities: matchEval.compatibilities || [],
        divergences: matchEval.divergences || [],
        masterProduct: {
          id: m.masterProduct.id,
          masterSku: m.masterProduct.masterSku,
          name: m.masterProduct.name,
          imageUrl: m.masterProduct.imageUrl || null
        },
        listing: {
          id: m.listing.id,
          externalListingId: m.listing.externalListingId,
          title: m.listing.title,
          marketplace: m.account.marketplace,
          accountName: m.account.accountName,
          imageUrl: m.listing.imageUrl || null
        },
        variation: m.variation ? {
          id: m.variation.id,
          variationName: m.variation.variationName,
          sku: m.variation.currentSku,
          imageUrl: m.variation.imageUrl || null
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
   * Cria os grupos MasterProduct reais se não existirem e gera os vínculos e sugestões.
   */
  static async runRematching(client: PrismaClient, organizationId: string): Promise<{ analyzedListings: number; groupsCreated: number; automaticLinks: number; reviewSuggestions: number; unlinkedListings: number }> {
    const listings = await client.marketplaceListing.findMany({
      where: { organizationId },
      include: { account: true, variations: true }
    });

    if (listings.length === 0) {
      return { analyzedListings: 0, groupsCreated: 0, automaticLinks: 0, reviewSuggestions: 0, unlinkedListings: 0 };
    }

    // 1. Agrupar anúncios por código normalizado de estampa ou SKU idêntico
    const skuGroupMap = new Map<string, typeof listings>();

    for (const listing of listings) {
      for (const v of listing.variations) {
        const skuKey = v.currentSku ? v.currentSku.trim().toUpperCase().replace(/\s+/g, '') : `NO-SKU-${listing.id}`;
        if (!skuGroupMap.has(skuKey)) {
          skuGroupMap.set(skuKey, []);
        }
        if (!skuGroupMap.get(skuKey)!.some(l => l.id === listing.id)) {
          skuGroupMap.get(skuKey)!.push(listing);
        }
      }
    }

    let groupsCreated = 0;
    let automaticLinks = 0;
    let reviewSuggestions = 0;
    const linkedListingIds = new Set<string>();

    // 2. Para cada grupo de SKUs coincidentes, criar MasterProduct e ProductMappings
    for (const [skuKey, groupListings] of skuGroupMap.entries()) {
      if (skuKey.startsWith('NO-SKU-')) continue;

      const firstListing = groupListings[0];
      const masterSku = firstListing.variations[0]?.currentSku || skuKey;

      // Upsert MasterProduct
      const masterProduct = await client.masterProduct.upsert({
        where: { id: `mp-${masterSku.replace(/[^a-zA-Z0-9-]/g, '_')}` },
        update: { name: firstListing.title, updatedAt: new Date() },
        create: {
          id: `mp-${masterSku.replace(/[^a-zA-Z0-9-]/g, '_')}`,
          organizationId,
          name: firstListing.title,
          masterSku,
          status: 'ACTIVE'
        }
      });
      groupsCreated++;

      for (const listing of groupListings) {
        linkedListingIds.add(listing.id);
        for (const varItem of listing.variations) {
          const evalResult = calculateMatchConfidence(
            { sku: masterSku, title: firstListing.title },
            { sku: varItem.currentSku, title: listing.title }
          );

          const isAutomatic = evalResult.confidenceScore >= 90;
          if (isAutomatic) automaticLinks++;
          else reviewSuggestions++;

          await client.productMapping.upsert({
            where: { id: `map-${masterProduct.id}-${listing.id}-${varItem.id}` },
            update: {
              confidenceScore: evalResult.confidenceScore / 100,
              mappingMetadataJson: JSON.stringify({ compatibilities: evalResult.compatibilities, divergences: evalResult.divergences }),
              updatedAt: new Date()
            },
            create: {
              id: `map-${masterProduct.id}-${listing.id}-${varItem.id}`,
              organizationId,
              masterProductId: masterProduct.id,
              marketplaceAccountId: listing.marketplaceAccountId,
              marketplaceListingId: listing.id,
              marketplaceVariationId: varItem.id,
              currentMarketplaceSku: varItem.currentSku,
              confidenceScore: evalResult.confidenceScore / 100,
              mappingType: isAutomatic ? 'AUTOMATIC' : 'SUGGESTED',
              confirmedByUser: isAutomatic,
              mappingMetadataJson: JSON.stringify({ compatibilities: evalResult.compatibilities, divergences: evalResult.divergences })
            }
          });
        }
      }
    }

    const unlinkedListings = listings.filter(l => !linkedListingIds.has(l.id)).length;

    return {
      analyzedListings: listings.length,
      groupsCreated,
      automaticLinks,
      reviewSuggestions,
      unlinkedListings
    };
  }

  /**
   * Remove o vínculo de um anúncio com um produto mestre.
   */
  static async unlinkListing(client: PrismaClient, organizationId: string, masterProductId: string, marketplaceListingId: string): Promise<boolean> {
    await client.productMapping.deleteMany({
      where: {
        organizationId,
        masterProductId,
        marketplaceListingId
      }
    });
    return true;
  }

  /**
   * Funde dois grupos de produtos mestres (migra todos os vínculos do grupo origem para o destino).
   */
  static async mergeGroups(client: PrismaClient, organizationId: string, sourceMasterProductId: string, targetMasterProductId: string): Promise<boolean> {
    const target = await client.masterProduct.findUnique({ where: { id: targetMasterProductId } });
    if (!target) throw new Error('Grupo destino não encontrado.');

    // Atualiza todos os mapeamentos do grupo origem para o grupo destino
    await client.productMapping.updateMany({
      where: { organizationId, masterProductId: sourceMasterProductId },
      data: { masterProductId: targetMasterProductId, updatedAt: new Date() }
    });

    // Remove o produto mestre origem
    await client.masterProduct.delete({
      where: { id: sourceMasterProductId }
    });

    return true;
  }

  /**
   * Separa anúncios de um grupo mestre existente criando um novo grupo.
   */
  static async splitGroup(
    client: PrismaClient,
    organizationId: string,
    sourceMasterProductId: string,
    listingIdsToExtract: string[],
    newGroupName: string,
    newMasterSku: string
  ): Promise<string> {
    const newMasterProduct = await client.masterProduct.create({
      data: {
        organizationId,
        name: newGroupName,
        masterSku: newMasterSku,
        status: 'ACTIVE'
      }
    });

    await client.productMapping.updateMany({
      where: {
        organizationId,
        masterProductId: sourceMasterProductId,
        marketplaceListingId: { in: listingIdsToExtract }
      },
      data: {
        masterProductId: newMasterProduct.id,
        updatedAt: new Date()
      }
    });

    return newMasterProduct.id;
  }

  /**
   * Cria manualmente um novo grupo mestre e vincula os anúncios especificados.
   */
  static async createManualGroup(
    client: PrismaClient,
    organizationId: string,
    name: string,
    masterSku: string,
    listingIds: string[]
  ): Promise<string> {
    const masterProduct = await client.masterProduct.create({
      data: {
        organizationId,
        name,
        masterSku,
        status: 'ACTIVE'
      }
    });

    for (const listingId of listingIds) {
      await this.linkListing(client, organizationId, masterProduct.id, listingId);
    }

    return masterProduct.id;
  }
}

