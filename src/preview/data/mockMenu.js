// Fictional, local-only catalog. Shapes follow types/product.ts; see the audit
// for the checked-in sample/demo sources. These are not live branch prices.
export const mockCategories = [
  { id: "all", name: "All items", icon: "all" },
  { id: "mains", name: "Main dishes", icon: "mains" },
  { id: "burgers", name: "Burgers", icon: "burgers" },
  { id: "sides", name: "Sides", icon: "sides" },
  { id: "drinks", name: "Drinks", icon: "drinks" },
];

const product = (
  id,
  name,
  price,
  categoryId,
  description,
  art,
  extra = {},
) => ({
  id,
  code: `MOCK-${id.toUpperCase()}`,
  name,
  price,
  categoryId,
  description,
  art,
  unit: "portion",
  isActive: true,
  isAvailable: true,
  imagePath: null,
  optionGroups: [],
  ...extra,
});

export const mockMenu = [
  product(
    "nasi",
    "Nasi Lemak",
    9.9,
    "mains",
    "Coconut rice, sambal & all the classics",
    "rice",
    {
      optionGroups: [
        {
          id: "spice",
          name: "Spice Level",
          selectionType: "SINGLE",
          isRequired: true,
          minSelection: 1,
          maxSelection: 1,
          sortOrder: 1,
          options: [{ id: "mild", name: "Mild", priceAdjustment: 0 }],
        },
      ],
    },
  ),
  product(
    "chop",
    "Chicken Chop",
    18.9,
    "mains",
    "Grilled chicken with house sauce",
    "chicken",
  ),
  product(
    "burger",
    "Chicken Burger",
    14.9,
    "burgers",
    "Chicken, crisp greens & a toasted bun",
    "burger",
  ),
  product(
    "fries",
    "French Fries",
    6.9,
    "sides",
    "Golden, lightly salted & made to share",
    "fries",
  ),
  product(
    "tea",
    "Lemon Tea",
    4.9,
    "drinks",
    "Fresh lemon & a refreshing tea blend",
    "tea",
  ),
  product(
    "coffee",
    "Coffee",
    8.5,
    "drinks",
    "A freshly brewed cup of comfort",
    "coffee",
  ),
];

export const packagingOptions = [
  ["CUP_LID", "Cup lid"],
  ["PAPER_BAG", "Paper bag"],
  ["TAKEAWAY_BOX", "Takeaway box"],
  ["CUTLERY", "Cutlery"],
  ["STRAW", "Straw"],
  ["SAUCE", "Sauce"],
  ["NAPKIN", "Napkin"],
];
