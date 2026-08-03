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

console.log('🧪 Executando Testes Automatizados do Conjunto DEMO (LX Sync)...\n');

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(() => {
    console.log(`  ✅ ${name}`);
    passed++;
  }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ❌ ${name}: ${msg}`);
    failed++;
  });
}

// ---------------------------------------------------------------------------
// Fake PrismaClient em memória (somente os métodos usados pelo ImportService)
// ---------------------------------------------------------------------------
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
      const record = { id: `job-${this.importJobs.length + 1}`, ...data };
      this.importJobs.push(record);
      return record;
    }
  };

  auditLog = {
    create: async ({ data }: any) => {
      const record = { id: `audit-${this.auditLogs.length + 1}`, ...data };
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

async function runTests() {
  // ============================================================
  // 1. Quantidade mínima de anúncios e variações
  // ============================================================
  console.log('📋 1. Quantidade de Dados DEMO');

  let listingsCount = 0;
  let variationsCount = 0;
  let minVars = Infinity;
  let maxVars = 0;

  await test('Gerador produz >= 50 anúncios', () => {
    listingsCount = generateDemoMarketplaceData().length;
    assert.ok(listingsCount >= 50, `Esperado >= 50, obtido ${listingsCount}`);
  });

  await test('Gerador produz ~120 variações (>= 100)', () => {
    const all = generateDemoMarketplaceData();
    variationsCount = all.reduce((acc, l) => acc + l.variations.length, 0);
    assert.ok(variationsCount >= 100, `Esperado >= 100, obtido ${variationsCount}`);
  });

  await test('Cada anúncio tem entre 1 e 5 variações', () => {
    const all = generateDemoMarketplaceData();
    all.forEach(l => {
      const n = l.variations.length;
      assert.ok(n >= 1 && n <= 5, `Anúncio ${l.externalListingId} tem ${n} variações (fora de 1-5)`);
      minVars = Math.min(minVars, n);
      maxVars = Math.max(maxVars, n);
    });
  });

  await test('Contagem total de variações informada no relatório', () => {
    const all = generateDemoMarketplaceData();
    const total = all.reduce((acc, l) => acc + l.variations.length, 0);
    console.log(`  ℹ️  Relatório: ${all.length} anúncios, ${total} variações`);
    assert.ok(all.length >= 50);
    assert.ok(total >= 100);
  });

  // ============================================================
  // 2. Adapter serve listas e variações do dataset
  // ============================================================
  console.log('\n📋 2. FakeMarketplaceAdapter com Dataset DEMO');

  await test('listListings retorna todos os anúncios do dataset', async () => {
    const adapter = new FakeMarketplaceAdapter('shopee', 'acc-shopee-demo');
    const res = await adapter.listListings({ limit: 200 });
    assert.ok(res.total >= 50, `total = ${res.total}`);
    assert.strictEqual(res.listings.length, res.total);
  });

  await test('listVariations retorna variações reais para cada anúncio', async () => {
    const adapter = new FakeMarketplaceAdapter('shopee', 'acc-shopee-demo');
    const res = await adapter.listListings({ limit: 200 });
    const first = res.listings[0];
    const vars = await adapter.listVariations(first.externalListingId);
    assert.ok(vars.length >= 1 && vars.length <= 5);
    assert.ok(vars.every(v => v.currentSku !== undefined));
  });

  await test('Adapter aceita dataset customizado (isolado das contas reais)', async () => {
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

  // ============================================================
  // 3. Idempotência: primeira importação cria, segunda atualiza
  // ============================================================
  console.log('\n📋 3. Idempotência da Importação');

  let firstSummary: any = null;
  let secondSummary: any = null;
  let fakeClient: any = null;

  await test('Primeira importação cria anúncios e variações', async () => {
    fakeClient = new FakePrismaClient();
    firstSummary = await ImportService.executeImportJob(fakeClient as unknown as import('@prisma/client').PrismaClient, ACCOUNT_CONFIG, 'lucas@festum.com');
    assert.ok(firstSummary.createdListings >= 50, `created = ${firstSummary.createdListings}`);
    assert.ok(firstSummary.totalVariations >= 100, `variations = ${firstSummary.totalVariations}`);
    assert.strictEqual(fakeClient.listings.size, firstSummary.createdListings);
    assert.strictEqual(fakeClient.variations.size, firstSummary.totalVariations);
  });

  await test('Segunda importação NÃO duplica (0 criados, todos atualizados)', async () => {
    secondSummary = await ImportService.executeImportJob(fakeClient as unknown as import('@prisma/client').PrismaClient, ACCOUNT_CONFIG, 'lucas@festum.com');
    assert.strictEqual(secondSummary.createdListings, 0, `created na 2ª = ${secondSummary.createdListings}`);
    assert.ok(secondSummary.updatedListings >= 50, `updated = ${secondSummary.updatedListings}`);
    assert.strictEqual(fakeClient.listings.size, firstSummary.totalListings, 'listings duplicados!');
    assert.strictEqual(fakeClient.variations.size, firstSummary.totalVariations, 'variações duplicadas!');
  });

  // ============================================================
  // 4. Atualização de preço e estoque na segunda importação
  // ============================================================
  console.log('\n📋 4. Atualização de Preço e Estoque');

  await test('Mudanças de preço/estoque no adapter refletem no banco (upsert)', async () => {
    const client = new FakePrismaClient();

    // 1ª importação com dataset padrão
    await ImportService.executeImportJob(client as unknown as import('@prisma/client').PrismaClient, ACCOUNT_CONFIG, 'lucas@festum.com');

    // 2ª importação com dataset modificado (preço + estoque alterados)
    const modified = generateDemoMarketplaceData();
    const target = modified.find(l => l.externalListingId === 'FDM-0001')!;
    target.title = 'Painel Redondo (1.50m) - PREÇO PROMOCIONAL';
    target.variations[0].price = 49.9;   // antes: 99.9 * 1 = 99.9
    target.variations[0].stock = 2;      // antes: 0

    const adapter = new FakeMarketplaceAdapter('shopee', 'acc-shopee-demo', modified);
    const summary = await ImportService.executeImportJob(client as unknown as import('@prisma/client').PrismaClient, ACCOUNT_CONFIG, 'lucas@festum.com', adapter);
    assert.strictEqual(summary.createdListings, 0);
    assert.ok(summary.updatedListings >= 1);

    // Confirma o novo valor/estoque persistidos
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

  // ============================================================
  // 5. MatchingService com diferentes padrões de SKU
  // ============================================================
  console.log('\n📋 5. MatchingService vs Padrões de SKU DEMO');

  await test('SKUs idênticos em anúncios diferentes => match forte', () => {
    const r = calculateMatchConfidence(
      { sku: 'Z - Red150 - Zoologico - 04', title: 'Painel Zoologico 04 1.50m' },
      { sku: 'Z - Red150 - Zoologico - 04', title: 'Painel Zoologico Ed. Licenciada' }
    );
    assert.ok(r.confidenceScore >= 60, `score = ${r.confidenceScore}`);
  });

  await test('Diferenças de espaços e separadores são normalizadas', () => {
    assert.strictEqual(
      normalizeSkuForComparison('Z-Red100-Zoologico-04'),
      normalizeSkuForComparison('Z - Red100 - Zoologico - 04')
    );
    assert.strictEqual(
      normalizeSkuForComparison('Z-Red50-Zoologico-04'),
      normalizeSkuForComparison('Z - Red50 - Zoologico - 04')
    );
  });

  await test('Letras maiúsculas e minúsculas são normalizadas', () => {
    assert.strictEqual(
      normalizeSkuForComparison('z - red80 - zoologico - 04'),
      normalizeSkuForComparison('Z - Red80 - Zoologico - 04')
    );
  });

  await test('Títulos semelhantes aumentam o score de match', () => {
    const r = calculateMatchConfidence(
      { sku: 'Z - Red150 - Zoologico - 04', title: 'Painel Zoologico 04 1.50m' },
      { sku: 'Z - Red150 - Zoologico - 04', title: 'Painel Divertido Zoo Estampa 04' }
    );
    assert.ok(r.confidenceScore >= 60, `score = ${r.confidenceScore}`);
  });

  await test('Mesmo tema/código em medidas diferentes => divergência de medida', () => {
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

  await test('Anúncio sem SKU => score baixo / sem match por SKU', () => {
    const r = calculateMatchConfidence(
      { sku: '', title: 'Painel Baby Festa (SKU pendente)' },
      { sku: 'Z - Red100 - Zoologico - 04', title: 'Painel Zoologico 1.00m' }
    );
    assert.ok(r.confidenceScore < 60, `score = ${r.confidenceScore}`);
  });

  await test('SKUs parcialmente incompatíveis (tema diferente, código igual)', () => {
    const r = calculateMatchConfidence(
      { sku: 'Z - Red50 - Zoologico - 04', title: 'Painel Zoologico 04' },
      { sku: 'Z - Red50 - Arraia - 02', title: 'Painel Arraia 02' }
    );
    // SKU difere => não deve ser match forte
    assert.ok(r.confidenceScore < 60, `score = ${r.confidenceScore}`);
  });

  await test('decomposeSku lê SKUs Festum Decor (prefixo/medida/tema/código)', () => {
    const d = decomposeSku('Z - Red50 - Zoologico - 04');
    assert.strictEqual(d.prefix, 'Z');
    assert.strictEqual(d.size, 'Red50');
    assert.strictEqual(d.theme, 'Zoologico');
    assert.strictEqual(d.code, '04');
  });

  // ============================================================
  // 6. Estados variados no dataset
  // ============================================================
  console.log('\n📋 6. Estados Variados (ativos, pausados, estoque zero/baixo)');

  await test('Dataset contém anúncios ativos e pausados', () => {
    const all = generateDemoMarketplaceData();
    const actives = all.filter(l => l.status === 'ACTIVE');
    const paused = all.filter(l => l.status === 'PAUSED');
    assert.ok(actives.length > 0);
    assert.ok(paused.length >= 5, `paused = ${paused.length}`);
  });

  await test('Dataset contém variações com estoque zero e estoque baixo', () => {
    const all = generateDemoMarketplaceData();
    const zeroStock = all.flatMap(l => l.variations).filter(v => v.stock === 0);
    const lowStock = all.flatMap(l => l.variations).filter(v => v.stock >= 1 && v.stock <= 2);
    assert.ok(zeroStock.length >= 5, `zero = ${zeroStock.length}`);
    assert.ok(lowStock.length >= 5, `low = ${lowStock.length}`);
  });

  await test('Dataset contém preços variados e múltiplas variações por anúncio', () => {
    const all = generateDemoMarketplaceData();
    const prices = new Set(all.flatMap(l => l.variations).map(v => v.price));
    assert.ok(prices.size >= 20, `preços distintos = ${prices.size}`);
    const multi = all.filter(l => l.variations.length >= 3);
    assert.ok(multi.length >= 20, `anúncios com 3+ variações = ${multi.length}`);
  });

  // ============================================================
  // RESULTADO FINAL
  // ============================================================
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 Resultado: ${passed} passaram, ${failed} falharam (total: ${passed + failed})`);
  console.log(`${'='.repeat(60)}`);

  if (failed > 0) {
    console.error('\n❌ ALGUNS TESTES FALHARAM!');
    process.exit(1);
  } else {
    console.log('\n🎉 TODOS OS TESTES AUTOMATIZADOS DO CONJUNTO DEMO FORAM CONCLUÍDOS COM SUCESSO!');
  }
}

runTests().catch(err => {
  console.error('❌ Erro fatal nos testes:', err);
  process.exit(1);
});
