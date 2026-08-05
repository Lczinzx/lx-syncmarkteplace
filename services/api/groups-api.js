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

  async unlinkListing(masterProductId, marketplaceListingId) {
    return apiFetch('/api/product-groups/unlink', {
      method: 'POST',
      body: JSON.stringify({ masterProductId, marketplaceListingId })
    });
  },

  async mergeGroups(sourceMasterProductId, targetMasterProductId) {
    return apiFetch('/api/product-groups/merge', {
      method: 'POST',
      body: JSON.stringify({ sourceMasterProductId, targetMasterProductId })
    });
  },

  async splitGroup(sourceMasterProductId, listingIdsToExtract, newGroupName, newMasterSku) {
    return apiFetch('/api/product-groups/split', {
      method: 'POST',
      body: JSON.stringify({ sourceMasterProductId, listingIdsToExtract, newGroupName, newMasterSku })
    });
  },

  async createManualGroup(name, masterSku, listingIds = []) {
    return apiFetch('/api/product-groups/create-manual', {
      method: 'POST',
      body: JSON.stringify({ name, masterSku, listingIds })
    });
  },

  async previewEdit(scope, field, newValue, masterProductId, listingId, variationId) {
    return apiFetch('/api/product-groups/preview-edit', {
      method: 'POST',
      body: JSON.stringify({ scope, field, newValue, masterProductId, listingId, variationId })
    });
  },

  async runRematching() {
    return apiFetch('/api/product-groups/rematch', {
      method: 'POST'
    });
  }
};

