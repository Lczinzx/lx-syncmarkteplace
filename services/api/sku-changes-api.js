import { apiFetch } from './api-client.js';

export const SkuChangesAPI = {
  async getCapabilities() {
    return await apiFetch('/api/sku-changes/capabilities');
  },

  async generatePreview(selection, rule) {
    return await apiFetch('/api/sku-changes/preview', {
      method: 'POST',
      body: JSON.stringify({ selection, rule })
    });
  },

  async confirmSkuChange(previewId, items) {
    return await apiFetch('/api/sku-changes/confirm', {
      method: 'POST',
      body: JSON.stringify({ previewId, items })
    });
  },

  async getJobs() {
    return await apiFetch('/api/sku-changes/jobs');
  },

  async getJobDetails(jobId) {
    return await apiFetch(`/api/sku-changes/jobs/${jobId}`);
  },

  async pauseJob(jobId) {
    return await apiFetch(`/api/sku-changes/jobs/${jobId}/pause`, { method: 'POST' });
  },

  async resumeJob(jobId) {
    return await apiFetch(`/api/sku-changes/jobs/${jobId}/resume`, { method: 'POST' });
  },

  async cancelJob(jobId) {
    return await apiFetch(`/api/sku-changes/jobs/${jobId}/cancel`, { method: 'POST' });
  },

  async generateRollbackPreview(jobId) {
    return await apiFetch(`/api/sku-changes/jobs/${jobId}/rollback-preview`, { method: 'POST' });
  },

  async confirmRollback(jobId) {
    return await apiFetch(`/api/sku-changes/jobs/${jobId}/rollback-confirm`, { method: 'POST' });
  }
};
