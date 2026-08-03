import { apiFetch } from './api-client.js';

export const AccountsAPI = {
  async getAccounts() {
    return await apiFetch('/api/marketplace-accounts');
  },

  async createAccount(accountData) {
    return await apiFetch('/api/marketplace-accounts', {
      method: 'POST',
      body: JSON.stringify(accountData)
    });
  },

  async updateAccount(accountId, accountData) {
    return await apiFetch(`/api/marketplace-accounts/${accountId}`, {
      method: 'PUT',
      body: JSON.stringify(accountData)
    });
  },

  async deleteAccount(accountId) {
    return await apiFetch(`/api/marketplace-accounts/${accountId}`, {
      method: 'DELETE'
    });
  },

  async testAccount(accountId) {
    return await apiFetch(`/api/marketplace-accounts/${accountId}/test`, {
      method: 'POST'
    });
  },

  async importAccountListings(accountId) {
    return await apiFetch(`/api/marketplace-accounts/${accountId}/import`, {
      method: 'POST'
    });
  }
};
