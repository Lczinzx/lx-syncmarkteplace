/**
 * Demo Data — LX Sync Marketplace
 * Conjunto de dados DEMO determinístico (IDs fixos, sem Date.now()) usado pelo
 * FakeMarketplaceAdapter para testes realistas de interface, matching, filtros
 * e operações em lote. Nunca se mistura com contas reais.
 */

export interface DemoVariationSpec {
  externalVariationId: string;
  externalModelId?: string;
  variationName: string;
  currentSku: string;
  price: number;
  stock: number;
  status: string;
  imageUrl?: string;
}

export interface DemoListingSpec {
  externalListingId: string;
  externalProductId: string;
  title: string;
  description: string;
  imageUrl: string;
  categoryId: string;
  status: string;
  listingUrl: string;
  variations: DemoVariationSpec[];
}

// Temas reais da Festum Decor
const THEMES = [
  { code: '04', name: 'Zoologico' },
  { code: '12', name: 'Jardim Encantado' },
  { code: '03', name: 'Setembro Amarelo' },
  { code: '08', name: 'Natal' },
  { code: '05', name: 'Fundo do Mar' },
  { code: '07', name: 'Infantil' },
  { code: '02', name: 'Arraia' }
];

const ROUND_SIZES = ['Red50', 'Red80', 'Red100', 'Red120', 'Red150', 'Red200'];
const DOOR_SIZES = ['Port85', 'Port100', 'Port120'];
const RET_SIZES = ['Ret H 150_220', 'Ret H 200_300'];
const CIL_SIZES = ['Cil50', 'Cil80', 'Cil100'];
const SPECIAL_SIZES = ['Rom200', 'DFRom200', 'CPM140'];

const BASE_PRICE = 99.9;

// Padrões de estoque por tema para gerar estados variados:
// 0 => estoque zero; 1-2 => estoque baixo; demais => normal
const STOCK_PATTERNS: number[][] = [
  [0, 3, 2, 14, 22, 5],
  [4, 18, 2, 9, 3, 25],
  [1, 7, 40, 12, 0, 30],
  [20, 2, 6, 55, 4, 8],
  [0, 0, 1, 33, 17, 9],
  [4, 12, 25, 2, 50, 6],
  [0, 1, 0, 60, 45, 3]
];

let listingCounter = 0;

function nextListingId(): string {
  listingCounter++;
  return 'FDM-' + String(listingCounter).padStart(4, '0');
}

// Imagens DEMO determinísticas (seeded) — consistentes entre execuções
function demoImage(seed: string, w = 200, h = 200): string {
  return `https://picsum.photos/seed/${seed}/${w}/${h}`;
}

function listingImage(externalListingId: string): string {
  return demoImage(`lx-${externalListingId}`, 360, 360);
}

function buildSku(prefix: string | undefined, size: string, theme: string, code: string): string {
  if (prefix) return `${prefix} - ${size} - ${theme} - ${code}`;
  return `${size} - ${theme} - ${code}`;
}

function realPrice(themeIndex: number): number {
  return BASE_PRICE + themeIndex * 12.5;
}

function stockFor(themeIndex: number, sizeIndex: number): number {
  const pattern = STOCK_PATTERNS[themeIndex % STOCK_PATTERNS.length];
  return pattern[sizeIndex % pattern.length];
}

function buildListing(
  title: string,
  themeName: string,
  productId: string,
  categoryId: string,
  status: string,
  variations: Array<{ name: string; sku: string; stock: number }>,
  priceBase: number
): DemoListingSpec {
  const externalListingId = nextListingId();
  return {
    externalListingId,
    externalProductId: productId,
    title,
    description: `${themeName} em tecido sublimado com elástico. Qualidade Festum Decor.`,
    imageUrl: listingImage(externalListingId),
    categoryId,
    status,
    listingUrl: `https://shopee.com.br/product/FESTUM/${externalListingId}`,
    variations: variations.map((v, i) => ({
      externalVariationId: `${externalListingId}-${i + 1}`,
      externalModelId: `${externalListingId}_M${i + 1}`,
      variationName: v.name,
      currentSku: v.sku,
      price: priceBase * (1 + i * 0.07),
      stock: v.stock,
      status,
      imageUrl: demoImage(`lx-${externalListingId}-var-${i + 1}`, 160, 160)
    }))
  };
}

export function generateDemoMarketplaceData(): DemoListingSpec[] {
  listingCounter = 0;
  const listings: DemoListingSpec[] = [];

  // =====================================================================
  // 1) CATÁLOGO PRINCIPAL: 7 temas x 5-6 anúncios (>= 35 anúncios)
  // =====================================================================
  THEMES.forEach((theme, themeIndex) => {
    const t = theme.name;
    const c = theme.code;

    // Painel Redondo (1.50m)
    listings.push(
      buildListing(
        `${t} ${c} - Painel Redondo (1.50m)`,
        t,
        `PROD-${c}-R1`,
        'DECOR_PARTY',
        'ACTIVE',
        ROUND_SIZES.slice(0, 4).map((s, i) => ({
          name: `Tamanho ${s}`,
          sku: buildSku('Z', s, t, c),
          stock: stockFor(themeIndex, i)
        })),
        realPrice(themeIndex)
      )
    );

    // Painel Redondo Grande (2.00m)
    listings.push(
      buildListing(
        `${t} ${c} - Painel Redondo Grande (2.00m)`,
        t,
        `PROD-${c}-R2`,
        'DECOR_PARTY',
        'ACTIVE',
        [
          { name: 'Red200', sku: buildSku('Z', 'Red200', t, c), stock: stockFor(themeIndex, 4) },
          { name: 'Red150', sku: buildSku('Z', 'Red150', t, c), stock: stockFor(themeIndex, 5) }
        ],
        realPrice(themeIndex)
      )
    );

    // Cilindro Decorativo
    listings.push(
      buildListing(
        `${t} ${c} - Cilindro Decorativo`,
        t,
        `PROD-${c}-C1`,
        'PARTY_PROPS',
        'ACTIVE',
        CIL_SIZES.map((s, i) => ({
          name: `Cilindro ${s}`,
          sku: buildSku('Z', s, t, c),
          stock: stockFor(themeIndex, i + 1)
        })),
        realPrice(themeIndex) * 0.5
      )
    );

    // Banner Retangular
    listings.push(
      buildListing(
        `${t} ${c} - Banner Retangular`,
        t,
        `PROD-${c}-RT`,
        'BANNER',
        'ACTIVE',
        RET_SIZES.map((s, i) => ({
          name: s,
          sku: buildSku(undefined, s, t, c),
          stock: stockFor(themeIndex, i + 2)
        })),
        realPrice(themeIndex) * 1.2
      )
    );

    // Capa de Porta
    listings.push(
      buildListing(
        `${t} ${c} - Capa de Porta`,
        t,
        `PROD-${c}-P1`,
        'PARTY_PROPS',
        'ACTIVE',
        DOOR_SIZES.map((s, i) => ({
          name: s,
          sku: buildSku('Z', s, t, c),
          stock: stockFor(themeIndex, i + 1)
        })),
        realPrice(themeIndex) * 0.8
      )
    );

    // Topper (pausado de propósito para variar estados)
    listings.push(
      buildListing(
        `${t} ${c} - Topper`,
        t,
        `PROD-${c}-T1`,
        'DECOR_PARTY',
        'PAUSED',
        SPECIAL_SIZES.slice(0, 2).map((s, i) => ({
          name: s,
          sku: buildSku('Z', s, t, c),
          stock: stockFor(themeIndex, i + 3)
        })),
        realPrice(themeIndex) * 0.65
      )
    );
  });

  // =====================================================================
  // 2) CASOS PARA VALIDAR O MATCHING SERVICE
  // =====================================================================

  // a) SKUs idênticos em anúncios diferentes (produto licenciado)
  listings.push(
    buildListing(
      'Painel Zoologico 04 Ed. Licenciada (1.50m)',
      'Zoologico',
      'PROD-LIC-01',
      'DECOR_PARTY',
      'ACTIVE',
      [
        { name: 'Red150', sku: 'Z - Red150 - Zoologico - 04', stock: 12 },
        { name: 'Red120', sku: 'Z - Red120 - Zoologico - 04', stock: 4 }
      ],
      realPrice(0) * 1.1
    )
  );

  // b) Diferenças de espaços e separadores (mesmo SKU sem espaços)
  listings.push(
    buildListing(
      'Painel Zoologico 04 SEM Espaços',
      'Zoologico',
      'PROD-SP-01',
      'DECOR_PARTY',
      'ACTIVE',
      [
        { name: 'Red100', sku: 'Z-Red100-Zoologico-04', stock: 0 },
        { name: 'Red50', sku: 'Z-Red50-Zoologico-04', stock: 9 }
      ],
      realPrice(0)
    )
  );

  // c) Letras maiúsculas e minúsculas
  listings.push(
    buildListing(
      'painel zoologico 04 (caixa baixa)',
      'Zoologico',
      'PROD-CS-01',
      'DECOR_PARTY',
      'ACTIVE',
      [{ name: 'Red80', sku: 'z - red80 - zoologico - 04', stock: 22 }],
      realPrice(0)
    )
  );

  // d) Títulos semelhantes com SKU real (pausado + estoque zero)
  listings.push(
    buildListing(
      'Painel Divertido Zoo Estampa 04',
      'Zoologico',
      'PROD-TT-01',
      'DECOR_PARTY',
      'PAUSED',
      [{ name: 'Red150', sku: 'Z - Red150 - Zoologico - 04', stock: 0 }],
      realPrice(0)
    )
  );

  // e) Mesmo tema e código em medidas diferentes
  listings.push(
    buildListing(
      'Painel Zoologico Quarto (Red100/Red120)',
      'Zoologico',
      'PROD-MD-01',
      'DECOR_PARTY',
      'ACTIVE',
      ROUND_SIZES.slice(2, 4).map((s, i) => ({
        name: s,
        sku: buildSku('Z', s, 'Zoologico', '04'),
        stock: stockFor(0, i + 1)
      })),
      realPrice(0)
    )
  );

  // f) Anúncios SEM SKU
  listings.push(
    buildListing(
      'Painel Baby Festa (SKU pendente)',
      'Infantil',
      'PROD-NS-01',
      'DECOR_PARTY',
      'ACTIVE',
      [
        { name: 'Red100', sku: '', stock: 8 },
        { name: 'Red80', sku: '', stock: 3 }
      ],
      realPrice(5)
    )
  );

  // g) SKUs parcialmente incompatíveis (código igual, tema diferente)
  listings.push(
    buildListing(
      'Painel Arraia Estampa 02 (conflito)',
      'Arraia',
      'PROD-PC-01',
      'DECOR_PARTY',
      'ACTIVE',
      [
        { name: 'Red50', sku: 'Z - Red50 - Zoologico - 04', stock: 4 },
        { name: 'Red50', sku: 'Z - Red50 - Arraia - 02', stock: 6 }
      ],
      realPrice(6)
    )
  );

  // h) Preços variados e múltiplas variações (anúncio premium)
  listings.push(
    buildListing(
      'Painel Zoologico Premium (Vários tamanhos)',
      'Zoologico',
      'PROD-PR-01',
      'DECOR_PARTY',
      'ACTIVE',
      ROUND_SIZES.slice(0, 5).map((s, i) => ({
        name: s,
        sku: buildSku('Z', s, 'Zoologico', '04'),
        stock: stockFor(2, i)
      })),
      realPrice(2)
    )
  );

  return listings;
}
