import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ExternalLink, MoreVertical, Plus, ReceiptText, Save, Search, ShieldCheck, X } from "lucide-react";
import { useOrganization } from "../../hooks/useOrganization";
import {
  listBranches,
  listTerminals,
} from "../../services/organization.service";
import { uploadSystemLogo } from "../../services/systemSettings.service";
import BranchManagement from "./BranchManagement";
import ReceiptPreview from "../ReceiptPreview";
import { useSystemSettings } from "../../hooks/useSystemSettings";

const emptyBranch = {
  code: "",
  name: "",
  registration_no: "",
  phone: "",
  email: "",
  address: "",
  currency_code: "MYR",
  timezone: "Asia/Kuala_Lumpur",
  status: "ACTIVE",
  operating_model: "FULL_SERVICE",
  manager_name: "",
  operating_hours: "10:00 AM – 10:00 PM (Daily)",
  tax_type: "SST",
  tax_rate: 6,
  rounding_rule: "5_SEN",
  cash_drawer_float: 300,
  address_line_2: "",
  city: "",
  state: "",
  postcode: "",
  country: "Malaysia",
};
const branchFields = [
  ["code", "Branch code / Outlet ID"],
  ["name", "Branch name"],
  ["phone", "Phone number"],
  ["email", "Store email address"],
  ["manager_name", "Store manager / Person-in-charge"],
  ["address", "Street address line 1"],
  ["address_line_2", "Street address line 2"],
  ["city", "City"],
  ["state", "State / Federal Territory"],
  ["postcode", "Postal code"],
  ["country", "Country"],
  ["timezone", "Time zone"],
  ["operating_model", "Branch type / Operating model"],
  ["operating_hours", "Operating hours"],
  ["tax_type", "Tax type / SST rate"],
  ["tax_rate", "Tax rate (%)"],
  ["registration_no", "Tax registration no. (SST ID)"],
  ["cash_drawer_float", "Default cash drawer float"],
];

function branchFormFromRow(row) {
  return {
    ...emptyBranch,
    ...row,
    ...(row?.configuration || {}),
    code: row?.code || "",
    name: row?.name || "",
    phone: row?.phone || "",
    email: row?.email || "",
    address: row?.address || "",
    currency_code: row?.currency_code || "MYR",
    timezone: row?.timezone || "Asia/Kuala_Lumpur",
    status: row?.status || "ACTIVE",
  };
}
const tabs = [
  "General",
  "Regional & Tax",
  "Contact & Address",
  "Receipt Settings",
  "E-Invoice",
  "Branches",
];
const inputClass =
  "mt-1 block w-full rounded-xl border border-slate-300 bg-white p-3 text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100 disabled:bg-slate-100";

function SuccessToast({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="fixed right-5 top-5 z-[100] flex w-[min(380px,calc(100vw-2.5rem))] items-start gap-3 rounded-2xl border border-emerald-200 bg-white p-4 text-emerald-900 shadow-[0_16px_45px_rgba(15,23,42,0.18)]" role="status" aria-live="polite">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check size={16} strokeWidth={3} /></span>
      <p className="flex-1 pt-1 text-sm font-bold">{message}</p>
      <button type="button" onClick={onDismiss} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Dismiss notification"><X size={16} /></button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  disabled = false,
  placeholder = "",
}) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <input
        required={required}
        type={type}
        value={value ?? ""}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options, required = false, disabled = false }) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <select
        required={required}
        disabled={disabled}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

const branchSelectOptions = {
  country: [
    ["Malaysia", "Malaysia"],
    ["Singapore", "Singapore"],
    ["Thailand", "Thailand"],
    ["Indonesia", "Indonesia"],
    ["Brunei", "Brunei"],
  ],
  timezone: [
    ["Asia/Kuala_Lumpur", "Asia/Kuala Lumpur (GMT+08:00)"],
    ["Asia/Singapore", "Asia/Singapore (GMT+08:00)"],
    ["Asia/Bangkok", "Asia/Bangkok (GMT+07:00)"],
    ["Asia/Jakarta", "Asia/Jakarta (GMT+07:00)"],
    ["Asia/Brunei", "Asia/Brunei (GMT+08:00)"],
    ["UTC", "UTC (GMT+00:00)"],
  ],
  operating_model: [
    ["FULL_SERVICE", "Full-service store"],
    ["QUICK_SERVICE", "Quick-service store"],
    ["FLAGSHIP", "Flagship store"],
    ["KIOSK", "Kiosk"],
  ],
  tax_type: [
    ["SST", "Sales Tax / SST"],
    ["GST", "GST"],
    ["NONE", "No tax"],
  ],
};

const companyCurrencyOptions = [
  ["MYR", "MYR · Malaysian Ringgit"],
  ["SGD", "SGD · Singapore Dollar"],
  ["USD", "USD · US Dollar"],
  ["THB", "THB · Thai Baht"],
  ["IDR", "IDR · Indonesian Rupiah"],
  ["BND", "BND · Brunei Dollar"],
  ["PHP", "PHP · Philippine Peso"],
  ["VND", "VND · Vietnamese Dong"],
  ["CNY", "CNY · Chinese Yuan"],
  ["JPY", "JPY · Japanese Yen"],
  ["KRW", "KRW · South Korean Won"],
  ["HKD", "HKD · Hong Kong Dollar"],
  ["AUD", "AUD · Australian Dollar"],
  ["GBP", "GBP · British Pound"],
  ["EUR", "EUR · Euro"],
];

const companyBusinessTypeOptions = [
  ["FOOD_BEVERAGE", "Food & Beverage"],
  ["RETAIL", "Retail"],
  ["SERVICES", "Services"],
];

const companyCountryOptions = [
  ["Malaysia", "Malaysia"],
  ["Singapore", "Singapore"],
  ["Thailand", "Thailand"],
];
const countryCurrency = { Malaysia: "MYR", Singapore: "SGD", Thailand: "THB" };
const countryTimezone = { Malaysia: "Asia/Kuala_Lumpur", Singapore: "Asia/Singapore", Thailand: "Asia/Bangkok" };
const countryTaxDefaults = { Malaysia: "SST_SERVICE_TAX", Singapore: "GST", Thailand: "VAT" };
const countryTaxOptions = {
  Malaysia: [["SST_SALES_TAX", "SST - Sales Tax"], ["SST_SERVICE_TAX", "SST - Service Tax"], ["TAX_EXEMPT", "Tax Exempt"]],
  Singapore: [["GST", "GST"], ["ZERO_RATED_GST", "Zero-rated GST"], ["GST_EXEMPT", "GST Exempt"]],
  Thailand: [["VAT", "VAT"], ["ZERO_RATED_VAT", "Zero-rated VAT"], ["VAT_EXEMPT", "VAT Exempt"]],
};

const malaysiaStateOptions = [
  ["Johor", "Johor"],
  ["Kedah", "Kedah"],
  ["Kelantan", "Kelantan"],
  ["Melaka", "Melaka"],
  ["Negeri Sembilan", "Negeri Sembilan"],
  ["Pahang", "Pahang"],
  ["Penang", "Penang"],
  ["Perak", "Perak"],
  ["Perlis", "Perlis"],
  ["Sabah", "Sabah"],
  ["Sarawak", "Sarawak"],
  ["Selangor", "Selangor"],
  ["Terengganu", "Terengganu"],
  ["Kuala Lumpur", "Kuala Lumpur"],
  ["Labuan", "Labuan"],
  ["Putrajaya", "Putrajaya"],
];
const singaporeStateOptions = [["Central Region", "Central Region"], ["East Region", "East Region"], ["North Region", "North Region"], ["Northeast Region", "Northeast Region"], ["West Region", "West Region"]];
const thailandStateOptions = ["Bangkok", "Amnat Charoen", "Ayutthaya", "Buriram", "Chachoengsao", "Chiang Mai", "Chon Buri", "Khon Kaen", "Nakhon Ratchasima", "Phuket", "Rayong", "Songkhla", "Surat Thani", "Udon Thani"].map((value) => [value, value]);
const countryStateOptions = { Malaysia: malaysiaStateOptions, Singapore: singaporeStateOptions, Thailand: thailandStateOptions };

function CompanySetup({ company, permissions }) {
  const state = useOrganization("company");
  const printerState = useSystemSettings();
  const [form, setForm] = useState(company);
  const [tab, setTab] = useState("General");
  const [branches, setBranches] = useState([]);
  const [terminalCounts, setTerminalCounts] = useState({});
  const [branchLoadError, setBranchLoadError] = useState("");
  const [branchQuery, setBranchQuery] = useState("");
  const [logoBusy, setLogoBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const logoInputRef = useRef(null);
  const hasEditPermission = permissions.includes("company.update");
  const canEdit = hasEditPermission && editing;
  const receiptSettings = form?.receipt_configuration || {};
  const targetPrinter = printerState.data?.printers?.find((printer) => printer.type === "RECEIPT" && printer.enabled) || null;
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(company), [form, company]);
  const visibleBranches = useMemo(() => {
    const query = branchQuery.trim().toLowerCase();
    return branches.filter((branch) => !query || [branch.code, branch.name, branch.address].some((value) => String(value || "").toLowerCase().includes(query)));
  }, [branches, branchQuery]);
  useEffect(() => {
    setForm({
      ...company,
      country: company.country === "Singapore" || company.country === "Thailand" ? company.country : "Malaysia",
    });
    setEditing(false);
  }, [company]);
  useEffect(() => {
    let active = true;
    setBranchLoadError("");
    void (async () => {
      const result = await listBranches();
      if (!active) return;
      if (result.error) {
        setBranchLoadError(result.error.message || "Unable to load branches.");
        return;
      }
      const rows = result.data || [];
      setBranches(rows);
      const counts = {};
      await Promise.all(
        rows.map(async (branch) => {
          const terminals = await listTerminals(branch.id);
          if (!terminals.error) counts[branch.id] = terminals.data?.length || 0;
        }),
      );
      if (active) setTerminalCounts(counts);
    })();
    return () => {
      active = false;
    };
  }, [company?.id]);
  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const updateReceipt = (key, value) =>
    setForm((current) => ({
      ...current,
      receipt_configuration: {
        ...(current.receipt_configuration || {}),
        [key]: value,
      },
    }));
  const uploadLogo = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLogoBusy(true);
    const result = await uploadSystemLogo(file);
    setLogoBusy(false);
    if (result.error) {
      window.alert(result.error.message);
      return;
    }
    update("logo_url", result.data.url);
    update("logo_storage_path", result.data.path);
  };
  const save = async (event) => {
    event.preventDefault();
    const saved = await state.save({
      ...form,
      contact_phone: form.phone || "",
      contact_email: form.email || "",
      country: form.country || "Malaysia",
      currency_code: form.currency_code || countryCurrency[form.country] || "MYR",
      timezone: countryTimezone[form.country] || "Asia/Kuala_Lumpur",
    });
    if (saved) setEditing(false);
  };
  if (!form) return null;
  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-5 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[.2em] text-amber-700">
            Organization / Company
          </p>
          <h1 className="mt-1 text-4xl font-black text-slate-950">
            Company Setup
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage company information and default settings used across branches, POS terminals, receipts and reports.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-2 shadow-sm">
          <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2"><span className="font-mono text-xs font-black tracking-wide text-slate-800">{form.code}</span><span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-800"><ShieldCheck size={12} /> {form.status === "ACTIVE" ? "Active" : "Inactive"}</span></div>
          {hasEditPermission && !editing && <button type="button" onClick={() => setEditing(true)} className="rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-black text-white">Edit Company</button>}
          <button type="button" onClick={() => setTab("Receipt Settings")} className="flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold text-slate-700"><ReceiptText size={15} /> Preview Receipt</button>
          {editing && <button type="button" onClick={() => { setForm({ ...company, country: company.country || "Malaysia" }); setEditing(false); }} className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">Cancel</button>}
        </div>
      </header>
      <nav
        aria-label="Company setup sections"
        className="sticky top-0 z-20 flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl border bg-white p-1.5 shadow-sm"
      >
        {tabs.map((item) => (
          <button
            type="button"
            key={item}
            onClick={() => setTab(item)}
            className={`whitespace-nowrap rounded-lg px-4 py-2.5 text-xs font-bold ${tab === item ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}
          >
            {item === "E-Invoice" ? <>{item} <span className="ml-1 text-[10px] opacity-70">• Not configured</span></> : item === "Branches" ? <>{item} <span className="ml-1 rounded-full bg-white/15 px-1.5 py-0.5 text-[10px]">{branches.length}</span></> : item}
          </button>
        ))}
      </nav>
      {tab === "Branches" ? (
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b p-6"><div><h2 className="text-lg font-black">Company Branches</h2><p className="mt-1 max-w-2xl text-xs text-slate-500">Branches are scoped to {form.name}. Terminals sync fiscal numbering and configurations automatically.</p></div><div className="flex gap-2"><button type="button" onClick={() => { window.location.hash = "#admin/branches"; }} className="flex items-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-bold">Open Branch Management <ExternalLink size={13} /></button>{permissions.includes("branch.create") && <button type="button" onClick={() => { window.location.hash = "#admin/branches"; }} className="flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-xs font-bold text-white"><Plus size={14} /> New Branch</button>}</div></div>
          {branchLoadError && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              Unable to load branch list. {branchLoadError}
              <button
                type="button"
                onClick={() => setTab("Branches")}
                className="ml-3 underline"
              >
                Retry
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50/70 px-5 py-3"><label className="relative min-w-64 flex-1 max-w-md"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={branchQuery} onChange={(event) => setBranchQuery(event.target.value)} placeholder="Search branch code, name or address..." className="w-full rounded-lg border bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" /></label><span className="text-xs text-slate-500">Showing <strong>{visibleBranches.length} active branches</strong></span></div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="p-4">Branch code</th>
                  <th className="p-4">Branch name</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Active terminals</th>
                  <th className="p-4">Regional / Tax</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleBranches.map((branch) => (
                  <tr key={branch.id} className="border-t">
                    <td className="p-4"><span className="rounded bg-slate-100 px-2 py-1 font-mono text-xs font-black">{branch.code}</span></td>
                    <td className="p-4"><strong className="block">{branch.name}</strong><span className="mt-0.5 block text-xs text-slate-500">{branch.address || "Address not configured"}</span></td>
                    <td className="p-4">
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${branch.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>● {branch.status}</span>
                    </td>
                    <td className="p-4"><span className="rounded bg-slate-100 px-2 py-1 text-xs font-bold">{terminalCounts[branch.id] ?? 0} POS Online</span></td>
                    <td className="p-4"><span className="block text-xs font-semibold">{branch.configuration?.tax_type || form.tax_type || "Company default"} {branch.configuration?.tax_rate ?? form.default_tax_rate ?? 0}%</span><span className="text-[10px] text-slate-400">Inherited company rule</span></td>
                    <td className="p-4"><div className="flex items-center justify-end gap-2"><button type="button" onClick={() => { window.location.hash = `#admin/branches?branchId=${encodeURIComponent(branch.id)}`; }} className="rounded-lg border px-3 py-2 text-xs font-bold">Manage Terminals</button><MoreVertical size={16} className="text-slate-400" /></div></td>
                  </tr>
                ))}
                {!visibleBranches.length && (
                  <tr>
                    <td colSpan="6" className="p-10 text-center text-slate-500">
                      No branches match this search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t bg-slate-50 px-4 py-3 text-[10px] text-slate-500"><span>Tax rates and fiscal receipt numbering are inherited by each terminal automatically.</span><span>{visibleBranches.length} of {branches.length} branches displayed</span></div>
        </div>
      ) : (
        <form
          onSubmit={save}
          className="space-y-6 rounded-2xl border bg-white p-6 shadow-sm"
        >
          {tab === "General" && (
            !editing ? (
              <div className="space-y-5">
                <div><h2 className="text-xl font-black">General information</h2><p className="text-sm text-slate-500">Company identity and contact details used across the POS.</p></div>
                <div className="flex flex-wrap items-center gap-5 rounded-xl border bg-slate-50 p-4"><div className="flex h-20 w-28 items-center justify-center rounded-lg border bg-white text-xs font-bold text-slate-400">{form.logo_url ? <img src={form.logo_url} alt={`${form.name} logo`} className="h-full w-full rounded-lg object-contain p-2" /> : "No logo"}</div><div><p className="text-sm font-black">Company Logo</p><p className="mt-1 text-xs text-slate-500">PNG, JPG or SVG. Maximum 2 MB.</p>{hasEditPermission && <button type="button" onClick={() => setEditing(true)} className="mt-3 rounded-lg border bg-white px-3 py-2 text-xs font-bold">Edit company details</button>}</div></div>
                <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">{[["Company Code", form.code, "Internal identifier for this company."], ["Company Name", form.name], ["Registration Number", form.registration_no], ["Website", form.website], ["Business Type", form.business_type], ["Currency", form.currency_code]].map(([label, value, help]) => <div key={label}><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 font-semibold text-slate-900">{value || "Not configured"}</dd>{help && <p className="mt-1 text-xs text-slate-500">{help}</p>}</div>)}</dl>
              </div>
            ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-black">General information</h2>
                <p className="text-sm text-slate-500">
                  Stable identity used across branches, receipts and reports.
                </p>
              </div>
              <label className="block text-sm font-semibold">
                Company logo
                <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={uploadLogo} disabled={!canEdit || logoBusy} className="sr-only" />
                <div className="mt-2 flex items-center gap-2"><button type="button" onClick={() => logoInputRef.current?.click()} disabled={!canEdit || logoBusy} className="rounded-lg border bg-white px-3 py-2 text-sm font-bold disabled:opacity-50">{logoBusy ? "Uploading…" : "Upload Logo"}</button>{form.logo_url && <button type="button" onClick={() => { update("logo_url", ""); update("logo_storage_path", ""); }} disabled={!canEdit || logoBusy} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-700 disabled:opacity-50">Remove</button>}</div>
                {logoBusy && <span className="mt-1 block text-xs text-slate-500">Uploading logo…</span>}
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Company code"
                  value={form.code}
                  onChange={(value) => update("code", value.toUpperCase())}
                  required
                  disabled={!canEdit || Boolean(company?.id)}
                />
                {company?.id && <p className="-mt-3 text-xs text-slate-500">Internal identifier for this company.</p>}
                <Field
                  label="Company name"
                  value={form.name}
                  onChange={(value) => update("name", value)}
                  required
                  disabled={!canEdit}
                />
                <Field
                  label="Registration number"
                  value={form.registration_no}
                  onChange={(value) => update("registration_no", value)}
                  disabled={!canEdit}
                />
                <Field
                  label="Website"
                  value={form.website}
                  onChange={(value) => update("website", value)}
                  type="url"
                  placeholder="https://example.com"
                  disabled={!canEdit}
                />
                <SelectField
                  label="Business type"
                  value={form.business_type || "FOOD_BEVERAGE"}
                  onChange={(value) => update("business_type", value)}
                  options={companyBusinessTypeOptions}
                  required
                  disabled={!canEdit}
                />
                <label className="text-sm font-semibold">
                  Status
                  <select
                    className={inputClass}
                    value={form.status}
                    onChange={(event) => update("status", event.target.value)}
                    disabled={!canEdit}
                  >
                    <option>ACTIVE</option>
                    <option>INACTIVE</option>
                  </select>
                </label>
                <SelectField
                  label="Currency"
                  value={form.currency_code || countryCurrency[form.country] || "MYR"}
                  onChange={(value) => update("currency_code", value)}
                  options={companyCurrencyOptions.filter(([code]) => ["MYR", "SGD", "THB"].includes(code))}
                  required
                  disabled={!canEdit}
                />
                <Field
                  label="Company timezone"
                  value={`${countryTimezone[form.country] || "Asia/Kuala_Lumpur"} (${form.country || "Malaysia"})`}
                  onChange={() => undefined}
                  required
                  disabled
                />
              </div>
              {form.logo_url && (
                <div className="rounded-2xl border border-dashed bg-slate-50 p-4">
                  <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
                    Logo preview
                  </p>
                  <img
                    src={form.logo_url}
                    alt={`${form.name} logo`}
                    className="h-24 max-w-xs rounded-xl border bg-white object-contain p-2"
                  />
                </div>
              )}
            </div>
            )
          )}
          {tab === "Regional & Tax" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-black">Tax & finance</h2>
                <p className="text-sm text-slate-500">
                  Tax values are validated again by PostgreSQL before saving.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex items-center gap-3 rounded-xl border p-3 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={form.tax_enabled !== false}
                    onChange={(event) =>
                      update("tax_enabled", event.target.checked)
                    }
                    disabled={!canEdit}
                  />{" "}
                  Tax enabled
                </label>
                <label className="text-sm font-semibold">
                  Tax type
                  <select
                    className={inputClass}
                    value={form.tax_type || countryTaxDefaults[form.country] || "SST_SERVICE_TAX"}
                    onChange={(event) => update("tax_type", event.target.value)}
                    disabled={!canEdit || form.tax_enabled === false}
                  >
                    {(countryTaxOptions[form.country] || countryTaxOptions.Malaysia).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <Field
                  label="Tax registration number"
                  value={form.tax_registration_no}
                  onChange={(value) => update("tax_registration_no", value)}
                  disabled={!canEdit || form.tax_enabled === false}
                />
                <Field
                  label="SST registration number"
                  value={form.sst_registration_no}
                  onChange={(value) => update("sst_registration_no", value)}
                  disabled={!canEdit || form.tax_enabled === false}
                />
                <Field
                  label="Default tax rate (%)"
                  type="number"
                  value={form.default_tax_rate ?? 0}
                  onChange={(value) => update("default_tax_rate", value)}
                  disabled={!canEdit || form.tax_enabled === false}
                />
              </div>
            </div>
          )}
          {tab === "Contact & Address" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-black">Contact & address</h2>
                <p className="text-sm text-slate-500">
                  Used for receipts and company communication.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Address line 1"
                  value={form.address_line_1}
                  onChange={(value) => update("address_line_1", value)}
                  disabled={!canEdit}
                />
                <Field
                  label="Address line 2"
                  value={form.address_line_2}
                  onChange={(value) => update("address_line_2", value)}
                  disabled={!canEdit}
                />
                <Field
                  label="City"
                  value={form.city}
                  onChange={(value) => update("city", value)}
                  disabled={!canEdit}
                />
                <SelectField
                  label={form.country === "Malaysia" ? "State / Federal Territory" : "State / Province"}
                  value={form.state}
                  onChange={(value) => update("state", value)}
                  options={countryStateOptions[form.country] || malaysiaStateOptions}
                  disabled={!canEdit}
                />
                <Field
                  label="Postcode"
                  value={form.postcode}
                  type="tel"
                  onChange={(value) => update("postcode", value.replace(/\D/g, "").slice(0, 10))}
                  disabled={!canEdit}
                />
                <SelectField
                  label="Country"
                  value={form.country || "Malaysia"}
                  onChange={(value) => setForm((current) => ({
                    ...current,
                    country: value,
                    state: "",
                    currency_code: countryCurrency[value] || "MYR",
                    timezone: countryTimezone[value] || "Asia/Kuala_Lumpur",
                    tax_type: countryTaxDefaults[value] || "TAX_EXEMPT",
                  }))}
                  options={companyCountryOptions}
                  required
                  disabled={!canEdit}
                />
                <Field
                  label="Contact person"
                  value={form.contact_name}
                  onChange={(value) => update("contact_name", value)}
                  disabled={!canEdit}
                />
                <Field
                  label="Phone"
                  value={form.contact_phone}
                  onChange={(value) => update("contact_phone", value)}
                  disabled={!canEdit}
                />
                <Field
                  label="Email"
                  type="email"
                  value={form.contact_email}
                  onChange={(value) => update("contact_email", value)}
                  disabled={!canEdit}
                />
              </div>
            </div>
          )}
          {tab === "Receipt Settings" && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-4">
                <div><h2 className="text-xl font-black">Receipt Information</h2><p className="text-sm text-slate-500">Customize physical and digital receipts issued to dine-in and takeout guests.</p></div>
                <div className="space-y-3 rounded-xl border p-4"><h3 className="font-black">Receipt line visibility</h3>{[["showCompanyName", "Show Company Name"], ["showRegistrationNumber", "Show Registration Number"], ["showAddress", "Show Address"], ["showPhoneNumber", "Show Phone Number"], ["showTaxDetails", "Show Tax Breakdown & Tax Registration Number"]].map(([key, label]) => <label key={key} className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={receiptSettings[key] !== false} onChange={(event) => updateReceipt(key, event.target.checked)} disabled={!canEdit} />{label}</label>)}</div>
                <label className="block text-sm font-semibold">Receipt Header Greeting<input maxLength={160} className={inputClass} value={receiptSettings.headerGreeting || receiptSettings.header || ""} onChange={(event) => updateReceipt("headerGreeting", event.target.value)} disabled={!canEdit} /><span className="mt-1 block text-xs font-normal text-slate-500">Prints directly below company address details.</span></label>
                <label className="block text-sm font-semibold">Receipt Footer Note<textarea maxLength={500} rows={4} className={inputClass} value={receiptSettings.footerNote || receiptSettings.footer || ""} onChange={(event) => updateReceipt("footerNote", event.target.value)} disabled={!canEdit} /><span className="mt-1 block text-xs font-normal text-slate-500">Printed at bottom alongside QR code.</span></label>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs"><span className="font-semibold text-slate-700">Printer: {targetPrinter ? `${targetPrinter.name} (${targetPrinter.paperWidth}mm Thermal)` : "No receipt printer configured"}</span><span className={targetPrinter ? "font-bold text-emerald-700" : "font-bold text-slate-500"}>{targetPrinter ? "Configured" : "Status unavailable"}</span></div>
              </div>
              <aside className="space-y-3"><div><h3 className="font-black">Live receipt preview</h3><p className="text-xs text-slate-500">Uses sample transaction data and your unsaved settings.</p></div><ReceiptPreview company={form} tax={{ enabled: form.tax_enabled, name: form.tax_type, rate: form.default_tax_rate }} settings={receiptSettings} /></aside>
            </div>
          )}
          {tab === "E-Invoice" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-black">E-Invoice configuration</h2>
                <p className="text-sm text-slate-500">
                  Sensitive provider credentials stay in Supabase Edge Functions
                  and are never shown here.
                </p>
              </div>
              <div className="rounded-2xl border bg-slate-50 p-5">
                <p className="font-bold">Provider status</p>
                <p className="mt-1 text-sm text-slate-600">
                  {form.einvoice_configuration?.status || "Not configured"}
                </p>
                <p className="mt-4 text-sm">
                  Manage profiles, branch mappings and submissions in the
                  existing E-Invoice module.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    window.location.hash = "#admin/einvoice";
                  }}
                  className="mt-4 flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white"
                >
                  Open E-Invoice <ExternalLink size={15} />
                </button>
              </div>
            </div>
          )}
          <div className="flex justify-end border-t pt-5">
            <button
              disabled={!canEdit || state.saving || !dirty}
              className="flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 font-black text-slate-950 disabled:opacity-50"
            >
              <Save size={16} />{" "}
              {state.saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export default function OrganizationManagement({
  mode = "company",
  permissions = [],
  initialBranchId = "",
}) {
  const state = useOrganization(mode);
  const [form, setForm] = useState(null);
  const [selected, setSelected] = useState(
    mode === "branch" ? initialBranchId || null : null,
  );
  const canEdit = permissions.includes(
    mode === "company" ? "company.update" : "branch.update",
  );
  useEffect(() => {
    setForm(null);
    setSelected(mode === "branch" ? initialBranchId || null : null);
  }, [initialBranchId, mode]);
  useEffect(() => {
    if (mode !== "branch") return;
    const next = selected
      ? `#admin/branches?branchId=${encodeURIComponent(selected)}`
      : "#admin/branches";
    if (globalThis.location?.hash !== next)
      globalThis.history?.replaceState(null, "", next);
  }, [mode, selected]);
  useEffect(() => {
    if (mode === "company" && state.rows[0]) {
      setForm({ ...state.rows[0], country: state.rows[0].country || "Malaysia" });
    }
  }, [mode, state.rows]);
  const save = async (event) => {
    event.preventDefault();
    if (await state.save(form)) {
      if (mode === "branch") setForm(null);
    }
  };
  if (mode === "company")
    return form ? (
      <CompanySetup company={form} permissions={permissions} />
    ) : (
      <p role="status">
        {state.loading ? "Loading company…" : "Company setup is unavailable."}
      </p>
    );
  if (selected)
    return (
      <BranchManagement
        branchId={selected}
        permissions={permissions}
        onBack={() => setSelected(null)}
      />
    );
  return (
    <section className="space-y-6">
      <header className="rounded-3xl bg-[#171717] p-7 text-white">
        <p className="text-xs font-bold uppercase tracking-widest text-[#D4AF37]">
          Organization
        </p>
        <h1 className="mt-2 text-3xl font-black">Branches</h1>
        <p className="mt-2 text-sm text-slate-300">
          Manage each restaurant’s people, terminals and operating settings.
        </p>
      </header>
      {state.error && (
        <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">
          Unable to load branches. {state.error}
          <button onClick={state.load} className="ml-4 underline">
            Retry
          </button>
        </div>
      )}
      <SuccessToast message={state.message} onDismiss={() => state.load()} />
      {state.loading && <p role="status">Loading branches…</p>}
      {!form && permissions.includes("branch.create") && (
        <button
          className="rounded-xl bg-[#D4AF37] px-5 py-3 font-bold"
          onClick={() => setForm({ ...emptyBranch })}
        >
          Create branch
        </button>
      )}
      {form && (
        <form
          onSubmit={save}
          className="space-y-5 rounded-2xl border bg-white p-6"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">
              {form.id ? "Edit branch" : "New branch"}
            </h2>
            <span className="text-xs font-bold text-slate-500">
              {form.status}
            </span>
          </div>
          <fieldset
            disabled={state.saving || (form.id && !canEdit)}
            className="grid gap-4 md:grid-cols-2"
          >
            {branchFields.map(([key, label]) => {
              const options = branchSelectOptions[key] || (key === "state" && form.country === "Malaysia" ? malaysiaStateOptions : null);
              return options ? (
                <SelectField
                  key={key}
                  label={label}
                  required={["timezone"].includes(key)}
                  value={form[key]}
                  options={options}
                  onChange={(value) => setForm({ ...form, [key]: value, ...(key === "country" && value === "Malaysia" ? { state: "" } : {}) })}
                />
              ) : (
                <Field
                  key={key}
                  label={label}
                  type={
                    ["tax_rate", "cash_drawer_float"].includes(key)
                      ? "number"
                      : key === "email"
                        ? "email"
                        : "text"
                  }
                  required={["code", "name", "phone", "address"].includes(
                    key,
                  )}
                  value={form[key]}
                  onChange={(value) =>
                    setForm({
                      ...form,
                      [key]: ["code", "currency_code"].includes(key)
                        ? value.toUpperCase()
                        : value,
                    })
                  }
                />
              );
            })}
            {(!form.id || permissions.includes("branch.deactivate")) && (
              <label className="text-sm font-semibold">
                Status
                <select
                  className={inputClass}
                  value={form.status}
                  onChange={(event) =>
                    setForm({ ...form, status: event.target.value })
                  }
                >
                  <option>ACTIVE</option>
                  <option>INACTIVE</option>
                </select>
              </label>
            )}
          </fieldset>
          <button
            disabled={state.saving}
            className="rounded-xl bg-[#D4AF37] px-5 py-3 font-bold"
          >
            {state.saving ? "Saving…" : "Save branch"}
          </button>
          <button
            type="button"
            onClick={() => setForm(null)}
            className="ml-3 rounded-xl border px-5 py-3"
          >
            Cancel
          </button>
        </form>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {state.rows.map((row) => (
          <article key={row.id} className="rounded-2xl border bg-white p-5">
            <div className="flex justify-between">
              <span className="font-bold">{row.code}</span>
              <span
                className={`rounded-full px-2 py-1 text-xs ${row.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
              >
                {row.status}
              </span>
            </div>
            <h2 className="mt-3 text-xl font-bold">{row.name}</h2>
            <p className="mt-1 text-sm text-slate-500">{row.companies?.name}</p>
            <p className="mt-3 text-sm">
              {row.address || "Address not configured"}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {row.currency_code || row.companies?.currency_code || "MYR"} ·{" "}
              {row.timezone || row.companies?.timezone || "Asia/Kuala_Lumpur"}
            </p>
            <div className="mt-5 flex gap-3">
              <button
                className="flex-1 rounded-xl bg-[#171717] p-3 font-bold text-white"
                onClick={() => setSelected(row.id)}
              >
                Manage branch
              </button>
              {canEdit && (
              <button
                className="rounded-xl border px-4"
                onClick={() => setForm(branchFormFromRow(row))}
              >
                  Edit
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {!state.loading && !state.rows.length && (
        <p className="rounded-xl border bg-white p-8 text-center text-slate-500">
          No branches available.
        </p>
      )}
    </section>
  );
}
