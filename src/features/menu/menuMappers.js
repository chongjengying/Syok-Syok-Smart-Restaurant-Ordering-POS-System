export function mapCategory(category) {
  return {
    id: category.id,
    name: category.name,
    description: category.description || '',
  };
}

export function mapProduct(product) {
  const image = product.image || product.imageUrl || product.imagePath || null;
  return {
    ...product,
    price: Number(product.price),
    description: product.description || '',
    optionGroups: Array.isArray(product.optionGroups) ? product.optionGroups : [],
    image,
    imageUrl: product.imageUrl || image,
  };
}
