export interface SkuDecomposition {
  prefix?: string;
  size?: string;
  theme?: string;
  code?: string;
}

export interface MatchScoreResult {
  confidenceScore: number; // 0 a 100
  matchLevel: 'AUTO_MATCH' | 'VERY_STRONG' | 'REQUIRES_REVISION' | 'LOW';
  compatibilities: string[];
  divergences: string[];
  reason: string;
}

/**
 * Normaliza SKUs para comparação insensível a maiúsculas/minúsculas e separadores
 * Exemplo: "Z-Red50-Zoologico-04" -> "Z-RED50-ZOOLOGICO-04"
 */
export function normalizeSkuForComparison(sku: string): string {
  if (!sku) return '';
  return sku
    .trim()
    .toUpperCase()
    .replace(/[\_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/\s*-\s*/g, '-');
}

/**
 * Decompõe a estrutura de SKU da Festum Decor
 * Exemplo: "Z - Red50 - Zoologico - 04" -> { prefix: "Z", size: "Red50", theme: "Zoologico", code: "04" }
 */
export function decomposeSku(sku: string): SkuDecomposition {
  if (!sku) return {};
  const parts = sku.split('-').map(p => p.trim());
  if (parts.length >= 4) {
    return {
      prefix: parts[0],
      size: parts[1],
      theme: parts[2],
      code: parts[3]
    };
  }
  if (parts.length === 3) {
    return {
      size: parts[0],
      theme: parts[1],
      code: parts[2]
    };
  }
  return {};
}

/**
 * Normaliza títulos para comparação inteligente removendo palavras comerciais de ruído
 */
export function normalizeListingTitleForComparison(title: string): string {
  if (!title) return '';
  const noiseWords = [
    'promoção', 'promocao', 'oferta', 'envio imediato', 'pronta entrega',
    'sublimado', 'decoração', 'decoracao', 'festa', 'painel', 'capa', 'com elástico', 'com elastico',
    'kit', 'suporte', 'mesa', 'estrutura', 'completo'
  ];

  let normalized = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\×\*\:]/g, 'x')
    .replace(/\s+x\s+/g, 'x');

  noiseWords.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    normalized = normalized.replace(regex, '');
  });

  return normalized.replace(/\s+/g, ' ').trim();
}

/**
 * Avalia o grau de equivalência entre 2 publicações / variações com múltiplos sinais
 */
export function calculateMatchConfidence(
  itemA: { 
    sku?: string; 
    title: string; 
    size?: string; 
    theme?: string; 
    code?: string;
    variationName?: string;
    imageUrl?: string | null;
    attributes?: Record<string, any>;
    variationsCount?: number;
  },
  itemB: { 
    sku?: string; 
    title: string; 
    size?: string; 
    theme?: string; 
    code?: string;
    variationName?: string;
    imageUrl?: string | null;
    attributes?: Record<string, any>;
    variationsCount?: number;
  }
): MatchScoreResult {
  const normSkuA = normalizeSkuForComparison(itemA.sku || '');
  const normSkuB = normalizeSkuForComparison(itemB.sku || '');

  const compatibilities: string[] = [];
  const divergences: string[] = [];
  let score = 0;

  // 1. Comparação de SKU Exato / Normalizado (Peso Máximo: 95 pontos se idêntico)
  if (normSkuA && normSkuB && normSkuA === normSkuB) {
    score += 95;
    compatibilities.push(`SKU idêntico (${normSkuA})`);
  } else {
    // 2. Decomposição de SKU Festum Decor (Prefixo, Medida, Tema, Código)
    const decompA = decomposeSku(normSkuA || itemA.sku || itemA.title || '');
    const decompB = decomposeSku(normSkuB || itemB.sku || itemB.title || '');

    const codeA = itemA.code || decompA.code;
    const codeB = itemB.code || decompB.code;
    const themeA = itemA.theme || decompA.theme;
    const themeB = itemB.theme || decompB.theme;
    const sizeA = itemA.size || decompA.size;
    const sizeB = itemB.size || decompB.size;

    if (codeA && codeB && codeA.toLowerCase() === codeB.toLowerCase()) {
      score += 30;
      compatibilities.push(`Código de estampa idêntico (${codeA})`);
    } else if (codeA && codeB && codeA.toLowerCase() !== codeB.toLowerCase()) {
      divergences.push(`Códigos de estampa divergentes (${codeA} vs ${codeB})`);
    }

    if (themeA && themeB && themeA.toLowerCase() === themeB.toLowerCase()) {
      score += 25;
      compatibilities.push(`Tema compatível (${themeA})`);
    } else if (themeA && themeB && themeA.toLowerCase() !== themeB.toLowerCase()) {
      divergences.push(`Temas divergentes (${themeA} vs ${themeB})`);
    }

    if (sizeA && sizeB && sizeA.toLowerCase() === sizeB.toLowerCase()) {
      score += 25;
      compatibilities.push(`Medida/Tamanho compatível (${sizeA})`);
    } else if (sizeA && sizeB && sizeA.toLowerCase() !== sizeB.toLowerCase()) {
      divergences.push(`Medidas conflitantes (${sizeA} vs ${sizeB})`);
    }
  }

  // 3. Comparação de Título Normalizado (até 30 pontos)
  const normTitleA = normalizeListingTitleForComparison(itemA.title);
  const normTitleB = normalizeListingTitleForComparison(itemB.title);

  if (normTitleA === normTitleB && normTitleA.length > 3) {
    score += 30;
    compatibilities.push('Título principal idêntico');
  } else {
    const wordsA = normTitleA.split(' ').filter(w => w.length > 2 && !['capa', 'painel', 'redondo', 'mesa'].includes(w));
    const wordsB = normTitleB.split(' ').filter(w => w.length > 2 && !['capa', 'painel', 'redondo', 'mesa'].includes(w));
    const commonWords = wordsA.filter(w => wordsB.includes(w));
    if (commonWords.length >= 1) {
      const matchScore = Math.min(25, commonWords.length * 10);
      score += matchScore;
      compatibilities.push(`Palavras-chave em comum: ${commonWords.join(', ')}`);
    }
  }

  // 4. Comparação de Estrutura de Variações e Imagens
  if (itemA.variationsCount && itemB.variationsCount && itemA.variationsCount === itemB.variationsCount) {
    score += 10;
    compatibilities.push(`Mesmo número de variações (${itemA.variationsCount})`);
  }

  if (itemA.imageUrl && itemB.imageUrl && itemA.imageUrl === itemB.imageUrl) {
    score += 15;
    compatibilities.push('URL da imagem idêntica');
  }

  // 5. Trava de Segurança por Conflito Crítico
  if (divergences.some(d => d.includes('Medidas conflitantes'))) {
    score = Math.min(score, 50); // Trava máxima de 50% se medidas divergirem (ex: Red50 vs Red80)
  }
  if (divergences.some(d => d.includes('Códigos de estampa divergentes'))) {
    score = Math.min(score, 40); // Trava máxima de 40% se estampa for diferente
  }

  const finalScore = Math.min(100, Math.max(0, score));

  // Determina Nível de Confiança
  let matchLevel: MatchScoreResult['matchLevel'] = 'LOW';
  if (finalScore >= 90) matchLevel = 'AUTO_MATCH';
  else if (finalScore >= 70) matchLevel = 'REQUIRES_REVISION';
  else if (finalScore >= 50) matchLevel = 'VERY_STRONG';

  return {
    confidenceScore: finalScore,
    matchLevel,
    compatibilities,
    divergences,
    reason: compatibilities.join(' • ') || 'Poucos sinais de correspondência encontrados.'
  };
}

