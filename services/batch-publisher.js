/**
 * Batch Publisher Service - LX Sync Marketplace
 * Gerencia a publicação simultânea de produtos/anúncios em múltiplas contas e plataformas.
 */

import { StorageService } from './storage.js';
import { SyncEngine } from './sync-engine.js';

export class BatchPublisher {
  /**
   * Publica um produto simultaneamente em múltiplas contas de marketplaces.
   *
   * @param {Object} productData - { masterSku, title, category, unitPrice, totalStock, description, imageUrl, channelOverrides }
   * @param {Array<string>} targetAccountIds - IDs das contas selecionadas
   * @param {Function} onProgress - Callback para atualizar interface (accountId, status, detail)
   * @param {Array<Object>} accounts - Contas ATUAIS vindas da API (fonte única)
   */
  static async publishToAccounts(productData, targetAccountIds, onProgress = null, accounts = []) {
    if (!targetAccountIds || targetAccountIds.length === 0) {
      throw new Error('Selecione pelo menos uma conta para publicar.');
    }

    if (!productData.masterSku || !productData.title || !productData.unitPrice) {
      throw new Error('Título, SKU Master e Preço são obrigatórios.');
    }

    // Somente IDs que existem na lista atual da API
    const selectedAccounts = accounts.filter(a => targetAccountIds.includes(a.id));

    if (selectedAccounts.length === 0) {
      throw new Error('Nenhuma conta válida foi selecionada. Atualize a lista de contas (API).');
    }
    if (selectedAccounts.length < targetAccountIds.length) {
      throw new Error('Uma ou mais contas selecionadas não existem mais no backend. Atualize a lista.');
    }

    // Inicializa progresso na interface
    if (onProgress) {
      selectedAccounts.forEach(acc => {
        onProgress({ accountId: acc.id, status: 'pending', message: 'Aguardando envio...' });
      });
    }

    const results = [];
    const createdMappings = {};

    // Processamento simultâneo via Promise.allSettled
    const publishPromises = selectedAccounts.map(async (acc) => {
      if (onProgress) {
        onProgress({ accountId: acc.id, status: 'publishing', message: `Publicando em ${acc.sellerName || acc.platformName}...` });
      }

      try {
        const adapter = await SyncEngine.getAdapterForAccount(acc);
        
        // Verifica se há customização por canal
        const channelOverride = productData.channelOverrides && productData.channelOverrides[acc.platform] || {};
        const finalPayload = {
          ...productData,
          title: channelOverride.title || productData.title,
          unitPrice: channelOverride.unitPrice || productData.unitPrice
        };

        const res = await adapter.createListing(finalPayload);

        if (res.success) {
          if (onProgress) {
            onProgress({
              accountId: acc.id,
              status: 'success',
              message: `Publicado! Código: ${res.itemCode}`,
              result: res
            });
          }

          createdMappings[acc.id] = {
            accountId: acc.id,
            platform: acc.platform,
            itemCode: res.itemCode,
            title: finalPayload.title,
            stock: Number(productData.totalStock),
            active: true,
            url: res.url
          };

          return { accountId: acc.id, success: true, res };
        } else {
          throw new Error(res.message || 'Falha na API do marketplace');
        }
      } catch (err) {
        if (onProgress) {
          onProgress({
            accountId: acc.id,
            status: 'error',
            message: `Erro ao publicar: ${err.message}`
          });
        }
        return { accountId: acc.id, success: false, error: err.message };
      }
    });

    const settledResults = await Promise.allSettled(publishPromises);
    settledResults.forEach(sr => {
      if (sr.status === 'fulfilled') {
        results.push(sr.value);
      }
    });

    const successCount = results.filter(r => r.success).length;

    // Registra/atualiza o SKU Master no banco de dados central com os novos mapeamentos
    const totalStock = Number(productData.totalStock) || 10;
    const newSku = {
      id: 'sku-' + Date.now(),
      masterSku: productData.masterSku.trim().toUpperCase(),
      name: productData.title.trim(),
      category: productData.category || 'Geral',
      totalStock: totalStock,
      reservedStock: 0,
      availableStock: totalStock,
      minStockAlert: 5,
      unitPrice: Number(productData.unitPrice),
      status: 'synced',
      updatedAt: new Date().toISOString(),
      mappings: createdMappings
    };

    await StorageService.updateSku(newSku);

    // Registra Log de Auditoria
    await StorageService.addLog({
      type: 'multi_post',
      status: successCount > 0 ? 'success' : 'error',
      masterSku: newSku.masterSku,
      marketplace: `Multicanal (${successCount}/${selectedAccounts.length} contas)`,
      oldStock: 0,
      newStock: totalStock,
      trigger: 'multi_post_publisher',
      message: `Postagem multicanal efetuada com sucesso em ${successCount} de ${selectedAccounts.length} contas selecionadas.`
    });

    return {
      success: successCount > 0,
      successCount,
      totalCount: selectedAccounts.length,
      sku: newSku,
      results
    };
  }
}
