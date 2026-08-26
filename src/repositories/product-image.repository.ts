import { supabase } from '../infrastructure/supabase/client';
import type { ApiResult } from '../types/api';

export const PRODUCT_IMAGE_BUCKET = 'product-images';

export function getProductImagePublicUrl(imagePath?: string | null): string {
  const normalizedPath = String(imagePath || '').trim();
  if (!normalizedPath) return '';
  return supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(normalizedPath).data.publicUrl || '';
}

export async function uploadProductImageObject(
  imagePath: string,
  image: Blob,
): Promise<ApiResult<{ path: string }>> {
  const { data, error } = await supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(imagePath, image, { cacheControl: '3600', contentType: 'image/webp', upsert: false });
  if (error) return { data: null, error };
  return { data: { path: data.path }, error: null };
}

export async function deleteProductImageObject(imagePath: string): Promise<ApiResult<{ path: string }>> {
  const { data, error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([imagePath]);
  if (error) return { data: null, error };
  if (!data.length) {
    return { data: null, error: new Error('The image object was not removed from Storage.') };
  }
  return { data: { path: imagePath }, error: null };
}
