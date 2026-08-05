import { PrismaClient } from '@prisma/client';
import { encryptSecret } from '../utils/crypto.js';

export const DEMO_ORGANIZATION_ID = 'org-festum-decor';

export const DEMO_ACCOUNTS = [
  { id: 'acc-shopee-demo', marketplace: 'shopee', accountName: 'Festum Decor - Shopee', externalAccountId: 'demo-shopee-2035668', shopId: '2035668', sellerId: '2035668' },
  { id: 'acc-mercadolivre-demo', marketplace: 'mercadolivre', accountName: 'Festum Decor - Mercado Livre', externalAccountId: 'demo-meli-55412', shopId: '55412', sellerId: '55412' },
  { id: 'acc-tiktok-demo', marketplace: 'tiktok', accountName: 'Festum Decor - TikTok', externalAccountId: 'demo-tiktok-99120', shopId: '99120', sellerId: '99120' },
  { id: 'acc-amazon-demo', marketplace: 'amazon', accountName: 'Festum Decor - Amazon BR', externalAccountId: 'demo-amazon-33019', shopId: '33019', sellerId: '33019' }
];

export interface DemoSeedResult {
  enabled: boolean;
  seeded: boolean;
  accountsCreated: number;
  listingsCreated: number;
  groupsCreated: number;
  reason?: string;
}

/**
 * Garante a existência da organização Festum Decor e de 4 contas DEMO
 * (Shopee, Mercado Livre, TikTok Shop, Amazon BR) no PostgreSQL (upsert idempotente).
 *
 * Proteção: somente executa quando ENABLE_DEMO_SEED=true.
 */
export async function ensureDemoData(client: PrismaClient): Promise<DemoSeedResult> {
  if (process.env.ENABLE_DEMO_SEED !== 'true') {
    return { enabled: false, seeded: false, accountsCreated: 0, listingsCreated: 0, groupsCreated: 0, reason: 'ENABLE_DEMO_SEED != true' };
  }

  const org = await client.organization.upsert({
    where: { slug: 'festum-decor' },
    update: { name: 'Festum Decor SaaS (Demonstração)', status: 'ACTIVE' },
    create: {
      id: DEMO_ORGANIZATION_ID,
      name: 'Festum Decor SaaS (Demonstração)',
      slug: 'festum-decor',
      status: 'ACTIVE'
    }
  });

  const createdAccountIds: string[] = [];

  for (const accSpec of DEMO_ACCOUNTS) {
    const acc = await client.marketplaceAccount.upsert({
      where: { id: accSpec.id },
      update: {
        organizationId: org.id,
        marketplace: accSpec.marketplace,
        accountName: accSpec.accountName,
        externalAccountId: accSpec.externalAccountId,
        shopId: accSpec.shopId,
        status: 'CONNECTED',
        isDemo: true
      },
      create: {
        id: accSpec.id,
        organizationId: org.id,
        marketplace: accSpec.marketplace,
        accountName: accSpec.accountName,
        externalAccountId: accSpec.externalAccountId,
        shopId: accSpec.shopId,
        sellerId: accSpec.sellerId,
        status: 'CONNECTED',
        isDemo: true,
        accessTokenEncrypted: encryptSecret(`demo_${accSpec.marketplace}_token_simulado`)
      }
    });
    createdAccountIds.push(acc.id);
  }

  // 1. Criar Produto Mestre Central Multicanal: "Painel Redondo Zoológico 50x50"
  const masterSku = 'Z - Red50 - Zoologico - 04';
  const masterImageUrl = 'https://picsum.photos/seed/demo-mp-Z_Red50_Zoologico_04/360/360';
  const masterProduct = await client.masterProduct.upsert({
    where: { id: 'mp-Z_Red50_Zoologico_04' },
    update: { name: 'Painel Redondo Zoológico 50x50', masterSku, imageUrl: masterImageUrl, updatedAt: new Date() },
    create: {
      id: 'mp-Z_Red50_Zoologico_04',
      organizationId: org.id,
      name: 'Painel Redondo Zoológico 50x50',
      masterSku,
      imageUrl: masterImageUrl,
      productType: 'Redondo',
      size: 'Red50',
      theme: 'Zoologico',
      designCode: '04',
      status: 'ACTIVE'
    }
  });

  // 2. Anúncios Equivalentes nos 4 Marketplaces
  const multiChannelListings = [
    { accId: 'acc-shopee-demo', extId: 'FDM-0001', title: 'Painel Redondo Zoológico 50x50' },
    { accId: 'acc-mercadolivre-demo', extId: 'FDM-ML-0001', title: 'Capa Painel Mesa Zoológico 50 cm' },
    { accId: 'acc-tiktok-demo', extId: 'FDM-TT-0001', title: 'Painel Safari Red50' },
    { accId: 'acc-amazon-demo', extId: 'FDM-AMZ-0001', title: 'Painel Redondo Festa Zoológico' }
  ];

  let listingsCount = 0;

  for (const item of multiChannelListings) {
    const listing = await client.marketplaceListing.upsert({
      where: {
        marketplaceAccountId_externalListingId: {
          marketplaceAccountId: item.accId,
          externalListingId: item.extId
        }
      },
      update: { title: item.title, status: 'ACTIVE', updatedAt: new Date() },
      create: {
        id: `list-demo-${item.accId}-${item.extId}`,
        organizationId: org.id,
        marketplaceAccountId: item.accId,
        externalListingId: item.extId,
        title: item.title,
        status: 'ACTIVE',
        imageUrl: `https://picsum.photos/seed/demo-${item.extId}/360/360`
      }
    });

    const variation = await client.marketplaceVariation.upsert({
      where: {
        marketplaceListingId_externalVariationId: {
          marketplaceListingId: listing.id,
          externalVariationId: `var-${item.extId}-01`
        }
      },
      update: { currentSku: masterSku, price: 99.90, stock: 15 },
      create: {
        id: `var-demo-${item.accId}-${item.extId}-01`,
        organizationId: org.id,
        marketplaceListingId: listing.id,
        externalVariationId: `var-${item.extId}-01`,
        variationName: 'Tamanho 50x50 cm',
        currentSku: masterSku,
        price: 99.90,
        stock: 15,
        status: 'ACTIVE',
        imageUrl: `https://picsum.photos/seed/demo-${item.extId}/360/360`
      }
    });

    // Vincular ao Produto Mestre
    await client.productMapping.upsert({
      where: { id: `map-${masterProduct.id}-${listing.id}-${variation.id}` },
      update: { confirmedByUser: true, confidenceScore: 0.98, updatedAt: new Date() },
      create: {
        id: `map-${masterProduct.id}-${listing.id}-${variation.id}`,
        organizationId: org.id,
        masterProductId: masterProduct.id,
        marketplaceAccountId: item.accId,
        marketplaceListingId: listing.id,
        marketplaceVariationId: variation.id,
        currentMarketplaceSku: masterSku,
        confidenceScore: 0.98,
        mappingType: 'AUTOMATIC',
        confirmedByUser: true
      }
    });

    listingsCount++;
  }

  // 3. Limpeza Idempotente de Anúncios Obsoletos/Inválidos das contas DEMO
  const validDemoListingIds = new Set(['FDM-0001', 'FDM-ML-0001', 'FDM-TT-0001', 'FDM-AMZ-0001', ...Array.from({ length: 50 }, (_, i) => `FDM-${String(i + 1).padStart(4, '0')}`)]);
  
  const obsoleteListings = await client.marketplaceListing.findMany({
    where: {
      marketplaceAccountId: { in: createdAccountIds },
      externalListingId: { notIn: Array.from(validDemoListingIds) }
    },
    select: { id: true }
  });

  if (obsoleteListings.length > 0) {
    const obsoleteIds = obsoleteListings.map(l => l.id);
    await client.marketplaceVariation.deleteMany({ where: { marketplaceListingId: { in: obsoleteIds } } });
    await client.marketplaceListing.deleteMany({ where: { id: { in: obsoleteIds } } });
    console.log(`[DEMO SEED] ${obsoleteIds.length} anúncio(s) DEMO obsoleto(s) removido(s).`);
  }

  return {
    enabled: true,
    seeded: true,
    accountsCreated: createdAccountIds.length,
    listingsCreated: listingsCount,
    groupsCreated: 1
  };
}

