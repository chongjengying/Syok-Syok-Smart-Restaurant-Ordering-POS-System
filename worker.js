export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    // Never serve the SPA shell for a missing versioned asset. Returning HTML
    // for a JavaScript request causes a confusing module MIME-type failure.
    if (pathname.startsWith('/assets/')) {
      return env.ASSETS.fetch(request, { not_found_handling: '404' });
    }
    const response = await env.ASSETS.fetch(request);
    // The HTML points to content-hashed bundles. Never let an edge cache keep
    // an old HTML shell after a deployment, otherwise browsers request assets
    // that no longer exist and remain on the Suspense loading screen.
    if (pathname === '/' || pathname === '/index.html') {
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      headers.set('CDN-Cache-Control', 'no-store');
      return new Response(response.body, { status: response.status, headers });
    }
    return response;
  },
};
