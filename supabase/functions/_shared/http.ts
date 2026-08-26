export function buildCorsHeaders(methods: string) {
  return {
    'Access-Control-Allow-Origin': Deno.env.get('CORS_ALLOWED_ORIGIN') || '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': methods,
  };
}

export function jsonResponse(
  status: number,
  body: Record<string, unknown> | undefined,
  corsHeaders: Record<string, string>,
) {
  return new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
