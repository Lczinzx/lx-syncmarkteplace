import { BaseAdapter } from './base-adapter.js';

export class MockAdapter extends BaseAdapter {
  constructor(marketplaceName, accountConfig) {
    super(accountConfig);
    this.name = marketplaceName;
  }

  async checkConnection() {
    // Simula latência de rede realista de 150ms
    await new Promise(r => setTimeout(r, 150));
    return {
      success: true,
      message: `[Modo Demo] Conexão ativa com ${this.name}`,
      sellerName: this.accountConfig.sellerName || 'Loja Demo Teste'
    };
  }

  async updateStock(itemCode, newQuantity) {
    await new Promise(r => setTimeout(r, 250));
    
    // Simula sucesso de envio
    return {
      success: true,
      marketplace: this.name,
      itemCode,
      updatedQuantity: newQuantity,
      timestamp: new Date().toISOString()
    };
  }

  async getProductDetails(itemCode) {
    return {
      itemCode,
      title: `Item Simulado em ${this.name} (${itemCode})`,
      stock: 10
    };
  }

  async createListing(productData) {
    // Simula latência de rede realista para postagem em lote
    await new Promise(r => setTimeout(r, 400 + Math.random() * 300));
    
    const prefixes = { meli: 'MLB', shopee: 'SHP', tiktok: 'TT', amazon: 'AMZ' };
    const platform = this.accountConfig.platform || 'meli';
    const prefix = prefixes[platform] || 'ITEM';
    const itemCode = `${prefix}-${Math.floor(100000000 + Math.random() * 900000000)}`;

    return {
      success: true,
      marketplace: this.name,
      accountId: this.accountConfig.id,
      sellerName: this.accountConfig.sellerName || this.name,
      itemCode: itemCode,
      title: productData.title,
      price: productData.unitPrice || productData.price,
      stock: productData.totalStock || productData.stock,
      url: `https://marketplace.mock/item/${itemCode}`,
      timestamp: new Date().toISOString()
    };
  }
}
