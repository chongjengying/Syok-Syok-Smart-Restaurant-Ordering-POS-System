import { mockMenu } from "./mockMenu.js";

export function createMockOrders() {
  const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
  const item = (id, productId, quantity, status, batchId) => {
    const dish = mockMenu.find((entry) => entry.id === productId);
    return {
      id,
      productId,
      name: dish.name,
      quantity,
      unitPrice: dish.price,
      selectedOptions:
        productId === "nasi"
          ? [
              {
                id: "mild",
                name: "Mild",
                groupId: "spice",
                groupName: "Spice Level",
                selectionType: "SINGLE",
                priceAdjustment: 0,
              },
            ]
          : [],
      specialRequest: "",
      serviceMode: "DINE_IN",
      itemStatus: status,
      batchId,
    };
  };
  return [
    {
      id: "order-1042",
      orderNumber: "DEMO-1042",
      tableId: "table-3",
      diningMode: "dine-in",
      status: "PREPARING",
      paymentStatus: "UNPAID",
      createdAt: ago(12),
      items: [
        item("item-a", "nasi", 2, "PREPARING", "batch-a"),
        item("item-b", "tea", 2, "PREPARING", "batch-a"),
      ],
      batches: [
        { id: "batch-a", batchNo: 1, status: "PREPARING", createdAt: ago(12) },
      ],
      payments: [],
      bills: [],
      takeawayPackaging: [],
      receipt: null,
      discount: 0,
      tax: 0,
      serviceCharge: 0,
      rounding: 0,
    },
    {
      id: "order-1043",
      orderNumber: "DEMO-1043",
      tableId: "table-6",
      diningMode: "dine-in",
      status: "READY",
      paymentStatus: "UNPAID",
      createdAt: ago(8),
      items: [
        item("item-c", "burger", 1, "READY", "batch-b"),
        item("item-d", "fries", 1, "READY", "batch-b"),
      ],
      batches: [
        { id: "batch-b", batchNo: 1, status: "READY", createdAt: ago(8) },
      ],
      payments: [],
      bills: [],
      takeawayPackaging: [],
      receipt: null,
      discount: 0,
      tax: 0,
      serviceCharge: 0,
      rounding: 0,
    },
    {
      id: "order-1041",
      orderNumber: "DEMO-1041",
      tableId: null,
      diningMode: "takeaway",
      status: "COMPLETED",
      paymentStatus: "PAID",
      createdAt: ago(35),
      items: [
        {
          ...item("item-e", "coffee", 2, "SERVED", "batch-c"),
          serviceMode: "TAKEAWAY",
        },
      ],
      batches: [
        { id: "batch-c", batchNo: 1, status: "SERVED", createdAt: ago(35) },
      ],
      payments: [
        {
          id: "payment-seed",
          paymentNumber: "PAY-DEMO-001",
          paymentMethod: "CASH",
          amount: 17,
          receivedAmount: 20,
          changeAmount: 3,
          splitType: "FULL",
          paidAt: ago(34),
          shiftId: "mock-shift",
          allocations: [],
        },
      ],
      bills: [],
      takeawayPackaging: ["PAPER_BAG", "NAPKIN"],
      receipt: { receiptNumber: "RCP-DEMO-001", issuedAt: ago(34) },
      discount: 0,
      tax: 0,
      serviceCharge: 0,
      rounding: 0,
    },
  ];
}
