import { apiFetch } from './api-client.js';

export const GroupsAPI = {
  async getGroupedProducts(params = {}) {
    const query = new URLSearchParams(params).toString();
    const url = `/api/product-groups${query ? '?' + query : ''}`;
    return apiFetch(url, { method: 'GET' });
  },

  async getPendingMatches() {
    return apiFetch('/api/product-groups/pending', { method: 'GET' });
  },

  async confirmMatch(mappingId) {
    return apiFetch('/api/product-groups/confirm-match', {
      method: 'POST',
      body: JSON.stringify({ mappingId })
    });
  },

  async rejectMatch(mappingId) {
    return apiFetch('/api/product-groups/reject-match', {
      method: 'POST',
      body: JSON.stringify({ mappingId })
    });
  },

  async linkListing(masterProductId, marketplaceListingId) {
    return apiFetch('/api/product-groups/link', {
      method: 'POST',
      body: JSON.stringify({ masterProductId, marketplaceListingId })
    });
  },

  async runRematching() {
    return apiFetch('/api/product-groups/rematch', {
      method: 'POST'
    });
  }
};
