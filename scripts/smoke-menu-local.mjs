import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const status = JSON.parse(execFileSync('npx', ['--no-install', 'supabase', 'status', '--output', 'json'], { encoding: 'utf8' }));
const baseUrl = status.API_URL;
const anonKey = status.ANON_KEY;
const serviceKey = status.SERVICE_ROLE_KEY;

async function request(path, { method = 'GET', key = anonKey, token = key, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  return { response, payload };
}

async function successful(path, options) {
  const result = await request(path, options);
  if (!result.response.ok) {
    throw new Error(`${options?.method || 'GET'} ${path}: ${result.response.status} ${JSON.stringify(result.payload)}`);
  }
  return result.payload;
}

const suffix = crypto.randomUUID().slice(0, 8);
const categoryAName = `Menu Smoke A ${suffix}`;
const categoryBName = `Menu Smoke B ${suffix}`;

const [categoryA] = await successful('/rest/v1/categories', {
  method: 'POST', key: serviceKey, body: { name: categoryAName, description: 'Menu integration test' },
});
const [categoryB] = await successful('/rest/v1/categories', {
  method: 'POST', key: serviceKey, body: { name: categoryBName, description: 'Menu integration test' },
});

const [burger] = await successful('/rest/v1/products', {
  method: 'POST',
  key: serviceKey,
  body: {
    category_id: categoryA.id,
    product_name: `Burger ${suffix}`,
    description: 'Real database product',
    unit: 'item',
    cost_price: 7,
    sell_price: 15,
    status: true,
  },
});

const auth = await successful('/auth/v1/signup', {
  method: 'POST',
  body: { email: `menu-smoke-${suffix}@example.com`, password: `Menu-${suffix}-Pass!`, data: { full_name: 'Menu Smoke User' } },
});
assert.ok(auth.access_token, 'Expected an authenticated frontend session');

const functionRequest = (path = '') => successful(`/functions/v1/products${path}`, { token: auth.access_token });

const unauthorized = await request('/functions/v1/products');
assert.equal(unauthorized.response.status, 401, 'Products endpoint must reject anonymous access');

const activeCategories = await functionRequest('/categories?activeOnly=true');
assert.ok(activeCategories.data.some(({ id }) => id === categoryA.id), 'Category with active product was not returned');
assert.ok(!activeCategories.data.some(({ id }) => id === categoryB.id), 'Empty category should not be in active menu categories');

const allCategories = await functionRequest('/categories?activeOnly=false');
assert.ok(allCategories.data.some(({ id }) => id === categoryB.id), 'All-categories query omitted a real database category');
const categoryNames = allCategories.data.map(({ name }) => name);
assert.deepEqual(categoryNames, [...categoryNames].sort(), 'Categories were not sorted by database name');

let categoryProducts = await functionRequest(`?categoryId=${categoryA.id}`);
let menuBurger = categoryProducts.data.products.find(({ id }) => id === burger.id);
assert.equal(menuBurger.price, 15, 'Initial database price was not returned');
assert.equal(menuBurger.categoryId, categoryA.id, 'Product/category relationship was incorrect');
assert.equal(menuBurger.isActive, true, 'Active product flag was not returned');
assert.equal(menuBurger.isAvailable, true, 'Available product flag was not returned');

await successful(`/rest/v1/products?id=eq.${burger.id}`, {
  method: 'PATCH', key: serviceKey, body: { sell_price: 18 },
});
categoryProducts = await functionRequest(`?categoryId=${categoryA.id}`);
menuBurger = categoryProducts.data.products.find(({ id }) => id === burger.id);
assert.equal(menuBurger.price, 18, 'Updated database price was not returned after refetch');

await successful(`/rest/v1/products?id=eq.${burger.id}`, {
  method: 'PATCH', key: serviceKey, body: { status: false },
});
categoryProducts = await functionRequest(`?categoryId=${categoryA.id}`);
assert.ok(!categoryProducts.data.products.some(({ id }) => id === burger.id), 'Disabled product remained visible');

await successful(`/rest/v1/products?id=eq.${burger.id}`, {
  method: 'PATCH', key: serviceKey, body: { status: true, category_id: categoryB.id },
});
const oldCategoryProducts = await functionRequest(`?categoryId=${categoryA.id}`);
const movedCategoryProducts = await functionRequest(`?categoryId=${categoryB.id}`);
assert.ok(!oldCategoryProducts.data.products.some(({ id }) => id === burger.id), 'Moved product remained in its old category');
assert.ok(movedCategoryProducts.data.products.some(({ id }) => id === burger.id), 'Moved product did not appear in its new category');

const [chickenBurger] = await successful('/rest/v1/products', {
  method: 'POST',
  key: serviceKey,
  body: {
    category_id: categoryB.id,
    product_name: `Chicken Burger ${suffix}`,
    description: 'New real database product',
    unit: 'item',
    cost_price: 10,
    sell_price: 20,
    status: true,
  },
});
const refreshedProducts = await functionRequest(`?categoryId=${categoryB.id}`);
assert.ok(refreshedProducts.data.products.some(({ id }) => id === chickenBurger.id), 'New database product did not appear');

const emptyResult = await functionRequest(`?categoryId=${crypto.randomUUID()}`);
assert.deepEqual(emptyResult.data.products, [], 'Unknown category should return an empty product list');

console.log(JSON.stringify({
  activeCategory: categoryAName,
  emptyCategoryExcluded: categoryBName,
  initialPrice: 15,
  updatedPrice: 18,
  disabledProductHidden: true,
  categoryMoveVerified: true,
  newProductPrice: 20,
  anonymousStatus: unauthorized.response.status,
}));
