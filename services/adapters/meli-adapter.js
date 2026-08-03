import { BaseAdapter } from './base-adapter.js';

export class MeliAdapter extends BaseAdapter {
  constructor(accountConfig) {
    super(accountConfig);
    this.name = 'Mercado Livre';
    this.baseUrl = 'https://api.mercadolibre.com';
  }

  async checkConnection() {
    if (!this.accountConfig.apiToken) {
      return { success: false, message: 'Token da API Mercado Livre não configurado' };
    }
    // No modo real, faria um fetch no /users/me
    return { success: true, message: 'Conectado ao Mercado Livre', sellerId: this.accountConfig.sellerId };
  }

  async updateStock(itemCode, newQuantity) {
    console.log(`[MeliAdapter] Atualizando estoque do item ${itemCode} para ${newQuantity}`);
    // Endpoint oficial Mercado Livre: PUT /items/{item_id}
    // Body: { available_quantity: newQuantity }
    return {
      success: true,
      marketplace: 'Mercado Livre',
      itemCode,
      updatedQuantity: newQuantity,
      timestamp: new Date().toISOString()
    };
  }

  async getProductDetails(itemCode) {
    return {
      itemCode,
      title: 'Produto Mercado Livre ' + itemCode,
      stock: 10,
      price: 150.00
    };
  }

  async createListing(productData) {
    const itemCode = 'MLB-' + Math.floor(100000000 + Math.random() * 900000000);
    console.log(`[MeliAdapter] Anúncio publicado no Mercado Livre (${this.accountConfig.sellerName || 'Mercado Livre'}): ${itemCode}`);
    return {
      success: true,
      marketplace: 'Mercado Livre',
      accountId: this.accountConfig.id,
      sellerName: this.accountConfig.sellerName || 'Mercado Livre',
      itemCode: itemCode,
      title: productData.title,
      price: productData.unitPrice || productData.price,
      stock: productData.totalStock || productData.stock,
      url: `https://produto.mercadolivre.com.br/${itemCode}`,
      timestamp: new Date().toISOString()
    };
  }
}
