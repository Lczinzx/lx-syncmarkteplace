import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generateDemoMarketplaceData, DemoListingSpec } from '../marketplaces/demo-data.js';
import { FakeMarketplaceAdapter } from '../marketplaces/fake-marketplace.adapter.js';
import { ImportService } from '../services/import.service.js';
import {
  calculateMatchConfidence,
  decomposeSku,
  normalizeSkuForComparison,
  normalizeListingTitleForComparison
} from '../services/matching.service.js';

class FakePrismaClient {
  listings = new Map<string, Record<string, any>>();      // key: marketplaceAccountId|externalListingId
  variations = new Map<string, Record<string, any>>();    // key: marketplaceListingId|externalVariationId
  importJobs: Array<Record<string, any>> = [];
  auditLogs: Array<Record<string, any>> = [];

  marketplaceListing = {
    findFirst: async ({ where }: any) => {
      const key = `${where.marketplaceAccountId}|${where.externalListingId}`;
      return this.listings.get(key) || null;
    },
    upsert: async ({ where, update, create }: any) => {
      const key = `${where.marketplaceAccountId_externalListingId.marketplaceAccountId}|${where.marketplaceAccountId_externalListingId.externalListingId}`;
      const existing = this.listings.get(key);
      if (existing) {
        const merged = { ...existing, ...update };
        this.listings.set(key, merged);
        return merged;
      }
      this.listings.set(key, create);
      return create;
    }
  };

  marketplaceVariation = {
    upsert: async ({ where, update, create }: any) => {
      const key = `${where.marketplaceListingId_externalVariationId.marketplaceListingId}|${where.marketplaceListingId_externalVariationId.externalVariationId}`;
      const existing = this.variations.get(key);
      if (existing) {
        const merged = { ...existing, ...update };
        this.variations.set(key, merged);
        return merged;
      }
      this.variations.set(key, create);
      return create;
    }
  };

  importJob = {
    create: async ({ data }: any) => {
      this.importJobs.push(data);
      return data;
    },
    update: async ({ data }: any) => data
  };

  auditLog = {
    create: async ({ data }: any) => {
      const record = { id: `log-${Date.now()}`, ...data };
      this.auditLogs.push(record);
      return record;
    }
  };

  marketplaceAccount = {
    update: async ({ data }: any) => data
  };
}

const ACCOUNT_CONFIG = {
  id: 'acc-shopee-demo',
  organizationId: 'org-festum-decor',
  marketplace: 'shopee',
  accountName: 'Festum Decor (Demo)'
};

describe('⚡ TESTES AUTOMATIZADOS DO CONJUNTO DEMO (LX SYNC)', () => {
  it('1. Gerador produz >= 50 anúncios', () => {
    const listingsCount = generateDemoMarketplaceData().length;
    assert.ok(listingsCount >= 50, `Esperado >= 50, obtido ${listingsCount}`);
  });

  it('2. Gerador produz ~120 variações (>= 100)', () => {
    const all = generateDemoMarketplaceData();
    const variationsCount = all.reduce((acc, l) => acc + l.variations.length, 0);
    assert.ok(variationsCount >= 100, `Esperado >= 100, obtido ${variationsCount}`);
  });

  it('3. Cada anúncio tem entre 1 e 5 variações', () => {
    const all = generateDemoMarketplaceData();
    all.forEach(l => {
      const n = l.variations.length;
      assert.ok(n >= 1 && n <= 5, `Anúncio ${l.externalListingId} tem ${n} variações (fora de 1-5)`);
    });
  });

  it('4. Contagem total de variações informada no relatório', () => {
    const all = generateDemoMarketplaceData();
    const total = all.reduce((acc, l) => acc + l.variations.length, 0);
    assert.ok(all.length >= 50);
    assert.ok(total >= 100);
  });

  it('5. listListings retorna todos os anúncios do dataset', async () => {
    const adapter = new FakeMarketplaceAdapter('shopee', 'acc-shopee-demo');
    const res = await adapter.listListings({ limit: 200 });
    assert.ok(res.total >= 50, `total = ${res.total}`);
    assert.strictEqual(res.listings.length, res.total);
  });

  it('6. listVariations retorna variações reais para cada anúncio', async () => {
    const adapter = new FakeMarketplaceAdapter('shopee', 'acc-shopee-demo');
    const res = await adapter.listListings({ limit: 200 });
    const first = res.listings[0];
    const vars = await adapter.listVariations(first.externalListingId);
    assert.ok(vars.length >= 1 && vars.length <= 5);
    assert.ok(vars.every(v => v.currentSku !== undefined));
  });

  it('7. Adapter aceita dataset customizado (isolado das contas reais)', async () => {
    const custom: DemoListingSpec[] = [{
      externalListingId: 'CUSTOM-001',
      externalProductId: 'C-P1',
      title: 'Custom Test Listing',
      description: 'Custom',
      imageUrl: 'x.png',
      categoryId: 'DECOR_PARTY',
      status: 'ACTIVE',
      listingUrl: 'https://x.com/CUSTOM-001',
      variations: [{ externalVariationId: 'CUSTOM-001-1', variationName: 'Red50', currentSku: 'Z - Red50 - Zoologico - 04', price: 99.9, stock: 5, status: 'ACTIVE' }]
    }];
    const adapter = new FakeMarketplaceAdapter('shopee', 'acc-custom', custom);
    const res = await adapter.listListings({ limit: 10 });
    assert.strictEqual(res.total, 1);
    assert.strictEqual(res.listings[0].externalListingId, 'CUSTOM-001');
  });

  let firstSummary: any = null;
  let secondSummary: any = null;
  let fakeClient: any = null;

  it('8. Primeira importação cria anúncios e variações', async () => {
    fakeClient = new FakePrismaClient();
    firstSummary = await ImportService.executeImportJob(fakeClient as unknown as import('@prisma/client').PrismaClient, ACCOUNT_CONFIG, 'lucas@festum.com');
    assert.ok(firstSummary.createdListings >= 50, `created = ${firstSummary.createdListings}`);
    assert.ok(firstSummary.totalVariations >= 100, `variations = ${firstSummary.totalVariations}`);
    assert.strictEqual(fakeClient.listings.size, firstSummary.createdListings);
    assert.strictEqual(fakeClient.variations.size, firstSummary.totalVariations);
  });

  it('9. Segunda importação NÃO duplica (0 criados, todos atualizados)', async () => {
    secondSummary = await ImportService.executeImportJob(fakeClient as unknown as import('@prisma/client').PrismaClient, ACCOUNT_CONFIG, 'lucas@festum.com');
    assert.strictEqual(secondSummary.createdListings, 0, `created na 2ª = ${secondSummary.createdListings}`);
    assert.ok(secondSummary.updatedListings >= 50, `updated = ${secondSummary.updatedListings}`);
    assert.strictEqual(fakeClient.listings.size, firstSummary.totalListings, 'listings duplicados!');
    assert.strictEqual(fakeClient.variations.size, firstSummary.totalVariations, 'variações duplicadas!');
  });

  it('10. Mudanças de preço/estoque no adapter refletem no banco (upsert)', async () => {
    const client = new FakePrismaClient();

    await ImportService.executeImportJob(client as unknown as import('@prisma/client').PrismaClient, ACCOUNT_CONFIG, 'lucas@festum.com');

    const modified = generateDemoMarketplaceData();
    const target = modified.find(l => l.externalListingId === 'FDM-0001')!;
    target.title = 'Painel Redondo (1.50m) - PREÇO PROMOCIONAL';
    target.variations[0].price = 49.9;
    target.variations[0].stock = 2;

    const adapter = new FakeMarketplaceAdapter('shopee', 'acc-shopee-demo', modified);
    const summary = await ImportService.executeImportJob(client as unknown as import('@prisma/client').PrismaClient, ACCOUNT_CONFIG, 'lucas@festum.com', adapter);
    assert.strictEqual(summary.createdListings, 0);
    assert.ok(summary.updatedListings >= 1);

    const listingKey = `acc-shopee-demo|FDM-0001`;
    const listing = client.listings.get(listingKey);
    assert.ok(listing, 'anúncio FDM-0001 não persistido');
    assert.strictEqual(listing.title, 'Painel Redondo (1.50m) - PREÇO PROMOCIONAL');
    const varKey = `${listing.id}|FDM-0001-1`;
    const variation = client.variations.get(varKey);
    assert.ok(variation, 'variação FDM-0001-1 não persistida');
    assert.strictEqual(variation.price, 49.9);
    assert.strictEqual(variation.stock, 2);
  });

  it('11. SKUs idênticos em anúncios diferentes => match forte', () => {
    const r = calculateMatchConfidence(
      { sku: 'Z - Red150 - Zoologico - 04', title: 'Painel Zoologico 04 1.50m' },
      { sku: 'Z - Red150 - Zoologico - 04', title: 'Painel Zoologico Ed. Licenciada' }
    );
    assert.ok(r.confidenceScore >= 60, `score = ${r.confidenceScore}`);
  });

  it('12. Diferenças de espaços e separadores são normalizadas', () => {
    assert.strictEqual(
      normalizeSkuForComparison('Z-Red100-Zoologico-04'),
      normalizeSkuForComparison('Z - Red100 - Zoologico - 04')
    );
    assert.strictEqual(
      normalizeSkuForComparison('Z-Red50-Zoologico-04'),
      normalizeSkuForComparison('Z - Red50 - Zoologico - 04')
    );
  });

  it('13. Letras maiúsculas e minúsculas são normalizadas', () => {
    assert.strictEqual(
      normalizeSkuForComparison('z - red80 - zoologico - 04'),
      normalizeSkuForComparison('Z - Red80 - Zoologico - 04')
    );
  });

  it('14. Títulos semelhantes aumentam o score de match', () => {
    const r = calculateMatchConfidence(
      { sku: 'Z - Red150 - Zoologico - 04', title: 'Painel Zoologico 04 1.50m' },
      { sku: 'Z - Red150 - Zoologico - 04', title: 'Painel Divertido Zoo Estampa 04' }
    );
    assert.ok(r.confidenceScore >= 60, `score = ${r.confidenceScore}`);
  });

  it('15. Mesmo tema/código em medidas diferentes => divergência de medida', () => {
    const r = calculateMatchConfidence(
      { sku: 'Z - Red100 - Zoologico - 04', title: 'Painel Zoologico Quarto Red100' },
      { sku: 'Z - Red120 - Zoologico - 04', title: 'Painel Zoologico Quarto Red120' }
    );
    assert.ok(
      r.divergences.some(d => d.includes('Medidas conflitantes')),
      `divergences = ${r.divergences.join('; ')}`
    );
    assert.ok(r.confidenceScore <= 50, `score travado = ${r.confidenceScore}`);
  });

  it('16. Anúncio sem SKU => score baixo / sem match por SKU', () => {
    const r = calculateMatchConfidence(
      { sku: '', title: 'Painel Baby Festa (SKU pendente)' },
      { sku: 'Z - Red100 - Zoologico - 04', title: 'Painel Zoologico 1.00m' }
    );
    assert.ok(r.confidenceScore < 60, `score = ${r.confidenceScore}`);
  });

  it('17. SKUs parcialmente incompatíveis (tema diferente, código igual)', () => {
    const r = calculateMatchConfidence(
      { sku: 'Z - Red50 - Zoologico - 04', title: 'Painel Zoologico 04' },
      { sku: 'Z - Red50 - Arraia - 02', title: 'Painel Arraia 02' }
    );
    assert.ok(r.confidenceScore < 60, `score = ${r.confidenceScore}`);
  });

  it('18. decomposeSku lê SKUs Festum Decor (prefixo/medida/tema/código)', () => {
    const d = decomposeSku('Z - Red50 - Zoologico - 04');
    assert.strictEqual(d.prefix, 'Z');
    assert.strictEqual(d.size, 'Red50');
    assert.strictEqual(d.theme, 'Zoologico');
    assert.strictEqual(d.code, '04');
  });

  it('19. Dataset contém anúncios ativos e pausados', () => {
    const all = generateDemoMarketplaceData();
    const actives = all.filter(l => l.status === 'ACTIVE');
    const paused = all.filter(l => l.status === 'PAUSED');
    assert.ok(actives.length > 0);
    assert.ok(paused.length >= 5, `paused = ${paused.length}`);
  });

  it('20. Dataset contém variações com estoque zero e estoque baixo', () => {
    const all = generateDemoMarketplaceData();
    const zeroStock = all.flatMap(l => l.variations).filter(v => v.stock === 0);
    const lowStock = all.flatMap(l => l.variations).filter(v => v.stock >= 1 && v.stock <= 2);
    assert.ok(zeroStock.length >= 5, `zero = ${zeroStock.length}`);
    assert.ok(lowStock.length >= 5, `low = ${lowStock.length}`);
  });

  it('21. Dataset contém preços variados e múltiplas variações por anúncio', () => {
    const all = generateDemoMarketplaceData();
    const prices = new Set(all.flatMap(l => l.variations).map(v => v.price));
    assert.ok(prices.size >= 20, `preços distintos = ${prices.size}`);
    const multi = all.filter(l => l.variations.length >= 3);
    assert.ok(multi.length >= 20, `anúncios com 3+ variações = ${multi.length}`);
  });
});
