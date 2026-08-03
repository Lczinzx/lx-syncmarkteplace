import crypto from 'node:crypto';
import { FakeMarketplaceAdapter } from '../marketplaces/fake-marketplace.adapter.js';

export interface SkuJobItemRecord {
  id: string;
  skuChangeJobId: string;
  marketplaceAccountId: string;
  externalListingId: string;
  externalVariationId: string;
  oldSku: string;
  newSku: string;
  status: 'PENDING' | 'QUEUED' | 'PROCESSING' | 'CONFIRMING' | 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'CANCELLED';
  attempts: number;
  idempotencyKey: string;
  errorMessage?: string;
  processedAt?: string;
}

export class SkuQueueService {
  /**
   * Gera a Chave de Idempotência SHA-256 única para o item
   */
  static generateIdempotencyKey(
    organizationId: string,
    marketplaceAccountId: string,
    externalListingId: string,
    externalVariationId: string,
    oldSku: string,
    newSku: string,
    operation = 'BULK_SKU_UPDATE'
  ): string {
    const raw = `${organizationId}:${marketplaceAccountId}:${externalListingId}:${externalVariationId}:${oldSku}:${newSku}:${operation}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Processa o lote de alteração de SKU item a item com confirmação e idempotência
   */
  static async processJob(
    jobId: string,
    organizationId: string,
    items: Array<{
      externalListingId: string;
      externalVariationId: string;
      marketplaceAccountId: string;
      marketplace: string;
      oldSku: string;
      newSku: string;
    }>
  ) {
    const processedItems: SkuJobItemRecord[] = [];
    let successCount = 0;
    let failCount = 0;

    for (const item of items) {
      const idempotencyKey = this.generateIdempotencyKey(
        organizationId,
        item.marketplaceAccountId,
        item.externalListingId,
        item.externalVariationId,
        item.oldSku,
        item.newSku
      );

      const adapter = new FakeMarketplaceAdapter(item.marketplace, item.marketplaceAccountId);

      try {
        // Step 1: Envia atualização via Adapter
        const updateRes = await adapter.updateVariationSku({
          externalListingId: item.externalListingId,
          externalVariationId: item.externalVariationId,
          oldSku: item.oldSku,
          newSku: item.newSku,
          idempotencyKey
        });

        // Step 2: Confirmação pós-HTTP 200 (Re-consulta do SKU no adapter)
        const confirmRes = await adapter.confirmSkuChange({
          externalListingId: item.externalListingId,
          externalVariationId: item.externalVariationId,
          expectedSku: item.newSku
        });

        if (updateRes.success && confirmRes.confirmed) {
          successCount++;
          processedItems.push({
            id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            skuChangeJobId: jobId,
            marketplaceAccountId: item.marketplaceAccountId,
            externalListingId: item.externalListingId,
            externalVariationId: item.externalVariationId,
            oldSku: item.oldSku,
            newSku: item.newSku,
            status: 'SUCCESS',
            attempts: 1,
            idempotencyKey,
            processedAt: new Date().toISOString()
          });
        } else {
          failCount++;
          processedItems.push({
            id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            skuChangeJobId: jobId,
            marketplaceAccountId: item.marketplaceAccountId,
            externalListingId: item.externalListingId,
            externalVariationId: item.externalVariationId,
            oldSku: item.oldSku,
            newSku: item.newSku,
            status: 'FAILED',
            attempts: 1,
            idempotencyKey,
            errorMessage: confirmRes.message || 'Falha ao confirmar a alteração do SKU no marketplace',
            processedAt: new Date().toISOString()
          });
        }
      } catch (err: unknown) {
        failCount++;
        const msg = err instanceof Error ? err.message : String(err);
        processedItems.push({
          id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          skuChangeJobId: jobId,
          marketplaceAccountId: item.marketplaceAccountId,
          externalListingId: item.externalListingId,
          externalVariationId: item.externalVariationId,
          oldSku: item.oldSku,
          newSku: item.newSku,
          status: 'FAILED',
          attempts: 1,
          idempotencyKey,
          errorMessage: msg,
          processedAt: new Date().toISOString()
        });
      }
    }

    return {
      jobId,
      status: failCount === 0 ? 'COMPLETED' : 'COMPLETED_WITH_ERRORS',
      totalItems: items.length,
      successfulItems: successCount,
      failedItems: failCount,
      items: processedItems
    };
  }
}
