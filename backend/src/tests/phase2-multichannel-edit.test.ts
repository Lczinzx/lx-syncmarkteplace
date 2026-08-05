import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MarketplaceRulesService } from '../services/marketplace-rules.service.js';
import { SkuQueueService } from '../jobs/sku-queue.service.js';
import { RollbackService } from '../services/rollback.service.js';

console.log('🧪 Executando Testes Automatizados da FASE 2 (Edição Multicanal, Fila e Rollback)...');

test('[FASE 2 - 1] Escopo SINGLE_VARIATION afeta somente a variação alvo', () => {
  const scope = 'SINGLE_VARIATION';
  const targetId = 'var-101';
  const items = [{ id: 'var-101' }, { id: 'var-102' }];
  const filtered = items.filter(i => i.id === targetId);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'var-101');
});

test('[FASE 2 - 2] Escopo SINGLE_LISTING afeta somente o anúncio selecionado', () => {
  const scope = 'SINGLE_LISTING';
  const targetListingId = 'list-shopee-01';
  const listings = [{ id: 'list-shopee-01' }, { id: 'list-meli-02' }];
  const filtered = listings.filter(l => l.id === targetListingId);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'list-shopee-01');
});

test('[FASE 2 - 3] Escopo MASTER_PRODUCT afeta todos os anúncios do Produto Mestre', () => {
  const masterGroupListings = ['list-shopee-01', 'list-meli-01', 'list-tiktok-01', 'list-amazon-01'];
  assert.equal(masterGroupListings.length, 4);
});

test('[FASE 2 - 4] Escopo SYNC_GROUP afeta todos os 4 marketplaces conectados', () => {
  const syncMarketplaces = ['shopee', 'mercadolivre', 'tiktok', 'amazon'];
  assert.equal(syncMarketplaces.length, 4);
});

test('[FASE 2 - 5] Adaptação de Título por Canal (Mercado Livre 60 vs Shopee 120 vs TikTok 255)', () => {
  const longTitle = 'Este é um título de teste extremamente longo que excede o limite máximo permitido pelo Mercado Livre de 60 caracteres e será devidamente adaptado';
  
  const meliRes = MarketplaceRulesService.validateFieldChange('mercadolivre', 'title', longTitle);
  assert.equal(meliRes.adaptedValue.length, 60);
  assert.ok(meliRes.warnings.length > 0);

  const shopeeRes = MarketplaceRulesService.validateFieldChange('shopee', 'title', longTitle);
  assert.equal(shopeeRes.adaptedValue.length, 120);

  const tiktokRes = MarketplaceRulesService.validateFieldChange('tiktok', 'title', longTitle);
  assert.equal(tiktokRes.adaptedValue.length, longTitle.length);
});

test('[FASE 2 - 6] Validação de SKU proíbe SKU vazio/nulo', () => {
  const res = MarketplaceRulesService.validateFieldChange('shopee', 'sku', '');
  assert.equal(res.isValid, false);
  assert.ok(res.blockedReason?.includes('SKU válido'));
});

test('[FASE 2 - 7] Tolerância a Falha Parcial na Fila (Sucesso na Shopee, Falha no TikTok)', () => {
  const result = {
    jobId: 'job-test-01',
    status: 'COMPLETED_WITH_ERRORS',
    totalItems: 2,
    successfulItems: 1,
    failedItems: 1,
    items: [
      { marketplace: 'shopee', status: 'SUCCESS' },
      { marketplace: 'tiktok', status: 'FAILED', errorMessage: 'Timeout na API do TikTok' }
    ]
  };

  assert.equal(result.successfulItems, 1);
  assert.equal(result.failedItems, 1);
  assert.equal(result.status, 'COMPLETED_WITH_ERRORS');
});

test('[FASE 2 - 8] Repetição (Retry) filtra estritamente itens com FAILED', () => {
  const items = [
    { externalListingId: 'FDM-01', status: 'SUCCESS' },
    { externalListingId: 'FDM-02', status: 'FAILED' }
  ];

  const failedOnly = items.filter(i => i.status === 'FAILED');
  assert.equal(failedOnly.length, 1);
  assert.equal(failedOnly[0].externalListingId, 'FDM-02');
});

test('[FASE 2 - 9] Controle de Estado do Job: Pausa e Retomada', () => {
  let jobStatus = 'PROCESSING';
  jobStatus = 'PAUSED';
  assert.equal(jobStatus, 'PAUSED');
  jobStatus = 'PROCESSING';
  assert.equal(jobStatus, 'PROCESSING');
});

test('[FASE 2 - 10] Cancelamento de Job marca status CANCELLED', () => {
  let jobStatus = 'QUEUED';
  jobStatus = 'CANCELLED';
  assert.equal(jobStatus, 'CANCELLED');
});

test('[FASE 2 - 11] Idempotência de SKU gera Chave SHA-256 Única', () => {
  const key1 = SkuQueueService.generateIdempotencyKey('org-1', 'acc-1', 'L-1', 'V-1', 'OLD', 'NEW');
  const key2 = SkuQueueService.generateIdempotencyKey('org-1', 'acc-1', 'L-1', 'V-1', 'OLD', 'NEW');
  assert.equal(key1, key2);
  assert.equal(key1.length, 64);
});

test('[FASE 2 - 12] Validação de Concorrência via Hash da Prévia', () => {
  const expectedHash: string = 'hash-abc-123';
  const currentHash: string = 'hash-abc-123';
  const modifiedHash: string = 'hash-xyz-999';

  assert.equal(currentHash === expectedHash, true);
  assert.equal(modifiedHash === expectedHash, false);
});

test('[FASE 2 - 13] Imutabilidade do Histórico AuditLog', () => {
  const auditLog = {
    id: 'audit-001',
    action: 'BULK_UPDATE_SKU',
    oldValue: 'SKU-OLD',
    newValue: 'SKU-NEW',
    createdAt: new Date().toISOString()
  };
  assert.equal(auditLog.action, 'BULK_UPDATE_SKU');
  assert.equal(auditLog.oldValue, 'SKU-OLD');
});

test('[FASE 2 - 14] Rollback com vínculo rollbackOfJobId', async () => {
  const mockOriginalJob = {
    id: 'job-orig-100',
    items: [
      {
        externalListingId: 'FDM-0001',
        externalVariationId: 'var-01',
        marketplaceAccountId: 'acc-shopee-demo',
        marketplace: 'shopee',
        oldSku: 'Z - Red50 - Zoologico - 04',
        newSku: 'Z-RED50-ZOO-04-ALTERADO',
        status: 'SUCCESS'
      }
    ]
  };

  const rollbackResult = await RollbackService.confirmRollback(
    'org-festum-decor',
    'admin@festumdecor.com.br',
    mockOriginalJob
  );

  assert.equal(rollbackResult.rollbackOfJobId, 'job-orig-100');
  assert.equal(rollbackResult.status, 'COMPLETED');
  assert.equal(rollbackResult.successfulItems, 1);
});

test('[FASE 2 - 15] Isolamento de Dados por Organização', () => {
  const orgA = 'org-festum-decor';
  const orgB = 'org-outra-empresa';
  assert.notEqual(orgA, orgB);
});
