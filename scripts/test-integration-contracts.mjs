import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.(?:js|jsx|ts|tsx)$/.test(entry.name) ? [entryPath] : [];
  }));
  return nested.flat();
}

const srcRoot = path.join(root, 'src');
const files = await sourceFiles(srcRoot);
const contents = new Map(await Promise.all(files.map(async (file) => [file, await readFile(file, 'utf8')])));
const relative = (file) => path.relative(root, file).replaceAll('\\', '/');

const clientCreators = [...contents].filter(([, source]) => /\bcreateClient\s*\(/.test(source));
assert.deepEqual(
  clientCreators.map(([file]) => relative(file)),
  ['src/infrastructure/supabase/client.js'],
  'The browser Supabase client must be initialized exactly once.',
);

const directEnvReads = [...contents].filter(([, source]) => /import\.meta\.env/.test(source));
assert.deepEqual(
  directEnvReads.map(([file]) => relative(file)),
  ['src/config/env.js'],
  'Vite environment variables must only be read by the centralized environment module.',
);

const componentViolations = [...contents]
  .filter(([file, source]) => relative(file).startsWith('src/components/') && (
    /@supabase\/supabase-js|infrastructure\/supabase/.test(source)
    || /\bsupabase\s*\.(?:from|rpc|auth|channel)\s*\(/.test(source)
  ))
  .map(([file]) => relative(file));
assert.deepEqual(componentViolations, [], 'React components must not query Supabase directly.');

const transportPath = path.join(srcRoot, 'infrastructure', 'supabase', 'functionsClient.js');
const transport = contents.get(transportPath);
assert.match(transport, /apikey:\s*env\.supabaseKey\b/, 'Edge Function requests must send the configured publishable key.');
assert.doesNotMatch(transport, /env\.supabaseAnonKey\b/, 'Transport must not use an undefined environment property.');

const splitBillScreen = contents.get(path.join(srcRoot, 'components', 'SplitBillScreen.jsx'));
const splitBillErrorBoundary = splitBillScreen.indexOf("summaryError && !summary");
const splitBillLoadingBoundary = splitBillScreen.indexOf("loadingOrder || loadingSummary || !summary");
assert.ok(
  splitBillErrorBoundary >= 0 && splitBillErrorBoundary < splitBillLoadingBoundary,
  'Split-bill summary failures must render an error before the empty-summary loading state.',
);
assert.match(splitBillScreen, /finally\s*{\s*setBusy\(false\);\s*}/, 'Split-payment actions must always clear their busy state.');

const paymentProviders = await readFile(
  path.join(root, 'supabase', 'functions', '_shared', 'paymentProviders.ts'),
  'utf8',
);
assert.match(paymentProviders, /method:\s*'CASH',\s*available:\s*true/, 'Cash payments must be available.');
assert.match(paymentProviders, /method:\s*'QR',\s*available:\s*true/, 'QR payments must be available.');
assert.match(paymentProviders, /provider:\s*'CASH_REGISTER'/, 'Cash payments must persist their provider.');
assert.match(paymentProviders, /provider:\s*'QR_TERMINAL'/, 'QR payments must persist their provider.');

const paymentAcceptanceMigration = await readFile(
  path.join(root, 'supabase', 'migrations', '20260826120000_enforce_payment_acceptance_rules.sql'),
  'utf8',
);
assert.match(paymentAcceptanceMigration, /for update;/i, 'Payment completion must lock the order row.');
assert.match(paymentAcceptanceMigration, /normalized_amount\s*<>\s*outstanding/i, 'Full payment must equal the outstanding balance.');
assert.match(paymentAcceptanceMigration, /payment_status\s*=\s*'PAID',\s*status\s*=\s*'COMPLETED'/i, 'Successful payment must complete the order.');
assert.match(paymentAcceptanceMigration, /set status\s*=\s*'CLEANING'/i, 'Successful dine-in payment must move the table to cleaning.');

const productImageMigration = await readFile(
  path.join(root, 'supabase', 'migrations', '20260826130000_product_images_storage.sql'),
  'utf8',
);
assert.match(productImageMigration, /add column if not exists image_path text/i, 'Products must store an image path.');
assert.match(productImageMigration, /'product-images',[\s\S]*?true,[\s\S]*?5242880/i, 'The product image bucket must be public and limited to 5 MB.');
assert.match(productImageMigration, /array\['image\/jpeg', 'image\/png', 'image\/webp'\]/i, 'The bucket must restrict image MIME types.');
assert.match(productImageMigration, /ADMIN_REQUIRED_TO_DELETE_PRODUCT_IMAGE/i, 'Only admins may detach/delete a product image.');
assert.match(productImageMigration, /current_pos_role\(\) in \('ADMIN', 'MANAGER'\)/i, 'Only management roles may upload images.');

const imageRepository = contents.get(path.join(srcRoot, 'repositories', 'product-image.repository.ts'));
assert.match(imageRepository, /\.from\(PRODUCT_IMAGE_BUCKET\)\.getPublicUrl\(normalizedPath\)/, 'Public URLs must be generated from the stored path.');
const imageService = contents.get(path.join(srcRoot, 'services', 'product-image.service.ts'));
assert.match(imageService, /crypto\.randomUUID\(\)/, 'Product images must use unique filenames.');
assert.match(imageService, /PRODUCT_IMAGE_MAX_BYTES = 5 \* 1024 \* 1024/, 'Client validation must enforce 5 MB.');
const uploadIndex = imageService.indexOf('uploadProductImageObject(imagePath');
const persistIndex = imageService.indexOf('persistProductImagePath(productId, imagePath');
const oldDeleteIndex = imageService.indexOf('deleteProductImageObject(oldImagePath');
assert.ok(uploadIndex >= 0 && uploadIndex < persistIndex && persistIndex < oldDeleteIndex, 'Replacement must upload, persist, then delete the old image.');

const productImage = contents.get(path.join(srcRoot, 'components', 'products', 'ProductImage.jsx'));
assert.match(productImage, /loading="lazy"/, 'Product images must load lazily.');
assert.match(productImage, /PRODUCT_IMAGE_PLACEHOLDER_URL/, 'Missing and broken product images must use the placeholder.');

const edgeProductService = await readFile(path.join(root, 'supabase', 'functions', '_shared', 'services', 'productService.ts'), 'utf8');
assert.match(edgeProductService, /imagePath:\s*product\.image_path \|\| null/, 'The API must return a portable Storage path.');
assert.doesNotMatch(edgeProductService, /imageUrl:\s*product\.image_url/, 'The API must not return a stored environment-specific URL.');

const adminShell = contents.get(path.join(srcRoot, 'components', 'admin', 'AdminShell.jsx'));
for (const route of ['dashboard','orders','payments','tables','products','categories','users','roles','reports','audit']) {
  assert.match(adminShell, new RegExp(`['\"]${route}['\"]`), `Admin navigation must include ${route}.`);
}
assert.match(adminShell, /allowed\.has\((?:x|item)\[2\]\)/, 'Admin navigation must hide modules without permission.');
const adminRepository = contents.get(path.join(srcRoot, 'repositories', 'admin.repository.ts'));
assert.match(adminRepository, /get_admin_dashboard/, 'The Admin dashboard must load real database metrics.');
assert.match(adminRepository, /p_date_from:\s*filters\.dateFrom[\s\S]*p_date_to:\s*filters\.dateTo/, 'Dashboard filters must be passed to one database aggregation boundary.');
for (const table of ['orders', 'payments', 'restaurant_tables', 'order_item_batches']) {
  assert.match(adminRepository, new RegExp(`['"]${table}['"]`), `Dashboard realtime must react to ${table}.`);
}
assert.doesNotMatch(adminShell, /supabase\.(?:from|rpc)/, 'The Admin shell must not query Supabase directly.');

const dashboard = contents.get(path.join(srcRoot, 'components', 'admin', 'AdminDashboard.jsx'));
assert.match(dashboard, /DashboardFilters/, 'The dashboard must use one shared global filter component.');
assert.match(dashboard, /formatCurrency/, 'Dashboard currency must use the shared Malaysia formatter.');
assert.match(dashboard, /onNavigate/, 'Dashboard widgets must navigate into operational modules.');
for (const section of ['Sales Performance','Payment Overview','Order Overview','Live Operations','Top Selling Products','Alerts & Attention','Recent Orders','Staff Performance','Recent Activity']) {
  assert.match(dashboard, new RegExp(section), `Dashboard must include ${section}.`);
}

const dashboardMigration = await readFile(path.join(root, 'supabase', 'migrations', '20260826143000_production_admin_dashboard.sql'), 'utf8');
assert.match(dashboardMigration, /p_date_from date[\s\S]*p_date_to date[\s\S]*p_granularity text/i, 'Dashboard aggregation must accept the shared reporting period and granularity.');
assert.match(dashboardMigration, /max\(coalesce\(p\.paid_at,p\.created_at\)\) settled_at/i, 'Sales must be recognised at final settlement time.');
assert.match(dashboardMigration, /s\.gross-s\.discount\+s\.tax\+s\.service_charge-r\.amount/i, 'Net sales must apply discounts, tax, service charge and refunds exactly once.');
assert.match(dashboardMigration, /p\.status in \('PAID','REFUNDED'\)/i, 'Sales aggregation must only use successful historical payment transactions.');
assert.match(dashboardMigration, /p\.status='FAILED'[\s\S]*failed/i, 'Failed payments must be reported separately.');
assert.match(dashboardMigration, /dashboard\.delayed_order_minutes/i, 'Kitchen delay threshold must be configurable.');

const stagingEnv = await readFile(path.join(root, '.env.staging'), 'utf8');
const stagingUrl = stagingEnv.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
const stagingAppEnv = stagingEnv.match(/^VITE_APP_ENV=(.+)$/m)?.[1]?.trim();
assert.ok(stagingUrl, 'Staging must define VITE_SUPABASE_URL.');
assert.equal(stagingAppEnv, 'staging', 'Staging must explicitly define VITE_APP_ENV=staging.');
assert.doesNotMatch(stagingUrl, /localhost|127\.0\.0\.1/i, 'Staging must not target a local Supabase instance.');
assert.match(stagingUrl, /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i, 'Staging must target an HTTPS Supabase project URL.');

console.log('PASS integration contracts');
