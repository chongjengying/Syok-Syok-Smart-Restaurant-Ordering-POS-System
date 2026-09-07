export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    // Never serve the SPA shell for a missing versioned asset. Returning HTML
    // for a JavaScript request causes a confusing module MIME-type failure.
    if (pathname.startsWith('/assets/')) {
      return env.ASSETS.fetch(request, { not_found_handling: '404' });
    }
    return env.ASSETS.fetch(request);
  },
};
