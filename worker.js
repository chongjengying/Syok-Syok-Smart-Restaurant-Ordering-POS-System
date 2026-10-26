export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    // Never serve the SPA shell for a missing versioned asset. Returning HTML
    // for a JavaScript request causes a confusing module MIME-type failure.
    if (pathname.startsWith('/assets/')) {
      return env.ASSETS.fetch(request, { not_found_handling: '404' });
    }
    const isPreview = /^\/pos\/preview\/?$/.test(pathname)
      && ['GET', 'HEAD'].includes(request.method);
    let assetRequest = request;
    if (isPreview) {
      // Resolve only the isolated preview route to the existing application
      // shell. The browser keeps its URL so PreviewRoute selects mock-only UI.
      url.pathname = '/';
      assetRequest = new Request(url, request);
    }
    const response = await env.ASSETS.fetch(assetRequest);
    // The HTML points to content-hashed bundles. Never let an edge cache keep
    // an old HTML shell after a deployment, otherwise browsers request assets
    // that no longer exist and remain on the Suspense loading screen.
    if (pathname === '/' || pathname === '/index.html' || isPreview) {
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      headers.set('CDN-Cache-Control', 'no-store');
      return new Response(response.body, { status: response.status, headers });
    }
    return response;
  },
};
