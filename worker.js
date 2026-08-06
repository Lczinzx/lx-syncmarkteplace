export default {
  async fetch(request, env) {
    if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return env.ASSETS.fetch(request);
    }
    return new Response('<!DOCTYPE html><html><head><title>LX Sync Marketplace</title></head><body><h1>LX Sync Marketplace</h1><p>Worker Ativo. Carregando a aplicação...</p></body></html>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
};
