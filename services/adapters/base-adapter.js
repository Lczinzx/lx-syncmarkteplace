/**
 * Base Adapter - LX Sync Marketplace
 * Interface padronizada para integração de Marketplace
 */

export class BaseAdapter {
  constructor(accountConfig) {
    this.accountConfig = accountConfig || {};
    this.name = 'Base Adapter';
  }

  /**
   * Valida se as credenciais do marketplace estão conectadas e ativas
   */
  async checkConnection() {
    throw new Error('Método checkConnection() deve ser implementado');
  }

  /**
   * Atualiza a quantidade de estoque de um item no marketplace
   * @param {string} itemCode - Código/ID do anúncio ou variação no marketplace
   * @param {number} newQuantity - Quantidade a ser atualizada
   */
  async updateStock(itemCode, newQuantity) {
    throw new Error('Método updateStock() deve ser implementado');
  }

  /**
   * Busca detalhes do produto/anuncio no marketplace
   * @param {string} itemCode 
   */
  async getProductDetails(itemCode) {
    throw new Error('Método getProductDetails() deve ser implementado');
  }

  /**
   * Cria/Publica uma nova postagem ou anúncio no marketplace
   * @param {Object} productData - Título, preço, estoque, descrição, imagens, etc.
   */
  async createListing(productData) {
    throw new Error('Método createListing() deve ser implementado');
  }
}
