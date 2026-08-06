import { PrismaClient, MarketplaceListing, MarketplaceVariation, MarketplaceAccount } from '@prisma/client';

export interface ListingAccountView {
  id: string;
  marketplace: string;
  accountName: string;
  isDemo: boolean;
}

export interface ListingVariationView {
  id: string;
  externalVariationId: string;
  externalModelId?: string | null;
  variationName: string;
  currentSku: string;
  price: number;
  stock: number;
  status: string;
  imageUrl?: string | null;
}

export interface LinkedChannelView {
  marketplaceAccountId: string;
  marketplace: string;
  accountName: string;
  externalListingId: string;
  title: string;
  status: string;
  confidenceScore: number;
}

export interface MarketplaceListingView {
  id: string;
  externalListingId: string;
  externalProductId?: string | null;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  images?: Array<{ id: string; url: string; isPrimary: boolean; position: number }>;
  masterProductImageUrl?: string | null;
  categoryId?: string | null;
  status: string;
  listingUrl?: string | null;
  importedAt: string;
  updatedAt: string;
  account: ListingAccountView;
  variations: ListingVariationView[];
  linkedChannels: LinkedChannelView[];
  linkedMasterProductId?: string | null;
  linkedMasterSku?: string | null;
}

export interface ListingsResultView {
  listings: MarketplaceListingView[];
  totalListings: number;
  totalVariations: number;
}

type ListingWithRelations = MarketplaceListing & {
  account: MarketplaceAccount;
  variations: MarketplaceVariation[];
  images?: any[];
  mappings?: any[];
};

export function toListingView(listing: ListingWithRelations): MarketplaceListingView {
  const primaryImg = (listing as any).images?.find((i: any) => i.isPrimary) || (listing as any).images?.[0];
  const mainUrl = listing.imageUrl || (primaryImg ? primaryImg.url : null);

  // Mapeia canais vinculados através de ProductMapping
  const mappings = (listing as any).mappings || [];
  const linkedChannels: LinkedChannelView[] = [];
  let masterProductImageUrl: string | null = null;
  let linkedMasterProductId: string | null = null;
  let linkedMasterSku: string | null = null;

  if (mappings.length > 0 && mappings[0].masterProduct) {
    const mp = mappings[0].masterProduct;
    masterProductImageUrl = mp.imageUrl || null;
    linkedMasterProductId = mp.id;
    linkedMasterSku = mp.masterSku;

    if (Array.isArray(mp.mappings)) {
      mp.mappings.forEach((m: any) => {
        if (m.listing && m.account && m.listing.id !== listing.id) {
          linkedChannels.push({
            marketplaceAccountId: m.account.id,
            marketplace: m.account.marketplace,
            accountName: m.account.accountName,
            externalListingId: m.listing.externalListingId,
            title: m.listing.title,
            status: m.listing.status,
            confidenceScore: m.confidenceScore || 1.0
          });
        }
      });
    }
  }

  return {
    id: listing.id,
    externalListingId: listing.externalListingId,
    externalProductId: listing.externalProductId,
    title: listing.title,
    description: listing.description,
    imageUrl: mainUrl,
    images: (listing as any).images?.map((i: any) => ({
      id: i.id,
      url: i.url,
      isPrimary: i.isPrimary,
      position: i.position
    })) || [],
    masterProductImageUrl,
    linkedMasterProductId,
    linkedMasterSku,
    categoryId: listing.categoryId,
    status: listing.status,
    listingUrl: listing.listingUrl,
    importedAt: listing.importedAt.toISOString(),
    updatedAt: listing.updatedAt.toISOString(),
    account: {
      id: listing.account.id,
      marketplace: listing.account.marketplace,
      accountName: listing.account.accountName,
      isDemo: listing.account.isDemo
    },
    variations: listing.variations.map(v => ({
      id: v.id,
      externalVariationId: v.externalVariationId,
      externalModelId: v.externalModelId,
      variationName: v.variationName,
      currentSku: v.currentSku,
      price: v.price,
      stock: v.stock,
      status: v.status,
      imageUrl: v.imageUrl || null
    })),
    linkedChannels
  };
}

/**
 * Lista anúncios persistidos no PostgreSQL com suas variações e galeria de imagens.
 */
export async function listMarketplaceListings(
  client: PrismaClient,
  organizationId: string,
  marketplaceFilter?: string
): Promise<ListingsResultView> {
  const whereClause: any = { organizationId };

  if (marketplaceFilter && marketplaceFilter.trim() !== '' && marketplaceFilter.toLowerCase() !== 'all') {
    whereClause.account = { marketplace: marketplaceFilter.toLowerCase() };
  }

  const rows = await client.marketplaceListing.findMany({
    where: whereClause,
    include: {
      account: true,
      variations: true,
      images: { orderBy: { position: 'asc' } },
      mappings: {
        include: {
          masterProduct: {
            include: {
              mappings: {
                include: {
                  account: true,
                  listing: true
                }
              }
            }
          }
        }
      }
    },
    orderBy: { externalListingId: 'asc' }
  });

  const listings = rows
    .sort((a, b) => Number(a.externalListingId) - Number(b.externalListingId) || a.externalListingId.localeCompare(b.externalListingId))
    .map(toListingView);

  const totalVariations = listings.reduce((acc, l) => acc + l.variations.length, 0);

  return {
    listings,
    totalListings: listings.length,
    totalVariations
  };
}