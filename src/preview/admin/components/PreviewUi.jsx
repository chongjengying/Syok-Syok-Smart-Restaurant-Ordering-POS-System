import { cloneElement, isValidElement, useEffect, useId, useRef } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  LoaderCircle,
  Search,
  X,
} from "lucide-react";

export function Button({
  children,
  variant = "primary",
  icon: Icon,
  className = "",
  type = "button",
  ...props
}) {
  return (
    <button
      type={type}
      className={`preview-button preview-button-${variant} ${className}`}
      {...props}
    >
      {Icon && <Icon size={16} aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children, className = "" }) {
  const id = useId();
  const control = isValidElement(children)
    ? cloneElement(children, {
        "aria-labelledby": id,
        "aria-describedby": error || hint ? `${id}-hint` : undefined,
        "aria-invalid": error ? true : undefined,
      })
    : children;
  return (
    <label className={`preview-field ${className}`}>
      <span id={id} className="preview-field-label">
        {label}
      </span>
      {control}
      {hint && !error && (
        <span id={`${id}-hint`} className="preview-hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-hint`} className="preview-error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

export function TextInput({ icon: Icon, className = "", ...props }) {
  return (
    <span className={`preview-input-wrap ${className}`}>
      {Icon && <Icon size={16} aria-hidden="true" />}
      <input {...props} />
    </span>
  );
}

export function Tag({ children, tone }) {
  const value = String(children || "").toLowerCase();
  const color =
    tone ||
    (/failed|rejected|cancelled|revoked|out of stock|action required|inactive|unavailable/.test(
      value,
    )
      ? "red"
      : /pending|preparing|low stock|reserved|unpaid|scheduled|setup|cleaning|paused/.test(
            value,
          )
        ? "amber"
        : /active|paid|accepted|completed|available|operational|enabled|issued|succeeded|in stock|ready|verified/.test(
              value,
            )
          ? "green"
          : "neutral");
  return (
    <span className={`preview-tag preview-tag-${color}`}>
      <span className="preview-tag-dot" />
      {children}
    </span>
  );
}

export function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  wide = false,
  drawer = false,
}) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  const id = useId();
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const items = () =>
      [
        ...(dialogRef.current?.querySelectorAll(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
        ) || []),
      ].filter((element) => element.getClientRects().length);
    const target =
      dialogRef.current?.querySelector("[autofocus]") ||
      items()[0] ||
      dialogRef.current;
    target?.focus();
    const handle = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current?.();
      }
      if (event.key !== "Tab") return;
      const controls = items();
      if (!controls.length) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && document.activeElement === controls[0]) {
        event.preventDefault();
        controls.at(-1).focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === controls.at(-1)
      ) {
        event.preventDefault();
        controls[0].focus();
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handle);
      if (previous?.isConnected) previous.focus?.();
    };
  }, []);
  return (
    <div
      className={`preview-modal-backdrop ${drawer ? "preview-drawer-backdrop" : ""}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeRef.current?.();
      }}
    >
      <section
        ref={dialogRef}
        className={`preview-modal ${wide ? "preview-modal-wide" : ""} ${drawer ? "preview-detail-drawer" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
      >
        <header className="preview-modal-header">
          <div>
            <h2 id={id}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            type="button"
            className="preview-icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div className="preview-modal-body">{children}</div>
        {footer && <footer className="preview-modal-footer">{footer}</footer>}
      </section>
    </div>
  );
}

export function EmptyState({
  title = "Nothing here yet",
  description = "Create your first record to get started.",
  onReset,
  action = "Clear filters",
}) {
  return (
    <div className="preview-empty">
      <span className="preview-empty-icon">
        <Search size={24} />
      </span>
      <strong>{title}</strong>
      <span>{description}</span>
      {onReset && (
        <Button variant="secondary" onClick={onReset}>
          {action}
        </Button>
      )}
    </div>
  );
}

export function ScreenState({ state, onReset }) {
  if (state === "loading")
    return (
      <div
        className="preview-skeleton-panel"
        role="status"
        aria-label="Loading screen"
      >
        <span className="preview-spinner" />
        <div className="preview-skeleton-grid">
          {Array.from({ length: 8 }, (_, index) => (
            <span key={index} />
          ))}
        </div>
      </div>
    );
  if (state === "error" || state === "offline" || state === "access-denied")
    return (
      <div className="preview-state-card preview-state-error" role="alert">
        <CircleAlert size={24} />
        <div>
          <strong>
            {state === "offline"
              ? "You’re offline"
              : state === "access-denied"
                ? "This page requires additional access"
                : "We couldn’t load this page"}
          </strong>
          <p>
            {state === "access-denied"
              ? "Ask your company owner to review your role and branch access."
              : "Your changes are safe. Try again to return to the sample workspace."}
          </p>
        </div>
        <Button variant="secondary" onClick={onReset}>
          Try again
        </Button>
      </div>
    );
  if (state === "empty")
    return (
      <div className="preview-card">
        <EmptyState
          title="Your workspace is ready for its first record"
          description="Use the page’s create action, or restore the sample data to explore this screen."
          onReset={onReset}
          action="Restore sample view"
        />
      </div>
    );
  return null;
}

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon = CheckCircle2,
  tone = "green",
  children,
}) {
  return (
    <article className="preview-stat-card">
      <span className="preview-stat-label">{label}</span>
      <span className="preview-stat-icon">
        <Icon size={17} />
      </span>
      <strong>{value}</strong>
      {children || (
        <small className={`preview-metric-hint tone-${tone}`}>{hint}</small>
      )}
    </article>
  );
}

export function DataTable({
  columns,
  rows,
  sort,
  onSort,
  renderCell,
  actions,
  empty,
  busy = false,
}) {
  return (
    <div
      className="preview-table-wrap"
      tabIndex={0}
      aria-label="Scrollable records"
    >
      <table className="preview-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                scope="col"
                aria-sort={
                  sort?.key === column
                    ? sort.direction === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
                }
              >
                {onSort ? (
                  <button
                    type="button"
                    className="preview-sort-heading"
                    onClick={() => onSort(column)}
                  >
                    {column}
                    {sort?.key === column ? (
                      sort.direction === "asc" ? (
                        <ArrowUp size={12} />
                      ) : (
                        <ArrowDown size={12} />
                      )
                    ) : null}
                  </button>
                ) : (
                  column
                )}
              </th>
            ))}
            {actions && (
              <th scope="col" className="preview-actions-heading">
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {busy ? (
            <tr>
              <td colSpan={columns.length + Number(Boolean(actions))}>
                <LoaderCircle className="preview-spin" size={20} /> Loading
                records…
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={row._id || row.id || index}>
                {columns.map((column) => (
                  <td key={column}>
                    {renderCell ? (
                      renderCell(row, column)
                    ) : /status|validation|visibility|result/i.test(column) ? (
                      <Tag>{row[column]}</Tag>
                    ) : (
                      (row[column] ?? "—")
                    )}
                  </td>
                ))}
                {actions && (
                  <td>
                    <div className="preview-row-actions">{actions(row)}</div>
                  </td>
                )}
              </tr>
            ))
          )}
          {!busy && !rows.length && (
            <tr>
              <td
                colSpan={columns.length + Number(Boolean(actions))}
                className="preview-empty-cell"
              >
                {empty || "No records match your filters."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, count, pageSize, onChange, onSize }) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  return (
    <div className="preview-table-footer">
      <span>
        {count
          ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, count)}`
          : "0"}{" "}
        of {count} records
      </span>
      <div className="preview-pagination">
        {onSize && (
          <select
            aria-label="Records per page"
            value={pageSize}
            onChange={(event) => onSize(Number(event.target.value))}
          >
            {[5, 10, 25].map((size) => (
              <option key={size} value={size}>
                {size} per page
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <span>
          {page} / {pages}
        </span>
        <button
          type="button"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
