import { apiFetch } from './api-client.js';

export const ListingsAPI = {
  /**
   * Lista anúncios persistidos no PostgreSQL (GET /api/marketplace-listings).
   * Retorna { listings, totalListings, totalVariations } do backend.
   */
  async getListings() {
    return await apiFetch('/api/marketplace-listings');
  },

  async searchBySkus(skus, matchMode = 'NORMALIZED') {
    return await apiFetch('/api/listings/search-by-skus', {
      method: 'POST',
      body: JSON.stringify({ skus, matchMode })
    });
  }
};
