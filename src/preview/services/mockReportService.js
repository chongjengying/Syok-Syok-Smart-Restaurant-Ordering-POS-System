import { totalCents, money } from "./previewMoney.js";

export const businessDate = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
export const mockReportTypes = [
  ["daily-sales", "Daily Sales Report"],
  ["order-transactions", "Order Transaction Report"],
  ["product-sales", "Product Sales Report"],
  ["payments", "Payment Transaction Report"],
];

export function generateMockReport(data, type, from, to) {
  if (!from || !to || from > to) throw new Error("Choose a valid date range.");
  const orders = data.orders.filter(
    (order) =>
      order.status !== "CANCELLED" &&
      businessDate(order.createdAt) >= from &&
      businessDate(order.createdAt) <= to,
  );
  let columns, rows;
  if (type === "order-transactions") {
    columns = ["Order", "Dining", "Status", "Payment status", "Total"];
    rows = orders.map((order) => [
      order.orderNumber,
      order.diningMode,
      order.status,
      order.paymentStatus,
      money(totalCents(order.items) / 100),
    ]);
  } else if (type === "product-sales") {
    columns = ["Product", "Category", "Quantity sold", "Gross sales"];
    rows = data.products
      .map((product) => {
        const items = orders
          .filter((order) => order.paymentStatus === "PAID")
          .flatMap((order) => order.items)
          .filter((item) => item.productId === product.id);
        return [
          product.name,
          data.categories.find((category) => category.id === product.categoryId)
            ?.name,
          items.reduce((sum, item) => sum + item.quantity, 0),
          money(totalCents(items) / 100),
        ];
      })
      .filter((row) => row[2] > 0);
  } else {
    const payments = data.orders
      .flatMap((order) => order.payments.map((payment) => ({ order, payment })))
      .filter(
        ({ payment }) =>
          businessDate(payment.paidAt) >= from &&
          businessDate(payment.paidAt) <= to,
      );
    columns =
      type === "payments"
        ? ["Payment", "Order", "Method", "Provider", "Reference", "Amount"]
        : ["Business date", "Payment", "Order", "Method", "Collected"];
    rows = payments.map(({ order, payment }) =>
      type === "payments"
        ? [
            payment.paymentNumber,
            order.orderNumber,
            payment.paymentMethod,
            payment.providerId ? "Demo QR provider" : "—",
            payment.paymentReference || "—",
            money(payment.amount),
          ]
        : [
            businessDate(payment.paidAt),
            payment.paymentNumber,
            order.orderNumber,
            payment.paymentMethod,
            money(payment.amount),
          ],
    );
  }
  return {
    title: mockReportTypes.find(([id]) => id === type)?.[1],
    columns,
    rows,
    from,
    to,
  };
}

export async function exportMockReport(report, type) {
  const filename = `mock-${report.title.toLowerCase().replaceAll(" ", "-")}-${report.from}`;
  if (type === "pdf") {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const document = new jsPDF({ orientation: "landscape" });
    document.setFontSize(16);
    document.text(`MOCK DATA · ${report.title}`, 14, 18);
    document.setFontSize(10);
    document.text(
      `${report.from} to ${report.to} · Syok Syok design preview`,
      14,
      26,
    );
    autoTable(document, {
      startY: 34,
      head: [report.columns],
      body: report.rows,
      headStyles: { fillColor: [249, 115, 22] },
    });
    document.save(`${filename}.pdf`);
  } else {
    const Excel = (await import("exceljs")).default;
    const workbook = new Excel.Workbook();
    const sheet = workbook.addWorksheet("Mock report");
    sheet.addRow([`MOCK DATA · ${report.title}`]);
    sheet.addRow([`${report.from} to ${report.to}`]);
    sheet.addRow([]);
    sheet.addRow(report.columns);
    sheet.addRows(report.rows);
    sheet.columns.forEach((column) => {
      column.width = 24;
    });
    const blob = new Blob([await workbook.xlsx.writeBuffer()], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.xlsx`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
