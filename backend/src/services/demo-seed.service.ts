import { PrismaClient } from '@prisma/client';
import { encryptSecret } from '../utils/crypto.js';
import { ImportService } from './import.service.js';
import { FakeMarketplaceAdapter } from '../marketplaces/fake-marketplace.adapter.js';

export const DEMO_ORGANIZATION_ID = 'org-festum-decor';

export const DEMO_ACCOUNTS = [
  { id: 'acc-shopee-demo', marketplace: 'shopee', accountName: 'Festum Decor - Shopee (DEMO)', externalAccountId: 'demo-shopee-9999', shopId: 'demo-9999', sellerId: 'demo-9999' },
  { id: 'acc-mercadolivre-demo', marketplace: 'mercadolivre', accountName: 'Festum Decor - Mercado Livre (DEMO)', externalAccountId: 'demo-meli-55412', shopId: '55412', sellerId: '55412' },
  { id: 'acc-tiktok-demo', marketplace: 'tiktok', accountName: 'Festum Decor - TikTok (DEMO)', externalAccountId: 'demo-tiktok-99120', shopId: '99120', sellerId: '99120' },
  { id: 'acc-amazon-demo', marketplace: 'amazon', accountName: 'Festum Decor - Amazon BR (DEMO)', externalAccountId: 'demo-amazon-33019', shopId: '33019', sellerId: '33019' }
];

export interface DemoSeedResult {
  enabled: boolean;
  seeded: boolean;
  accountsCreated: number;
  listingsCreated: number;
  groupsCreated: number;
  reason?: string;
}

export interface DemoCleanupResult {
  accountsDeleted: number;
  listingsDeleted: number;
  variationsDeleted: number;
}

/**
 * Remove com segurança todos os dados de demonstração (isDemo = true) no PostgreSQL.
 * Trava de Segurança: ABORTA se qualquer conta com isDemo = false estiver selecionada.
 */
export async function cleanupDemoData(client: PrismaClient): Promise<DemoCleanupResult> {
  const demoAccounts = await client.marketplaceAccount.findMany({
    where: { isDemo: true }
  });

  if (demoAccounts.length === 0) {
    return { accountsDeleted: 0, listingsDeleted: 0, variationsDeleted: 0 };
  }

  const demoAccountIds = demoAccounts.map(a => a.id);

  // Trava de segurança contra exclusão acidental de dados reais
  const realInList = demoAccounts.filter(a => a.isDemo === false);
  if (realInList.length > 0) {
    throw new Error('ABORTADO: Tentativa de remoção de dados DEMO envolveu contas reais (isDemo=false).');
  }

  return await client.$transaction(async (tx) => {
    const demoListings = await tx.marketplaceListing.findMany({
      where: { marketplaceAccountId: { in: demoAccountIds } },
      select: { id: true }
    });

    const demoListingIds = demoListings.map(l => l.id);

    await tx.marketplaceListingImage.deleteMany({
      where: { marketplaceListingId: { in: demoListingIds } }
    });

    const varRes = await tx.marketplaceVariation.deleteMany({
      where: { marketplaceListingId: { in: demoListingIds } }
    });

    await tx.productMapping.deleteMany({
      where: { marketplaceListingId: { in: demoListingIds } }
    });

    const listRes = await tx.marketplaceListing.deleteMany({
      where: { marketplaceAccountId: { in: demoAccountIds } }
    });

    const accRes = await tx.marketplaceAccount.deleteMany({
      where: { id: { in: demoAccountIds }, isDemo: true }
    });

    return {
      accountsDeleted: accRes.count,
      listingsDeleted: listRes.count,
      variationsDeleted: varRes.count
    };
  });
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

  // Importar o conjunto completo de 50 anúncios Shopee (FDM-0001 a FDM-0050) via FakeMarketplaceAdapter
  const adapter = new FakeMarketplaceAdapter();
  await ImportService.executeImportJob(
    client,
    {
      id: 'acc-shopee-demo',
      organizationId: org.id,
      marketplace: 'shopee',
      accountName: 'Festum Decor - Shopee'
    },
    'system@lxsync.com',
    adapter
  );

  // 1. Criar Produto Mestre Central Multicanal: "Painel Redondo Zoológico 50x50"
  const masterSku = 'Z - Red50 - Zoologico - 04';
  const masterImageUrl = 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=400&q=80';
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
    { accId: 'acc-shopee-demo', extId: 'FDM-0001', title: 'Painel Redondo Zoológico 50x50', img: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=400&q=80' },
    { accId: 'acc-mercadolivre-demo', extId: 'FDM-ML-0001', title: 'Capa Painel Mesa Zoológico 50 cm', img: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=400&q=80' },
    { accId: 'acc-tiktok-demo', extId: 'FDM-TT-0001', title: 'Painel Safari Red50', img: 'https://images.unsplash.com/photo-1527529482837-4698179dc6ce?w=400&q=80' },
    { accId: 'acc-amazon-demo', extId: 'FDM-AMZ-0001', title: 'Painel Redondo Festa Zoológico', img: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80' }
  ];

  for (const item of multiChannelListings) {
    const listing = await client.marketplaceListing.upsert({
      where: {
        marketplaceAccountId_externalListingId: {
          marketplaceAccountId: item.accId,
          externalListingId: item.extId
        }
      },
      update: { title: item.title, imageUrl: item.img, status: 'ACTIVE', updatedAt: new Date() },
      create: {
        id: `list-demo-${item.accId}-${item.extId}`,
        organizationId: org.id,
        marketplaceAccountId: item.accId,
        externalListingId: item.extId,
        title: item.title,
        status: 'ACTIVE',
        imageUrl: item.img
      }
    });

    // Criar imagem primária na tabela MarketplaceListingImage
    await client.marketplaceListingImage.upsert({
      where: { id: `img-${listing.id}-main` },
      update: { url: item.img, isPrimary: true, updatedAt: new Date() },
      create: {
        id: `img-${listing.id}-main`,
        organizationId: org.id,
        marketplaceListingId: listing.id,
        url: item.img,
        position: 0,
        isPrimary: true,
        source: 'SEED',
        status: 'ACTIVE'
      }
    });

    const variation = await client.marketplaceVariation.upsert({
      where: {
        marketplaceListingId_externalVariationId: {
          marketplaceListingId: listing.id,
          externalVariationId: `var-${item.extId}-01`
        }
      },
      update: { currentSku: masterSku, imageUrl: item.img, price: 99.90, stock: 15 },
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
        imageUrl: item.img
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
  }

  // Auditar totais no PostgreSQL
  const totalListings = await client.marketplaceListing.count({ where: { organizationId: org.id } });
  const totalVariations = await client.marketplaceVariation.count({ where: { organizationId: org.id } });
  const totalMappings = await client.productMapping.count({ where: { organizationId: org.id } });
  const totalImages = await client.marketplaceListingImage.count({ where: { organizationId: org.id } });

  console.log(`[DEMO-SEED] Seed concluído: ${totalListings} anúncios, ${totalVariations} variações, ${totalMappings} mappings, ${totalImages} imagens em 4 contas DEMO.`);

  return {
    enabled: true,
    seeded: true,
    accountsCreated: createdAccountIds.length,
    listingsCreated: totalListings,
    groupsCreated: 1
  };
}

