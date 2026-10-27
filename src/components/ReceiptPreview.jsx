import React from 'react';

const sampleItems = [
  { name: 'Nasi Lemak Royale', quantity: 1, total: 18.5 },
  { name: 'Teh Tarik Special', quantity: 1, total: 4.5 },
  { name: 'Ayam Goreng Berempah', quantity: 2, total: 16 },
  { name: 'Sambal Sotong Extra', quantity: 1, total: 61 },
];

const money = (value, currency = 'MYR') => new Intl.NumberFormat('en-MY', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value).replace('MYR', 'RM');

export default function ReceiptPreview({ company, tax, settings }) {
  const address = [company?.address_line_1, company?.address_line_2, company?.city, company?.state, company?.postcode, company?.country].filter(Boolean).join(', ');
  const subtotal = sampleItems.reduce((sum, item) => sum + item.total, 0);
  const taxAmount = tax?.enabled === false ? 0 : subtotal * (Number(tax?.rate || 0) / 100);
  const config = settings || {};
  return <div className="mx-auto w-full max-w-sm rounded-xl border border-slate-300 bg-white p-5 font-mono text-xs text-slate-900 shadow-sm">
    <p className="mb-3 rounded border border-slate-300 bg-slate-50 p-2 text-center text-xs font-bold">Sample preview · Not a transaction receipt</p>
    <div className="border-b border-dashed border-slate-400 pb-3 text-center">
      {config.showCompanyName !== false && <strong className="block text-sm uppercase">{company?.name || 'Company name'}</strong>}
      {config.showRegistrationNumber !== false && company?.registration_no && <span className="block">Reg: {company.registration_no}</span>}
      {config.showAddress !== false && address && <span className="block">{address}</span>}
      {config.showPhoneNumber !== false && (company?.phone || company?.contact_phone) && <span className="block">Tel: {company.phone || company.contact_phone}</span>}
      {config.showTaxDetails !== false && company?.tax_registration_no && <span className="block">Tax: {company.tax_registration_no}</span>}
    </div>
    {config.headerGreeting && <p className="whitespace-pre-wrap py-3 text-center">{config.headerGreeting}</p>}
    <div className="flex justify-between py-3"><span>Table: T04</span><span>Bill #1042</span></div>
    <div className="space-y-1 border-y border-dashed border-slate-400 py-3">{sampleItems.map((item) => <div className="flex justify-between gap-3" key={item.name}><span>{item.quantity}x {item.name}</span><span>{money(item.total, company?.currency_code || 'MYR')}</span></div>)}</div>
    <div className="space-y-1 py-3 text-right"><div className="flex justify-between"><span>Subtotal</span><span>{money(subtotal, company?.currency_code || 'MYR')}</span></div>{config.showTaxDetails !== false && taxAmount > 0 && <div className="flex justify-between"><span>{tax?.name || 'Tax'} ({tax?.rate || 0}%)</span><span>{money(taxAmount, company?.currency_code || 'MYR')}</span></div>}<div className="flex justify-between border-t border-slate-400 pt-1 text-sm font-black"><span>TOTAL</span><span>{money(subtotal + taxAmount, company?.currency_code || 'MYR')}</span></div></div>
    {config.footerNote && <p className="whitespace-pre-wrap border-t border-dashed border-slate-400 pt-3 text-center">{config.footerNote}</p>}
    <p className="pt-3 text-center text-slate-500">Payment Method: DuitNow QR</p><div className="mx-auto mt-3 h-12 w-12 border-4 border-slate-800 p-1 text-center text-[8px] leading-9">QR</div>
  </div>;
}
