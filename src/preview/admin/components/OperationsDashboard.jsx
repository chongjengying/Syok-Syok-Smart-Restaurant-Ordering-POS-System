import {
  ArrowRight,
  Banknote,
  CalendarDays,
  ClipboardList,
  RefreshCw,
  ShoppingBasket,
} from "lucide-react";
import { usePreviewWorkspace } from "../hooks/usePreviewWorkspace";
import { financialSummary } from "../previewSelectors";
import { money } from "../previewMoney";
import { Button, EmptyState, MetricCard, Tag } from "./PreviewUi";

export default function OperationsDashboard({ navigate }) {
  const workspace = usePreviewWorkspace();
  const summary = financialSummary(workspace.modules, workspace.branch);
  const canSeeSales = workspace.canView("reports");
  const today = new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date());
  return (
    <div className="preview-stack preview-dashboard preview-minimal-dashboard">
      <div className="preview-page-heading">
        <div>
          <h1>Today's overview</h1>
          <p>A clear view of your restaurant's day.</p>
        </div>
        <div className="preview-heading-action">
          <span className="preview-context-date">
            <CalendarDays size={16} />
            {today}
          </span>
          <Button
            variant="secondary"
            icon={RefreshCw}
            onClick={() => workspace.refresh()}
          >
            Refresh
          </Button>
          <Button onClick={() => navigate("panel/reports")}>
            View reports
            <ArrowRight size={16} />
          </Button>
        </div>
      </div>
      <div className="preview-dashboard-metrics">
        <MetricCard
          label="Today's sales"
          value={canSeeSales ? money(summary.net) : "Restricted"}
          icon={Banknote}
          tone="neutral"
          hint={
            canSeeSales
              ? "Net receipts after refunds"
              : "Report access is required"
          }
        />
        <MetricCard
          label="Today's orders"
          value={summary.orders.length}
          icon={ClipboardList}
          tone="neutral"
          hint={`${summary.settledCount} settled · ${summary.orders.filter((row) => row.Payment === "Unpaid" && row.Status !== "Cancelled").length} unpaid · ${summary.orders.filter((row) => row.Status === "Cancelled").length} cancelled`}
        />
        <MetricCard
          label="Average order value"
          value={canSeeSales ? money(summary.aov) : "Restricted"}
          icon={ShoppingBasket}
          tone="neutral"
          hint={
            canSeeSales
              ? `Before refunds · ${summary.settledCount} settled orders`
              : "Report access is required"
          }
        />
      </div>
      <div className="preview-dashboard-columns">
        <section className="preview-card preview-flush-card">
          <header className="preview-panel-heading">
            <div>
              <h2>Recent orders</h2>
              <p>
                Latest orders from{" "}
                {workspace.branch === "All branches"
                  ? "all branches"
                  : workspace.branch}
              </p>
            </div>
            <button
              type="button"
              className="preview-text-link"
              onClick={() => navigate("panel/orders")}
            >
              View all orders
              <ArrowRight size={14} />
            </button>
          </header>
          {summary.orders.length ? (
            <div className="preview-table-wrap">
              <table className="preview-table preview-recent-table">
                <thead>
                  <tr>
                    {["Order", "Service", "Total", "Payment", "Status", ""].map(
                      (label) => (
                        <th scope="col" key={label}>
                          {label}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {summary.orders.slice(0, 5).map((order) => (
                    <tr key={order._id}>
                      <td>
                        <button
                          type="button"
                          className="preview-name-link"
                          onClick={() =>
                            navigate(`panel/orders?record=${order._id}`)
                          }
                        >
                          {order.Order}
                        </button>
                        <small>{order.Time}</small>
                      </td>
                      <td>
                        {order["Order type"]}
                        <small>
                          {order.Table !== "Takeaway"
                            ? order.Table
                            : "Counter order"}
                        </small>
                      </td>
                      <td className="preview-money">{order.Total}</td>
                      <td>
                        <Tag>{order.Payment}</Tag>
                      </td>
                      <td>
                        <Tag>{order.Status}</Tag>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="preview-icon-button"
                          aria-label={`View ${order.Order}`}
                          onClick={() =>
                            navigate(`panel/orders?record=${order._id}`)
                          }
                        >
                          <ArrowRight size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No orders today"
              description="Orders in this branch will appear here during service."
              onReset={() => navigate("panel/orders")}
              action="Open orders"
            />
          )}
          <div className="preview-dashboard-panel-note">
            Showing up to 5 recent orders
          </div>
        </section>
        <section className="preview-card preview-flush-card">
          <header className="preview-panel-heading">
            <div>
              <h2>Top-selling items</h2>
              <p>By quantity sold today</p>
            </div>
            <button
              type="button"
              className="preview-text-link"
              onClick={() => navigate("panel/products")}
            >
              View menu
              <ArrowRight size={14} />
            </button>
          </header>
          {!canSeeSales ? (
            <EmptyState
              title="Report access is required"
              description="Your sample role can view orders; sales analysis requires report permission."
            />
          ) : summary.topItems.length ? (
            <div className="preview-table-wrap">
              <table className="preview-table preview-selling-table">
                <thead>
                  <tr>
                    <th scope="col">Item</th>
                    <th scope="col">Sold</th>
                    <th scope="col">Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.topItems.slice(0, 5).map((item) => (
                    <tr key={item.productId}>
                      <td>
                        <button
                          type="button"
                          className="preview-name-link"
                          onClick={() =>
                            navigate(`panel/products?record=${item.productId}`)
                          }
                        >
                          {item.name}
                        </button>
                        <small>{item.category}</small>
                      </td>
                      <td>{item.quantity}</td>
                      <td className="preview-money">{money(item.sales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No settled item sales"
              description="Top items appear after the first sample payment."
            />
          )}
          <div className="preview-dashboard-panel-note">
            Historical receipt prices · before discounts and tax
          </div>
        </section>
      </div>
      <div className="preview-dashboard-footnote">
        <span>
          All amounts in MYR. Cancelled and unpaid orders are excluded from
          sales.
        </span>
        <span>
          Updated{" "}
          {workspace.lastUpdated.toLocaleTimeString("en-MY", {
            timeZone: "Asia/Kuala_Lumpur",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          MYT
        </span>
      </div>
    </div>
  );
}
