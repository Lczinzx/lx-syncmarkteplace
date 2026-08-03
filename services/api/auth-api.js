import { apiFetch } from './api-client.js';

export const AuthAPI = {
  async loginWithGoogle(token) {
    const data = await apiFetch('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ token })
    });
    if (data.token) {
      localStorage.setItem('lx_jwt_token', data.token);
      localStorage.setItem('lx_auth_user', JSON.stringify(data.user));
    }
    return data;
  },

  async getCurrentUser() {
    return await apiFetch('/api/auth/me');
  },

  async logout() {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      localStorage.removeItem('lx_jwt_token');
      localStorage.removeItem('lx_auth_user');
    }
  }
};
