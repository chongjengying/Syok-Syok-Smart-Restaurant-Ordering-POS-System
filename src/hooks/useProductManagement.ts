import { useCallback, useEffect, useRef, useState } from "react";
import { getManagedCategories } from "../services/category-management.service";
import {
  createManagedProduct,
  editManagedProduct,
  getManagedProducts,
} from "../services/product-management.service";
import {
  deleteProductImage,
  uploadProductImage,
  validateProductImage,
} from "../services/product-image.service";
import { invalidateProductCache } from "../services/product-cache.service";
import type { Category } from "../types/category";
import type { ManagedProduct, ProductManagementInput } from "../types/product";

export function useProductManagement(canReadCategories = true) {
  const [products, setProducts] = useState<ManagedProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const submitting = useRef(false);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setIsLoading(true);
    try {
      const [productResult, categoryResult] = await Promise.all([
        getManagedProducts(),
        canReadCategories ? getManagedCategories() : Promise.resolve(null),
      ]);
      if (request !== generation.current) return;
      if (productResult.error || !productResult.data) {
        setError(productResult.error?.message || "Unable to load products.");
        return;
      }
      setProducts(productResult.data);
      if (categoryResult?.error) {
        setError(categoryResult.error.message || "Unable to load categories.");
        return;
      }
      setCategories(categoryResult?.data || []);
      setError("");
    } catch (cause) {
      if (request === generation.current)
        setError(
          cause instanceof Error ? cause.message : "Unable to load products.",
        );
    } finally {
      if (request === generation.current) setIsLoading(false);
    }
  }, [canReadCategories]);

  useEffect(() => {
    const requests = generation;
    void refresh();
    return () => {
      requests.current++;
    };
  }, [refresh]);

  const save = async (
    input: ProductManagementInput,
    image: File | null,
    existing?: ManagedProduct | null,
    skipMetadata = false,
    onPersisted?: (product: ManagedProduct) => void,
  ) => {
    if (submitting.current) return false;
    submitting.current = true;
    setError("");
    setNotice("");
    setIsSaving(true);
    try {
      if (image) validateProductImage(image);
      const saved =
        existing && skipMetadata
          ? { data: existing, error: null }
          : existing
            ? await editManagedProduct(existing.id, input)
            : await createManagedProduct(input);
      if (saved.error || !saved.data) {
        setError(saved.error?.message || "Unable to save product.");
        return false;
      }
      // A failed image upload must retry against the saved row, not create it again.
      onPersisted?.(saved.data);
      invalidateProductCache();
      let message = "Product saved.";
      if (image) {
        const uploaded = await uploadProductImage(
          saved.data.id,
          saved.data.code,
          image,
          existing?.imagePath || null,
        );
        if (uploaded.error) {
          await refresh();
          setError(
            `Product details were saved, but the image could not be uploaded. ${uploaded.error.message}`,
          );
          return false;
        }
        if (uploaded.data?.cleanupWarning)
          message += ` ${uploaded.data.cleanupWarning}`;
      }
      invalidateProductCache();
      await refresh();
      setNotice(message);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save product.",
      );
      return false;
    } finally {
      submitting.current = false;
      setIsSaving(false);
    }
  };

  const removeImage = async (product: ManagedProduct) => {
    if (!product.imagePath) return true;
    if (submitting.current) return false;
    submitting.current = true;
    try {
      setError("");
      setNotice("");
      setIsSaving(true);
      const result = await deleteProductImage(product.id, product.imagePath);
      if (result.error) {
        setError(result.error.message);
        return false;
      }
      invalidateProductCache();
      setNotice("Product image deleted.");
      await refresh();
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to delete image.",
      );
      return false;
    } finally {
      submitting.current = false;
      setIsSaving(false);
    }
  };

  return {
    products,
    categories,
    isLoading,
    isSaving,
    error,
    notice,
    refresh,
    save,
    removeImage,
  };
}
