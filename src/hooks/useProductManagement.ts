import { useCallback, useEffect, useState } from 'react';
import { getManagedCategories } from '../services/category-management.service';
import { createManagedProduct, editManagedProduct, getManagedProducts } from '../services/product-management.service';
import { deleteProductImage, uploadProductImage, validateProductImage } from '../services/product-image.service';
import { invalidateProductCache } from '../services/product-cache.service';
import type { Category } from '../types/category';
import type { ManagedProduct, ProductManagementInput } from '../types/product';

export function useProductManagement() {
  const [products, setProducts] = useState<ManagedProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const [productResult, categoryResult] = await Promise.all([getManagedProducts(), getManagedCategories()]);
    setIsLoading(false);
    if (productResult.error || !productResult.data) return setError(productResult.error?.message || 'Unable to load products.');
    if (categoryResult.error || !categoryResult.data) return setError(categoryResult.error?.message || 'Unable to load categories.');
    setProducts(productResult.data);
    setCategories(categoryResult.data);
    setError('');
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = async (input: ProductManagementInput, image: File | null, existing?: ManagedProduct | null, skipMetadata = false) => {
    setError(''); setNotice('');
    try { if (image) validateProductImage(image); } catch (reason) { setError((reason as Error).message); return false; }
    setIsSaving(true);
    const saved = existing && skipMetadata ? { data: existing, error: null } : existing ? await editManagedProduct(existing.id, input) : await createManagedProduct(input);
    if (saved.error || !saved.data) {
      console.error('Product metadata save failed', saved.error);
      setError(saved.error?.message || 'Unable to save product.'); setIsSaving(false); return false;
    }
    let message = 'Product saved.';
    if (image) {
      const uploaded = await uploadProductImage(saved.data.id, saved.data.code, image, existing?.imagePath || null);
      if (uploaded.error) {
        setError(uploaded.error.message); setIsSaving(false); await refresh(); return false;
      }
      if (uploaded.data?.cleanupWarning) message += ` ${uploaded.data.cleanupWarning}`;
    }
    invalidateProductCache();
    setIsSaving(false); setNotice(message); await refresh(); return true;
  };

  const removeImage = async (product: ManagedProduct) => {
    if (!product.imagePath) return true;
    setError(''); setNotice(''); setIsSaving(true);
    const result = await deleteProductImage(product.id, product.imagePath);
    setIsSaving(false);
    if (result.error) { setError(result.error.message); return false; }
    invalidateProductCache(); setNotice('Product image deleted.'); await refresh(); return true;
  };

  return { products, categories, isLoading, isSaving, error, notice, refresh, save, removeImage };
}
