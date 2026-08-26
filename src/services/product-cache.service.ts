import type { Product } from '../types/product';

// v2 invalidates empty/legacy entries produced when older Product Functions
// omitted availability flags and the frontend incorrectly filtered every row.
export const PRODUCT_CACHE_KEY = 'pos.available-products.v2';
export const PRODUCT_CACHE_STALE_TIME_MS = 2 * 60 * 1000;
export const PRODUCT_CACHE_GC_TIME_MS = 30 * 60 * 1000;

export interface ProductCacheEntry {
  products: Product[];
  fetchedAt: number;
}

type ProductLoader = () => Promise<Product[]>;
type CacheListener = (entry: ProductCacheEntry | null) => void;

const listeners = new Set<CacheListener>();
let cacheEntry: ProductCacheEntry | null = readStoredEntry();
let pendingRefresh: Promise<Product[]> | null = null;

function storageAvailable(): boolean {
  return typeof globalThis.sessionStorage !== 'undefined';
}

function readStoredEntry(): ProductCacheEntry | null {
  if (!storageAvailable()) return null;
  try {
    const raw = globalThis.sessionStorage.getItem(PRODUCT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProductCacheEntry>;
    if (!Array.isArray(parsed.products) || typeof parsed.fetchedAt !== 'number') return null;
    const productsAreValid = parsed.products.every((product) => (
      product !== null
      && typeof product === 'object'
      && typeof (product as Partial<Product>).id === 'string'
      && typeof (product as Partial<Product>).name === 'string'
      && Number.isFinite(Number((product as Partial<Product>).price))
      && (product as Partial<Product>).isActive === true
      // Sold-out products are deliberately cached so the menu can display them.
      // Availability is refreshed by the stale-time/manual refresh policy.
      && (
        typeof (product as Partial<Product>).isAvailable === 'boolean'
        || !('isAvailable' in (product as Partial<Product>))
      )
    ));
    if (!productsAreValid) {
      globalThis.sessionStorage.removeItem(PRODUCT_CACHE_KEY);
      return null;
    }
    if (Date.now() - parsed.fetchedAt > PRODUCT_CACHE_GC_TIME_MS) {
      globalThis.sessionStorage.removeItem(PRODUCT_CACHE_KEY);
      return null;
    }
    return { products: parsed.products as Product[], fetchedAt: parsed.fetchedAt };
  } catch {
    try {
      globalThis.sessionStorage.removeItem(PRODUCT_CACHE_KEY);
    } catch {
      // Ignore browser storage access failures and continue without persistence.
    }
    return null;
  }
}

function publish(entry: ProductCacheEntry | null) {
  for (const listener of listeners) listener(entry);
}

function persist(entry: ProductCacheEntry) {
  if (!storageAvailable()) return;
  try {
    globalThis.sessionStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // The in-memory cache remains usable when browser storage is unavailable or full.
  }
}

export function getProductCache(): ProductCacheEntry | null {
  return cacheEntry;
}

export function isProductCacheStale(
  entry: ProductCacheEntry | null = cacheEntry,
  now = Date.now(),
): boolean {
  return !entry || now - entry.fetchedAt >= PRODUCT_CACHE_STALE_TIME_MS;
}

export function subscribeToProductCache(listener: CacheListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function refreshProductCache(loader: ProductLoader, force = false): Promise<Product[]> {
  if (!force && cacheEntry && !isProductCacheStale(cacheEntry)) {
    return Promise.resolve(cacheEntry.products);
  }
  if (pendingRefresh) return pendingRefresh;

  pendingRefresh = loader()
    .then((products) => {
      cacheEntry = { products, fetchedAt: Date.now() };
      persist(cacheEntry);
      publish(cacheEntry);
      return products;
    })
    .finally(() => {
      pendingRefresh = null;
    });

  return pendingRefresh;
}

export function invalidateProductCache(): void {
  if (!cacheEntry) return;
  cacheEntry = { ...cacheEntry, fetchedAt: 0 };
  persist(cacheEntry);
  publish(cacheEntry);
}

export function clearProductCache(): void {
  cacheEntry = null;
  if (storageAvailable()) {
    try {
      globalThis.sessionStorage.removeItem(PRODUCT_CACHE_KEY);
    } catch {
      // Ignore browser storage access failures and clear the in-memory cache.
    }
  }
  publish(null);
}
