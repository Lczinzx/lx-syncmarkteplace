export default {
  async fetch(request, env) {
    if (!env?.ASSETS?.fetch) {
      return new Response("ASSETS binding unavailable", {
        status: 500,
        headers: {
          "Content-Type": "text/plain; charset=utf-8"
        }
      });
    }

    return env.ASSETS.fetch(request);
  }
};
