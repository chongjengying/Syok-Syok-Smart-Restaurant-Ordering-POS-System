export const mockTables = Array.from({ length: 12 }, (_, index) => ({
  id: `table-${index + 1}`,
  tableNumber: String(index + 1).padStart(2, "0"),
  tableName: null,
  capacity: index > 7 ? 6 : index % 3 === 0 ? 2 : 4,
  area: index > 7 ? "Terrace" : "Main dining",
  isActive: true,
  status:
    {
      2: "OCCUPIED",
      5: "OCCUPIED",
      7: "CLEANING",
      9: "RESERVED",
      11: "DISABLED",
    }[index] || "AVAILABLE",
}));
