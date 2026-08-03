import { apiFetch } from './api-client.js';

export const MasterProductsAPI = {
  async getMasterProducts() {
    return await apiFetch('/api/master-products');
  },

  async createMasterProduct(productData) {
    return await apiFetch('/api/master-products', {
      method: 'POST',
      body: JSON.stringify(productData)
    });
  },

  async getSuggestions(listingId, variationId) {
    return await apiFetch('/api/product-mappings/suggestions', {
      method: 'POST',
      body: JSON.stringify({ listingId, variationId })
    });
  },

  async previewSkuChange(masterProductId, newSku) {
    return await apiFetch('/api/sku-changes/preview', {
      method: 'POST',
      body: JSON.stringify({ masterProductId, newSku })
    });
  },

  async confirmSkuChange(masterProductId, newSku) {
    return await apiFetch('/api/sku-changes/confirm', {
      method: 'POST',
      body: JSON.stringify({ masterProductId, newSku })
    });
  }
};
