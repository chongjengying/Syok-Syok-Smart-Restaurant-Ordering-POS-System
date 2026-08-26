import React, { useEffect, useState } from 'react';
import { PRODUCT_IMAGE_PLACEHOLDER_URL } from '../../services/product-image.service';

export default function ProductImage({ src, alt, className = '', fallbackLabel = 'Product image unavailable' }) {
  const [failed, setFailed] = useState(!src);
  useEffect(() => setFailed(!src), [src]);

  return (
    <img
      src={failed ? PRODUCT_IMAGE_PLACEHOLDER_URL : src}
      alt={failed ? fallbackLabel : alt}
      loading="lazy"
      className={className}
      onError={() => { if (!failed) setFailed(true); }}
    />
  );
}
