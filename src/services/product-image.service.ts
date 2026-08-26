import {
  deleteProductImageObject,
  getProductImagePublicUrl,
  uploadProductImageObject,
} from '../repositories/product-image.repository';
import { persistProductImagePath } from '../repositories/product.repository';
import type { ApiResult } from '../types/api';

export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const PRODUCT_IMAGE_PLACEHOLDER_URL = '/product-placeholder.svg';
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const allowedExtensions = new Set(['jpg', 'jpeg', 'png', 'webp']);

export class ProductImageError extends Error {
  constructor(public readonly code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ProductImageError';
  }
}

export function validateProductImage(file: File): void {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  if (!allowedTypes.has(file.type) || !allowedExtensions.has(extension)) {
    throw new ProductImageError('INVALID_IMAGE', 'Choose a JPG, JPEG, PNG, or WEBP image.');
  }
  if (file.size <= 0) throw new ProductImageError('INVALID_IMAGE', 'The selected image is empty.');
  if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
    throw new ProductImageError('IMAGE_TOO_LARGE', 'Product images must be 5 MB or smaller.');
  }
}

async function loadImageSource(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new ProductImageError('INVALID_IMAGE', 'The selected file could not be decoded as an image.'));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function convertToWebp(file: File): Promise<Blob> {
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await loadImageSource(file);
  } catch (error) {
    if (error instanceof ProductImageError) throw error;
    throw new ProductImageError('INVALID_IMAGE', 'The selected file could not be decoded as an image.', { cause: error });
  }
  const width = source.width;
  const height = source.height;
  if (!width || !height) throw new ProductImageError('INVALID_IMAGE', 'The selected image has invalid dimensions.');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new ProductImageError('IMAGE_PROCESSING_FAILED', 'This browser cannot process the selected image.');
  context.drawImage(source, 0, 0);
  if ('close' in source && typeof source.close === 'function') source.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.88));
  if (!blob) throw new ProductImageError('IMAGE_PROCESSING_FAILED', 'The image could not be converted to WEBP.');
  if (blob.size > PRODUCT_IMAGE_MAX_BYTES) {
    throw new ProductImageError('IMAGE_TOO_LARGE', 'The converted image exceeds the 5 MB limit.');
  }
  return blob;
}

function productFolder(productCode: string): string {
  const normalized = productCode.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{0,39}$/.test(normalized)) {
    throw new ProductImageError('INVALID_PRODUCT_CODE', 'The product code cannot be used for image storage.');
  }
  return normalized;
}

export function getProductImageUrl(imagePath?: string | null): string {
  return getProductImagePublicUrl(imagePath) || PRODUCT_IMAGE_PLACEHOLDER_URL;
}

export async function uploadProductImage(
  productId: string,
  productCode: string,
  file: File,
  oldImagePath: string | null = null,
): Promise<ApiResult<{ imagePath: string; imageUrl: string; cleanupWarning?: string }>> {
  try {
    validateProductImage(file);
    const webp = await convertToWebp(file);
    const imagePath = `products/${productFolder(productCode)}/${crypto.randomUUID()}.webp`;
    const upload = await uploadProductImageObject(imagePath, webp);
    if (upload.error) throw new ProductImageError('UPLOAD_FAILED', 'Image upload failed. Check your Storage permission and try again.', { cause: upload.error });

    const persisted = await persistProductImagePath(productId, imagePath);
    if (persisted.error) {
      const cleanup = await deleteProductImageObject(imagePath);
      if (cleanup.error) console.error('Unable to remove image after database update failure', cleanup.error);
      throw new ProductImageError('DATABASE_UPDATE_FAILED', 'The image uploaded, but the product could not be updated.', { cause: persisted.error });
    }

    let cleanupWarning: string | undefined;
    if (oldImagePath && oldImagePath !== imagePath) {
      const removed = await deleteProductImageObject(oldImagePath);
      if (removed.error) {
        cleanupWarning = 'The new image was saved, but the previous image could not be cleaned up.';
        console.error('Unable to remove replaced product image', { oldImagePath, error: removed.error });
      }
    }
    return { data: { imagePath, imageUrl: getProductImageUrl(imagePath), cleanupWarning }, error: null };
  } catch (error) {
    console.error('Product image upload failed', error);
    return { data: null, error: error instanceof Error ? error : new Error('Image upload failed.') };
  }
}

export const replaceProductImage = uploadProductImage;

export async function deleteProductImage(
  productId: string,
  imagePath: string,
): Promise<ApiResult<{ imagePath: null }>> {
  const persisted = await persistProductImagePath(productId, null);
  if (persisted.error) {
    console.error('Unable to clear product image path', persisted.error);
    return { data: null, error: new ProductImageError('DATABASE_UPDATE_FAILED', 'The product image could not be removed.', { cause: persisted.error }) };
  }
  const removed = await deleteProductImageObject(imagePath);
  if (removed.error) {
    console.error('Product image path cleared but Storage cleanup failed', { imagePath, error: removed.error });
    return { data: null, error: new ProductImageError('DELETE_FAILED', 'The image was detached from the product, but Storage cleanup failed.', { cause: removed.error }) };
  }
  return { data: { imagePath: null }, error: null };
}
