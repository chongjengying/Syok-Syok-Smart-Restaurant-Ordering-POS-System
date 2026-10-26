import { useEffect } from "react";
import {
  UtensilsCrossed,
  LayoutDashboard,
  Grid2X2,
  ReceiptText,
  ChefHat,
  BellRing,
  Banknote,
  BarChart3,
  ChevronDown,
  MapPin,
  FlaskConical,
  Check,
  X,
} from "lucide-react";
import { usePreviewPos } from "./state/usePreviewPos.js";
import { IconButton } from "./components/ui.jsx";
import ProductDialog from "./components/ProductDialog.jsx";
import {
  WelcomeScreen,
  MenuScreen,
  CartScreen,
  DetailScreen,
} from "./screens/OrderingScreens.jsx";
import TableScreen from "./screens/TableScreens.jsx";
import PaymentScreen, { ReceiptScreen } from "./screens/PaymentScreen.jsx";
import {
  OrdersScreen,
  KitchenScreen,
  ShiftScreen,
} from "./screens/OperationsScreens.jsx";
import ReportsScreen from "./screens/ReportsScreen.jsx";
import "./styles/preview.css";

const navigation = [
  ["welcome", "Overview", LayoutDashboard],
  ["selection", "New order", Grid2X2],
  ["tables", "Tables", UtensilsCrossed],
  ["orders", "Orders", ReceiptText],
  ["kitchen", "Kitchen", ChefHat],
  ["serve", "To serve", BellRing],
  ["shift", "Cash shift", Banknote],
  ["reports", "Reports", BarChart3],
];
const orderScreens = new Set(["selection", "menu", "cart", "review", "status"]);

export default function PreviewApp({ adapter }) {
  const pos = usePreviewPos(adapter);
  const { notice, setNotice } = pos;
  useEffect(() => {
    const title = document.title;
    document.title = "Syok Syok · POS Design Preview";
    return () => {
      document.title = title;
    };
  }, []);
  useEffect(() => {
    const heading = document.querySelector(".pos-preview main h1");
    heading?.focus({ preventScroll: true });
    document.querySelector(".pv-content")?.scrollTo(0, 0);
  }, [pos.screen]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timeout);
  }, [notice, setNotice]);
  let content;
  if (pos.screen === "welcome") content = <WelcomeScreen pos={pos} />;
  else if (pos.screen === "selection")
    content = <TableScreen key="selection" pos={pos} />;
  else if (pos.screen === "tables")
    content = <TableScreen key="management" pos={pos} management />;
  else if (pos.screen === "orders") content = <OrdersScreen pos={pos} />;
  else if (pos.screen === "kitchen") content = <KitchenScreen pos={pos} />;
  else if (pos.screen === "serve")
    content = <KitchenScreen pos={pos} serving />;
  else if (pos.screen === "shift") content = <ShiftScreen pos={pos} />;
  else if (pos.screen === "reports") content = <ReportsScreen pos={pos} />;
  else if (!pos.order) content = <WelcomeScreen pos={pos} />;
  else if (pos.screen === "menu") content = <MenuScreen pos={pos} />;
  else if (pos.screen === "cart") content = <CartScreen pos={pos} />;
  else if (pos.screen === "review")
    content = <CartScreen pos={pos} finalReview />;
  else if (pos.screen === "detail" || pos.screen === "status")
    content = <DetailScreen pos={pos} statusView={pos.screen === "status"} />;
  else if (pos.screen === "payment" || pos.screen === "split")
    content = (
      <PaymentScreen
        key={pos.orderId + pos.screen}
        pos={pos}
        split={pos.screen === "split"}
      />
    );
  else if (pos.screen === "receipt") content = <ReceiptScreen pos={pos} />;
  return (
    <div className="pos-preview">
      <a href="#pv-main" className="pv-skip">
        Skip to content
      </a>
      <aside className="pv-sidebar">
        <a
          className="pv-brand-icon"
          href="/pos/preview"
          aria-label="Syok Syok preview home"
        >
          <UtensilsCrossed size={26} strokeWidth={2.2} />
        </a>
        <nav aria-label="POS preview navigation">
          {navigation.map(([screen, name, Icon]) => {
            const current =
              screen === "selection"
                ? orderScreens.has(pos.screen)
                : screen === "orders"
                  ? [
                      "orders",
                      "detail",
                      "payment",
                      "split",
                      "receipt",
                    ].includes(pos.screen)
                  : screen === pos.screen;
            return (
              <button
                key={screen}
                aria-label={name}
                aria-current={current ? "page" : undefined}
                onClick={() =>
                  screen === "selection" ? pos.startOrder() : pos.go(screen)
                }
              >
                <Icon size={22} strokeWidth={current ? 2 : 1.65} />
                <span>{name}</span>
                {screen === "serve" &&
                  pos.data.orders.some((order) =>
                    order.batches.some((batch) => batch.status === "READY"),
                  ) && <i className="pv-nav-dot" />}
              </button>
            );
          })}
        </nav>
        <div className="pv-sidebar-bottom">
          <span className="pv-sidebar-mark">SS</span>
          <small>SYOK SYOK</small>
        </div>
      </aside>
      <div className="pv-workspace">
        <header className="pv-topbar">
          <div className="pv-wordmark">
            syok<span>syok.</span>
            <small>RESTAURANT POS</small>
          </div>
          <span className="pv-topbar-divider" />
          <div className="pv-location">
            <MapPin size={16} />
            <span>
              Main branch<small>Demo terminal 01</small>
            </span>
            <ChevronDown size={13} />
          </div>
          <span className="pv-preview-label">
            <FlaskConical size={13} /> Design preview
          </span>
          <time>
            {new Intl.DateTimeFormat("en-MY", {
              timeZone: "Asia/Kuala_Lumpur",
              day: "2-digit",
              month: "short",
              year: "numeric",
            }).format(new Date())}
          </time>
          <div className="pv-staff">
            <span>AM</span>
            <div>
              <strong>Alex Morgan</strong>
              <small>Demo manager</small>
            </div>
          </div>
        </header>
        <main id="pv-main" className="pv-content">
          {pos.error && !pos.customization && (
            <div className="pv-error-banner" role="alert">
              <span>{pos.error}</span>
              <IconButton
                label="Dismiss error"
                onClick={() => pos.setError("")}
              >
                <X size={17} />
              </IconButton>
            </div>
          )}
          {content}
        </main>
        <footer className="pv-statusbar">
          <span>
            <i />{" "}
            {pos.data.shift.status === "OPEN" ? "Shift open" : "Shift closed"}
            <b>·</b> Demo manager
          </span>
          <span>
            Mock data only <b>·</b> No live transactions
          </span>
          <span>
            SYOK SYOK POS <b>v. preview</b>
          </span>
        </footer>
      </div>
      {pos.customization && (
        <ProductDialog
          key={pos.customization.item?.id || pos.customization.dish.id}
          pos={pos}
          {...pos.customization}
        />
      )}
      {pos.notice && (
        <div className="pv-toast" role="status">
          <span>
            <Check size={17} />
          </span>
          {pos.notice}
          <IconButton
            label="Dismiss notification"
            onClick={() => pos.setNotice("")}
          >
            <X size={15} />
          </IconButton>
        </div>
      )}
    </div>
  );
}
