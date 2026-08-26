const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
const unique = (rows, key) => new Set(rows.map(row => row[key]).filter(Boolean)).size;

export function buildReportSummary(reportId, rows, databaseSummary = {}) {
  if (Array.isArray(databaseSummary.cards)) return databaseSummary.cards;
  if (reportId === 'daily-sales') {
    if (Object.keys(databaseSummary).length) return [
      ['Gross Sales','grossSales','currency'],['Discount','discountAmount','currency'],['Net Sales','netSales','currency'],['Tax','taxAmount','currency'],['Service Charge','serviceCharge','currency'],['Refund','refundAmount','currency'],['Final Sales','finalSales','currency'],['Total Collected','totalCollected','currency'],['Orders','orderCount','number'],['Average Order','averageOrderValue','currency'],['Cancelled Orders','cancelledOrderCount','number'],['Refunds','refundCount','number'],['Cash','cashTotal','currency'],['QR','qrTotal','currency'],['Card','cardTotal','currency'],['Other','otherTotal','currency'],
    ].map(([label,key,type]) => ({ label, value: databaseSummary[key] || 0, type }));
    const orders = new Map(); rows.forEach(row => orders.set(row.order_id, row));
    const orderRows = [...orders.values()];
    return [
      { label: 'Gross Sales', value: sum(orderRows, 'subtotal'), type: 'currency' },
      { label: 'Discount', value: sum(orderRows, 'discount'), type: 'currency' },
      { label: 'Tax', value: sum(orderRows, 'tax'), type: 'currency' },
      { label: 'Service Charge', value: sum(orderRows, 'service_charge'), type: 'currency' },
      { label: 'Final Sales', value: sum(orderRows, 'order_total'), type: 'currency' },
      { label: 'Total Collected', value: sum(rows, 'amount_paid'), type: 'currency' },
      { label: 'Order Count', value: orders.size, type: 'number' },
      { label: 'Average Order Value', value: orders.size ? sum(orderRows, 'order_total') / orders.size : 0, type: 'currency' },
    ];
  }
  if (reportId === 'payments') return [
    { label: 'Total Payment', value: sum(rows.filter(row => row.payment_status === 'PAID'), 'payment_amount'), type: 'currency' },
    ...['CASH','QR','CARD'].map(method => ({ label: `${method} Total`, value: sum(rows.filter(row => row.payment_method === method && row.payment_status === 'PAID'), 'payment_amount'), type: 'currency' })),
    { label: 'Refund Total', value: sum(rows, 'refunded_amount'), type: 'currency' },
    { label: 'Failed Payments', value: rows.filter(row => row.payment_status === 'FAILED').length, type: 'number' },
  ];
  if (reportId === 'product-sales' || reportId === 'category-sales') return [
    { label: reportId === 'product-sales' ? 'Products Sold' : 'Categories', value: rows.length, type: 'number' },
    { label: 'Quantity Sold', value: sum(rows, 'quantity_sold'), type: 'number' },
    { label: 'Gross Sales', value: sum(rows, 'gross_sales'), type: 'currency' },
    { label: 'Net Sales', value: sum(rows, 'net_sales') || sum(rows, 'gross_sales'), type: 'currency' },
  ];
  if (reportId === 'refunds') return [{ label: 'Refund Count', value: rows.length, type: 'number' }, { label: 'Total Refund', value: sum(rows, 'refund_amount'), type: 'currency' }];
  if (reportId === 'hourly-sales') return [{ label: 'Orders', value: sum(rows, 'order_count'), type: 'number' }, { label: 'Quantity', value: sum(rows, 'quantity_sold'), type: 'number' }, { label: 'Net Sales', value: sum(rows, 'net_sales'), type: 'currency' }];
  if (reportId === 'kitchen-performance') {
    const completed = rows.filter(row => row.preparation_minutes != null);
    return [{ label: 'Kitchen Orders', value: rows.length, type: 'number' }, { label: 'Average Preparation', value: completed.length ? sum(completed, 'preparation_minutes') / completed.length : 0, type: 'number' }, { label: 'Delayed', value: rows.filter(row => row.delay_flag).length, type: 'number' }];
  }
  return [{ label: 'Records', value: rows.length, type: 'number' }, { label: 'Orders', value: unique(rows, 'order_number'), type: 'number' }];
}
