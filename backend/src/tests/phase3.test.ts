import assert from 'node:assert';
import { applySkuTransformation } from '../services/transformation.service.js';
import { decomposeSku } from '../services/matching.service.js';
import { PreviewService } from '../services/preview.service.js';
import { SkuQueueService } from '../jobs/sku-queue.service.js';
import { RollbackService } from '../services/rollback.service.js';

console.log('🧪 Executando Testes Automatizados da FASE 3 (LX Sync Backend)...');

// 1. Testes de Transformação de SKUs
const t1 = applySkuTransformation('Z-Red50-Zoologico-04', { type: 'NORMALIZE_SEPARATORS' });
assert.strictEqual(t1, 'Z - Red50 - Zoologico - 04', 'Normalização de separadores deve formatar hífens e espaços');

const t2 = applySkuTransformation('Red50', { type: 'ADD_PREFIX', prefix: 'Z - ' });
assert.strictEqual(t2, 'Z - Red50', 'Prefixagem de SKU deve adicionar o prefixo');

const t3 = applySkuTransformation('Z - Red50 - Zoologico - 04', { type: 'REPLACE_TEXT', findText: 'Red50', replaceText: 'Red150' });
assert.strictEqual(t3, 'Z - Red150 - Zoologico - 04', 'Substituição de texto no SKU deve trocar Red50 por Red150');
console.log('✅ 1. Testes de Transformação de SKUs: PASSOU');

// 2. Testes de Decomposição Festum Decor SKU
const decomp = decomposeSku('Z - Red50 - Zoologico - 04');
assert.strictEqual(decomp.prefix, 'Z', 'Prefix deve ser Z');
assert.strictEqual(decomp.size, 'Red50', 'Size deve ser Red50');
assert.strictEqual(decomp.theme, 'Zoologico', 'Theme deve ser Zoologico');
assert.strictEqual(decomp.code, '04', 'Code deve ser 04');
console.log('✅ 2. Testes do Parser de SKU Festum Decor: PASSOU');

// 3. Teste de Idempotência SHA-256
const key1 = SkuQueueService.generateIdempotencyKey('org-1', 'acc-1', 'MLB123', 'VAR1', 'OLD', 'NEW');
const key2 = SkuQueueService.generateIdempotencyKey('org-1', 'acc-1', 'MLB123', 'VAR1', 'OLD', 'NEW');
assert.strictEqual(key1, key2, 'Chaves de idempotência com mesmos parâmetros devem ser idênticas');
console.log('✅ 3. Teste de Gerador de Chave de Idempotência SHA-256: PASSOU');

// 4. Teste de Fila Assíncrona e Confirmação
async function testQueueAndRollback() {
  const jobResult = await SkuQueueService.processJob('job-test-1', 'org-festum-decor', [
    {
      externalListingId: 'MLB123',
      externalVariationId: 'VAR333',
      marketplaceAccountId: 'acc-meli-1',
      marketplace: 'meli',
      oldSku: 'Z-Red50-Zoo-04',
      newSku: 'Z - Red50 - Zoologico - 04'
    }
  ]);

  assert.strictEqual(jobResult.status, 'COMPLETED', 'Job simulado deve completar com sucesso');
  assert.strictEqual(jobResult.successfulItems, 1, '1 item deve ser atualizado e confirmado com sucesso');

  // 5. Teste de Rollback / Desfazer
  const rollbackPreview = RollbackService.generateRollbackPreview({
    id: jobResult.jobId,
    items: jobResult.items.map(i => ({ ...i, oldSku: i.oldSku, newSku: i.newSku, status: i.status }))
  });

  assert.strictEqual(rollbackPreview.totalEligible, 1, '1 item elegível para desfazer');
  assert.strictEqual(rollbackPreview.previewItems[0].targetRollbackSku, 'Z-Red50-Zoo-04', 'SKU de rollback deve ser o antigo original');

  const rollbackExec = await RollbackService.confirmRollback('org-festum-decor', 'lucas@gmail.com', {
    id: jobResult.jobId,
    items: jobResult.items.map(i => ({ ...i, oldSku: i.oldSku, newSku: i.newSku, status: i.status }))
  });

  assert.strictEqual(rollbackExec.successfulItems, 1, 'Rollback deve restaurar 1 item com sucesso');
  console.log('✅ 4. Teste de Fila Assíncrona e Rollback/Desfazer: PASSOU');
}

testQueueAndRollback().then(() => {
  console.log('\n🎉 TODOS OS TESTES AUTOMATIZADOS DA FASE 3 FORAM CONCLUÍDOS COM SUCESSO!');
}).catch(err => {
  console.error('❌ Falha nos testes da Fase 3:', err);
  process.exit(1);
});
