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
}

export interface MarketplaceListingView {
  id: string;
  externalListingId: string;
  externalProductId?: string | null;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  categoryId?: string | null;
  status: string;
  listingUrl?: string | null;
  importedAt: string;
  updatedAt: string;
account: ListingAccountView;
  variations: ListingVariationView[];
}

export interface ListingsResultView {
  listings: MarketplaceListingView[];
  totalListings: number;
  totalVariations: number;
}

type ListingWithRelations = MarketplaceListing & {
  account: MarketplaceAccount;
  variations: MarketplaceVariation[];
};

export function toListingView(listing: ListingWithRelations): MarketplaceListingView {
  return {
    id: listing.id,
    externalListingId: listing.externalListingId,
    externalProductId: listing.externalProductId,
    title: listing.title,
    description: listing.description,
    imageUrl: listing.imageUrl,
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
      status: v.status
    }))
  };
}

/**
 * Lista anúncios persistidos no PostgreSQL com suas variações,
 * apenas da organização autenticada (fonte única persistida).
 */
export async function listMarketplaceListings(
  client: PrismaClient,
  organizationId: string
): Promise<ListingsResultView> {
  const rows = await client.marketplaceListing.findMany({
    where: { organizationId },
    include: {
      account: true,
      variations: true
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