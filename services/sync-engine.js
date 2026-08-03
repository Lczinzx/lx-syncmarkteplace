/**
 * Sync Engine - LX Sync Marketplace
 * Motor central de regras de negócio e sincronização de estoques.
 */

import { StorageService } from './storage.js';
import { MeliAdapter } from './adapters/meli-adapter.js';
import { ShopeeAdapter } from './adapters/shopee-adapter.js';
import { TikTokAdapter } from './adapters/tiktok-adapter.js';
import { MockAdapter } from './adapters/mock-adapter.js';

export class SyncEngine {
  /**
   * Instancia o adapter adequado para uma conta específica
   */
  static async getAdapterForAccount(accountConfig) {
    const settings = await StorageService.getSettings();
    const platform = accountConfig.platform || 'meli';

    if (settings.demoMode) {
      const name = accountConfig.sellerName || accountConfig.platformName || accountConfig.platform;
      return new MockAdapter(name, accountConfig);
    }

    switch (platform) {
      case 'meli':
        return new MeliAdapter(accountConfig);
      case 'shopee':
        return new ShopeeAdapter(accountConfig);
      case 'tiktok':
        return new TikTokAdapter(accountConfig);
      default:
        return new MockAdapter(accountConfig.platformName || platform, accountConfig);
    }
  }

  /**
   * Instancia o adapter adequado para um marketplace específico
   * (as contas vêm da API — nunca de storage local)
   */
  static async getAdapter(marketplaceKey, accounts = []) {
    const accountConfig = accounts.find(a => a.platform === marketplaceKey || a.id === marketplaceKey) || { platform: marketplaceKey };
    return await this.getAdapterForAccount(accountConfig);
  }

  /**
   * Calcula o estoque efetivamente disponível para sincronização
   */
  static calculateEffectiveStock(sku, settings) {
    const total = sku.totalStock || 0;
    const reserved = sku.reservedStock || 0;
    const buffer = settings.oversellingSafetyBuffer || 0;
    return Math.max(0, total - reserved - buffer);
  }

  /**
   * Sincroniza um único SKU Master para todas as contas e canais mapeados
   */
  static async syncSku(skuId, triggerSource = 'manual', accounts = []) {
    const skus = await StorageService.getSkus();
    const skuIndex = skus.findIndex(s => s.id === skuId);
    if (skuIndex === -1) throw new Error(`SKU ID ${skuId} não encontrado.`);

    const sku = skus[skuIndex];
    const settings = await StorageService.getSettings();
    const targetStock = this.calculateEffectiveStock(sku, settings);

    const results = [];
    let anyError = false;

    if (sku.mappings) {
      for (const [mapKey, mapping] of Object.entries(sku.mappings)) {
        if (!mapping || !mapping.active || !mapping.itemCode) {
          continue;
        }

        // Tenta encontrar a conta por id ou por plataforma
        const acc = accounts.find(a => a.id === mapKey || a.id === mapping.accountId || a.platform === mapKey) || {
          id: mapKey,
          platform: mapping.platform || mapKey,
          sellerName: mapping.title || mapKey
        };

        const mpName = acc.sellerName || acc.platformName || mapKey;

        try {
          const adapter = await this.getAdapterForAccount(acc);
          const res = await adapter.updateStock(mapping.itemCode, targetStock);

          if (res.success) {
            sku.mappings[mapKey].stock = targetStock;

            await StorageService.addLog({
              type: 'sync',
              status: 'success',
              masterSku: sku.masterSku,
              marketplace: mpName,
              oldStock: mapping.stock,
              newStock: targetStock,
              trigger: triggerSource,
              message: `Estoque de ${sku.masterSku} atualizado para ${targetStock} em (${mpName}).`
            });

            results.push({ marketplace: mpName, success: true, stock: targetStock });
          } else {
            anyError = true;
            await StorageService.addLog({
              type: 'sync',
              status: 'error',
              masterSku: sku.masterSku,
              marketplace: mpName,
              oldStock: mapping.stock,
              newStock: targetStock,
              trigger: triggerSource,
              message: `Falha ao sincronizar em (${mpName}): ${res.message || 'Erro de API'}`
            });

            results.push({ marketplace: mpName, success: false, error: res.message });
          }
        } catch (err) {
          anyError = true;
          await StorageService.addLog({
            type: 'sync',
            status: 'error',
            masterSku: sku.masterSku,
            marketplace: mpName,
            oldStock: mapping ? mapping.stock : 0,
            newStock: targetStock,
            trigger: triggerSource,
            message: `Exceção em (${mpName}): ${err.message}`
          });

          results.push({ marketplace: mpName, success: false, error: err.message });
        }
      }
    }

    // Atualiza status do SKU Master
    sku.availableStock = targetStock;
    if (targetStock === 0) {
      sku.status = 'critical';
    } else if (targetStock <= (sku.minStockAlert || settings.lowStockThreshold)) {
      sku.status = 'warning';
    } else {
      sku.status = anyError ? 'warning' : 'synced';
    }

    sku.updatedAt = new Date().toISOString();
    skus[skuIndex] = sku;
    await StorageService.saveSkus(skus);

    return { sku, results };
  }

  /**
   * Sincroniza todos os SKUs Master em lote
   */
  static async syncAllSkus(triggerSource = 'bulk_auto', accounts = []) {
    const skus = await StorageService.getSkus();
    const batchResults = [];

    for (const sku of skus) {
      const res = await this.syncSku(sku.id, triggerSource, accounts);
      batchResults.push(res);
    }

    return batchResults;
  }

  /**
   * Simula a ocorrência de uma nova venda em determinado marketplace
   * Reduz 1 unidade do estoque total e dispara a propagação imediata para os outros
   */
  static async simulateSale(skuId, marketplaceKey, accounts = []) {
    const skus = await StorageService.getSkus();
    const sku = skus.find(s => s.id === skuId);
    if (!sku) throw new Error('SKU não encontrado');

    if (sku.totalStock <= 0) {
      throw new Error(`Impossível registrar venda: Estoque de ${sku.masterSku} está zerado!`);
    }

    const mpNames = { meli: 'Mercado Livre', shopee: 'Shopee', tiktok: 'TikTok Shop' };
    const originName = mpNames[marketplaceKey] || marketplaceKey;

    const oldTotal = sku.totalStock;
    sku.totalStock -= 1;
    await StorageService.updateSku(sku);

    // Registra a venda de origem
    await StorageService.addLog({
      type: 'venda',
      status: 'success',
      masterSku: sku.masterSku,
      marketplace: originName,
      oldStock: oldTotal,
      newStock: sku.totalStock,
      trigger: 'venda_detectada',
      message: `🛒 Venda realizada no ${originName}! Estoque Master reduzido de ${oldTotal} para ${sku.totalStock}.`
    });

    // Dispara propagação imediata
    return await this.syncSku(skuId, `propagacao_venda_${marketplaceKey}`, accounts);
  }
}
