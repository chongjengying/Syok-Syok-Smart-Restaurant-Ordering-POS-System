import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20260907380000_branch_menu_pricing_snapshots.sql', import.meta.url), 'utf8');
const productFunction = readFileSync(new URL('../supabase/functions/products/index.ts', import.meta.url), 'utf8');
const orderService = readFileSync(new URL('../src/services/order.service.ts', import.meta.url), 'utf8');
const checkout = readFileSync(new URL('../src/hooks/useCheckout.js', import.meta.url), 'utf8');
const orderFunction = readFileSync(new URL('../supabase/functions/orders/index.ts', import.meta.url), 'utf8');
const cartService = readFileSync(new URL('../src/services/cart.service.ts', import.meta.url), 'utf8');
const productCache = readFileSync(new URL('../src/services/product-cache.service.ts', import.meta.url), 'utf8');

for (const invariant of [
  'create table if not exists public.branch_products',
  'unique(branch_id,product_id)',
  'price_override numeric(12,2)',
  'sold_out boolean',
  'public.require_terminal_staff_session()',
  "public.has_pos_permission('order.edit')",
  'public.resolve_branch_product',
  "'PRODUCT_SOLD_OUT'",
  'product_code_snapshot',
  'tax_mode_snapshot',
  'modifier_total',
  'price_snapshot_at',
  'for update',
  "item_status='DRAFT'",
  "'ORDER_ITEM_ADDED'",
  "'ORDER_ITEM_UPDATED'",
  "'ORDER_ITEM_REMOVED'",
  'public.void_submitted_order_item',
  "public.has_pos_permission('order.manage')",
  "'SUBMITTED_ORDER_ITEM_VOIDED'",
]) assert.ok(migration.includes(invariant), `Missing branch-menu invariant: ${invariant}`);

assert.ok(migration.includes('coalesce(bp.price_override,p.sell_price)'), 'Branch price must fall back to the company price.');
assert.ok(migration.includes('ord.company_id<>s.company_id or ord.branch_id<>s.branch_id'), 'Order edits must enforce trusted tenant and branch scope.');
assert.ok(!migration.match(/set unit_price\s*=.*sell_price/i), 'Kitchen submission must not reprice persisted draft lines.');
assert.ok(productFunction.includes("supabase.rpc('get_current_branch_menu'"), 'Menu Edge Function must use trusted branch RPC.');
assert.ok(productFunction.includes("supabase.rpc('get_current_branch_menu_categories'"), 'Category loading must use trusted branch RPC.');
assert.ok(orderService.includes('orderItemId:'), 'Persisted draft identity must be returned to the server.');
assert.ok(checkout.includes('orderItemId: item.id'), 'Recovered draft lines must retain their database identity.');
assert.ok(orderFunction.includes('orderItemId,'), 'The Edge Function must preserve persisted draft item identity.');
assert.ok(orderFunction.includes("orderResourceAction === 'void'"), 'Submitted-line voiding must use a dedicated endpoint.');
assert.ok(!cartService.match(/(?:0\.06|0\.10|\*\s*6\s*\/\s*100|\*\s*10\s*\/\s*100)/), 'The browser must not hardcode tax or service-charge rates.');
assert.ok(productCache.includes('pos.available-products.v3'), 'Company-wide legacy price caches must be invalidated.');
console.log('PASS branch menu/pricing: trusted scope, overrides, sold-out, snapshots, stable drafts, modifier rules, audit');
