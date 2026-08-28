import React, { createContext, useContext, useState } from "react";
import { AlertTriangle, Plus, Save, Trash2, Upload } from "lucide-react";
import { env } from "../../config/env";
import { useSystemSettings } from "../../hooks/useSystemSettings";
import {
  testIntegrationConfiguration,
  testPrinterConfiguration,
} from "../../services/systemSettings.service";
import type {
  KitchenStation,
  PrinterConfig,
  SystemSettings,
} from "../../types/systemSettings";
import { translate, translateSystemLabel } from "../../utils/i18n";
const tabs = [
  "General",
  "Branding",
  "Tax & Charges",
  "Receipt",
  "Printer",
  "Kitchen / KDS",
  "Numbering",
  "Regional",
  "Backup",
  "Integrations",
] as const;
type TabName = (typeof tabs)[number];
const tabKeys: Record<TabName, string> = {
  General: "systemTabGeneral",
  Branding: "systemTabBranding",
  "Tax & Charges": "systemTabTaxCharges",
  Receipt: "systemTabReceipt",
  Printer: "systemTabPrinter",
  "Kitchen / KDS": "systemTabKitchen",
  Numbering: "systemTabNumbering",
  Regional: "systemTabRegional",
  Backup: "systemTabBackup",
  Integrations: "systemTabIntegrations",
};
const tabFields: Record<TabName, readonly (keyof SystemSettings)[]> = {
  General: ["restaurantInfo"],
  Branding: ["logoPath", "logoUrl"],
  "Tax & Charges": [
    "taxEnabled",
    "taxName",
    "taxRate",
    "taxMode",
    "serviceChargeEnabled",
    "serviceChargeName",
    "serviceChargeRate",
    "serviceChargeOrderTypes",
  ],
  Receipt: ["receiptConfig"],
  Printer: ["printers"],
  "Kitchen / KDS": ["stations"],
  Numbering: ["numbering"],
  Regional: [
    "timezone",
    "currencyCode",
    "currencySymbol",
    "decimalPlaces",
    "roundingRule",
    "defaultLanguage",
    "enabledLanguages",
  ],
  Backup: [],
  Integrations: ["integrations"],
};
const labelClass =
  "block text-xs font-black uppercase tracking-wide text-slate-500";
const inputClass =
  "mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm disabled:bg-slate-100";
const SystemAdministrationLanguageContext = createContext("en");

const useSystemAdministrationLanguage = () =>
  useContext(SystemAdministrationLanguageContext);
function Field({
  label,
  value,
  onChange,
  type = "text",
  disabled = false,
}: {
  label: string;
  value: unknown;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  const language = useSystemAdministrationLanguage();
  return (
    <label className={labelClass}>
      {translateSystemLabel(language, label)}
      <input
        type={type}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={inputClass}
      />
    </label>
  );
}
function Select({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  disabled?: boolean;
}) {
  const language = useSystemAdministrationLanguage();
  return (
    <label className={labelClass}>
      {translateSystemLabel(language, label)}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={inputClass}
      >
        {options.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
    </label>
  );
}
function Toggle({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const language = useSystemAdministrationLanguage();
  return (
    <label className="flex items-center gap-3 rounded-xl border p-3 text-sm font-bold">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      {translateSystemLabel(language, label)}
    </label>
  );
}
const newPrinter = (): PrinterConfig => ({
  id: crypto.randomUUID(),
  name: "New Printer",
  type: "RECEIPT",
  connectionType: "SYSTEM_PRINT",
  ipAddress: "",
  port: "9100",
  paperWidth: 80,
  autoCut: false,
  copies: 1,
  enabled: true,
});
const newStation = (): KitchenStation => ({
  id: crypto.randomUUID(),
  name: "New Station",
  code: `STATION_${Date.now().toString().slice(-5)}`,
  stationType: "OTHER",
  printerId: "",
  kdsDeviceKey: "",
  categoryIds: [],
  enabled: true,
});
export default function SystemAdministrationPage({
  lang = "en",
}: {
  lang?: string;
}) {
  const tr = (key: string, variables: Record<string, unknown> = {}) =>
    translate(lang, key, variables);
  const state = useSystemSettings();
  const [tab, setTab] = useState<TabName>(tabs[0]);
  const [notice, setNotice] = useState("");
  const s = state.draft;
  const fields = tabFields[tab];
  const tabDirty = state.isDirty(fields);
  const tabLabel = tr(tabKeys[tab]);
  const set = <K extends keyof SystemSettings>(
    key: K,
    value: SystemSettings[K],
  ) =>
    state.setDraft((current) =>
      current ? { ...current, [key]: value } : current,
    );
  const setInfo = (key: string, value: string) =>
    s && set("restaurantInfo", { ...s.restaurantInfo, [key]: value });
  const setReceipt = (key: string, value: unknown) =>
    s && set("receiptConfig", { ...s.receiptConfig, [key]: value });
  if (state.loading)
    return <div className="h-72 animate-pulse rounded-2xl bg-slate-200" />;
  if (!s)
    return (
      <div
        role="alert"
        className="rounded-2xl border border-red-200 bg-red-50 p-5"
      >
        {state.error}
        <button onClick={() => void state.load()} className="ml-3 font-bold">
          {tr("retry")}
        </button>
      </div>
    );
  const disabled = !s.canEdit;
  const pageLanguage = lang.startsWith("zh")
    ? "zh"
    : lang.startsWith("ms")
      ? "ms"
      : "en";
  const generalFields = [
    ["restaurantName", "Restaurant Name"],
    ["legalCompanyName", "Legal Company Name"],
    ["registrationNumber", "Registration Number"],
    ["taxRegistrationNumber", "Tax Registration Number"],
    ["phoneNumber", "Phone Number"],
    ["email", "Email"],
    ["website", "Website"],
    ["addressLine1", "Address Line 1"],
    ["addressLine2", "Address Line 2"],
    ["city", "City"],
    ["state", "State"],
    ["postcode", "Postcode"],
    ["country", "Country"],
    ["branchName", "Branch Name"],
    ["branchCode", "Branch Code"],
  ];
  return (
    <SystemAdministrationLanguageContext.Provider value={pageLanguage}>
      <section className="space-y-5 pb-10">
        <header>
          <p className="text-xs font-black tracking-[.2em] text-amber-700">
            {tr("systemAdministration")}
          </p>
          <h1 className="text-3xl font-black">
            {tr("restaurantConfiguration")}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {tr("systemEnvironment")}:{" "}
            <strong>{String(env.appEnv).toUpperCase()}</strong> ·{" "}
            {tr("systemRevision")} {s.revision} ·{" "}
            {s.canEdit ? tr("systemAdminEdit") : tr("systemReadOnly")}
          </p>
        </header>
        {String(env.appEnv).toUpperCase() === "PRODUCTION" && (
          <div className="flex gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            <AlertTriangle size={18} />
            {tr("systemProductionWarning")}
          </div>
        )}
        {state.error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {state.error}
          </div>
        )}
        {state.message && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            {state.message}
          </div>
        )}
        <nav className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map((x) => (
            <button
              key={x}
              onClick={() => setTab(x)}
              className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-black ${tab === x ? "bg-slate-950 text-white" : "border bg-white text-slate-600"}`}
            >
              {tr(tabKeys[x])}
              {state.isDirty(tabFields[x]) && (
                <span
                  className="ml-1 text-amber-500"
                  aria-label={tr("systemUnsavedChanges")}
                >
                  ●
                </span>
              )}
            </button>
          ))}
        </nav>
        <fieldset
          disabled={disabled || state.saving}
          className="rounded-2xl border bg-white p-5 shadow-sm disabled:opacity-80"
        >
          <legend className="px-2 text-lg font-black">{tabLabel}</legend>
          {tab === "General" && (
            <div className="grid gap-4 md:grid-cols-2">
              {generalFields.map(([key, label]) => (
                <Field
                  key={key}
                  label={label}
                  value={s.restaurantInfo[key as keyof typeof s.restaurantInfo]}
                  onChange={(v) => setInfo(key, v)}
                />
              ))}
            </div>
          )}
          {tab === "Branding" && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">{tr("systemLogoHelp")}</p>
              {s.logoUrl ? (
                <img
                  src={s.logoUrl}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                  alt={tr("systemLogoPreview")}
                  className="h-36 w-60 rounded-xl border object-contain p-3"
                />
              ) : (
                <div className="flex h-36 w-60 items-center justify-center rounded-xl border border-dashed text-sm text-slate-400">
                  {tr("systemNoLogo")}
                </div>
              )}
              <div className="flex gap-2">
                <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white">
                  <Upload size={16} />
                  {tr("systemUploadReplace")}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void state.uploadLogo(file);
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    set("logoPath", "");
                    set("logoUrl", "");
                  }}
                  className="rounded-xl border px-4 py-2 text-sm font-bold"
                >
                  {tr("remove")}
                </button>
              </div>
            </div>
          )}
          {tab === "Tax & Charges" && (
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-3">
                <Toggle
                  label="Tax Enabled"
                  value={s.taxEnabled}
                  onChange={(v) => set("taxEnabled", v)}
                />
                <Field
                  label="Tax Name"
                  value={s.taxName}
                  onChange={(v) => set("taxName", v)}
                />
                <Field
                  label="Tax Rate (%)"
                  type="number"
                  value={s.taxRate}
                  onChange={(v) => set("taxRate", Number(v))}
                />
                <Select
                  label="Tax Mode"
                  value={s.taxMode}
                  onChange={(v) =>
                    set("taxMode", v as SystemSettings["taxMode"])
                  }
                  options={["EXCLUSIVE", "INCLUSIVE"]}
                />
              </div>
              <div className="space-y-3">
                <Toggle
                  label="Service Charge Enabled"
                  value={s.serviceChargeEnabled}
                  onChange={(v) => set("serviceChargeEnabled", v)}
                />
                <Field
                  label="Service Charge Name"
                  value={s.serviceChargeName}
                  onChange={(v) => set("serviceChargeName", v)}
                />
                <Field
                  label="Service Charge Rate (%)"
                  type="number"
                  value={s.serviceChargeRate}
                  onChange={(v) => set("serviceChargeRate", Number(v))}
                />
                <p className={labelClass}>{tr("systemApplicableOrderTypes")}</p>
                {["DINE_IN", "TAKEAWAY"].map((x) => (
                  <Toggle
                    key={x}
                    label={x}
                    value={s.serviceChargeOrderTypes.includes(x)}
                    onChange={(on) =>
                      set(
                        "serviceChargeOrderTypes",
                        on
                          ? [...new Set([...s.serviceChargeOrderTypes, x])]
                          : s.serviceChargeOrderTypes.filter((y) => y !== x),
                      )
                    }
                  />
                ))}
              </div>
              <p className="md:col-span-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                {tr("systemFinancialSnapshotHelp")}
              </p>
            </div>
          )}
          {tab === "Receipt" && (
            <div className="grid gap-3 md:grid-cols-3">
              {[
                ["showLogo", "Show Logo"],
                ["showRestaurantName", "Restaurant Name"],
                ["showAddress", "Address"],
                ["showPhone", "Phone"],
                ["showTaxNumber", "Tax Number"],
                ["showOrderNumber", "Order Number"],
                ["showTableNumber", "Table Number"],
                ["showStaffName", "Staff Name"],
                ["showPaymentMethod", "Payment Method"],
                ["showTax", "Tax"],
                ["showServiceCharge", "Service Charge"],
                ["showDiscount", "Discount"],
                ["showItemNotes", "Item Notes"],
                ["autoPrint", "Auto Print"],
              ].map(([key, label]) => (
                <Toggle
                  key={key}
                  label={label}
                  value={Boolean(s.receiptConfig[key])}
                  onChange={(v) => setReceipt(key, v)}
                />
              ))}
              <div className="md:col-span-3 grid gap-4 md:grid-cols-2">
                <Field
                  label="Receipt Header"
                  value={s.receiptConfig.receiptHeader}
                  onChange={(v) => setReceipt("receiptHeader", v)}
                />
                <Field
                  label="Receipt Footer"
                  value={s.receiptConfig.receiptFooter}
                  onChange={(v) => setReceipt("receiptFooter", v)}
                />
                <Field
                  label="Thank You Message"
                  value={s.receiptConfig.thankYouMessage}
                  onChange={(v) => setReceipt("thankYouMessage", v)}
                />
                <Field
                  label="Copies"
                  type="number"
                  value={s.receiptConfig.copies}
                  onChange={(v) => setReceipt("copies", Number(v))}
                />
                <Select
                  label="Paper Size"
                  value={String(s.receiptConfig.paperSize)}
                  onChange={(v) => setReceipt("paperSize", v)}
                  options={["58mm", "80mm"]}
                />
              </div>
            </div>
          )}
          {tab === "Printer" && (
            <div className="space-y-4">
              {s.printers.map((p, index) => (
                <div
                  key={p.id}
                  className="grid gap-3 rounded-xl border p-4 md:grid-cols-4"
                >
                  <Field
                    label="Printer Name"
                    value={p.name}
                    onChange={(v) =>
                      set(
                        "printers",
                        s.printers.map((x, i) =>
                          i === index ? { ...x, name: v } : x,
                        ),
                      )
                    }
                  />
                  <Select
                    label="Type"
                    value={p.type}
                    options={["RECEIPT", "KITCHEN", "BEVERAGE", "OTHER"]}
                    onChange={(v) =>
                      set(
                        "printers",
                        s.printers.map((x, i) =>
                          i === index
                            ? { ...x, type: v as PrinterConfig["type"] }
                            : x,
                        ),
                      )
                    }
                  />
                  <Select
                    label="Connection"
                    value={p.connectionType}
                    options={["SYSTEM_PRINT", "NETWORK", "USB", "BLUETOOTH"]}
                    onChange={(v) =>
                      set(
                        "printers",
                        s.printers.map((x, i) =>
                          i === index
                            ? {
                                ...x,
                                connectionType:
                                  v as PrinterConfig["connectionType"],
                              }
                            : x,
                        ),
                      )
                    }
                  />
                  <Select
                    label="Paper Width"
                    value={String(p.paperWidth)}
                    options={["58", "80"]}
                    onChange={(v) =>
                      set(
                        "printers",
                        s.printers.map((x, i) =>
                          i === index
                            ? { ...x, paperWidth: Number(v) as 58 | 80 }
                            : x,
                        ),
                      )
                    }
                  />
                  {p.connectionType === "NETWORK" && (
                    <>
                      <Field
                        label="IP Address"
                        value={p.ipAddress}
                        onChange={(v) =>
                          set(
                            "printers",
                            s.printers.map((x, i) =>
                              i === index ? { ...x, ipAddress: v } : x,
                            ),
                          )
                        }
                      />
                      <Field
                        label="Port"
                        value={p.port}
                        onChange={(v) =>
                          set(
                            "printers",
                            s.printers.map((x, i) =>
                              i === index ? { ...x, port: v } : x,
                            ),
                          )
                        }
                      />
                    </>
                  )}
                  <Field
                    label="Copies"
                    type="number"
                    value={p.copies}
                    onChange={(v) =>
                      set(
                        "printers",
                        s.printers.map((x, i) =>
                          i === index ? { ...x, copies: Number(v) } : x,
                        ),
                      )
                    }
                  />
                  <Toggle
                    label="Auto Cut"
                    value={p.autoCut}
                    onChange={(v) =>
                      set(
                        "printers",
                        s.printers.map((x, i) =>
                          i === index ? { ...x, autoCut: v } : x,
                        ),
                      )
                    }
                  />
                  <Toggle
                    label="Enabled"
                    value={p.enabled}
                    onChange={(v) =>
                      set(
                        "printers",
                        s.printers.map((x, i) =>
                          i === index ? { ...x, enabled: v } : x,
                        ),
                      )
                    }
                  />
                  <div className="flex items-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const r = testPrinterConfiguration(p);
                        setNotice(`${p.name}: ${r.status} — ${r.message}`);
                        if (p.connectionType === "SYSTEM_PRINT") window.print();
                      }}
                      className="rounded-lg border px-3 py-2 text-xs font-bold"
                    >
                      {tr("systemTestPrint")}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        set(
                          "printers",
                          s.printers.filter((x) => x.id !== p.id),
                        )
                      }
                      className="rounded-lg border p-2 text-red-600"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => set("printers", [...s.printers, newPrinter()])}
                className="flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold"
              >
                <Plus size={16} />
                {tr("systemAddPrinter")}
              </button>
              {notice && (
                <p className="rounded-xl bg-slate-100 p-3 text-sm">{notice}</p>
              )}
            </div>
          )}
          {tab === "Kitchen / KDS" && (
            <div className="space-y-4">
              {s.stations.map((station, index) => (
                <div
                  key={station.id}
                  className="grid gap-3 rounded-xl border p-4 md:grid-cols-3"
                >
                  <Field
                    label="Station Name"
                    value={station.name}
                    onChange={(v) =>
                      set(
                        "stations",
                        s.stations.map((x, i) =>
                          i === index ? { ...x, name: v } : x,
                        ),
                      )
                    }
                  />
                  <Field
                    label="Station Code"
                    value={station.code}
                    onChange={(v) =>
                      set(
                        "stations",
                        s.stations.map((x, i) =>
                          i === index ? { ...x, code: v } : x,
                        ),
                      )
                    }
                  />
                  <Select
                    label="Station Type"
                    value={station.stationType}
                    options={[
                      "MAIN_KITCHEN",
                      "BEVERAGE",
                      "DESSERT",
                      "BAR",
                      "OTHER",
                    ]}
                    onChange={(v) =>
                      set(
                        "stations",
                        s.stations.map((x, i) =>
                          i === index
                            ? {
                                ...x,
                                stationType: v as KitchenStation["stationType"],
                              }
                            : x,
                        ),
                      )
                    }
                  />
                  <label className={labelClass}>
                    {tr("systemPrinter")}
                    <select
                      className={inputClass}
                      value={station.printerId}
                      onChange={(e) =>
                        set(
                          "stations",
                          s.stations.map((x, i) =>
                            i === index
                              ? { ...x, printerId: e.target.value }
                              : x,
                          ),
                        )
                      }
                    >
                      <option value="">{tr("none")}</option>
                      {s.printers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Field
                    label="KDS Device Key"
                    value={station.kdsDeviceKey}
                    onChange={(v) =>
                      set(
                        "stations",
                        s.stations.map((x, i) =>
                          i === index ? { ...x, kdsDeviceKey: v } : x,
                        ),
                      )
                    }
                  />
                  <Toggle
                    label="Enabled"
                    value={station.enabled}
                    onChange={(v) =>
                      set(
                        "stations",
                        s.stations.map((x, i) =>
                          i === index ? { ...x, enabled: v } : x,
                        ),
                      )
                    }
                  />
                  <div className="md:col-span-3">
                    <p className={labelClass}>
                      {tr("systemCategoriesAssigned")}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {s.categories.map((c) => (
                        <label
                          key={c.id}
                          className="rounded-lg border px-2 py-1 text-xs"
                        >
                          <input
                            className="mr-2"
                            type="checkbox"
                            checked={station.categoryIds.includes(c.id)}
                            onChange={(e) =>
                              set(
                                "stations",
                                s.stations.map((x, i) =>
                                  i === index
                                    ? {
                                        ...x,
                                        categoryIds: e.target.checked
                                          ? [...x.categoryIds, c.id]
                                          : x.categoryIds.filter(
                                              (id) => id !== c.id,
                                            ),
                                      }
                                    : x,
                                ),
                              )
                            }
                          />
                          {c.name}
                        </label>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      set(
                        "stations",
                        s.stations.filter((x) => x.id !== station.id),
                      )
                    }
                    className="w-fit text-xs font-bold text-red-600"
                  >
                    {tr("systemRemoveStation")}
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => set("stations", [...s.stations, newStation()])}
                className="flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold"
              >
                <Plus size={16} />
                {tr("systemAddStation")}
              </button>
              <p className="text-xs text-slate-500">
                {tr("systemRoutingHelp")}
              </p>
            </div>
          )}
          {tab === "Numbering" && (
            <div className="space-y-3">
              {s.numbering.map((n, index) => (
                <div
                  key={n.entityCode}
                  className="grid gap-3 rounded-xl border p-3 md:grid-cols-5"
                >
                  <strong className="self-center">{n.entityCode}</strong>
                  <Field
                    label="Prefix"
                    value={n.prefix}
                    onChange={(v) =>
                      set(
                        "numbering",
                        s.numbering.map((x, i) =>
                          i === index ? { ...x, prefix: v } : x,
                        ),
                      )
                    }
                  />
                  <Field
                    label="Padding"
                    type="number"
                    value={n.sequencePadding}
                    onChange={(v) =>
                      set(
                        "numbering",
                        s.numbering.map((x, i) =>
                          i === index
                            ? { ...x, sequencePadding: Number(v) }
                            : x,
                        ),
                      )
                    }
                  />
                  <Select
                    label="Date Format"
                    value={n.dateFormat}
                    options={["YYYYMMDD", "YYMMDD", "YYYY-MM"]}
                    onChange={(v) =>
                      set(
                        "numbering",
                        s.numbering.map((x, i) =>
                          i === index
                            ? { ...x, dateFormat: v as typeof n.dateFormat }
                            : x,
                        ),
                      )
                    }
                  />
                  <Select
                    label="Reset"
                    value={n.resetFrequency}
                    options={["NEVER", "DAILY", "MONTHLY", "YEARLY"]}
                    onChange={(v) =>
                      set(
                        "numbering",
                        s.numbering.map((x, i) =>
                          i === index
                            ? {
                                ...x,
                                resetFrequency: v as typeof n.resetFrequency,
                              }
                            : x,
                        ),
                      )
                    }
                  />
                </div>
              ))}
              <p className="text-xs text-slate-500">
                {tr("systemNumberingHelp")}
              </p>
            </div>
          )}
          {tab === "Regional" && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label={tr("systemTimezone")}
                value={s.timezone}
                onChange={(v) => set("timezone", v)}
              />
              <Field
                label={tr("systemCurrencyCode")}
                value={s.currencyCode}
                onChange={(v) => set("currencyCode", v.toUpperCase())}
              />
              <Field
                label={tr("systemCurrencySymbol")}
                value={s.currencySymbol}
                onChange={(v) => set("currencySymbol", v)}
              />
              <Field
                label={tr("systemDecimalPlaces")}
                type="number"
                value={s.decimalPlaces}
                onChange={(v) => set("decimalPlaces", Number(v))}
              />
              <Select
                label={tr("systemRoundingRule")}
                value={s.roundingRule}
                options={["NONE", "0.05", "0.10"]}
                onChange={(v) => set("roundingRule", v)}
              />
              <Select
                label={tr("systemDefaultLanguage")}
                value={s.defaultLanguage}
                options={s.enabledLanguages}
                onChange={(v) =>
                  set("defaultLanguage", v as SystemSettings["defaultLanguage"])
                }
              />
              <div>
                <p className={labelClass}>{tr("systemEnabledLanguages")}</p>
                {["en", "zh", "ms"].map((code) => (
                  <Toggle
                    key={code}
                    label={`${tr(`systemLanguage_${code}`)}${code === s.defaultLanguage ? ` (${tr("systemDefault")})` : ""}`}
                    disabled={code === s.defaultLanguage}
                    value={s.enabledLanguages.includes(code as never)}
                    onChange={(on) =>
                      set(
                        "enabledLanguages",
                        on
                          ? [...new Set([...s.enabledLanguages, code as never])]
                          : s.enabledLanguages.filter((x) => x !== code),
                      )
                    }
                  />
                ))}
              </div>
              <p className="md:col-span-2 text-xs text-slate-500">
                {tr("systemLanguageHelp")}
              </p>
            </div>
          )}
          {tab === "Backup" && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                disabled
                label="Backup Mode"
                value={s.backupConfig.mode || "UNKNOWN"}
                onChange={() => {}}
              />
              <Field
                disabled
                label="Provider"
                value={s.backupConfig.provider || "UNKNOWN"}
                onChange={() => {}}
              />
              <Field
                disabled
                label="Frequency"
                value={s.backupConfig.frequency || "PROVIDER_MANAGED"}
                onChange={() => {}}
              />
              <Field
                disabled
                label="Retention"
                value={s.backupConfig.retention || "PROVIDER_MANAGED"}
                onChange={() => {}}
              />
              <p className="md:col-span-2 rounded-xl bg-slate-100 p-3 text-sm">
                {tr("systemBackupAuthorityHelp")}
              </p>
            </div>
          )}
          {tab === "Integrations" && (
            <div className="space-y-3">
              {s.integrations.map((integration, index) => (
                <div
                  key={integration.integrationType}
                  className="grid gap-3 rounded-xl border p-4 md:grid-cols-4"
                >
                  <strong className="self-center">
                    {integration.integrationType.replaceAll("_", " ")}
                  </strong>
                  <Field
                    label="Provider"
                    value={integration.provider}
                    onChange={(v) =>
                      set(
                        "integrations",
                        s.integrations.map((x, i) =>
                          i === index ? { ...x, provider: v } : x,
                        ),
                      )
                    }
                  />
                  <Toggle
                    label="Enabled"
                    value={integration.enabled}
                    onChange={(v) =>
                      set(
                        "integrations",
                        s.integrations.map((x, i) =>
                          i === index ? { ...x, enabled: v } : x,
                        ),
                      )
                    }
                  />
                  <div>
                    <span className="block text-xs font-black">
                      {integration.status}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const r = testIntegrationConfiguration(integration);
                        setNotice(
                          `${integration.integrationType}: ${r.status} — ${r.message}`,
                        );
                      }}
                      className="mt-2 rounded-lg border px-3 py-2 text-xs font-bold"
                    >
                      {tr("systemTestConnection")}
                    </button>
                  </div>
                </div>
              ))}
              {notice && (
                <p className="rounded-xl bg-slate-100 p-3 text-sm">{notice}</p>
              )}
              <p className="text-xs text-slate-500">
                {tr("systemSecretsHelp")}
              </p>
            </div>
          )}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-xs text-slate-500">
              {fields.length
                ? tabDirty
                  ? tr("systemTabUnsaved", { tab: tabLabel })
                  : tr("systemTabCurrent", { tab: tabLabel })
                : tr("systemBackupReadOnly")}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!tabDirty || state.saving}
                onClick={() => state.reset(fields)}
                className="rounded-xl border bg-white px-4 py-2 text-sm font-bold disabled:opacity-40"
              >
                {tr("systemResetTab", { tab: tabLabel })}
              </button>
              <button
                type="button"
                disabled={
                  disabled || !tabDirty || state.saving || !fields.length
                }
                onClick={() => void state.save(fields, tabLabel)}
                className="flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-sm font-black disabled:opacity-40"
              >
                <Save size={16} />
                {state.saving
                  ? tr("saving")
                  : tr("systemSaveTab", { tab: tabLabel })}
              </button>
            </div>
          </div>
        </fieldset>
        {state.dirty && (
          <div className="sticky bottom-3 rounded-xl bg-slate-950 p-3 text-sm text-white shadow-xl">
            {tr("systemUnsavedTabsHelp")}
          </div>
        )}
      </section>
    </SystemAdministrationLanguageContext.Provider>
  );
}
