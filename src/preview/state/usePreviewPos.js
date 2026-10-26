import { useState, useSyncExternalStore } from "react";
import { createMockPosService } from "../services/mockPosService.js";

export function usePreviewPos(adapter) {
  const [service] = useState(() => adapter || createMockPosService());
  const data = useSyncExternalStore(service.subscribe, service.getSnapshot);
  const [screen, setScreen] = useState("welcome");
  const [orderId, setOrderId] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [customization, setCustomization] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [paymentBack, setPaymentBack] = useState("detail");
  const order = data.orders.find((entry) => entry.id === orderId) || null;

  const go = (next) => {
    setError("");
    setNotice("");
    setCartOpen(false);
    setScreen(next);
  };
  const run = async (operation, onSuccess) => {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      const result = await operation();
      onSuccess?.(result);
      return true;
    } catch (failure) {
      setError(failure.message || "Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const openOrder = (id) => {
    setOrderId(id);
    go("detail");
  };
  const startOrder = () =>
    run(
      async () => {
        if (order?.status === "DRAFT") await service.discardDraft(order.id);
      },
      () => {
        setOrderId(null);
        go("selection");
      },
    );
  const chooseContext = (mode, tableId) =>
    run(
      () => service.openOrder(mode, tableId),
      (result) => {
        setOrderId(result.id);
        go(result.existing ? "detail" : "menu");
      },
    );
  const beginPayment = (split = false) => {
    setPaymentBack(
      screen === "review"
        ? "review"
        : screen === "status"
          ? "status"
          : "detail",
    );
    go(split ? "split" : "payment");
  };
  return {
    service,
    data,
    screen,
    order,
    orderId,
    error,
    busy,
    notice,
    customization,
    cartOpen,
    paymentBack,
    go,
    run,
    openOrder,
    startOrder,
    chooseContext,
    beginPayment,
    setError,
    setNotice,
    setCustomization,
    setCartOpen,
    tableLabel: (entry) =>
      entry?.diningMode === "takeaway"
        ? "Takeaway"
        : `Table ${data.tables.find((table) => table.id === entry?.tableId)?.tableNumber || "—"}`,
  };
}
