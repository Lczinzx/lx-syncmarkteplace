import { describe, it } from 'node:test';
import assert from 'node:assert';
import { applySkuTransformation } from '../services/transformation.service.js';
import { decomposeSku } from '../services/matching.service.js';
import { SkuQueueService } from '../jobs/sku-queue.service.js';

describe('⚡ TESTES AUTOMATIZADOS DA FASE 3 (LX SYNC BACKEND)', () => {
  it('1. Testes de Transformação de SKUs (NORMALIZE_SEPARATORS, ADD_PREFIX, REPLACE_TEXT)', () => {
    const t1 = applySkuTransformation('Z-Red50-Zoologico-04', { type: 'NORMALIZE_SEPARATORS' });
    assert.strictEqual(t1, 'Z - Red50 - Zoologico - 04', 'Normalização de separadores deve formatar hífens e espaços');

    const t2 = applySkuTransformation('Red50', { type: 'ADD_PREFIX', prefix: 'Z - ' });
    assert.strictEqual(t2, 'Z - Red50', 'Prefixagem de SKU deve adicionar o prefixo');

    const t3 = applySkuTransformation('Z - Red50 - Zoologico - 04', { type: 'REPLACE_TEXT', findText: 'Red50', replaceText: 'Red150' });
    assert.strictEqual(t3, 'Z - Red150 - Zoologico - 04', 'Substituição de texto no SKU deve trocar Red50 por Red150');
  });

  it('2. Testes do Parser de SKU Festum Decor (prefixo, medida, tema, código)', () => {
    const decomp = decomposeSku('Z - Red50 - Zoologico - 04');
    assert.strictEqual(decomp.prefix, 'Z', 'Prefix deve ser Z');
    assert.strictEqual(decomp.size, 'Red50', 'Size deve ser Red50');
    assert.strictEqual(decomp.theme, 'Zoologico', 'Theme deve ser Zoologico');
    assert.strictEqual(decomp.code, '04', 'Code deve ser 04');
  });

  it('3. Teste de Gerador de Chave de Idempotência SHA-256', () => {
    const key1 = SkuQueueService.generateIdempotencyKey('org-1', 'acc-1', 'MLB123', 'VAR1', 'OLD', 'NEW');
    const key2 = SkuQueueService.generateIdempotencyKey('org-1', 'acc-1', 'MLB123', 'VAR1', 'OLD', 'NEW');
    assert.strictEqual(key1, key2, 'Chaves de idempotência com mesmos parâmetros devem ser idênticas');
  });

  it('4. Teste de Fila Assíncrona e Confirmação de Job', async () => {
    const jobResult = await SkuQueueService.processJob('job-test-1', 'org-festum-decor', [
      {
        externalListingId: 'MLB123',
        externalVariationId: 'VAR333',
        marketplaceAccountId: 'acc-shopee-demo',
        marketplace: 'shopee',
        oldSku: 'Z - Red50 - Zoologico - 04',
        newSku: 'Z - Red50 - Zoologico - 99'
      }
    ]);

    assert.strictEqual(jobResult.status, 'COMPLETED');
    assert.strictEqual(jobResult.totalItems, 1);
    assert.strictEqual(jobResult.successfulItems, 1);
  });
});
