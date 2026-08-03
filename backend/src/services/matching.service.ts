export interface SkuDecomposition {
  prefix?: string;
  size?: string;
  theme?: string;
  code?: string;
}

export interface MatchScoreResult {
  confidenceScore: number; // 0 a 100
  matchLevel: 'VERY_STRONG' | 'PROBABLE' | 'REQUIRES_REVISION' | 'LOW';
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
  return {};
}

/**
 * Normaliza títulos para comparação inteligente removendo palavras comerciais de ruído
 */
export function normalizeListingTitleForComparison(title: string): string {
  if (!title) return '';
  const noiseWords = [
    'promoção', 'promocao', 'oferta', 'envio imediato', 'pronta entrega',
    'sublimado', 'decoração', 'decoracao', 'festa', 'painel', 'capa', 'com elástico', 'com elastico'
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
 * Avalia o grau de equivalência entre 2 publicações / variações
 */
export function calculateMatchConfidence(
  itemA: { sku: string; title: string; size?: string; theme?: string; code?: string },
  itemB: { sku: string; title: string; size?: string; theme?: string; code?: string }
): MatchScoreResult {
  const normSkuA = normalizeSkuForComparison(itemA.sku);
  const normSkuB = normalizeSkuForComparison(itemB.sku);

  const compatibilities: string[] = [];
  const divergences: string[] = [];
  let score = 0;

  // 1. Comparação de SKU (Peso Alto: 60 pontos)
  if (normSkuA && normSkuB && normSkuA === normSkuB) {
    score += 60;
    compatibilities.push(`SKU idêntico (${normSkuA})`);
  } else if (normSkuA && normSkuB) {
    const decompA = decomposeSku(normSkuA);
    const decompB = decomposeSku(normSkuB);
    if (decompA.code && decompB.code && decompA.code === decompB.code) {
      score += 25;
      compatibilities.push(`Código de estampa compatível (${decompA.code})`);
    }
    if (decompA.size && decompB.size && decompA.size === decompB.size) {
      score += 20;
      compatibilities.push(`Medida/Tamanho compatível (${decompA.size})`);
    } else if (decompA.size && decompB.size && decompA.size !== decompB.size) {
      divergences.push(`Medidas conflitantes (${decompA.size} vs ${decompB.size})`);
    }
  }

  // 2. Comparação de Título Normalizado (Peso Médio: 30 pontos)
  const normTitleA = normalizeListingTitleForComparison(itemA.title);
  const normTitleB = normalizeListingTitleForComparison(itemB.title);

  if (normTitleA === normTitleB && normTitleA.length > 3) {
    score += 30;
    compatibilities.push('Título principal idêntico');
  } else {
    const wordsA = normTitleA.split(' ').filter(w => w.length > 2);
    const wordsB = normTitleB.split(' ').filter(w => w.length > 2);
    const commonWords = wordsA.filter(w => wordsB.includes(w));
    if (commonWords.length >= 2) {
      const meScore = Math.min(25, commonWords.length * 8);
      score += meScore;
      compatibilities.push(`Palavras-chave em comum: ${commonWords.join(', ')}`);
    }
  }

  // 3. Regra de Trava se Houver Conflito Crítico de Medida
  if (divergences.some(d => d.includes('Medidas conflitantes'))) {
    score = Math.min(score, 50); // Trava máxima de 50% se as medidas forem incompatíveis
  }

  const finalScore = Math.min(100, score);
  let matchLevel: MatchScoreResult['matchLevel'] = 'LOW';
  if (finalScore >= 95) matchLevel = 'VERY_STRONG';
  else if (finalScore >= 80) matchLevel = 'PROBABLE';
  else if (finalScore >= 60) matchLevel = 'REQUIRES_REVISION';

  return {
    confidenceScore: finalScore,
    matchLevel,
    compatibilities,
    divergences,
    reason: compatibilities.join(' • ') || 'Poucos sinais de correspondência encontrados.'
  };
}
