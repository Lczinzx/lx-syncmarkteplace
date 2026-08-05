/**
 * API Client Base - LX Sync Marketplace Frontend
 * Validação rigorosa de VITE_API_URL e tratamento de erros
 */

export function getApiBaseUrl() {
  const envUrl = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_API_URL : null;

  if (envUrl && envUrl.trim() !== '') {
    // Clean trailing slashes
    let cleaned = envUrl.trim().replace(/\/+$/, '');
    
    // Prevent HTTP calls when running on HTTPS frontend
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && cleaned.startsWith('http:')) {
      console.warn('⚠️ Frontend em HTTPS detectado chamando API via HTTP. Bloqueado para prevenir Mixed Content.');
    }
    return cleaned;
  }

  // Se estiver em localhost no browser de dev
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'http://localhost:3001';
  }

  // Em produção (Netlify/HTTPS), se VITE_API_URL não estiver configurado
  return null;
}

const inFlightRequests = new Map();

export async function apiFetch(endpoint, options = {}) {
  const baseUrl = getApiBaseUrl();

  if (!baseUrl) {
    const errorMsg = '⚠️ API do LX Sync não configurada neste ambiente (VITE_API_URL ausente). Por favor, configure VITE_API_URL nas variáveis do Netlify/Cloudflare.';
    console.error(`🚨 [API ERROR]: ${errorMsg}`);
    throw new Error(errorMsg);
  }

  const method = (options.method || 'GET').toUpperCase();
  const cacheKey = `${method}:${endpoint}`;

  // Deduplicação de requisições GET em andamento
  if (method === 'GET' && inFlightRequests.has(cacheKey)) {
    console.log(`⚡ [API DEDUP] Reutilizando requisição em andamento: ${cacheKey}`);
    return inFlightRequests.get(cacheKey);
  }

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

  const fetchPromise = (async () => {
    try {
      const url = `${baseUrl}${endpoint}`;
      console.log(`🌐 [API Request] ${config.method || 'GET'} ${url}`);

      const response = await fetch(url, config);

      if (response.status === 401) {
        localStorage.removeItem('lx_jwt_token');
        localStorage.removeItem('lx_auth_user');
        throw new Error('Sua sessão expirou. Faça login novamente via Google.');
      }

      if (response.status === 403) {
        throw new Error('Acesso negado: Você não possui permissões para realizar esta ação.');
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const textBody = await response.text();
        console.warn(`⚠️ [API NON-JSON RESPONSE] Status ${response.status}:`, textBody.slice(0, 200));
        throw new Error(`A API retornou uma resposta não-JSON (HTTP ${response.status}). Verifique a rota do servidor.`);
      }

      const data = await response.json();

      if (!response.ok || data.success === false) {
        const errObj = data.error || data.message;
        const errMsg = typeof errObj === 'object' ? errObj.message : String(errObj || `Erro HTTP ${response.status}`);
        throw new Error(errMsg);
      }

      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Failed to fetch') || err.name === 'TypeError') {
        throw new Error(`Servidor da API indisponível ou conexão bloqueada por CORS (${baseUrl}).`);
      }
      throw err;
    } finally {
      if (method === 'GET') {
        inFlightRequests.delete(cacheKey);
      }
    }
  })();

  if (method === 'GET') {
    inFlightRequests.set(cacheKey, fetchPromise);
  }

  return fetchPromise;
}

