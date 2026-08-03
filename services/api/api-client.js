/**
 * API Client Base - LX Sync Marketplace Frontend
 * Gerencia todas as chamadas HTTP com o Backend Node.js / Express
 */

const BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL)
  ? import.meta.env.VITE_API_URL
  : 'http://localhost:3001';

export async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('lx_jwt_token');

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers
  };

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, config);

    if (response.status === 401) {
      // Sessão expirada ou não fornecida
      localStorage.removeItem('lx_jwt_token');
      localStorage.removeItem('lx_auth_user');
      if (!window.location.pathname.includes('login')) {
        console.warn('⚠️ Sessão expirada ou não fornecida. Redirecionando para login...');
      }
    }

    const data = await response.json();

    if (!response.ok || data.success === false) {
      throw new Error(data.error || data.message || `Erro HTTP ${response.status}`);
    }

    return data;
  } catch (err) {
    console.error(`🚨 Erro na requisição API (${endpoint}):`, err);
    throw err;
  }
}
