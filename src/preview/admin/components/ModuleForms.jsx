import { useMemo, useState } from "react";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { adminModuleData } from "../adminModuleData";
import { initialBranches } from "../mockData";
import { usePreviewWorkspace } from "../hooks/usePreviewWorkspace";
import { money, parseMoney } from "../previewMoney";
import { Button, Field, Modal, Tag, TextInput } from "./PreviewUi";
import ProductEditor from "./ProductEditor";
import {
  dateKey,
  productAvailable,
  resolveOrderLine,
} from "../previewSelectors";

const branchNames = initialBranches.map((branch) => branch.name);
const fieldsByModule = {
  products: [
    { name: "Product", required: true },
    { name: "SKU", required: true },
    { name: "Category", options: ["Mains", "Sides", "Beverages", "Desserts"] },
    { name: "Price", type: "number", min: ".01", step: ".01", required: true },
    { name: "Stock tracking", options: ["On", "Off"] },
    { name: "Status", options: ["Available", "Unavailable"] },
  ],
  categories: [
    { name: "Category", required: true },
    { name: "Menu order", type: "number", min: 1, required: true },
    {
      name: "Kitchen routing",
      options: ["Hot kitchen", "Cold kitchen", "Bar"],
    },
    { name: "Visibility", options: ["Visible", "Hidden"] },
  ],
  tables: [
    { name: "Table", required: true },
    {
      name: "Dining area",
      options: ["Main Floor", "Bar Area", "Patio Garden"],
    },
    { name: "Branch", options: branchNames },
    { name: "Capacity", type: "number", min: 1, max: 30, required: true },
    { name: "Status", options: ["Available", "Reserved"] },
  ],
  promotions: [
    { name: "Promotion", required: true },
    { name: "Discount type", options: ["Percentage", "Fixed amount"] },
    {
      name: "Discount value",
      type: "number",
      min: ".01",
      step: ".01",
      required: true,
    },
    { name: "Starts", type: "date", required: true },
    { name: "Ends", type: "date", required: true },
  ],
  vouchers: [
    {
      name: "Code",
      required: true,
      hint: "Unique code. Letters, numbers, and hyphens only.",
    },
    { name: "Voucher", required: true },
    { name: "Type", options: ["Percentage", "Fixed amount"] },
    { name: "Value", type: "number", min: ".01", step: ".01", required: true },
    { name: "Redemption limit", type: "number", min: 1, required: true },
    { name: "Starts", type: "date", required: true },
    { name: "Ends", type: "date", required: true },
  ],
  "payment-providers": [
    { name: "Method", options: ["Cash", "QR", "Card", "E-wallet"] },
    { name: "Provider", required: true },
    { name: "Branches", options: ["All branches", ...branchNames] },
    { name: "Settlement", options: ["Immediate", "Daily", "T+1"] },
    { name: "Status", options: ["Enabled", "Setup", "Disabled"] },
  ],
  einvoice: [
    { name: "Buyer", required: true },
    {
      name: "Tax ID",
      required: true,
      hint: "Use a synthetic buyer tax identifier in this preview.",
    },
  ],
};

function initialValues(fields, row, branch) {
  return Object.fromEntries(
    fields.map((field) => {
      let value = row?.[field.name] ?? field.options?.[0] ?? "";
      if (field.name === "Branch") value = row?.Branch || branch;
      if (field.name === "Discount type")
        value = row?.Offer?.includes("%") ? "Percentage" : "Fixed amount";
      if (field.name === "Discount value")
        value = row?.Offer?.match(/[\d.]+/)?.[0] || "";
      if (field.name === "Capacity")
        value = Number.parseInt(row?.Capacity || "4", 10);
      if (["Price", "Value"].includes(field.name))
        value = String(value).replace(/[^\d.]/g, "");
      if (field.name === "Redemption limit")
        value = Number(String(row?.Redemptions || "0 / 100").split("/")[1]);
      if (field.name === "Starts") value = row?.Starts || dateKey(Date.now());
      if (field.name === "Ends")
        value = row?.Ends || dateKey(Date.now() + 30 * 86400000);
      return [field.name, value];
    }),
  );
}

export function RecordEditor({ moduleId, row, onClose, onSaved }) {
  if (moduleId === "products")
    return <ProductEditor row={row} onClose={onClose} onSaved={onSaved} />;
  return (
    <SimpleRecordEditor
      moduleId={moduleId}
      row={row}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function SimpleRecordEditor({ moduleId, row, onClose, onSaved }) {
  const workspace = usePreviewWorkspace();
  const fields = useMemo(
    () =>
      (
        fieldsByModule[moduleId] ||
        adminModuleData[moduleId].columns
          .slice(0, 3)
          .map((name) => ({ name, required: true }))
      ).map((field) =>
        field.name === "Category" && moduleId === "products"
          ? {
              ...field,
              options: workspace.modules.categories
                .filter((category) => category.Visibility === "Visible")
                .map((category) => category.Category),
            }
          : ["Branch", "Branches"].includes(field.name)
            ? {
                ...field,
                options: [
                  ...(field.name === "Branches" ? ["All branches"] : []),
                  ...workspace.availableBranches.map((branch) => branch.name),
                ],
              }
            : field,
      ),
    [moduleId, workspace.modules.categories, workspace.availableBranches],
  );
  const [values, setValues] = useState(() =>
    initialValues(fields, row, workspace.branch),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = (event) => {
    event.preventDefault();
    if (busy) return;
    setError("");
    const result = { ...row, ...values };
    if (
      fields.some(
        (field) => field.required && !String(values[field.name] ?? "").trim(),
      )
    ) {
      setError("Complete all required fields.");
      return;
    }
    if (moduleId === "tables") {
      result.Capacity = `${values.Capacity} seats`;
      result["Current order"] = row?.["Current order"] || "—";
    }
    if (moduleId === "categories")
      result.Products = row?.Products || "0 products";
    if (moduleId === "vouchers" || moduleId === "promotions") {
      if (values.Ends < values.Starts) {
        setError("The end date must follow the start date.");
        return;
      }
      const type = values.Type || values["Discount type"];
      const value = Number(values.Value || values["Discount value"]);
      if (value <= 0 || (type === "Percentage" && value > 100)) {
        setError(
          "Use a positive value; percentage discounts cannot exceed 100%.",
        );
        return;
      }
      result.Status =
        values.Starts > dateKey(Date.now())
          ? "Scheduled"
          : values.Ends < dateKey(Date.now())
            ? "Expired"
            : "Active";
      if (moduleId === "vouchers") {
        if (!/^[A-Z0-9-]{2,30}$/i.test(values.Code)) {
          setError("Use 2–30 letters, numbers, or hyphens for the code.");
          return;
        }
        result.Code = values.Code.toUpperCase();
        result.Value =
          type === "Percentage"
            ? `${value}%`
            : money(parseMoney(String(value)));
        const used = Number.parseInt(row?.Redemptions || "0", 10);
        if (Number(values["Redemption limit"]) < used) {
          setError("The redemption limit cannot be below existing usage.");
          return;
        }
        result.Redemptions = `${used} / ${values["Redemption limit"]}`;
        result.Validity = `${values.Starts} → ${values.Ends}`;
      } else {
        result.Offer =
          type === "Percentage"
            ? `${value}% off`
            : `${money(parseMoney(String(value)))} off`;
        result.Schedule = `${values.Starts} → ${values.Ends}`;
        result.Redemptions = row?.Redemptions || "0";
      }
    }
    if (moduleId === "einvoice") {
      result.Validation = "Ready for resubmission";
      result.Status = "Pending";
    }
    setBusy(true);
    const saved = workspace.saveRecord(moduleId, result, row?._id);
    setBusy(false);
    if (saved.error) {
      setError(saved.error);
      return;
    }
    onSaved(
      row
        ? "Changes saved to the sample workspace."
        : "Record created in the sample workspace.",
    );
  };
  return (
    <Modal
      title={`${row ? "Edit" : "Add"} ${moduleId === "products" ? "menu item" : moduleId === "payment-providers" ? "payment method" : moduleId.replaceAll("-", " ").replace(/s$/, "")}`}
      description="Review the details before saving to this mock workspace."
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="preview-record-form"
            disabled={busy || workspace.readOnly}
          >
            {busy ? "Saving…" : row ? "Save changes" : "Create record"}
          </Button>
        </>
      }
    >
      <form id="preview-record-form" className="preview-form" onSubmit={submit}>
        {error && (
          <p className="preview-inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="preview-two-columns">
          {fields.map((field) => (
            <Field
              key={field.name}
              label={`${field.name}${field.required ? " *" : ""}`}
              hint={field.hint}
            >
              {field.options ? (
                <select
                  name={field.name}
                  value={values[field.name]}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field.name]: event.target.value,
                    }))
                  }
                >
                  {field.options.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              ) : (
                <TextInput
                  name={field.name}
                  required={field.required}
                  type={field.type || "text"}
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={values[field.name]}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field.name]: event.target.value,
                    }))
                  }
                />
              )}
            </Field>
          ))}
        </div>
      </form>
    </Modal>
  );
}

export function ActionDialog({
  title,
  description,
  fields,
  initial = {},
  onClose,
  onConfirm,
  confirmLabel = "Confirm",
  danger = false,
  children,
  renderSummary,
}) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      fields.map((field) => {
        const options = field.options?.map((option) =>
          typeof option === "string" ? option : option.value,
        );
        const candidate = initial[field.name];
        return [
          field.name,
          options
            ? options.includes(candidate)
              ? candidate
              : options[0] || ""
            : (candidate ?? (field.type === "checkbox" ? false : "")),
        ];
      }),
    ),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await onConfirm(values);
      if (result?.error) setError(result.error);
    } catch {
      setError("This sample action could not be completed. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={title}
      description={description}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="preview-action-form"
            variant={danger ? "danger" : "primary"}
            disabled={busy}
          >
            {busy ? "Saving…" : confirmLabel}
          </Button>
        </>
      }
    >
      <form id="preview-action-form" className="preview-form" onSubmit={submit}>
        {children}
        {error && (
          <p className="preview-inline-error" role="alert">
            {error}
          </p>
        )}
        {fields.map((field) => (
          <Field
            key={field.name}
            label={field.label || field.name}
            hint={field.hint}
          >
            {field.type === "checkbox" ? (
              <input
                type="checkbox"
                checked={Boolean(values[field.name])}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [field.name]: event.target.checked,
                  }))
                }
              />
            ) : field.options ? (
              <select
                required={field.required}
                value={values[field.name] ?? ""}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [field.name]: event.target.value,
                  }))
                }
              >
                {field.options.map((option) => (
                  <option
                    key={typeof option === "string" ? option : option.value}
                    value={typeof option === "string" ? option : option.value}
                  >
                    {typeof option === "string" ? option : option.label}
                  </option>
                ))}
              </select>
            ) : field.type === "textarea" ? (
              <textarea
                required={field.required}
                rows={3}
                value={values[field.name] || ""}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [field.name]: event.target.value,
                  }))
                }
              />
            ) : (
              <TextInput
                required={field.required}
                type={field.type || "text"}
                min={field.min}
                step={field.step}
                value={values[field.name] ?? ""}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [field.name]: event.target.value,
                  }))
                }
              />
            )}
          </Field>
        ))}
        {renderSummary?.(values)}
      </form>
    </Modal>
  );
}

export function OrderComposer({ onClose, notify }) {
  const workspace = usePreviewWorkspace();
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [orderType, setOrderType] = useState("Takeaway");
  const [tableId, setTableId] = useState("");
  const [voucher, setVoucher] = useState("");
  const [error, setError] = useState("");
  const [customizing, setCustomizing] = useState(null);
  const register = workspace.modules["cash-shifts"].find(
    (shift) =>
      shift.Status === "Open" &&
      shift["Branch / terminal"].startsWith(workspace.branch),
  );
  const availableTables = workspace.modules.tables.filter(
    (row) => row.Branch === workspace.branch && row.Status === "Available",
  );
  const products = workspace.modules.products.filter(
    (product) =>
      !product._archived &&
      (product._allBranches !== false ||
        (product._branches || []).includes(workspace.branch)) &&
      product.Product.toLowerCase().includes(query.toLowerCase()),
  );
  const add = (product, choices = []) => {
    const line = resolveOrderLine(product, choices);
    if (line.error) {
      setError(line.error);
      return;
    }
    const lineId =
      product._id +
      ":" +
      choices
        .map((choice) => choice.optionId)
        .sort()
        .join(",");
    setItems((current) =>
      current.some((item) => item.lineId === lineId)
        ? current.map((item) =>
            item.lineId === lineId
              ? { ...item, quantity: item.quantity + 1 }
              : item,
          )
        : [
            ...current,
            {
              lineId,
              productId: product._id,
              quantity: 1,
              name: product.Product,
              ...line,
            },
          ],
    );
    setCustomizing(null);
  };
  const subtotal = items.reduce(
    (sum, item) => sum + item.priceCents * item.quantity,
    0,
  );
  const offer = workspace.modules.vouchers.find((row) => row.Code === voucher);
  const discount = Math.min(
    subtotal,
    offer
      ? offer.Type === "Percentage"
        ? Math.round(
            (subtotal * Number(String(offer.Value).replace("%", ""))) / 100,
          )
        : parseMoney(offer.Value) || 0
      : 0,
  );
  const tax = Math.round(
    ((subtotal - discount) * Number(workspace.settings.taxRate)) / 100,
  );
  const service = Math.round(
    ((subtotal - discount) * Number(workspace.settings.serviceRate)) / 100,
  );
  const submit = (event) => {
    event.preventDefault();
    const result = workspace.createOrder({
      items,
      orderType,
      tableId,
      voucher,
    });
    if (result.error) {
      setError(result.error);
      return;
    }
    workspace.setComposerOpen(false);
    onClose();
    notify("Order created. Follow it in Order Management.");
  };
  if (customizing)
    return (
      <ModifierPicker
        product={customizing}
        onClose={() => setCustomizing(null)}
        onAdd={(choices) => add(customizing, choices)}
      />
    );
  return (
    <Modal
      title="New order"
      description={`${register?.["Branch / terminal"] || workspace.branch} · ${register?.Shift || "No open register"}`}
      onClose={onClose}
      wide
      footer={
        <>
          <span className="preview-dialog-total">
            Total <strong>{money(subtotal - discount + tax + service)}</strong>
          </span>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="preview-order-form"
            disabled={!items.length || workspace.readOnly}
          >
            Create order
          </Button>
        </>
      }
    >
      <form id="preview-order-form" onSubmit={submit}>
        <div className="preview-composer-grid">
          <section>
            <label className="preview-search">
              <input
                aria-label="Search menu for new order"
                placeholder="Find a dish or drink…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="preview-composer-menu">
              {products.map((product) => (
                <button
                  key={product._id}
                  type="button"
                  disabled={!productAvailable(product, workspace.branch)}
                  onClick={() =>
                    product._modifiers?.length
                      ? setCustomizing(product)
                      : add(product)
                  }
                >
                  {product._photo ? (
                    <img
                      className="preview-food-photo"
                      src={product._photo}
                      alt=""
                    />
                  ) : (
                    <span className="preview-food-mark">
                      <ShoppingBag size={20} />
                    </span>
                  )}
                  <span>
                    <strong>{product.Product}</strong>
                    <small>
                      {product.Category} · {product.Price}
                      {product._modifiers?.length ? " · Options" : ""}
                    </small>
                  </span>
                  <Plus size={16} />
                </button>
              ))}
            </div>
          </section>
          <section className="preview-composer-summary">
            <div className="preview-section-heading">
              <h3>Order details</h3>
              <Tag tone="blue">
                {items.reduce((sum, item) => sum + item.quantity, 0)} items
              </Tag>
            </div>
            <div className="preview-two-columns">
              <Field label="Service">
                <select
                  value={orderType}
                  onChange={(event) => setOrderType(event.target.value)}
                >
                  <option>Takeaway</option>
                  <option>Dine-in</option>
                </select>
              </Field>
              {orderType === "Dine-in" && (
                <Field label="Available table">
                  <select
                    required
                    value={tableId}
                    onChange={(event) => setTableId(event.target.value)}
                  >
                    <option value="">Choose a table</option>
                    {availableTables.map((table) => (
                      <option key={table._id} value={table._id}>
                        {table.Table} · {table.Capacity}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            <div className="preview-cart-items">
              {!items.length && (
                <p className="preview-muted">
                  Choose items from the menu to start this order.
                </p>
              )}
              {items.map((item) => (
                <div key={item.lineId}>
                  <span>
                    <strong>{item.name}</strong>
                    {item.modifiers.map((modifier) => (
                      <small key={modifier.optionId}>{modifier.name}</small>
                    ))}
                    <small>{money(item.priceCents * item.quantity)}</small>
                  </span>
                  <div className="preview-quantity">
                    <button
                      type="button"
                      aria-label={`Decrease ${item.name}`}
                      onClick={() =>
                        setItems((current) =>
                          current
                            .map((row) =>
                              row.lineId === item.lineId
                                ? { ...row, quantity: row.quantity - 1 }
                                : row,
                            )
                            .filter((row) => row.quantity > 0),
                        )
                      }
                    >
                      <Minus size={13} />
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      type="button"
                      aria-label={`Increase ${item.name}`}
                      onClick={() =>
                        add(
                          workspace.modules.products.find(
                            (product) => product._id === item.productId,
                          ),
                          item.modifiers,
                        )
                      }
                    >
                      <Plus size={13} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${item.name}`}
                      onClick={() =>
                        setItems((current) =>
                          current.filter((row) => row.lineId !== item.lineId),
                        )
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <Field label="Voucher">
              <select
                value={voucher}
                onChange={(event) => setVoucher(event.target.value)}
              >
                <option value="">No voucher</option>
                {workspace.modules.vouchers
                  .filter(
                    (row) =>
                      row.Status === "Active" &&
                      row.Type !== "Free item" &&
                      (!row.Starts || row.Starts <= dateKey(Date.now())) &&
                      (!row.Ends || row.Ends >= dateKey(Date.now())),
                  )
                  .map((row) => (
                    <option key={row._id} value={row.Code}>
                      {row.Code} · {row.Value}
                    </option>
                  ))}
              </select>
            </Field>
            <dl className="preview-order-totals">
              {[
                ["Subtotal", subtotal],
                ["Discount", -discount],
                [`Tax (${workspace.settings.taxRate}%)`, tax],
                [`Service (${workspace.settings.serviceRate}%)`, service],
                ["Total", subtotal - discount + tax + service],
              ].map(([label, cents]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{money(cents)}</dd>
                </div>
              ))}
            </dl>
            {error && (
              <p className="preview-inline-error" role="alert">
                {error}
              </p>
            )}
          </section>
        </div>
      </form>
    </Modal>
  );
}

function ModifierPicker({ product, onClose, onAdd }) {
  const [choices, setChoices] = useState([]);
  const [error, setError] = useState("");
  const resolved = resolveOrderLine(product, choices);
  const select = (group, option, checked) => {
    setError("");
    setChoices((current) =>
      group.max === 1
        ? [
            ...current.filter((choice) => choice.groupId !== group.id),
            ...(checked ? [{ groupId: group.id, optionId: option.id }] : []),
          ]
        : checked
          ? [...current, { groupId: group.id, optionId: option.id }]
          : current.filter((choice) => choice.optionId !== option.id),
    );
  };
  return (
    <Modal
      title={`Customize ${product.Product}`}
      description="Choose the required options before adding this item."
      onClose={onClose}
      footer={
        <>
          <span className="preview-dialog-total">
            {resolved.priceCents ? money(resolved.priceCents) : product.Price}
          </span>
          <Button variant="secondary" onClick={onClose}>
            Back
          </Button>
          <Button
            onClick={() => {
              if (resolved.error) {
                setError(resolved.error);
                return;
              }
              onAdd(choices);
            }}
          >
            Add to order
          </Button>
        </>
      }
    >
      <div className="preview-form">
        {product._modifiers.map((group) => (
          <fieldset key={group.id} className="preview-permission-group">
            <legend>
              {group.name} · {group.required ? "Required" : "Optional"} · up to{" "}
              {group.max}
            </legend>
            {group.options.map((option) => (
              <label className="preview-modifier-choice" key={option.id}>
                <input
                  type={group.max === 1 ? "radio" : "checkbox"}
                  name={group.id}
                  checked={choices.some(
                    (choice) => choice.optionId === option.id,
                  )}
                  onChange={(event) =>
                    select(group, option, event.target.checked)
                  }
                />
                <span>{option.name}</span>
                <strong>
                  {option.priceCents
                    ? "+" + money(option.priceCents)
                    : "Included"}
                </strong>
              </label>
            ))}
          </fieldset>
        ))}
        {error && (
          <p className="preview-inline-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
