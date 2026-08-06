export default {
  async fetch(request, env, ctx) {
    try {
      const response = await env.ASSETS.fetch(request);
      if (response && response.status !== 404) {
        return response;
      }
      
      // Fallback SPA: se a rota ou query param não corresponder a um asset físico, serve index.html
      const url = new URL(request.url);
      const spaRequest = new Request(new URL('/index.html', url.origin), request);
      const spaResponse = await env.ASSETS.fetch(spaRequest);
      
      if (spaResponse && spaResponse.status === 200) {
        return spaResponse;
      }
      
      return response || new Response('Not Found', { status: 404 });
    } catch (err) {
      // Tentar servir /index.html em caso de exceção de roteamento
      try {
        const url = new URL(request.url);
        return await env.ASSETS.fetch(new Request(new URL('/index.html', url.origin), request));
      } catch (fallbackErr) {
        return new Response(`Error serving SPA: ${err.message}`, { status: 500 });
      }
    }
  }
};
