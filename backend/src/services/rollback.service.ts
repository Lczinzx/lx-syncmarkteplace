import { SkuQueueService } from '../jobs/sku-queue.service.js';

export class RollbackService {
  /**
   * Gera a pré-visualização de Desfazer/Rollback de um Job anterior
   */
  static generateRollbackPreview(
    originalJob: {
      id: string;
      items: Array<{
        externalListingId: string;
        externalVariationId: string;
        marketplaceAccountId: string;
        oldSku: string;
        newSku: string;
        status: string;
      }>;
    }
  ) {
    const itemsToRollback = originalJob.items.filter(i => i.status === 'SUCCESS');

    const previewItems = itemsToRollback.map(item => ({
      externalListingId: item.externalListingId,
      externalVariationId: item.externalVariationId,
      marketplaceAccountId: item.marketplaceAccountId,
      currentSku: item.newSku,       // SKU atualmente ativo pós-job
      targetRollbackSku: item.oldSku,// Resgata o SKU antigo original
      canRollback: true,
      reason: 'Pronto para desfazer alteração e restaurar SKU anterior'
    }));

    return {
      originalJobId: originalJob.id,
      totalEligible: itemsToRollback.length,
      previewItems
    };
  }

  /**
   * Executa a confirmação de Rollback criando um novo Job reverso
   */
  static async confirmRollback(
    organizationId: string,
    requestedByEmail: string,
    originalJob: {
      id: string;
      items: Array<{
        externalListingId: string;
        externalVariationId: string;
        marketplaceAccountId: string;
        marketplace?: string;
        oldSku: string;
        newSku: string;
        status: string;
      }>;
    }
  ) {
    const rollbackJobId = `job-rollback-${Date.now()}`;
    const itemsToRollback = originalJob.items.filter(i => i.status === 'SUCCESS');

    const rollbackQueueItems = itemsToRollback.map(i => ({
      externalListingId: i.externalListingId,
      externalVariationId: i.externalVariationId,
      marketplaceAccountId: i.marketplaceAccountId,
      marketplace: i.marketplace || 'MultiMarketplace',
      oldSku: i.newSku,        // SKU que foi colocado no job original
      newSku: i.oldSku         // Restaura o SKU antigo original
    }));

    const result = await SkuQueueService.processJob(rollbackJobId, organizationId, rollbackQueueItems);

    return {
      rollbackJobId,
      rollbackOfJobId: originalJob.id,
      requestedBy: requestedByEmail,
      status: result.status,
      totalItems: result.totalItems,
      successfulItems: result.successfulItems,
      failedItems: result.failedItems,
      items: result.items,
      message: `[MODO DEMONSTRAÇÃO] Rollback do Job ${originalJob.id} concluído com sucesso (${result.successfulItems} itens restaurados).`
    };
  }
}
