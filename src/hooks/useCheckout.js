import { useCallback, useEffect, useRef, useState } from 'react';
import { cancelOrder, createOrder, createOrderDraft, getOrder, saveOrderDraftItems, saveTakeawayPackaging, submitOrder } from '../services/order.service';
import { processPayment } from '../services/payment.service';

const pendingOrderKey = 'pos.pendingOrderId';
const activeOrderKey = 'pos.activeOrderId';
const activeStatuses = new Set(['DRAFT', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED']);

function activeOrderView(order, tableLabel = '') {
  return {
    id: order.id,
    orderId: order.order_number || order.orderNumber,
    status: order.status,
    paymentStatus: order.payment_status || order.paymentStatus,
    diningMode: order.dining_mode || order.diningMode,
    tableId: order.restaurant_table_id || order.table?.id || null,
    selectedTable: order.restaurant_tables?.table_number || order.table?.tableNumber || tableLabel,
    createdAt: order.created_at || order.createdAt,
    total: Number(order.total || 0),
  };
}

function pendingOrderView(order) {
  return {
    id: order.id,
    order_number: order.order_number || order.orderNumber,
    status: order.status,
    payment_status: order.payment_status || order.paymentStatus,
    dining_mode: order.dining_mode || order.diningMode,
    payment_id: order.payment_id || order.paymentId,
    total: Number(order.total || 0),
    created_at: order.created_at || order.createdAt,
  };
}

function draftCartView(order) {
  return (order.items || []).filter((item) => item.itemStatus === 'DRAFT').map((item) => ({
    dish: {
      id: item.productId, name: item.name, price: item.unitPrice,
      description: '', optionGroups: [], isActive: true, isAvailable: true,
    },
    selectedOptions: item.options.map((option) => ({
      id: option.id, name: option.name, priceAdjustment: option.priceAdjustment,
      groupId: option.groupName, groupName: option.groupName, selectionType: 'MULTIPLE',
    })),
    portion: null,
    selectedAddOns: item.options.map((option) => ({ ...option, groupId: option.groupName, selectionType: 'MULTIPLE', price: option.priceAdjustment })),
    specialRequest: item.specialRequest,
    quantity: item.quantity,
    serviceMode: item.serviceMode,
    finalPrice: item.unitPrice,
  }));
}

export function useCheckout({ enabled, cart, diningMode, tableId, tableLabel }) {
  const [pendingOrder, setPendingOrder] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [draftCart, setDraftCart] = useState([]);
  const [orderHistory, setOrderHistory] = useState([]);
  const [isRestoring, setIsRestoring] = useState(Boolean(enabled));
  const requestKey = useRef(null);
  const paymentRequest = useRef(null);
  const draftSaveQueue = useRef(Promise.resolve({ data: null, error: null }));

  const applyPersistedOrder = useCallback((order, fallbackTableLabel = '') => {
    const activeView = activeOrderView(order, fallbackTableLabel);
    setDraftCart(draftCartView(order));
    setOrderHistory((order.items || []).filter((item) => item.itemStatus !== 'DRAFT'));
    setActiveOrder(activeView);
    sessionStorage.setItem(activeOrderKey, order.id);
    if ((order.paymentStatus || order.payment_status) === 'UNPAID') {
      const pendingView = pendingOrderView(order);
      setPendingOrder(pendingView);
      sessionStorage.setItem(pendingOrderKey, order.id);
    } else {
      setPendingOrder(null);
      sessionStorage.removeItem(pendingOrderKey);
    }
    return activeView;
  }, []);

  useEffect(() => {
    if (!enabled) {
      setPendingOrder(null);
      setActiveOrder(null);
      setDraftCart([]);
      setOrderHistory([]);
      setIsRestoring(false);
      requestKey.current = null;
      return undefined;
    }

    let active = true;
    const restore = async () => {
      setIsRestoring(true);
      const storedOrderId = sessionStorage.getItem(activeOrderKey) || sessionStorage.getItem(pendingOrderKey);
      if (!storedOrderId) {
        if (active) setIsRestoring(false);
        return;
      }
      const result = await getOrder(storedOrderId);
      if (!active) return;
      if (result.error || result.data.status === 'CANCELLED') {
        sessionStorage.removeItem(activeOrderKey);
        sessionStorage.removeItem(pendingOrderKey);
      } else {
        applyPersistedOrder(result.data);
      }
      setIsRestoring(false);
    };
    void restore();
    return () => { active = false; };
  }, [applyPersistedOrder, enabled]);

  const beginCheckout = useCallback(() => {
    if (!requestKey.current) requestKey.current = crypto.randomUUID();
  }, []);

  const startNewOrderContext = useCallback(() => {
    setPendingOrder(null);
    setActiveOrder(null);
    setDraftCart([]);
    setOrderHistory([]);
    requestKey.current = null;
    sessionStorage.removeItem(pendingOrderKey);
    sessionStorage.removeItem(activeOrderKey);
  }, []);

  const createDraftContext = useCallback(async (mode, selectedTableId, fallbackTableLabel = '') => {
    const localDraft = {
      id: null,
      orderId: 'NEW',
      status: 'LOCAL_DRAFT',
      paymentStatus: null,
      diningMode: mode,
      tableId: mode === 'dine-in' ? selectedTableId : null,
      selectedTable: fallbackTableLabel,
      createdAt: new Date().toISOString(),
      isLocalDraft: true,
    };
    setPendingOrder(null);
    setActiveOrder(localDraft);
    setDraftCart([]);
    setOrderHistory([]);
    requestKey.current = null;
    sessionStorage.removeItem(pendingOrderKey);
    sessionStorage.removeItem(activeOrderKey);
    return { data: localDraft, error: null };
  }, []);

  const saveDraftCart = useCallback(async (nextCart) => {
    if (activeOrder?.isLocalDraft) {
      setDraftCart(nextCart);
      return { data: { items: nextCart }, error: null };
    }
    if (!activeOrder?.id) return { data: null, error: new Error('Create an order context before adding products.') };
    const orderId = activeOrder.id;
    const operation = draftSaveQueue.current.catch(() => null).then(async () => {
      const result = await saveOrderDraftItems(orderId, nextCart);
      if (result.error) return result;
      const persisted = await getOrder(orderId);
      if (persisted.error) return persisted;
      applyPersistedOrder(persisted.data, tableLabel);
      return { data: persisted.data, error: null };
    });
    draftSaveQueue.current = operation;
    return operation;
  }, [activeOrder?.id, activeOrder?.isLocalDraft, applyPersistedOrder, tableLabel]);

  const openExistingOrder = useCallback(async (orderId, fallbackTableLabel = '') => {
    const result = await getOrder(orderId);
    if (result.error) return result;
    const activeUnpaidOrder = activeStatuses.has(result.data.status)
      && ['UNPAID', 'PARTIALLY_PAID'].includes(result.data.paymentStatus);
    const paidKitchenOrder = result.data.status === 'COMPLETED'
      && result.data.paymentStatus === 'PAID'
      && result.data.items.some((item) => ['SUBMITTED', 'PREPARING', 'READY'].includes(item.itemStatus));
    if (!activeUnpaidOrder && !paidKitchenOrder) {
      return { data: null, error: new Error('This table no longer has an active order.') };
    }
    requestKey.current = null;
    return { data: applyPersistedOrder(result.data, fallbackTableLabel), error: null };
  }, [applyPersistedOrder]);

  const sendOrder = useCallback(async () => {
    if (!requestKey.current) requestKey.current = crypto.randomUUID();
    if (activeOrder?.isLocalDraft) {
      const input = {
        cart,
        paymentMethod: 'CASH',
        diningMode,
        tableId: diningMode === 'dine-in' ? tableId : null,
        idempotencyKey: requestKey.current,
      };
      let created = await createOrder(input);
      // A transport timeout can happen after commit; the same key safely
      // returns the already-created order instead of inserting a duplicate.
      if (created.error?.retryable) created = await createOrder(input);
      if (created.error) return created;
      const persisted = await getOrder(created.data.id);
      if (persisted.error) return persisted;
      requestKey.current = null;
      return { data: applyPersistedOrder(persisted.data, tableLabel), error: null };
    }
    if (!activeOrder?.id) return { data: null, error: new Error('No active order context.') };
    await draftSaveQueue.current;
    const saved = await saveOrderDraftItems(activeOrder.id, cart);
    if (saved.error) return saved;
    const result = await submitOrder(activeOrder.id, requestKey.current);
    if (result.error) {
      const reconciled = await getOrder(activeOrder.id);
      const stillHasDrafts = reconciled.data?.items?.some((item) => item.itemStatus === 'DRAFT');
      if (reconciled.error || stillHasDrafts || reconciled.data?.status === 'DRAFT') return result;
      requestKey.current = null;
      return { data: applyPersistedOrder(reconciled.data, tableLabel), error: null };
    }

    const persisted = await getOrder(result.data.id);
    if (persisted.error) return persisted;
    requestKey.current = null;
    return { data: applyPersistedOrder(persisted.data, tableLabel), error: null };
  }, [activeOrder, applyPersistedOrder, cart, diningMode, tableId, tableLabel]);

  const prepareTakeawayPayment = useCallback(async (packaging = []) => {
    if (diningMode !== 'takeaway') return { data: null, error: new Error('Only takeaway orders use pay before submit.') };
    if (!cart.length) return { data: null, error: new Error('Add at least one product before payment.') };
    if (!requestKey.current) requestKey.current = crypto.randomUUID();
    let orderId = activeOrder?.id || null;
    if (activeOrder?.isLocalDraft || !orderId) {
      const draft = await createOrderDraft('takeaway', null, requestKey.current);
      if (draft.error) return draft;
      orderId = draft.data.id;
    }
    const saved = await saveOrderDraftItems(orderId, cart);
    if (saved.error) return saved;
    const packagingResult = await saveTakeawayPackaging(orderId, packaging);
    if (packagingResult.error) return packagingResult;
    const persisted = await getOrder(orderId);
    if (persisted.error) return persisted;
    return { data: applyPersistedOrder(persisted.data), error: null };
  }, [activeOrder?.id, activeOrder?.isLocalDraft, applyPersistedOrder, cart, diningMode]);

  const cancelPendingCheckout = useCallback(async () => ({ data: null, error: null }), []);

  const discardDraft = useCallback(async () => {
    if (activeOrder?.isLocalDraft) return { data: null, error: null };
    if (activeOrder?.status !== 'DRAFT') return { data: null, error: null };
    return cancelOrder(activeOrder.id, 'Draft discarded before submission');
  }, [activeOrder]);

  const submitPayment = useCallback(async ({ paymentMethod, finalAmount, receivedAmount, submitTakeaway = false }) => {
    if (!pendingOrder?.id) {
      return { data: null, error: new Error('No unpaid order is available for payment.') };
    }
    const authoritativeAmount = Number.isFinite(finalAmount) ? Number(finalAmount) : Number(pendingOrder.total);
    const signature = `${pendingOrder.id}|${paymentMethod}|${authoritativeAmount}`;
    if (paymentRequest.current?.signature !== signature) {
      paymentRequest.current = { signature, idempotencyKey: crypto.randomUUID() };
    }
    const paymentResult = await processPayment(
      pendingOrder.id,
      paymentMethod,
      authoritativeAmount,
      paymentRequest.current.idempotencyKey,
      receivedAmount,
      submitTakeaway,
    );
    if (paymentResult.error) {
      const reconciled = await getOrder(pendingOrder.id);
      if (reconciled.error || reconciled.data?.paymentStatus !== 'PAID' || !paymentResult.error.retryable) return paymentResult;
      applyPersistedOrder(reconciled.data, tableLabel);
      return { data: reconciled.data, error: null };
    }

    const persistedResult = await getOrder(pendingOrder.id);
    if (persistedResult.error) return persistedResult;
    if (persistedResult.data.paymentStatus !== 'PAID') {
      return { data: null, error: new Error('Payment was not confirmed by the backend.') };
    }
    applyPersistedOrder(persistedResult.data, tableLabel);
    paymentRequest.current = null;
    return { data: persistedResult.data, error: null };
  }, [applyPersistedOrder, pendingOrder, tableLabel]);

  const resetCheckout = useCallback(() => {
    setPendingOrder(null);
    setActiveOrder(null);
    setDraftCart([]);
    setOrderHistory([]);
    requestKey.current = null;
    sessionStorage.removeItem(pendingOrderKey);
    sessionStorage.removeItem(activeOrderKey);
  }, []);

  return {
    activeOrder,
    draftCart,
    orderHistory,
    pendingOrder,
    authoritativeTotal: pendingOrder ? Number(pendingOrder.total || 0) : null,
    isRestoring,
    beginCheckout,
    cancelPendingCheckout,
    createDraftContext,
    discardDraft,
    openExistingOrder,
    sendOrder,
    prepareTakeawayPayment,
    saveDraftCart,
    startNewOrderContext,
    submitPayment,
    resetCheckout,
  };
}
