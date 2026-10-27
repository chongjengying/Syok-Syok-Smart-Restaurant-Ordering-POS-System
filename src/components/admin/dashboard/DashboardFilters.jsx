import React, { useState } from "react";
import { CalendarDays, Filter, X } from "lucide-react";

const presets = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["last7days", "Last 7 days"],
  ["month", "This month"],
  ["custom", "Custom"],
];

export default function DashboardFilters({ state, data, showBranch = true }) {
  const [expanded, setExpanded] = useState(false);
  const { filters, setFilter, setPreset } = state;
  const options = data?.filterOptions || {};
  const keys = [
    "diningMode",
    "paymentMethod",
    "paymentProviderId",
    "staffId",
    ...(showBranch ? ["branchId"] : []),
  ];
  const activeCount = keys.filter((key) => filters[key]).length;
  return (
    <section
      className="admin-surface admin-dashboard-filters"
      aria-label="Dashboard filters"
    >
      <div className="admin-period-filters">
        <span>
          <CalendarDays size={15} aria-hidden="true" />
          Period
        </span>
        {presets.map(([id, label]) => (
          <button
            type="button"
            aria-pressed={filters.preset === id}
            key={id}
            onClick={() => setPreset(id)}
            className={`admin-filter-preset ${filters.preset === id ? "is-active" : ""}`}
          >
            {label}
          </button>
        ))}
        {filters.preset === "custom" && (
          <div className="admin-custom-dates">
            <input
              aria-label="From date"
              type="date"
              value={filters.dateFrom}
              max={filters.dateTo}
              onChange={(event) => setFilter("dateFrom", event.target.value)}
            />
            <span>to</span>
            <input
              aria-label="To date"
              type="date"
              value={filters.dateTo}
              min={filters.dateFrom}
              onChange={(event) => setFilter("dateTo", event.target.value)}
            />
          </div>
        )}
        <button
          type="button"
          className="admin-button admin-button-secondary admin-more-filters"
          aria-expanded={expanded}
          aria-controls="admin-dashboard-advanced-filters"
          onClick={() => setExpanded(!expanded)}
        >
          <Filter size={14} />
          Filters{activeCount ? ` (${activeCount})` : ""}
        </button>
      </div>
      {expanded && (
        <div
          id="admin-dashboard-advanced-filters"
          className="admin-advanced-filters"
        >
          {showBranch && (
            <select
              aria-label="Branch"
              value={filters.branchId}
              onChange={(event) => setFilter("branchId", event.target.value)}
            >
              <option value="">All branches</option>
              {(options.branches || []).map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          )}
          <select
            aria-label="Order type"
            value={filters.diningMode}
            onChange={(event) => setFilter("diningMode", event.target.value)}
          >
            <option value="">All order types</option>
            <option value="dine-in">Dine-in</option>
            <option value="takeaway">Takeaway</option>
          </select>
          <select
            aria-label="Payment method"
            value={filters.paymentMethod}
            onChange={(event) => setFilter("paymentMethod", event.target.value)}
          >
            <option value="">All payment methods</option>
            {["CASH", "QR", "CARD", "EWALLET"].map((method) => (
              <option key={method}>{method}</option>
            ))}
          </select>
          <select
            aria-label="Payment provider"
            value={filters.paymentProviderId}
            onChange={(event) =>
              setFilter("paymentProviderId", event.target.value)
            }
          >
            <option value="">All providers</option>
            {(options.paymentProviders || []).map((provider) => (
              <option key={provider.providerId} value={provider.providerId}>
                {provider.displayName}
              </option>
            ))}
          </select>
          {data?.access?.staffPerformance && (
            <select
              aria-label="Staff"
              value={filters.staffId}
              onChange={(event) => setFilter("staffId", event.target.value)}
            >
              <option value="">All staff</option>
              {(options.staff || []).map((staff) => (
                <option key={staff.id} value={staff.id}>
                  {staff.name} · {staff.role}
                </option>
              ))}
            </select>
          )}
          {activeCount > 0 && (
            <button
              type="button"
              className="admin-text-link"
              onClick={() => keys.forEach((key) => setFilter(key, ""))}
            >
              <X size={14} />
              Clear filters
            </button>
          )}
        </div>
      )}
    </section>
  );
}
