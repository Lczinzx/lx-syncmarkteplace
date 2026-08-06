import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  listMarketplaceListings,
  toListingView,
  MarketplaceListingView
} from '../services/listings.service.js';
import { generateDemoMarketplaceData } from '../marketplaces/demo-data.js';

function buildFakeClient(rows: Array<Record<string, any>>) {
  return {
    marketplaceListing: {
      findMany: async () => rows
    }
  };
}

function demoRow(externalListingId: string, variationsCount: number, marketplace: string, isDemo = true): Record<string, any> {
  const now = new Date('2026-08-03T12:00:00Z');
  return {
    id: `list-${externalListingId}`,
    organizationId: 'org-festum-decor',
    marketplaceAccountId: 'acc-shopee-demo',
    externalListingId,
    externalProductId: `PROD-${externalListingId}`,
    title: `Painel Zoologico ${externalListingId}`,
    description: 'Descrição demo',
    imageUrl: 'assets/logo.svg',
    categoryId: 'DECOR_PARTY',
    status: 'ACTIVE',
    listingUrl: `https://shopee.com.br/product/FESTUM/${externalListingId}`,
    importedAt: now,
    updatedAt: now,
    account: {
      id: 'acc-shopee-demo',
      marketplace,
      accountName: 'Festum Decor (Demo)',
      isDemo
    },
    variations: Array.from({ length: variationsCount }, (_, i) => ({
      id: `var-${externalListingId}-${i + 1}`,
      organizationId: 'org-festum-decor',
      marketplaceListingId: `list-${externalListingId}`,
      externalVariationId: `${externalListingId}-${i + 1}`,
      externalModelId: `${externalListingId}_M${i + 1}`,
      variationName: `Tamanho ${i + 1}`,
      currentSku: `Z - Red50 - Zoologico - 04`,
      price: 99.9 + i,
      stock: 10 - i,
      status: 'ACTIVE',
      importedAt: now,
      updatedAt: now
    }))
  };
}

describe('📋 TESTES AUTOMATIZADOS DE LISTAGEM DE ANÚNCIOS (LX SYNC)', () => {
  it('1. Retorna anúncios com conta e variações incluídas', async () => {
    const fake = buildFakeClient([demoRow('FDM-0001', 4, 'shopee'), demoRow('FDM-0002', 2, 'shopee')]);
    const result = await listMarketplaceListings(fake as unknown as import('@prisma/client').PrismaClient, 'org-festum-decor');
    assert.strictEqual(result.totalListings, 2);
    assert.strictEqual(result.totalVariations, 6);
    assert.strictEqual(result.listings[0].variations.length, 4);
    assert.strictEqual(result.listings[0].account.accountName, 'Festum Decor (Demo)');
  });

  it('2. toListingView nunca expõe tokens/segredos da conta', () => {
    const row = demoRow('FDM-0001', 1, 'shopee');
    row.account.accessTokenEncrypted = 'SECRETO_NAO_DEVE_VAZAR';
    const view: MarketplaceListingView = toListingView(row as any);
    const json = JSON.stringify(view);
    assert.ok(!json.includes('SECRETO_NAO_DEVE_VAZAR'), 'token vazou na resposta!');
    assert.ok(!('accessTokenEncrypted' in view.account));
  });

  it('3. VariationView expõe SKU, preço e estoque (necessários à tela)', () => {
    const view: MarketplaceListingView = toListingView(demoRow('FDM-0001', 3, 'shopee') as any);
    const v = view.variations[0];
    assert.strictEqual(v.currentSku, 'Z - Red50 - Zoologico - 04');
    assert.strictEqual(typeof v.price, 'number');
    assert.strictEqual(typeof v.stock, 'number');
    assert.ok(view.variations.every(x => x.externalVariationId));
  });

  it('4. Contagens somam variações de todos os anúncios', async () => {
    const fake = buildFakeClient([demoRow('A', 5, 'shopee'), demoRow('B', 3, 'shopee'), demoRow('C', 1, 'meli')]);
    const result = await listMarketplaceListings(fake as unknown as import('@prisma/client').PrismaClient, 'org');
    assert.strictEqual(result.totalListings, 3);
    assert.strictEqual(result.totalVariations, 9);
  });

  it('5. Filtro por organização é passado ao Prisma', async () => {
    let receivedWhere: any = null;
    const fake = {
      marketplaceListing: {
        findMany: async (args: any) => {
          receivedWhere = args.where;
          return [];
        }
      }
    };
    await listMarketplaceListings(fake as unknown as import('@prisma/client').PrismaClient, 'org-festum-decor');
    assert.strictEqual(receivedWhere.organizationId, 'org-festum-decor');
    assert.ok(receivedWhere.marketplaceAccountId === undefined, 'não deve filtrar por conta específica');
  });

  it('6. Lista vazia retorna zero sem erro', async () => {
    const fake = buildFakeClient([]);
    const result = await listMarketplaceListings(fake as unknown as import('@prisma/client').PrismaClient, 'org-x');
    assert.strictEqual(result.totalListings, 0);
    assert.strictEqual(result.totalVariations, 0);
    assert.deepStrictEqual(result.listings, []);
  });

  it('7. View de 50 anúncios DEMO mantém contagem esperada', async () => {
    const demo = generateDemoMarketplaceData();
    const rows = demo.map(l => {
      const row = demoRow(l.externalListingId, l.variations.length, 'shopee');
      row.title = l.title;
      row.status = l.status;
      row.variations = l.variations.map((v, i) => ({
        id: `var-${l.externalListingId}-${i + 1}`,
        externalVariationId: v.externalVariationId,
        variationName: v.variationName,
        currentSku: v.currentSku,
        price: v.price,
        stock: v.stock,
        status: v.status
      }));
      return row;
    });
    const fake = buildFakeClient(rows);
    const result = await listMarketplaceListings(fake as unknown as import('@prisma/client').PrismaClient, 'org-festum-decor');
    assert.strictEqual(result.totalListings, 50);
    assert.strictEqual(result.totalVariations, 129);
    const views = result.listings.map(v => JSON.stringify(v));
    assert.ok(views.every(v => !v.includes('SECRETO')));
  });

  it('8. Cada anúncio da view tem variações entre 1 e 5', async () => {
    const demo = generateDemoMarketplaceData();
    const rows = demo.map(l => demoRow(l.externalListingId, l.variations.length, 'shopee'));
    const fake = buildFakeClient(rows);
    const result = await listMarketplaceListings(fake as unknown as import('@prisma/client').PrismaClient, 'org');
    result.listings.forEach(l => {
      assert.ok(l.variations.length >= 1 && l.variations.length <= 5, `${l.externalListingId}: ${l.variations.length} variações`);
    });
  });
});
