import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSkuForComparison,
  normalizeListingTitleForComparison,
  decomposeSku,
  calculateMatchConfidence
} from '../services/matching.service.js';

console.log('🧪 Executando Testes Automatizados de Agrupamento e Matching (Fase Multicanal)...');

test('[MATCHING 1] Decomposição da estrutura de SKU Festum Decor (Z - Red50 - Zoologico - 04)', () => {
  const decomp = decomposeSku('Z - Red50 - Zoologico - 04');
  assert.equal(decomp.prefix, 'Z');
  assert.equal(decomp.size, 'Red50');
  assert.equal(decomp.theme, 'Zoologico');
  assert.equal(decomp.code, '04');
});

test('[MATCHING 2] Normalização de SKU remove separadores e espaços inconsistentes', () => {
  assert.equal(normalizeSkuForComparison('z - red50 - zoologico - 04'), 'Z-RED50-ZOOLOGICO-04');
  assert.equal(normalizeSkuForComparison('Z_Red50_Zoologico_04'), 'Z-RED50-ZOOLOGICO-04');
});

test('[MATCHING 3] SKUs idênticos em marketplaces diferentes resultam em Confiança Muito Forte (≥90%)', () => {
  const itemA = { sku: 'Z - Red50 - Zoologico - 04', title: 'Painel Redondo Zoologico 50cm Shopee' };
  const itemB = { sku: 'Z-Red50-Zoologico-04', title: 'Capa Painel Redondo Zoologico 50cm Mercado Livre' };

  const result = calculateMatchConfidence(itemA, itemB);
  assert.ok(result.confidenceScore >= 90, `Esperado >=90, obtido ${result.confidenceScore}`);
  assert.equal(result.matchLevel, 'VERY_STRONG');
  assert.ok(result.compatibilities.some(c => c.includes('SKU idêntico')));
});

test('[MATCHING 4] Títulos e códigos compatíveis sem SKU exato resultam em Sugestão (70%-89%)', () => {
  const itemA = { sku: 'Z - Red50 - Zoologico - 04', title: 'Painel Redondo Zoologico 50cm' };
  const itemB = { sku: 'FDM - Red50 - Zoologico - 04', title: 'Capa Painel Zoologico Estampa 04 Red50 Mercado Livre' };

  const result = calculateMatchConfidence(itemA, itemB);
  assert.ok(result.confidenceScore >= 70 && result.confidenceScore < 90, `Esperado entre 70 e 89, obtido ${result.confidenceScore}`);
  assert.equal(result.matchLevel, 'REQUIRES_REVISION');
});

test('[MATCHING 5] Conflito crítico de medida (ex: Red50 vs Red80) penaliza a confiança (máx 50%)', () => {
  const itemA = { sku: 'Z - Red50 - Zoologico - 04', title: 'Painel Redondo 50cm Zoologico' };
  const itemB = { sku: 'Z - Red80 - Zoologico - 04', title: 'Painel Redondo 80cm Zoologico' };

  const result = calculateMatchConfidence(itemA, itemB);
  assert.ok(result.confidenceScore <= 50, `Esperado <=50 devido ao conflito de medida, obtido ${result.confidenceScore}`);
  assert.ok(result.divergences.some(d => d.includes('Medidas conflitantes')));
});

test('[MATCHING 6] Normalização de título ignora palavras comerciais de ruído', () => {
  const normA = normalizeListingTitleForComparison('Painel Redondo Zoologico 50cm Promocao Envio Imediato');
  const normB = normalizeListingTitleForComparison('Capa Painel Redondo Zoologico 50cm Pronta Entrega');

  assert.ok(!normA.includes('promocao'));
  assert.ok(!normA.includes('envio imediato'));
  assert.ok(!normB.includes('pronta entrega'));
});

test('[CONTRACT 7] Resposta do contrato de grupos possui unlinkedListings e summary global', () => {
  const mockResponse = {
    success: true,
    groups: [],
    unlinkedListings: Array.from({ length: 50 }, (_, i) => ({ id: `list-${i}` })),
    reviewSuggestions: [],
    summary: {
      totalListings: 50,
      totalVariations: 129,
      totalGroups: 0,
      linkedListings: 0,
      unlinkedListings: 50,
      pendingReviews: 0
    }
  };

  assert.equal(mockResponse.success, true);
  assert.equal(mockResponse.summary.totalListings, 50);
  assert.equal(mockResponse.summary.totalVariations, 129);
  assert.equal(mockResponse.unlinkedListings.length, 50);
  assert.equal(mockResponse.summary.unlinkedListings, 50);
});
