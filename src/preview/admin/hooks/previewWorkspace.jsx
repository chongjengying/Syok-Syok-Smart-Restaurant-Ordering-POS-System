import { useRef, useState } from "react";
import { WorkspaceContext } from "./usePreviewWorkspace";
import { money, parseMoney } from "../previewMoney";
import { adminModuleData } from "../adminModuleData";
import { referenceMenu, referenceOrders } from "../referenceData";
import { initialBranches, initialDevices } from "../mockData";
import {
  dateKey,
  productAvailable,
  resolveOrderLine,
} from "../previewSelectors";

const time = () =>
  new Date().toLocaleTimeString("en-MY", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kuala_Lumpur",
  });
const id = (prefix) => `${prefix}-${crypto.randomUUID()}`;

function initialWorkspace() {
  const data = Object.fromEntries(
    Object.entries(adminModuleData).map(([key, config]) => [
      key,
      config.rows.map((row, index) => ({ ...row, _id: `${key}-${index}` })),
    ]),
  );
  data.products = referenceMenu.map((item, index) => ({
    _id: `product-${index}`,
    Product: item.name,
    SKU: item.sku,
    Category: item.category,
    Price: money(parseMoney(item.price)),
    "Stock tracking": "On",
    Status: "Available",
    _stock: item.stock,
    _sold: item.sold,
    _image: item.image,
  }));
  data.orders = referenceOrders.map((row, index) => ({
    ...row,
    _id: `order-${index}`,
  }));
  data.payments = [
    {
      _id: "payment-1",
      Payment: "PAY-1046",
      Order: "#ORD-1046",
      Method: "Card",
      Provider: "Card terminal",
      Amount: "RM 72.00",
      Status: "Completed",
      _refundedCents: 0,
    },
    {
      _id: "payment-2",
      Payment: "PAY-1045",
      Order: "#ORD-1045",
      Method: "Cash",
      Provider: "Cash drawer",
      Amount: "RM 164.80",
      Status: "Completed",
      _refundedCents: 0,
    },
    {
      _id: "payment-3",
      Payment: "PAY-1040",
      Order: "#ORD-1040",
      Method: "QR",
      Provider: "DuitNow",
      Amount: "RM 34.00",
      Status: "Failed",
      _refundedCents: 0,
    },
  ];
  data.receipts = data.payments
    .filter((row) => row.Status === "Completed")
    .map((row, index) => ({
      _id: `receipt-${index}`,
      Receipt: `RCP-2026-${1046 - index}`,
      Order: row.Order,
      "Branch / terminal": "Bangsar Central · POS-01",
      Cashier: "Farah Lim",
      Issued: "Today",
      Total: row.Amount,
      Status: "Issued",
      _reprints: 0,
    }));
  data.tables = Array.from({ length: 24 }, (_, index) => ({
    _id: `table-${index}`,
    Table: `Table ${String(index + 1).padStart(2, "0")}`,
    "Dining area":
      index < 12 ? "Main Floor" : index < 18 ? "Bar Area" : "Patio Garden",
    Branch: "Bangsar Central",
    Capacity: index % 3 === 0 ? "4 seats" : "2 seats",
    "Current order":
      index === 3 ? "#ORD-1048" : index === 11 ? "#ORD-1047" : "—",
    Status:
      index === 3 || index === 11
        ? "Occupied"
        : index < 21
          ? "Available"
          : index < 23
            ? "Reserved"
            : "Cleaning",
  }));
  data.categories = ["Mains", "Sides", "Beverages", "Desserts"].map(
    (name, index) => ({
      _id: `category-${index}`,
      Category: name,
      Products: `${data.products.filter((item) => item.Category === name).length} products`,
      "Menu order": String(index + 1),
      "Kitchen routing":
        name === "Beverages"
          ? "Bar"
          : name === "Desserts"
            ? "Cold kitchen"
            : "Hot kitchen",
      Visibility: "Visible",
    }),
  );
  data.inventory = referenceMenu.map((item, index) => ({
    _id: `stock-${index}`,
    Item: item.name,
    SKU: item.sku,
    Branch: "Bangsar Central",
    "On hand": `${item.stock} portions`,
    "Reorder point": "10 portions",
    Status: item.stock < 10 ? "Low stock" : "In stock",
    _productId: `product-${index}`,
  }));
  data["cash-shifts"] = [
    {
      _id: "shift-02",
      Shift: "SH-002",
      "Branch / terminal": "Bangsar Central · POS-01",
      "Opened by": "Farah Lim",
      "Opened at": "Today · 09:00",
      "Opening cash": "RM 300.00",
      "Expected cash": "RM 680.00",
      Status: "Open",
    },
    {
      _id: "shift-01",
      Shift: "SH-001",
      "Branch / terminal": "Bangsar Central · POS-02",
      "Opened by": "Daniel Tan",
      "Opened at": "Yesterday · 09:00",
      "Opening cash": "RM 300.00",
      "Expected cash": "RM 540.00",
      Status: "Closed",
    },
  ];
  const cake = {
    productId: "product-4",
    name: "Pandan Gula Melaka Cake",
    quantity: 4,
    priceCents: 1800,
  };
  Object.assign(
    data.orders.find((row) => row.Order === "#ORD-1046"),
    {
      _items: [cake],
      _subtotalCents: 7200,
      _discountCents: 0,
      _taxCents: 0,
      _serviceCents: 0,
      _summary: "4 × Pandan Gula Melaka Cake",
    },
  );
  Object.assign(
    data.orders.find((row) => row.Order === "#ORD-1045"),
    {
      _items: [
        {
          productId: "product-1",
          name: "Signature Wagyu Beef Burger",
          quantity: 4,
          priceCents: 3800,
        },
        {
          productId: "product-2",
          name: "Teh Tarik Special",
          quantity: 1,
          priceCents: 1280,
        },
      ],
      _subtotalCents: 16480,
      _discountCents: 0,
      _taxCents: 0,
      _serviceCents: 0,
      _summary: "4 burgers, 1 tea · historical receipt prices",
    },
  );
  Object.entries(data)
    .filter(([, rows]) => Array.isArray(rows))
    .forEach(([moduleId, rows]) =>
      rows.forEach((row, index) => {
        row._createdAt = new Date(
          Date.now() -
            (/yesterday/i.test(row["Opened at"] || "")
              ? 86400000
              : (index + 1) * 120000),
        ).toISOString();
        if (
          ["payments", "discount-activity", "einvoice"].includes(moduleId) &&
          !row.Branch
        )
          row.Branch =
            data.orders.find((order) => order.Order === row.Order)?.Branch ||
            "Bangsar Central";
      }),
    );
  data._movements = [];
  data._salesDelta = 0;
  data._newOrders = 0;
  data._activity = [];
  return data;
}

export function PreviewWorkspaceProvider({ children }) {
  const [modules, setModules] = useState(initialWorkspace);
  const ref = useRef(modules);
  const [branch, setBranch] = useState("Bangsar Central");
  const [identity, setIdentity] = useState({
    actor: "Alex Tan",
    company: "Resto Dining Group",
  });
  const [availableBranches, setAvailableBranches] = useState(initialBranches);
  const [availableTerminals, setAvailableTerminals] = useState(initialDevices);
  const [area, setArea] = useState("Main Floor");
  const [role, setRole] = useState("Owner");
  const [permissionProfiles, setPermissionProfiles] = useState({});
  const can = (permission) =>
    role === "Owner" ||
    (role === "Manager" &&
      Boolean(permissionProfiles["Branch Manager"]?.[permission]));
  const modulePermission = (moduleId) =>
    ({
      products: "Manage products",
      categories: "Manage products",
      inventory: "Manage products",
      promotions: "Apply discounts",
      vouchers: "Apply discounts",
      orders: "Create orders",
      tables: "Manage tables",
      payments: "Process refunds",
      receipts: "Take payment",
      "cash-shifts": "Take payment",
      users: "Manage staff",
      roles: "Manage staff",
      branches: "Edit company settings",
      company: "Edit company settings",
      terminals: "Manage devices",
      "system-administration": "Edit company settings",
      "qr-settings": "Edit company settings",
      "payment-providers": "Edit company settings",
      einvoice: "View reports",
    })[moduleId];
  const canEdit = (moduleId) =>
    role === "Owner" ||
    (role === "Manager" &&
      Boolean(modulePermission(moduleId)) &&
      can(modulePermission(moduleId)));
  const canView = (moduleId) => {
    if (role !== "Manager") return true;
    const permission = {
      dashboard: "View dashboard",
      orders: "View orders",
      reports: "View reports",
      audit: "View reports",
      "discount-activity": "View reports",
      einvoice: "View reports",
      payments: "Take payment",
      receipts: "Take payment",
      "cash-shifts": "Take payment",
    }[moduleId];
    return !permission || can(permission);
  };
  const [screenState, setScreenState] = useState("default");
  const [composerOpen, setComposerOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [settings, setSettings] = useState({
    name: "Resto Dining Group",
    currency: "MYR",
    timezone: "Asia/Kuala_Lumpur",
    taxRate: "6",
    serviceRate: "0",
    receiptFooter: "Thank you for dining with us.",
    receiptCopies: "1",
    orderPrefix: "ORD",
    allowTakeaway: true,
    requireManagerApproval: true,
    printers: [],
    merchantName: "Resto Dining Group",
    merchantId: "MOCK-MERCHANT-001",
    qrEnabled: true,
    confirmation: "Cashier confirmation",
  });
  const commit = (next) => {
    ref.current = next;
    setModules(next);
    setLastUpdated(new Date());
  };
  const audit = (data, action, resource, reason = "", approver = "") => {
    data.audit.unshift({
      _id: id("audit"),
      _createdAt: new Date().toISOString(),
      When: time(),
      Actor: identity.actor,
      Action: action,
      Resource: resource,
      Branch: branch,
      Result: "Succeeded",
      Company: identity.company,
      Terminal: "POS-01",
      Reason: reason || "—",
      "Approved by": approver || "—",
    });
  };
  const transact = (callback) => {
    if (role === "Read only")
      return {
        error: "Your preview role can view records but cannot change them.",
      };
    const next = structuredClone(ref.current);
    const error = callback(next);
    if (error) return { error };
    commit(next);
    return { success: true };
  };
  const recordActivity = (action, resource, reason) => {
    const next = structuredClone(ref.current);
    audit(next, action, resource, reason);
    commit(next);
  };
  const saveRecord = (moduleId, values, existingId) =>
    transact((data) => {
      if (!canEdit(moduleId))
        return "Your sample role cannot edit this module.";
      const rows = data[moduleId];
      const columns = adminModuleData[moduleId].columns;
      const primary = columns[0];
      if (!String(values[primary] || "").trim())
        return `${primary} is required.`;
      const uniqueKey =
        moduleId === "products"
          ? "SKU"
          : moduleId === "vouchers"
            ? "Code"
            : primary;
      if (
        rows.some(
          (row) =>
            row._id !== existingId &&
            String(row[uniqueKey]).toLowerCase() ===
              String(values[uniqueKey]).toLowerCase(),
        )
      )
        return `${uniqueKey} must be unique.`;
      if (
        values.Price &&
        (!Number.isFinite(parseMoney(values.Price)) ||
          parseMoney(values.Price) <= 0)
      )
        return "Enter a price greater than zero with at most two decimal places.";
      const row = existingId
        ? rows.find((item) => item._id === existingId)
        : { _id: id(moduleId), _createdAt: new Date().toISOString() };
      if (!row) return "This record is no longer available.";
      const previousName = row.Category;
      Object.assign(row, values);
      if (moduleId === "products") {
        row.Price = money(parseMoney(values.Price));
        row._stock ??= 0;
        row._sold ??= 0;
      }
      if (!existingId) rows.unshift(row);
      if (
        moduleId === "products" &&
        row["Stock tracking"] === "On" &&
        !data.inventory.some(
          (item) => item._productId === row._id && item.Branch === branch,
        )
      )
        data.inventory.push({
          _id: id("stock"),
          Item: row.Product,
          SKU: row.SKU,
          Branch: branch === "All branches" ? "Bangsar Central" : branch,
          "On hand": "0 portions",
          "Reorder point": "10 portions",
          Status: "Out of stock",
          _productId: row._id,
        });
      if (moduleId === "products")
        data.inventory
          .filter((item) => item._productId === row._id)
          .forEach((item) => {
            item.Item = row.Product;
            item.SKU = row.SKU;
          });
      if (
        moduleId === "categories" &&
        previousName &&
        previousName !== row.Category
      )
        data.products
          .filter((item) => item.Category === previousName)
          .forEach((item) => {
            item.Category = row.Category;
          });
      if (["products", "categories"].includes(moduleId))
        data.categories.forEach((category) => {
          category.Products = `${data.products.filter((item) => item.Category === category.Category).length} products`;
        });
      audit(
        data,
        existingId ? "RECORD_UPDATED" : "RECORD_CREATED",
        `${moduleId}: ${row[primary]}`,
      );
    });
  const deleteProduct = (rowId) =>
    transact((data) => {
      if (!canEdit("products"))
        return "Your sample role cannot edit menu items.";
      const row = data.products.find((product) => product._id === rowId);
      if (!row) return "Item not found.";
      row._archived = true;
      row.Status = "Archived";
      audit(
        data,
        "MENU_ITEM_REMOVED",
        row.Product,
        "Historical order items and stock records retained.",
      );
    });
  const changeStatus = (moduleId, rowId, status, reason = "", approver = "") =>
    transact((data) => {
      if (!canEdit(moduleId))
        return "Your sample role cannot change this module.";
      const row = data[moduleId].find((item) => item._id === rowId);
      if (!row) return "Record not found.";
      if (
        moduleId === "orders" &&
        ["Paid", "Refunded", "Partially refunded"].includes(row.Payment) &&
        status === "Cancelled"
      )
        return "Paid orders require a refund instead of cancellation.";
      if (status === "Cancelled" && !reason.trim())
        return "Enter a cancellation reason.";
      if (
        status === "Cancelled" &&
        settings.requireManagerApproval &&
        !["Alex Tan · Company owner", "Farah Lim · Branch Manager"].includes(
          approver,
        )
      )
        return "Choose a sample owner or manager to approve this cancellation.";
      if (
        moduleId === "tables" &&
        status === "Available" &&
        row.Status === "Occupied"
      )
        return "Settle the linked order before releasing this table.";
      row[/categories/.test(moduleId) ? "Visibility" : "Status"] = status;
      if (moduleId === "orders" && status === "Cancelled") {
        const table = data.tables.find(
          (item) => item["Current order"] === row.Order,
        );
        if (table) {
          table.Status = "Cleaning";
          table["Current order"] = "—";
        }
      }
      audit(
        data,
        "STATUS_CHANGED",
        `${moduleId}: ${row[adminModuleData[moduleId].columns[0]]}`,
        reason,
        approver,
      );
    });
  const createOrder = ({ items, orderType, tableId, voucher }) =>
    transact((data) => {
      if (!can("Create orders"))
        return "Your sample role cannot create orders.";
      if (branch === "All branches")
        return "Select one branch before creating an order.";
      if (orderType === "Takeaway" && !settings.allowTakeaway)
        return "Takeaway ordering is disabled in Restaurant Settings.";
      if (!items.length) return "Add at least one menu item.";
      if (
        !data["cash-shifts"].some(
          (shift) =>
            shift.Status === "Open" &&
            shift["Branch / terminal"].startsWith(branch),
        )
      )
        return "Open a register for this branch before creating an order.";
      const products = items.map((item) => ({
        ...item,
        product: data.products.find(
          (product) => product._id === item.productId,
        ),
      }));
      if (
        products.some(
          (item) =>
            !item.product ||
            !productAvailable(item.product, branch) ||
            !Number.isInteger(item.quantity) ||
            item.quantity < 1,
        )
      )
        return "Choose available items and valid quantities.";
      const table = data.tables.find((row) => row._id === tableId);
      if (
        orderType === "Dine-in" &&
        (!table || table.Branch !== branch || table.Status !== "Available")
      )
        return "Choose an available table in the selected branch.";
      for (const item of products) {
        const resolved = resolveOrderLine(item.product, item.modifiers || []);
        if (resolved.error) return resolved.error;
        item.priceCents = resolved.priceCents;
        item.modifiers = resolved.modifiers;
      }
      const subtotal = products.reduce(
        (sum, item) => sum + item.priceCents * item.quantity,
        0,
      );
      let discount = 0;
      if (voucher) {
        const offer = data.vouchers.find(
          (row) => row.Code === voucher && row.Status === "Active",
        );
        if (!offer) return "This voucher is unavailable.";
        if (
          (offer.Starts && offer.Starts > dateKey(Date.now())) ||
          (offer.Ends && offer.Ends < dateKey(Date.now()))
        )
          return "This voucher is outside its valid dates.";
        const [used, limit] = String(offer.Redemptions).split("/").map(Number);
        if (used >= limit)
          return "This voucher has reached its redemption limit.";
        discount =
          offer.Type === "Percentage"
            ? Math.round(
                (subtotal * Number(String(offer.Value).replace("%", ""))) / 100,
              )
            : parseMoney(offer.Value);
        if (!Number.isFinite(discount) || discount < 0)
          return "This voucher needs a valid discount value.";
        discount = Math.min(discount, subtotal);
        offer.Redemptions = `${used + 1} / ${limit}`;
      }
      const tax = Math.round(
        ((subtotal - discount) * Number(settings.taxRate)) / 100,
      );
      const service = Math.round(
        ((subtotal - discount) * Number(settings.serviceRate)) / 100,
      );
      const total = subtotal - discount + tax + service;
      const orderNumber =
        "#" +
        settings.orderPrefix +
        "-" +
        (Math.max(
          1048,
          ...data.orders.map(
            (row) => Number(String(row.Order).replace(/\D/g, "")) || 0,
          ),
        ) +
          1);
      data.orders.unshift({
        _id: id("order"),
        _createdAt: new Date().toISOString(),
        Terminal: data["cash-shifts"]
          .find(
            (row) =>
              row.Status === "Open" &&
              row["Branch / terminal"].startsWith(branch),
          )
          ?.["Branch / terminal"].split(" · ")[1],
        Order: orderNumber,
        Time: time(),
        Branch: branch,
        "Order type": orderType,
        Cashier: identity.actor,
        Total: money(total),
        Status: "Preparing",
        Table: orderType === "Dine-in" ? table.Table : "Takeaway",
        Payment: "Unpaid",
        _items: products.map((item) => ({
          productId: item.productId,
          name: item.product.Product,
          quantity: item.quantity,
          priceCents: item.priceCents,
          modifiers: item.modifiers,
        })),
        _summary: `${items.reduce((sum, item) => sum + item.quantity, 0)} items`,
        _area: table?.["Dining area"] || area,
        _subtotalCents: subtotal,
        _discountCents: discount,
        _taxCents: tax,
        _serviceCents: service,
        _totalCents: total,
      });
      if (table && orderType === "Dine-in") {
        table.Status = "Occupied";
        table["Current order"] = orderNumber;
      }
      if (discount)
        data["discount-activity"].unshift({
          _id: id("discount"),
          _createdAt: new Date().toISOString(),
          Branch: branch,
          Time: time(),
          Order: orderNumber,
          Type: "Voucher",
          "Code / reason": voucher,
          "Approved by": "—",
          Discount: money(discount),
        });
      data._newOrders += 1;
      data._activity.push({ type: "order", branch });
      audit(data, "ORDER_CREATED", orderNumber);
    });
  const settleOrder = (rowId, method, cashReceived) =>
    transact((data) => {
      if (!can("Take payment")) return "Your sample role cannot take payments.";
      const order = data.orders.find((row) => row._id === rowId);
      if (!order || order.Payment !== "Unpaid" || order.Status === "Cancelled")
        return "This order cannot be paid again.";
      if (
        !data["cash-shifts"].some(
          (shift) =>
            shift.Status === "Open" &&
            shift["Branch / terminal"].startsWith(order.Branch) &&
            (!order.Terminal ||
              shift["Branch / terminal"].endsWith(` · ${order.Terminal}`)),
        )
      )
        return "Open a register for this branch before taking payment.";
      if (method === "QR" && !settings.qrEnabled)
        return "QR payments are disabled in QR settings.";
      if (
        !data["payment-providers"].some(
          (row) => row.Method === method && row.Status === "Enabled",
        )
      )
        return "Select an enabled payment method.";
      if (method === "Cash" && parseMoney(cashReceived) < order._totalCents)
        return "Cash received must cover the order total.";
      if (method === "Cash" && !Number.isFinite(parseMoney(cashReceived)))
        return "Enter a valid cash amount.";
      for (const item of order._items || []) {
        const stock = data.inventory.find(
          (row) =>
            row._productId === item.productId && row.Branch === order.Branch,
        );
        const product = data.products.find((row) => row._id === item.productId);
        if (
          product?.["Stock tracking"] === "On" &&
          (!stock || Number.parseFloat(stock["On hand"]) < item.quantity)
        )
          return `Insufficient stock for ${item.name}. Receive stock at this branch first.`;
      }
      order.Payment = "Paid";
      order.Status = "Completed";
      const paymentId = "PAY-" + order.Order.replace(/\D/g, "");
      data.payments.unshift({
        _id: id("payment"),
        _createdAt: new Date().toISOString(),
        Branch: order.Branch,
        Terminal: order.Terminal || "POS-01",
        Payment: paymentId,
        Order: order.Order,
        Method: method,
        Provider:
          method === "Cash"
            ? "Cash drawer"
            : method === "QR"
              ? "DuitNow"
              : "Card terminal",
        Amount: order.Total,
        Status: "Completed",
        _refundedCents: 0,
      });
      data.receipts.unshift({
        _id: id("receipt"),
        _createdAt: new Date().toISOString(),
        Receipt: "RCP-" + order.Order.replace("#", ""),
        Order: order.Order,
        "Branch / terminal": `${order.Branch} · ${order.Terminal || "POS-01"}`,
        Cashier: order.Cashier,
        Issued: time(),
        Total: order.Total,
        Status: "Issued",
        _reprints: 0,
      });
      for (const item of order._items || []) {
        const stock = data.inventory.find(
          (row) =>
            row._productId === item.productId && row.Branch === order.Branch,
        );
        if (stock) {
          const quantity = Number.parseFloat(stock["On hand"]) - item.quantity;
          stock["On hand"] = `${quantity} portions`;
          stock.Status =
            quantity <= 0
              ? "Out of stock"
              : quantity < Number.parseFloat(stock["Reorder point"])
                ? "Low stock"
                : "In stock";
          data._movements.unshift({
            id: id("movement"),
            item: item.name,
            type: "Sale",
            quantity: -item.quantity,
            branch: order.Branch,
            reason: order.Order,
            time: time(),
          });
        }
        const product = data.products.find((row) => row._id === item.productId);
        if (product) product._sold = (product._sold || 0) + item.quantity;
      }
      const table = data.tables.find(
        (row) => row["Current order"] === order.Order,
      );
      if (table) {
        table.Status = "Cleaning";
        table["Current order"] = "—";
      }
      if (method === "Cash") {
        const shift = data["cash-shifts"].find(
          (row) =>
            row.Status === "Open" &&
            row["Branch / terminal"].startsWith(order.Branch) &&
            (!order.Terminal ||
              row["Branch / terminal"].endsWith(` · ${order.Terminal}`)),
        );
        if (shift)
          shift["Expected cash"] = money(
            parseMoney(shift["Expected cash"]) + order._totalCents,
          );
      }
      const report = data.reports.find((row) => row.Branch === order.Branch);
      if (report) {
        report["Net sales"] = money(
          parseMoney(report["Net sales"]) + order._totalCents,
        );
        report.Orders = String(Number(report.Orders) + 1);
        report["Avg. order"] = money(
          Math.round(parseMoney(report["Net sales"]) / Number(report.Orders)),
        );
      }
      data._activity.push({
        type: "payment",
        branch: order.Branch,
        cents: order._totalCents,
      });
      data._salesDelta += order._totalCents;
      audit(data, "PAYMENT_COMPLETED", paymentId);
    });
  const refundPayment = (
    rowId,
    amount,
    reason,
    returnStock = false,
    approver = "",
  ) =>
    transact((data) => {
      if (!can("Process refunds"))
        return "Your sample role cannot refund payments.";
      const payment = data.payments.find((row) => row._id === rowId);
      const cents = parseMoney(amount);
      if (
        !payment ||
        !["Completed", "Partially refunded"].includes(payment.Status)
      )
        return "Only collected payments can be refunded.";
      if (!reason.trim()) return "A refund reason is required.";
      if (
        settings.requireManagerApproval &&
        !["Alex Tan · Company owner", "Farah Lim · Branch Manager"].includes(
          approver,
        )
      )
        return "Choose a sample owner or manager to approve this refund.";
      const available =
        parseMoney(payment.Amount) - (payment._refundedCents || 0);
      if (!Number.isSafeInteger(cents) || cents <= 0 || cents > available)
        return `Enter an amount from RM 0.01 to ${money(available)}.`;
      payment._refundedCents = (payment._refundedCents || 0) + cents;
      payment._refundEvents = [
        ...(payment._refundEvents || []),
        { amount: cents, at: new Date().toISOString(), reason, approver },
      ];
      payment.Status =
        payment._refundedCents === parseMoney(payment.Amount)
          ? "Refunded"
          : "Partially refunded";
      const order = data.orders.find((row) => row.Order === payment.Order);
      if (order) order.Payment = payment.Status;
      if (returnStock) {
        if (payment.Status !== "Refunded")
          return "Return all items to stock only when the payment is fully refunded.";
        if (!order?._items?.length)
          return "This historical sample has no item-level stock data. Record a separate stock adjustment after review.";
        if (payment._stockReturned)
          return "Items from this payment have already been returned.";
        order._items.forEach((item) => {
          const stock = data.inventory.find(
            (row) =>
              row._productId === item.productId && row.Branch === order.Branch,
          );
          if (stock) {
            const quantity =
              Number.parseFloat(stock["On hand"]) + item.quantity;
            stock["On hand"] = `${quantity} portions`;
            stock.Status =
              quantity < Number.parseFloat(stock["Reorder point"])
                ? "Low stock"
                : "In stock";
            data._movements.unshift({
              id: id("movement"),
              item: item.name,
              type: "Refund return",
              quantity: item.quantity,
              branch: order.Branch,
              reason: `${payment.Payment} · ${reason}`,
              time: time(),
            });
          }
        });
        payment._stockReturned = true;
      }
      if (payment.Method === "Cash") {
        const shift = data["cash-shifts"].find(
          (row) =>
            row.Status === "Open" &&
            row["Branch / terminal"].startsWith(order?.Branch || branch),
        );
        if (!shift)
          return "Open a register at the original branch before issuing a cash refund.";
        const expected = parseMoney(shift["Expected cash"]);
        if (cents > expected)
          return "The register has insufficient cash for this refund.";
        shift["Expected cash"] = money(expected - cents);
      }
      data.receipts.unshift({
        _id: id("receipt"),
        _createdAt: new Date().toISOString(),
        Receipt: `CRN-${payment.Payment}-${payment._refundedCents}`,
        Order: payment.Order,
        "Branch / terminal": `${order?.Branch || branch} · POS-01`,
        Cashier: identity.actor,
        Issued: time(),
        Total: money(-cents),
        Status: "Refund credit",
        Reason: reason,
        _reprints: 0,
      });
      const report = data.reports.find((row) => row.Branch === order?.Branch);
      if (report) {
        report["Net sales"] = money(parseMoney(report["Net sales"]) - cents);
        report["Avg. order"] = money(
          Math.round(parseMoney(report["Net sales"]) / Number(report.Orders)),
        );
      }
      data._activity.push({
        type: "refund",
        branch: order?.Branch || branch,
        cents: -cents,
      });
      data._salesDelta -= cents;
      audit(
        data,
        "REFUND_APPROVED",
        payment.Payment,
        `${reason} · ${money(cents)}`,
        approver,
      );
    });
  const stockMovement = ({ rowId, type, quantity, targetBranch, reason }) =>
    transact((data) => {
      if (!canEdit("inventory")) return "Your sample role cannot adjust stock.";
      const row = data.inventory.find((item) => item._id === rowId);
      const amount = Number(quantity);
      if (!row || !Number.isFinite(amount) || amount <= 0 || !reason.trim())
        return "Choose an item, a positive quantity, and a reason.";
      const current = Number.parseFloat(row["On hand"]);
      const outbound = ["Transfer", "Waste"].includes(type);
      if (outbound && amount > current)
        return "This movement would create negative stock.";
      if (type === "Transfer" && (!targetBranch || targetBranch === row.Branch))
        return "Choose a different receiving branch.";
      const nextQuantity = current + (outbound ? -amount : amount);
      row["On hand"] = `${nextQuantity} portions`;
      row.Status =
        nextQuantity <= 0
          ? "Out of stock"
          : nextQuantity < Number.parseFloat(row["Reorder point"])
            ? "Low stock"
            : "In stock";
      if (type === "Transfer") {
        let receiving = data.inventory.find(
          (item) => item.SKU === row.SKU && item.Branch === targetBranch,
        );
        if (!receiving) {
          receiving = {
            ...row,
            _id: id("stock"),
            Branch: targetBranch,
            "On hand": "0 portions",
          };
          data.inventory.push(receiving);
        }
        const received = Number.parseFloat(receiving["On hand"]) + amount;
        receiving["On hand"] = `${received} portions`;
        receiving.Status =
          received < Number.parseFloat(receiving["Reorder point"])
            ? "Low stock"
            : "In stock";
      }
      data._movements.unshift({
        id: id("movement"),
        item: row.Item,
        type,
        quantity: outbound ? -amount : amount,
        branch: row.Branch,
        targetBranch,
        reason,
        time: time(),
      });
      audit(data, "STOCK_MOVEMENT", row.Item, reason);
    });
  const closeShift = (rowId, actual, reason) =>
    transact((data) => {
      if (!can("Take payment"))
        return "Your sample role cannot close registers.";
      const row = data["cash-shifts"].find((item) => item._id === rowId);
      const cents = parseMoney(actual);
      if (!row || row.Status !== "Open" || !Number.isSafeInteger(cents))
        return "Select an open shift and enter valid counted cash.";
      const difference = cents - parseMoney(row["Expected cash"]);
      if (difference && !reason.trim())
        return "Explain the cash variance before closing.";
      row.Status = "Closed";
      row["Counted cash"] = money(cents);
      row.Variance = money(difference);
      row["Closed at"] = time();
      audit(data, "SHIFT_CLOSED", row.Shift, reason);
    });
  const openShift = (terminal, opening) =>
    transact((data) => {
      if (!can("Take payment"))
        return "Your sample role cannot open registers.";
      const cents = parseMoney(opening);
      if (
        branch === "All branches" ||
        !terminal ||
        !Number.isSafeInteger(cents)
      )
        return "Choose a branch, terminal, and valid opening cash.";
      if (
        !availableTerminals.some(
          (device) =>
            device.code === terminal &&
            device.branch === branch &&
            device.type === "POS terminal" &&
            device.status === "Active",
        )
      )
        return "Choose an active POS terminal assigned to this branch.";
      const location = `${branch} · ${terminal}`;
      if (
        data["cash-shifts"].some(
          (row) =>
            row["Branch / terminal"] === location && row.Status === "Open",
        )
      )
        return "This terminal already has an open register.";
      const number =
        Math.max(
          2,
          ...data["cash-shifts"].map(
            (row) => Number(row.Shift.replace(/\D/g, "")) || 0,
          ),
        ) + 1;
      const row = {
        _id: id("shift"),
        _createdAt: new Date().toISOString(),
        Shift: `SH-${String(number).padStart(3, "0")}`,
        "Branch / terminal": location,
        "Opened by": identity.actor,
        "Opened at": time(),
        "Opening cash": money(cents),
        "Expected cash": money(cents),
        Status: "Open",
      };
      data["cash-shifts"].unshift(row);
      audit(data, "SHIFT_OPENED", row.Shift);
    });
  const recordReprint = (rowId) =>
    transact((data) => {
      const receipt = data.receipts.find((row) => row._id === rowId);
      if (!receipt) return "Receipt not found.";
      receipt._reprints = (receipt._reprints || 0) + 1;
      receipt.Status = "Reprinted";
      audit(data, "RECEIPT_REPRINTED", receipt.Receipt);
    });
  const renameBranch = (previous, nextName) => {
    const next = structuredClone(ref.current);
    Object.entries(next)
      .filter(
        ([key, rows]) =>
          key !== "audit" && key !== "receipts" && Array.isArray(rows),
      )
      .forEach(([, rows]) =>
        rows.forEach((row) => {
          if (row.Branch === previous) row.Branch = nextName;
          if (row.branch === previous) row.branch = nextName;
          if (row["Branch / terminal"]?.startsWith(`${previous} ·`))
            row["Branch / terminal"] = row["Branch / terminal"].replace(
              previous,
              nextName,
            );
          if (row.Branches === previous) row.Branches = nextName;
        }),
      );
    commit(next);
    if (branch === previous) setBranch(nextName);
  };
  const saveSettings = (values) => {
    if (!can("Edit company settings"))
      return { error: "Your sample role cannot change restaurant settings." };
    setSettings((current) => ({ ...current, ...values }));
    setDirty(false);
    recordActivity("SETTINGS_UPDATED", "Restaurant settings");
    return { success: true };
  };
  return (
    <WorkspaceContext.Provider
      value={{
        modules,
        identity,
        setIdentity,
        branch,
        setBranch,
        availableBranches,
        setAvailableBranches,
        availableTerminals,
        setAvailableTerminals,
        renameBranch,
        area,
        setArea,
        role,
        setRole,
        can,
        canEdit,
        canView,
        setPermissionProfiles,
        readOnly: role === "Read only",
        screenState,
        setScreenState,
        composerOpen,
        setComposerOpen,
        dirty,
        setDirty,
        lastUpdated,
        refresh: () => setLastUpdated(new Date()),
        settings,
        saveSettings,
        saveRecord,
        deleteProduct,
        changeStatus,
        createOrder,
        settleOrder,
        refundPayment,
        stockMovement,
        closeShift,
        openShift,
        recordReprint,
        recordActivity,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}
