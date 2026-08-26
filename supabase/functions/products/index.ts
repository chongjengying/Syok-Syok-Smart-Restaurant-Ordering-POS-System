import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildCorsHeaders, jsonResponse as createJsonResponse } from '../_shared/http.ts';
import { CategoryRepository } from '../_shared/repositories/categoryRepository.ts';
import { ProductRepository } from '../_shared/repositories/productRepository.ts';
import { CategoryService } from '../_shared/services/categoryService.ts';
import { ProductService } from '../_shared/services/productService.ts';

const corsHeaders = buildCorsHeaders('GET, OPTIONS');
const jsonResponse = (status: number, body: Record<string, unknown>) =>
  createJsonResponse(status, body, corsHeaders);

function parseInteger(value: string | null, fallback: number, minimum: number, maximum: number) {
  if (value === null) return { value: fallback, error: null };
  if (!/^\d+$/.test(value)) return { value: null, error: 'must be an integer' };

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    return { value: null, error: `must be between ${minimum} and ${maximum}` };
  }
  return { value: parsed, error: null };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'GET') return jsonResponse(405, { error: 'Method not allowed.' });

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return jsonResponse(401, { error: 'Authentication is required.' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return jsonResponse(500, { error: 'Server configuration is incomplete.' });

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return jsonResponse(401, { error: 'The session is invalid or expired.' });
  const { data: profile } = await supabase.from('profiles').select('status').eq('id', userData.user.id).single();
  if (!profile || profile.status !== 'ACTIVE') return jsonResponse(403, { error: 'An active staff profile is required.' });

  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const functionIndex = pathParts.lastIndexOf('products');
  const resource = functionIndex >= 0 ? pathParts[functionIndex + 1] || null : null;
  const categoryService = new CategoryService(new CategoryRepository(supabase));
  const productService = new ProductService(new ProductRepository(supabase));

  if (resource === 'categories') {
    const activeOnly = url.searchParams.get('activeOnly') === 'true';
    const result = await categoryService.getCategories(activeOnly);
    if (result.error) return jsonResponse(500, { error: 'Unable to load categories.' });
    return jsonResponse(200, { data: result.data });
  }

  if (resource) {
    if (resource.length > 128) return jsonResponse(400, { error: 'Product ID is invalid.' });
    const result = await productService.getProduct(resource);
    if (result.error) return jsonResponse(500, { error: 'Unable to load the product.' });
    if (!result.data) return jsonResponse(404, { error: 'Product was not found or is unavailable.' });
    return jsonResponse(200, { data: result.data });
  }

  const categoryId = url.searchParams.get('categoryId')?.trim() || null;
  const search = url.searchParams.get('search')?.trim() || null;
  const limit = parseInteger(url.searchParams.get('limit'), 100, 1, 200);
  const offset = parseInteger(url.searchParams.get('offset'), 0, 0, 10_000);
  const availableOnly = url.searchParams.get('availableOnly') === 'true';
  if (categoryId && categoryId.length > 128) return jsonResponse(400, { error: 'categoryId must not exceed 128 characters.' });
  if (search && search.length > 100) return jsonResponse(400, { error: 'search must not exceed 100 characters.' });
  if (limit.error) return jsonResponse(400, { error: `limit ${limit.error}.` });
  if (offset.error) return jsonResponse(400, { error: `offset ${offset.error}.` });

  const result = await productService.getProducts({
    categoryId,
    search,
    limit: limit.value!,
    offset: offset.value!,
    availableOnly,
  });
  if (result.error) {
    console.error('Unable to load product listing', result.error);
    return jsonResponse(500, { error: 'Unable to load the product listing.' });
  }
  return jsonResponse(200, { data: result.data });
});
