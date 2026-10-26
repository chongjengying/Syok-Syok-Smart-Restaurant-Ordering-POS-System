import { useEffect, useId, useRef } from "react";
import { ArrowLeft, X, Minus, Plus, Search, Check } from "lucide-react";
import { label } from "../services/previewFormat.js";
export function Badge({ status, children }) {
  return (
    <span className={`pv-badge pv-status-${String(status).toLowerCase()}`}>
      <i />
      {children || label(status)}
    </span>
  );
}
export function Button({
  children,
  variant = "primary",
  icon: Icon,
  className = "",
  ...props
}) {
  return (
    <button
      className={`pv-button pv-button-${variant} ${className}`}
      {...props}
    >
      {Icon && <Icon size={18} />} {children}
    </button>
  );
}
export function IconButton({ label: text, children, ...props }) {
  return (
    <button
      className="pv-icon-button"
      aria-label={text}
      title={text}
      {...props}
    >
      {children}
    </button>
  );
}
export function PageTitle({ eyebrow, title, description, action, onBack }) {
  return (
    <div className="pv-page-title">
      <div className="pv-title-group">
        {onBack && (
          <IconButton label="Back" onClick={onBack}>
            <ArrowLeft size={20} />
          </IconButton>
        )}
        <div>
          {eyebrow && <p className="pv-eyebrow">{eyebrow}</p>}
          <h1 tabIndex={-1}>{title}</h1>
          {description && <p className="pv-description">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
export function SearchField({
  value,
  onChange,
  placeholder = "Search menu items…",
  label: text = "Search menu",
}) {
  return (
    <label className="pv-search">
      <Search size={19} />
      <input
        type="search"
        aria-label={text}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <button aria-label="Clear search" onClick={() => onChange("")}>
          <X size={16} />
        </button>
      )}
    </label>
  );
}
export function Quantity({ value, onChange, name, max = 99, min = 0 }) {
  return (
    <div className="pv-quantity">
      <button
        aria-label={`Decrease ${name}`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        <Minus size={15} />
      </button>
      <span aria-label={`${name} quantity`}>{value}</span>
      <button
        aria-label={`Increase ${name}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus size={15} />
      </button>
    </div>
  );
}
export function EmptyState({ icon: Icon, title, description, children }) {
  return (
    <div className="pv-empty">
      {Icon && (
        <span className="pv-empty-icon">
          <Icon size={30} strokeWidth={1.5} />
        </span>
      )}
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function CheckField({ checked, onChange, children }) {
  return (
    <label className="pv-check-field">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="pv-check-mark">{checked && <Check size={14} />}</span>
      <span>{children}</span>
    </label>
  );
}
export function Modal({ title, children, onClose, wide = false }) {
  const titleId = useId();
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    const focusable = () =>
      [
        ...dialog.querySelectorAll(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ),
      ].filter((element) => element.getClientRects().length);
    focusable()[0]?.focus();
    const keydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key === "Tab") {
        const elements = focusable();
        const first = elements[0],
          last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    dialog.addEventListener("keydown", keydown);
    return () => {
      dialog.removeEventListener("keydown", keydown);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div
      className="pv-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`pv-modal ${wide ? "pv-modal-wide" : ""}`}
      >
        <header>
          <div>
            <p className="pv-eyebrow">SYOK SYOK · PREVIEW</p>
            <h2 id={titleId}>{title}</h2>
          </div>
          <IconButton label="Close dialog" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </header>
        {children}
      </section>
    </div>
  );
}
