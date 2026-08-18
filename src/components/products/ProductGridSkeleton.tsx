import { ProductCardSkeleton } from './ProductCardSkeleton';

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return Array.from({ length: count }, (_, index) => (
    <ProductCardSkeleton key={index} />
  ));
}
