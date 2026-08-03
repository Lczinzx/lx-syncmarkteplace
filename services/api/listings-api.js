import { apiFetch } from './api-client.js';

export const ListingsAPI = {
  async getListings(params = {}) {
    const query = new URLSearchParams(params).toString();
    const url = query ? `/api/listings?${query}` : '/api/listings';
    return await apiFetch(url);
  },

  async searchBySkus(skus, matchMode = 'NORMALIZED') {
    return await apiFetch('/api/listings/search-by-skus', {
      method: 'POST',
      body: JSON.stringify({ skus, matchMode })
    });
  }
};
