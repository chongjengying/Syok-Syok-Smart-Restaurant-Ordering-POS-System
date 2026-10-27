import { isOperatorMode } from '../infrastructure/supabase/client';
import { endOperatorSession, resolveTerminal } from '../services/terminal-context.service';
import { getCurrentCashierShift, resetPosDevice } from '../services/organization.service';
import { clearDeviceCredential } from '../infrastructure/supabase/deviceCredential';
import { shiftError } from '../shared/shiftPresentation';
import React, { lazy, Suspense, useState, useEffect, useMemo, useRef } from 'react';
import IpadShell from '../components/IpadShell';
import WelcomeScreen from '../components/WelcomeScreen';
import MenuHomeScreen from '../components/MenuHomeScreen';
import CustomizationModal from '../components/CustomizationModal';
import CartReviewScreen from '../components/CartReviewScreen';
import ReviewOrderScreen from '../components/ReviewOrderScreen';
import TableSelectionScreen from '../components/TableSelectionScreen';
import PaymentScreen from '../components/PaymentScreen';
import PaymentConfirmationScreen from '../components/PaymentConfirmationScreen';
import SplitBillScreen from '../components/SplitBillScreen';
import OrderDetailScreen from '../components/OrderDetailScreen';
import OrderStatusScreen from '../components/OrderStatusScreen';
import AuthScreen from '../components/AuthScreen';
import ProfileModal from '../components/ProfileModal';
import { useAuthSession } from '../hooks/useAuthSession';
import { useCart } from '../hooks/useCart';
import { useCheckout } from '../hooks/useCheckout';
import { useTables } from '../hooks/useTables';
import { useProfile } from '../hooks/useProfile';
import { usePermissions } from '../hooks/usePermissions';
import { useUnpaidOrders } from '../hooks/useUnpaidOrders';
import { clearProductCache } from '../services/product-cache.service';
import { changeCartItemQuantity, removeCartItem as removeCartEntry } from '../services/cart.service';
import { getPriceChangeMessage, getUserErrorMessage } from '../shared/errorMessages';
import { hasPosCapability, POS_CAPABILITIES } from '../shared/permissions';
import { getStoredLanguage, LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES, translate } from '../utils/i18n';
import { usePosDisplaySettings } from '../hooks/usePosDisplaySettings';
import { canAccessProtectedScreen, getRoleLanding, hasAdminWorkspaceAccess } from '../services/session-authorization.service';
import { useStaffHandoff } from '../hooks/useStaffHandoff';
import StaffSelectorScreen from '../components/StaffSelectorScreen';
import StaffAccessStatusScreen from '../components/StaffAccessStatusScreen';
import TerminalSetupScreen from '../components/TerminalSetupScreen';
import PosStartupScreen from '../components/PosStartupScreen';
import TerminalLockScreen from '../components/TerminalLockScreen';
import CashShiftScreen from '../components/CashShiftScreen';
import { signInAnonymously } from '../features/auth/authService';

const KitchenScreen = lazy(() => import('../components/KitchenScreen'));
const ReadyToServeScreen = lazy(() => import('../components/ReadyToServeScreen'));
const ReportsScreen = lazy(() => import('../components/ReportsScreen'));
const TableManagementScreen = lazy(() => import('../components/TableManagementScreen'));
const UnpaidOrdersScreen = lazy(() => import('../components/UnpaidOrdersScreen'));
const AdminShell = lazy(() => import('../components/admin/AdminShell'));

function OperationalScreenLoader({ lang }) {
  return <div className="w-full h-full flex items-center justify-center bg-[#121212] text-[#D4AF37] font-bold">{translate(lang, 'loading')}</div>;
}

function isPosPath(path = '') {
  return path === '/pos' || path.startsWith('/pos/');
}

function adminLandingUrl() {
  const hash = globalThis.location?.hash || '';
  return `/admin${hash.startsWith('#admin/') ? hash : '#admin/dashboard'}`;
}

export default function App() {
  const [posStartup, setPosStartup] = useState(() => globalThis.location?.pathname === '/pos' && !globalThis.location?.hash?.startsWith('#admin/'));
  const [posEntryPath, setPosEntryPath] = useState(() => {
    const path = globalThis.location?.pathname || '/';
    if (globalThis.location?.hash?.startsWith('#admin/')) return '/admin';
    if (!isPosPath(path)) return path;
    return globalThis.localStorage?.getItem('pos.terminal.credential.v1') ? '/pos/login' : '/pos/setup';
  });
  // Auth State
  const { session, isLoading: authLoading, refreshSession, signOut, isPasswordRecovery, finishPasswordRecovery, notice: sessionNotice, clearNotice, isLocked, lockTerminal, unlockTerminal } = useAuthSession();
  const {
    profile,
    isLoading: profileLoading,
    error: profileError,
    refetch: refetchProfile,
  } = useProfile(session?.user?.id ? `${session.user.id}:${isOperatorMode()}` : '');
  const permissionState = usePermissions(session?.user?.id ? `${session.user.id}:${isOperatorMode()}` : '');
  const [operatorReady, setOperatorReady] = useState(false);
  const [terminalContext, setTerminalContext] = useState(null);
  const [activeShift, setActiveShift] = useState(null);
  const [signOutBlocked, setSignOutBlocked] = useState(false);
  const [posRequested, setPosRequested] = useState(false);
  const adminAccount = !isOperatorMode() && (profile?.role === 'ADMIN' || hasAdminWorkspaceAccess(permissionState.permissions));
  const effectivePermissions = useMemo(() => permissionState.permissions || [], [permissionState.permissions]);
  const hasEffectivePermission = (permission) => effectivePermissions.includes(permission);
  const staffHandoff = useStaffHandoff(Boolean(session) && !operatorReady && !adminAccount && terminalContext?.ok === true, session?.user?.id || '');
  useEffect(() => {
    if (!isOperatorMode() && !adminAccount && profile?.role?.startsWith('TERMINAL')) setOperatorReady(false);
  }, [adminAccount, profile]);
  useEffect(() => {
    let active = true;
    // Admin accounts use the account session and do not need a physical
    // terminal binding. Wait for profile resolution before deciding whether
    // this session belongs to a POS device.
    if (!session || profileLoading || adminAccount || (session.user?.is_anonymous && !isPosPath(globalThis.location?.pathname || ''))) {
      if (!session) deviceResetHandled.current = false;
      if (!session || adminAccount) setTerminalContext(null);
      return () => { active = false; };
    }
    void resolveTerminal().then(async (result) => {
      if (!active) return;
      setTerminalContext(result.data || null);
      if (['TERMINAL_AUTH_NOT_BOUND','DEVICE_AUTHENTICATION_INVALID','DEVICE_REVOKED','DEVICE_NOT_ACTIVATED'].includes(result.data?.code) && globalThis.localStorage?.getItem('pos.terminal.credential.v1') && !deviceResetHandled.current) {
        deviceResetHandled.current = true;
        clearDeviceCredential();
        setOperatorReady(false);
        setPosEntryPath('/pos/setup');
        globalThis.history?.replaceState(null, '', '/pos/setup');
        await signOut();
      }
    });
    return () => { active = false; };
  }, [adminAccount, operatorReady, profileLoading, session, signOut]);

  // Navigation includes order list → detail → payment → confirmation.
  const [currentScreen, setCurrentScreen] = useState(() => globalThis.location?.hash?.startsWith('#admin/') ? 'admin' : 'welcome');
  const [tableSelectionBackScreen, setTableSelectionBackScreen] = useState('welcome');
  const [orderDetailBackScreen, setOrderDetailBackScreen] = useState('unpaidOrders');
  const [paymentReturnScreen, setPaymentReturnScreen] = useState('orderDetail');
  const [paymentConfirmation, setPaymentConfirmation] = useState(null);
  const [splitBillOrderId, setSplitBillOrderId] = useState(null);
  const [stayOnDashboard, setStayOnDashboard] = useState(false);
  const [lang, setLang] = useState(() => getStoredLanguage()); // 'en' | 'zh' | 'ms'
  const hadStoredLanguageAtStartup = useRef(Boolean(globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY)));
  const appliedSystemLanguage = useRef(false);
  const appliedRoleLanding = useRef(false);
  const landingSessionId = useRef('');
  const anonymousAttempted = useRef(false);
  const deviceResetHandled = useRef(false);
  useEffect(() => {
    if (!session) anonymousAttempted.current = false;
  }, [session]);
  const displaySettings = usePosDisplaySettings(Boolean(session));
  const configuredLanguages = Array.isArray(displaySettings?.enabledLanguages)
    ? SUPPORTED_LANGUAGES.filter((code) => displaySettings.enabledLanguages.includes(code))
    : [];
  const enabledLanguages = configuredLanguages.length ? configuredLanguages : SUPPORTED_LANGUAGES;
  const tr = (key, variables) => translate(lang, key, variables);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  useEffect(() => {
    if (globalThis.location?.hash?.startsWith('#admin/')) {
      if (globalThis.location?.pathname !== '/admin') globalThis.history?.replaceState(null, '', adminLandingUrl());
      if (posEntryPath !== '/admin') setPosEntryPath('/admin');
      setPosStartup(false);
      return;
    }
    if (!isPosPath(globalThis.location?.pathname || '')) return;
    const hasRegisteredDevice = Boolean(globalThis.localStorage?.getItem('pos.terminal.credential.v1'));
    const next = hasRegisteredDevice ? '/pos/login' : '/pos/setup';
    if (next !== posEntryPath) setPosEntryPath(next);
    if (globalThis.location?.pathname !== next) globalThis.history?.replaceState(null, '', next);
    setPosStartup(false);
  }, [posEntryPath]);

  useEffect(() => {
    if (!session || profileLoading || permissionState.isLoading || !adminAccount || isOperatorMode()) return;
    if (!isPosPath(globalThis.location?.pathname || '')) return;
    globalThis.history?.replaceState(null, '', adminLandingUrl());
    setCurrentScreen('admin');
  }, [adminAccount, permissionState.isLoading, profileLoading, session]);

  useEffect(() => {
    if (authLoading || session || posStartup || isPasswordRecovery || anonymousAttempted.current) return;
    if (!isPosPath(globalThis.location?.pathname || '')) return;
    if (!posEntryPath.startsWith('/pos') || (posEntryPath !== '/pos/setup' && !globalThis.localStorage?.getItem('pos.terminal.credential.v1'))) return;
    anonymousAttempted.current = true;
    void signInAnonymously().then(async result => {
      if (result.error) {
        setPosEntryPath('/pos/error');
        globalThis.history?.replaceState(null, '', '/pos/error');
        return;
      }
      await refreshSession();
    });
  }, [authLoading, isPasswordRecovery, posEntryPath, posStartup, refreshSession, session]);

  // Cart & Order State
  const {
    cart,
    clearCart,
    replaceCart,
  } = useCart();

  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [diningMode, setDiningMode] = useState('takeaway'); // 'dine-in' | 'takeaway'
  const [selectedTable, setSelectedTable] = useState(null);
  const { tables, isLoading: tablesLoading, error: tablesError, refresh: refreshTables } = useTables(Boolean(session) && operatorReady && isOperatorMode());
  const [grandTotal, setGrandTotal] = useState(0);
  const [orderContextError, setOrderContextError] = useState('');
  const [isOpeningOrder, setIsOpeningOrder] = useState(false);
  const openingOrderInFlight = useRef(false);
  const [orderSubmitError, setOrderSubmitError] = useState('');
  const [orderNotice, setOrderNotice] = useState('');
  const [isSendingOrder, setIsSendingOrder] = useState(false);
  const takeawayConfirmationInFlight = useRef(false);
  const [takeawayPackaging, setTakeawayPackaging] = useState(['PAPER_BAG', 'NAPKIN']);
  const canStartOrder = hasEffectivePermission('order.create') && hasPosCapability(profile?.role, POS_CAPABILITIES.START_ORDER);
  const canAccessCashShift = hasEffectivePermission('cash.shift.view');
  const canMoveCash = hasEffectivePermission('cash.movement');
  const canAccessUnpaidOrders = hasEffectivePermission('order.view') && hasPosCapability(profile?.role, POS_CAPABILITIES.VIEW_UNPAID_ORDERS);
  const canAccessPayments = hasEffectivePermission('payment.view') && hasPosCapability(profile?.role, POS_CAPABILITIES.TAKE_PAYMENT);
  const {
    orders: unpaidOrders,
    isLoading: unpaidOrdersLoading,
    error: unpaidOrdersError,
  } = useUnpaidOrders(Boolean(session) && currentScreen === 'tableSelection' && canAccessUnpaidOrders, 100);
  const activeTakeawayOrders = unpaidOrders.filter((order) => order.diningMode === 'takeaway');
  const selectedTableLabel = tables.find((table) => table.id === selectedTable)?.tableNumber || '';
  const {
    activeOrder,
    draftCart,
    orderHistory,
    pendingOrder,
    authoritativeTotal,
    isRestoring: checkoutRestoring,
    beginCheckout,
    cancelPendingCheckout,
    createDraftContext,
    discardDraft,
    openExistingOrder,
    prepareTakeawayPayment,
    applyVoucher,
    removeVoucher,
    sendOrder,
    saveDraftCart,
    startNewOrderContext,
    submitPayment,
    resetCheckout,
  } = useCheckout({
    enabled: Boolean(session) && operatorReady && isOperatorMode(),
    cart,
    diningMode,
    tableId: selectedTable,
    tableLabel: selectedTableLabel,
  });

  // Customization Modal State
  const [activeCustomization, setActiveCustomization] = useState({
    isOpen: false,
    dish: null,
    existingCartItem: null,
    cartItemIndex: -1
  });

  const handleLogout = async () => {
    if (isOperatorMode()) {
      const ended = await endOperatorSession();
      if (ended.error) {
        setOrderContextError(ended.error.message === 'ACTIVE_SHIFT_SIGN_OUT_BLOCKED' ? 'Close the current shift before signing out, or use Switch Staff to hand over.' : ended.error.message);
        if (ended.error.message === 'ACTIVE_SHIFT_SIGN_OUT_BLOCKED') setSignOutBlocked(true);
        return ended;
      }
      setIsProfileOpen(false);
      unlockTerminal();
      setOperatorReady(false);
      setCurrentScreen('welcome');
      clearCart();
      clearProductCache();
      resetCheckout();
      appliedRoleLanding.current = false;
      globalThis.history?.replaceState(null, '', '/pos/login');
      return { error: null };
    }
    const loginPath = adminAccount || !isPosPath(globalThis.location?.pathname || '') ? '/admin/login' : '/pos/login';
    await discardDraft();
    const { error } = await signOut();
    if (error) return { error };
    setIsProfileOpen(false);
    setCurrentScreen('welcome');
    clearCart();
    clearProductCache();
    resetCheckout();
    globalThis.history?.replaceState(null, '', loginPath);
    setPosEntryPath(loginPath);
    return { error: null };
  };

  useEffect(() => {
    let active = true;
    if (!operatorReady || !isOperatorMode() || !(permissionState.permissions || []).includes('cash.shift.view')) { setActiveShift(null); return undefined; }
    const load = async () => {
      const result = await getCurrentCashierShift();
      if (active && !result.error) setActiveShift(result.data || null);
    };
    void load();
    const timer = window.setInterval(load, 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, [operatorReady, currentScreen, permissionState.permissions]);

  const handleAuthenticatedLogin = async () => {
    const result = await refreshSession();
    const signedInAsAdmin = result?.data?.staff?.role === 'ADMIN';
    if (!result?.error && signedInAsAdmin) {
      setOperatorReady(true);
      setCurrentScreen('admin');
      globalThis.history?.replaceState(null, '', adminLandingUrl());
    }
    return result;
  };

  const handleSwitchStaff = async () => {
    await discardDraft();
    const ended = await endOperatorSession({ handoff: true });
    if (ended.error) { setOrderContextError(ended.error.message); return; }
    unlockTerminal();
    setPosRequested(true);
    setIsProfileOpen(false);
    globalThis.history?.replaceState(null, '', '/pos/login');
    setCurrentScreen('welcome');
    clearCart();
    clearProductCache();
    resetCheckout();
    appliedRoleLanding.current = false;
    setOperatorReady(false);
  };

  const handleChangeTerminal = async () => {
    if (!hasEffectivePermission('terminal.deactivate') || !terminalContext?.terminalId) {
      setOrderContextError('You do not have permission to unbind this device.');
      return;
    }
    const unbound = await resetPosDevice(terminalContext.terminalId);
    if (unbound.error) { setOrderContextError(unbound.error.message === 'ACTIVE_SHIFT_DEVICE_CHANGE_BLOCKED' ? 'Close the current shift before unbinding this device.' : unbound.error.message); return; }
    await discardDraft();
    const ended = await endOperatorSession();
    if (ended.error) {
      setOrderContextError(ended.error.message);
      return;
    }
    const result = await signOut();
    if (result.error) {
      setOrderContextError(result.error.message);
      return;
    }
    clearDeviceCredential();
    setOperatorReady(false);
    setTerminalContext(null);
    setPosEntryPath('/pos/setup');
    globalThis.history?.replaceState(null, '', '/pos/setup');
    setCurrentScreen('welcome');
    clearCart();
    clearProductCache();
    resetCheckout();
  };

  // Listen for PWA Install Prompt & Network Online/Offline
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  useEffect(() => {
    globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, lang);
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
    document.documentElement.dataset.language = lang;
  }, [lang]);

  useEffect(() => {
    if (!displaySettings) return;
    const enabledLanguages = Array.isArray(displaySettings.enabledLanguages) ? displaySettings.enabledLanguages : ['en', 'zh', 'ms'];
    const defaultLanguage = enabledLanguages.includes(displaySettings.defaultLanguage) ? displaySettings.defaultLanguage : enabledLanguages[0];
    if (!defaultLanguage) return;
    if ((!appliedSystemLanguage.current && !hadStoredLanguageAtStartup.current) || !enabledLanguages.includes(lang)) setLang(defaultLanguage);
    appliedSystemLanguage.current = true;
  }, [displaySettings, lang]);

  const handleInstallPwa = () => {
    if (installPrompt) {
      installPrompt.prompt();
      installPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          setInstallPrompt(null);
        }
      });
    }
  };

  // Customization Handlers
  const handleOpenCustomization = (dish, existingCartItem = null, index = -1) => {
    setActiveCustomization({
      isOpen: true,
      dish,
      existingCartItem,
      cartItemIndex: index
    });
  };

  const handleCloseCustomization = () => {
    setActiveCustomization({
      isOpen: false,
      dish: null,
      existingCartItem: null,
      cartItemIndex: -1
    });
  };

  const persistCart = async (nextCart) => {
    setOrderSubmitError('');
    replaceCart(nextCart);
    const result = await saveDraftCart(nextCart);
    if (result.error) {
      setOrderSubmitError(getUserErrorMessage(result.error, 'Unable to save the order draft.'));
      replaceCart(result.restoredCart ?? draftCart);
      return false;
    }
    return true;
  };

  const handleSaveCustomization = async (newItem, index) => {
    const nextCart = index < 0
      ? [...cart, newItem]
      : cart.map((entry, entryIndex) => (entryIndex === index ? newItem : entry));
    if (!(await persistCart(nextCart))) return;
    handleCloseCustomization();
  };

  const handleChangeCartQuantity = async (index, delta) => {
    await persistCart(changeCartItemQuantity(cart, index, delta));
  };

  const handleRemoveCartItem = async (index) => {
    await persistCart(removeCartEntry(cart, index));
  };

  const handleClearCart = async () => { await persistCart([]); };

  // Flow Navigation Handlers
  const handleStartOrder = async () => {
    const currentShift = await getCurrentCashierShift();
    if (currentShift.error) {
      setOrderContextError(shiftError(currentShift.error));
      return;
    }
    if (!currentShift.data?.id) {
      setOrderContextError('Open a shift before starting an order.');
      if (canAccessCashShift) setCurrentScreen('cashShift');
      return;
    }
    setStayOnDashboard(false);
    const discarded = await discardDraft();
    if (discarded.error) {
      setOrderContextError(getUserErrorMessage(discarded.error, 'Unable to close the previous draft.'));
      return;
    }
    clearCart();
    startNewOrderContext();
    setDiningMode('dine-in');
    setSelectedTable(null);
    setGrandTotal(0);
    setOrderContextError('');
    setOrderNotice('');
    setTableSelectionBackScreen('welcome');
    setCurrentScreen('tableSelection');
  };

  const handleCheckoutFromMenu = () => {
    setCurrentScreen('cartReview');
  };

  const handleReturnToDashboard = () => {
    setStayOnDashboard(true);
    setOrderSubmitError('');
    setCurrentScreen('welcome');
  };

  const handleReviewOrder = () => {
    setOrderSubmitError('');
    setCurrentScreen('orderReview');
  };

  const handleReviewConfirmation = async (computedTotal) => {
    if (diningMode !== 'takeaway') return handleSendOrder(computedTotal);
    if (takeawayConfirmationInFlight.current) return { data: null, error: null };
    if (!canAccessPayments) {
      setOrderSubmitError(tr('paymentRoleRequired'));
      return { data: null, error: new Error(tr('paymentRoleRequired')) };
    }
    takeawayConfirmationInFlight.current = true;
    setGrandTotal(computedTotal);
    setOrderSubmitError('');
    setIsSendingOrder(true);
    let result;
    try {
      result = await prepareTakeawayPayment(takeawayPackaging);
    } catch (error) {
      result = { data: null, error };
    } finally {
      takeawayConfirmationInFlight.current = false;
      setIsSendingOrder(false);
    }
    if (result.error) {
      setOrderSubmitError(getUserErrorMessage(result.error, tr('unexpectedRetry')));
      return result;
    }
    beginCheckout();
    setPaymentConfirmation(null);
    setPaymentReturnScreen('orderReview');
    setCurrentScreen('payment');
    return result;
  };

  const handleChangeTable = async () => {
    if (activeOrder?.status === 'DRAFT' || activeOrder?.isLocalDraft) {
      const result = await discardDraft();
      if (result.error) {
        setOrderSubmitError(getUserErrorMessage(result.error, tr('unexpectedRetry')));
        return;
      }
      startNewOrderContext();
      clearCart();
    }
    setOrderContextError('');
    setTableSelectionBackScreen('menu');
    setCurrentScreen('tableSelection');
  };

  const handleSendOrder = async (computedTotal) => {
    const expectedTotal = Number(authoritativeTotal || 0) + Number(computedTotal || 0);
    setGrandTotal(computedTotal);
    setOrderSubmitError('');
    setIsSendingOrder(true);
    const result = await sendOrder();
    setIsSendingOrder(false);
    if (result.error) {
      setOrderSubmitError(getUserErrorMessage(result.error, tr('unexpectedRetry')));
      return result;
    }
    const persistedTotal = Number(result.data?.total || 0);
    setOrderNotice(getPriceChangeMessage(expectedTotal, persistedTotal));
    clearCart();
    setCurrentScreen('orderStatus');
    return result;
  };

  const handleOpenOrderContext = async () => {
    if (openingOrderInFlight.current) return;
    openingOrderInFlight.current = true;
    setIsOpeningOrder(true);
    try {
    setOrderContextError('');
    if (activeOrder && !['DRAFT', 'LOCAL_DRAFT'].includes(activeOrder.status) && activeOrder.tableId !== selectedTable) {
      setOrderContextError(tr('currentSubmittedOrderLocked'));
      return;
    }
    if (diningMode === 'takeaway') {
      setSelectedTable(null);
      startNewOrderContext();
      clearCart();
      const result = await createDraftContext('takeaway', null);
      if (result.error) {
        setOrderContextError(getUserErrorMessage(result.error, tr('unexpectedRetry')));
        return;
      }
      setCurrentScreen('menu');
      return;
    }
    const table = tables.find(({ id }) => id === selectedTable);
    if (!table) {
      setOrderContextError(tr('selectTableBeforeContinuing'));
      return;
    }
    let reopenedExistingOrder = false;
    if (table.status === 'OCCUPIED' && table.activeOrder) {
      if (table.activeOrder.paymentStatus === 'PAID') {
        startNewOrderContext();
        const result = await createDraftContext('dine-in', table.id, table.tableNumber);
        if (result.error) {
          setOrderContextError(getUserErrorMessage(result.error, tr('unexpectedRetry')));
          return;
        }
      } else {
        const result = await openExistingOrder(table.activeOrder.id, table.tableNumber);
        if (result.error) {
          setOrderContextError(getUserErrorMessage(result.error, tr('unexpectedRetry')));
          return;
        }
        reopenedExistingOrder = true;
      }
    } else if (table.status === 'OCCUPIED') {
      startNewOrderContext();
      const result = await createDraftContext('dine-in', table.id, table.tableNumber);
      if (result.error) {
        setOrderContextError(getUserErrorMessage(result.error, tr('unexpectedRetry')));
        return;
      }
    } else if (table.status === 'AVAILABLE') {
      startNewOrderContext();
      const result = await createDraftContext('dine-in', table.id, table.tableNumber);
      if (result.error) {
        setOrderContextError(getUserErrorMessage(result.error, tr('unexpectedRetry')));
        return;
      }
    } else {
      setOrderContextError(tr('tableUnavailableForOrdering'));
      return;
    }
    clearCart();
    if (reopenedExistingOrder) setOrderDetailBackScreen('tableSelection');
    setCurrentScreen(reopenedExistingOrder ? 'orderDetail' : 'menu');
    } catch (error) {
      setOrderContextError(getUserErrorMessage(error, tr('unexpectedRetry')));
    } finally {
      openingOrderInFlight.current = false;
      setIsOpeningOrder(false);
    }
  };

  const handleProceedToPayment = () => {
    if (!canAccessPayments) {
      setOrderSubmitError(tr('paymentRoleRequired'));
      return;
    }
    beginCheckout();
    setPaymentConfirmation(null);
    setPaymentReturnScreen(currentScreen === 'orderDetail' ? 'orderDetail' : 'orderStatus');
    setCurrentScreen('payment');
  };

  const handleOpenSplitBill = () => {
    setSplitBillOrderId(activeOrder?.id || pendingOrder?.id || null);
    setCurrentScreen('splitBill');
  };

  const handleBackFromPayment = async () => {
    const { error } = await cancelPendingCheckout();
    if (error) return { error };
    setCurrentScreen(paymentReturnScreen);
    return { error: null };
  };

  const handlePayment = async (paymentDetails) => {
    const result = await submitPayment(paymentDetails);
    if (result.error) return result;
    setPaymentConfirmation({
      order: result.data,
      paymentMethod: paymentDetails.paymentMethod,
      receivedAmount: paymentDetails.receivedAmount,
      changeAmount: paymentDetails.changeAmount,
      paymentReference: paymentDetails.paymentReference,
    });
    setCurrentScreen('paymentConfirmation');
    return { error: null };
  };

  const handlePaymentConfirmationDone = () => {
    clearCart();
    resetCheckout();
    setPaymentConfirmation(null);
    setSelectedTable(null);
    setStayOnDashboard(false);
    setCurrentScreen('welcome');
  };

  const handleSplitBillDone = () => {
    clearCart();
    resetCheckout();
    setSplitBillOrderId(null);
    setSelectedTable(null);
    setStayOnDashboard(false);
    setCurrentScreen('unpaidOrders');
  };

  const handleResetOrder = async () => {
    const result = await discardDraft();
    if (result.error) {
      setOrderSubmitError(getUserErrorMessage(result.error, tr('unexpectedRetry')));
      return;
    }
    clearCart();
    resetCheckout();
    setSelectedTable(null);
    setCurrentScreen('welcome');
  };

  const handleAddItems = () => {
    clearCart();
    setOrderSubmitError('');
    setCurrentScreen('menu');
  };

  const handleOpenUnpaidOrder = async (order, backScreen = 'unpaidOrders') => {
    setOrderContextError('');
    const result = await openExistingOrder(order.id, order.table?.tableNumber || '');
    if (result.error) {
      setOrderContextError(getUserErrorMessage(result.error, tr('unexpectedRetry')));
      return result;
    }
    setDiningMode(order.diningMode);
    setSelectedTable(order.table?.id || null);
    clearCart();
    setOrderDetailBackScreen(backScreen);
    setCurrentScreen('orderDetail');
    return result;
  };

  const handleCheckTableOrderStatus = async (table, progressOrder = table?.activeOrder) => {
    setOrderContextError('');
    if (!table?.id || !progressOrder?.id || !['UNPAID', 'PARTIALLY_PAID', 'PAID'].includes(progressOrder.paymentStatus)) {
      setOrderContextError(tr('noActiveProgressOrder'));
      return;
    }
    const result = await openExistingOrder(progressOrder.id, table.tableNumber);
    if (result.error) {
      setOrderContextError(getUserErrorMessage(result.error, tr('unexpectedRetry')));
      return;
    }
    setDiningMode('dine-in');
    setSelectedTable(table.id);
    clearCart();
    setCurrentScreen('orderStatus');
  };

  useEffect(() => {
    if (!selectedTable || tablesLoading) return;
    const table = tables.find(({ id }) => id === selectedTable);
    if (!table || !['AVAILABLE', 'OCCUPIED'].includes(table.status)) setSelectedTable(null);
  }, [selectedTable, tables, tablesLoading]);

  useEffect(() => {
    replaceCart(draftCart);
  }, [draftCart, replaceCart]);

  useEffect(() => {
    if (checkoutRestoring || stayOnDashboard || !activeOrder || currentScreen !== 'welcome') return;
    setDiningMode(activeOrder.diningMode);
    setSelectedTable(activeOrder.tableId || null);
    setCurrentScreen(activeOrder.status === 'DRAFT' || draftCart.length > 0 ? 'menu' : 'orderStatus');
  }, [activeOrder, checkoutRestoring, currentScreen, draftCart.length, stayOnDashboard]);

  const canAccessKitchen = hasEffectivePermission('order.view') && hasPosCapability(profile?.role, POS_CAPABILITIES.OPERATE_KITCHEN);
  const canAccessReadyToServe = hasEffectivePermission('order.view') && hasPosCapability(profile?.role, POS_CAPABILITIES.SERVE_ORDER);
  const canAccessReports = hasEffectivePermission('report.view') && hasPosCapability(profile?.role, POS_CAPABILITIES.VIEW_REPORTS);
  const canAccessTables = hasEffectivePermission('table.view') && hasPosCapability(profile?.role, POS_CAPABILITIES.OPERATE_TABLES);
  const canManageProducts = ['product.create', 'product.edit', 'product.manage_image']
    .some((permission) => hasEffectivePermission(permission));
  const canAccessAdmin = !isOperatorMode() && (profile?.role === 'ADMIN' || hasAdminWorkspaceAccess(effectivePermissions));
  useEffect(() => {
    // Administrators authenticate with email/password and do not require the
    // operational staff PIN handoff used by cashiers, waiters, and kitchen staff.
    if (profile?.status === 'ACTIVE' && adminAccount && !operatorReady && !posRequested) setOperatorReady(true);
  }, [adminAccount, operatorReady, posRequested, profile]);
  useEffect(() => {
    if (!authLoading && session && profile && !profileLoading && !permissionState.isLoading && currentScreen === 'admin' && !canAccessAdmin) {
      globalThis.history?.replaceState(null, '', globalThis.location?.pathname || '/');
      setCurrentScreen('welcome');
    }
  }, [authLoading, canAccessAdmin, currentScreen, permissionState.isLoading, profile, profileLoading, session]);

  useEffect(() => {
    if (!session) {
      setPosRequested(false);
      appliedRoleLanding.current = false;
      landingSessionId.current = '';
      setOperatorReady(false);
      return;
    }
    if (landingSessionId.current !== session.user.id) {
      appliedRoleLanding.current = false;
      landingSessionId.current = session.user.id;
    }
    if (!operatorReady) return;
    if (!profile || profile.status !== 'ACTIVE' || profileLoading || permissionState.isLoading || appliedRoleLanding.current) return;
    appliedRoleLanding.current = true;
    const landing = isOperatorMode() ? (profile.role === 'KITCHEN' ? 'kitchen' : 'welcome') : adminAccount ? 'admin' : getRoleLanding(profile.role);
    if (landing === 'admin') {
      globalThis.history?.replaceState(null, '', adminLandingUrl());
      setCurrentScreen('admin');
    } else if (landing === 'kitchen') {
      globalThis.history?.replaceState(null, '', isPosPath(globalThis.location?.pathname || '') ? '/pos/kitchen' : globalThis.location?.pathname || '/');
      setCurrentScreen('kitchen');
    } else {
      globalThis.history?.replaceState(null, '', globalThis.location?.pathname?.startsWith('/pos') ? '/pos/sales' : globalThis.location?.pathname || '/');
      setCurrentScreen('welcome');
    }
  }, [adminAccount, operatorReady, permissionState.isLoading, profile, profileLoading, session]);

  useEffect(() => {
    if (!session || !profile || profileLoading || permissionState.isLoading) return;
    if (currentScreen === 'admin' && canAccessAdmin) return;
    if (!canAccessProtectedScreen(currentScreen, profile?.role, effectivePermissions)) {
      globalThis.history?.replaceState(null, '', globalThis.location?.pathname || '/');
      setCurrentScreen(profile?.role === 'KITCHEN' && canAccessKitchen ? 'kitchen' : 'welcome');
    }
  }, [canAccessAdmin, canAccessKitchen, canAccessPayments, canAccessReadyToServe, canAccessReports, canAccessTables, canAccessUnpaidOrders, canStartOrder, currentScreen, effectivePermissions, permissionState.isLoading, profile, profileLoading, session]);
  // Show a full-screen loading state while checking session
  if (posStartup) {
    return <IpadShell isOnline={isOnline} lang={lang} setLang={setLang} enabledLanguages={enabledLanguages}><PosStartupScreen /></IpadShell>;
  }
  if (authLoading || (session && (profileLoading || checkoutRestoring))) {
    return (
      <IpadShell
        isOnline={isOnline}
        lang={lang}
        setLang={setLang}
        enabledLanguages={enabledLanguages}
      >
        <StaffAccessStatusScreen isOnline={isOnline} mode={checkoutRestoring ? 'restoring' : 'checking'} />
      </IpadShell>
    );
  }

  // An anonymous terminal setup session can remain in this browser. Opening an
  // admin URL must still offer email/password sign-in for an administrator.
  if (session?.user?.is_anonymous && !isPosPath(globalThis.location?.pathname || '')) {
    return <IpadShell isOnline={isOnline} lang={lang} setLang={setLang} enabledLanguages={enabledLanguages}>
      <AuthScreen lang={lang} setLang={setLang} enabledLanguages={enabledLanguages} onSignedIn={handleAuthenticatedLogin} sessionNotice={sessionNotice} onDismissSessionNotice={clearNotice} mode="admin" />
    </IpadShell>;
  }

  // Not authenticated → show Login Screen (inside IpadShell for consistent framing)
  if (!session || isPasswordRecovery) {
    const deviceIsUnbound = !globalThis.localStorage?.getItem('pos.terminal.credential.v1');
    const posRouteRequested = isPosPath(globalThis.location?.pathname || '') || posEntryPath.startsWith('/pos');
    if (!isPasswordRecovery && posRouteRequested && (posEntryPath === '/pos/setup' || deviceIsUnbound)) {
      return <IpadShell isOnline={isOnline} lang={lang} setLang={setLang} enabledLanguages={enabledLanguages}><TerminalSetupScreen onActivated={async () => { const result = await signInAnonymously(); if (result.error) return result; setPosEntryPath('/pos/login'); globalThis.history?.replaceState(null, '', '/pos/login'); await refreshSession(); return result; }} onResume={async () => { const result = await signInAnonymously(); if (result.error) return result; const terminal = await resolveTerminal(); if (!terminal.data?.ok) return { ...terminal, error: new Error(terminal.data?.code || 'TERMINAL_AUTH_NOT_BOUND') }; setTerminalContext(terminal.data); setPosEntryPath('/pos/login'); globalThis.history?.replaceState(null, '', '/pos/login'); await refreshSession(); return terminal; }} onSignOut={() => { globalThis.history?.replaceState(null, '', '/pos'); setPosStartup(true); }} /></IpadShell>;
    }
    if (posEntryPath === '/pos/error') {
      return <IpadShell isOnline={isOnline} lang={lang} setLang={setLang} enabledLanguages={enabledLanguages}><div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-[#0A0A0F] p-8 text-center text-white"><h1 className="text-2xl font-black text-red-300">Terminal unavailable</h1><p className="max-w-md text-sm text-gray-400">This terminal credential is invalid or revoked. Contact an administrator to activate or replace this device.</p></div></IpadShell>;
    }
    if (!isPasswordRecovery && posRouteRequested && !deviceIsUnbound) {
      return <IpadShell isOnline={isOnline} lang={lang} setLang={setLang} enabledLanguages={enabledLanguages}><PosStartupScreen title="Connecting to POS terminal" /></IpadShell>;
    }
    return (
      <IpadShell
        isOnline={isOnline}
        lang={lang}
        setLang={setLang}
        enabledLanguages={enabledLanguages}
      >
        <AuthScreen
          lang={lang}
          setLang={setLang}
          enabledLanguages={enabledLanguages}
          passwordRecovery={isPasswordRecovery}
          onPasswordRecovered={finishPasswordRecovery}
          onSignedIn={handleAuthenticatedLogin}
          sessionNotice={sessionNotice}
          onDismissSessionNotice={clearNotice}
          mode={isPosPath(globalThis.location?.pathname || '') || posEntryPath.startsWith('/pos') ? 'terminal' : 'admin'}
        />
      </IpadShell>
    );
  }

  if (profileError || !profile || profile.status !== 'ACTIVE' || (!adminAccount && profile.role === 'TERMINAL_SETUP')) {
    if (['TERMINAL_AUTH_NOT_BOUND','DEVICE_AUTHENTICATION_INVALID','DEVICE_REVOKED','DEVICE_NOT_ACTIVATED'].includes(terminalContext?.code)) {
      return <IpadShell isOnline={isOnline} lang={lang} setLang={setLang} enabledLanguages={enabledLanguages}><TerminalSetupScreen onActivated={async () => { const result = await resolveTerminal(); if (result.data?.ok) { const refreshed = await refetchProfile(); if (refreshed?.error || refreshed?.data?.role !== 'TERMINAL') return { ...result, error: refreshed?.error || new Error('Terminal profile could not be loaded.') }; setTerminalContext(result.data); setPosEntryPath('/pos/login'); globalThis.history?.replaceState(null, '', '/pos/login'); } return result; }} onResume={async () => { const result = await resolveTerminal(); if (result.data?.ok) { const refreshed = await refetchProfile(); if (refreshed?.error || refreshed?.data?.role !== 'TERMINAL') return { ...result, error: refreshed?.error || new Error('Terminal profile could not be loaded.') }; setTerminalContext(result.data); setPosEntryPath('/pos/login'); globalThis.history?.replaceState(null, '', '/pos/login'); } return result; }} onSignOut={handleLogout} /></IpadShell>;
    }
    if (posEntryPath.startsWith('/pos') && terminalContext?.code) {
      return <IpadShell isOnline={isOnline} lang={lang} setLang={setLang} enabledLanguages={enabledLanguages}><div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-[#0A0A0F] p-8 text-center text-white"><h1 className="text-2xl font-black text-red-300">Terminal unavailable</h1><p className="max-w-md text-sm text-gray-400">This terminal credential is invalid or inactive. Contact an administrator.</p><button onClick={handleLogout} className="rounded-xl bg-[#D4AF37] px-6 py-3 font-black text-black">Return to setup</button></div></IpadShell>;
    }
    return (
      <IpadShell
        isOnline={isOnline}
        lang={lang}
        setLang={setLang}
        enabledLanguages={enabledLanguages}
      >
        <div className="w-full h-full bg-[#121212] text-white flex flex-col items-center justify-center gap-4 p-8 text-center">
          <h1 className="text-2xl font-black text-[#D4AF37]">{tr('terminalUnavailable')}</h1>
          <p className="max-w-md text-sm text-gray-400">
            {profile?.status === 'INACTIVE'
              ? tr('staffPendingActivation')
              : profile?.status && profile.status !== 'ACTIVE'
                ? tr('staffAccessDisabled', { status: profile.status.toLowerCase() })
              : profileError || 'A valid staff profile could not be loaded.'}
          </p>
          <button onClick={handleLogout} className="rounded-xl bg-[#D4AF37] px-6 py-3 text-sm font-black text-[#121212]">
            {tr('signOut')}
          </button>
        </div>
      </IpadShell>
    );
  }

  if (!operatorReady && !adminAccount) {
    return (
      <IpadShell isOnline={isOnline} lang={lang} setLang={setLang} enabledLanguages={enabledLanguages}>
        <StaffSelectorScreen
          staff={staffHandoff.staff}
          selectedStaff={staffHandoff.selected}
          isLoading={staffHandoff.isLoading}
          isSubmitting={staffHandoff.isSubmitting}
          error={staffHandoff.error}
          isOnline={isOnline}
          onSelect={staffHandoff.select}
          onCancel={staffHandoff.cancel}
          onRetry={staffHandoff.refresh}
          onLogout={handleLogout}
          onSubmit={async (pin) => {
            const result = await staffHandoff.submitPin(pin);
            if (result.ok) {
              await refreshSession();
              setOperatorReady(!result.pinResetRequired);
            }
            return result.ok;
          }}
          onSetupPin={async (pin) => {
            const ok = await staffHandoff.setupPin(pin);
            if (ok) {
              await refreshSession();
              setOperatorReady(true);
            }
            return ok;
          }}
          currentUserId={session.user.id}
          pinResetRequired={staffHandoff.pinResetRequired}
          terminalContext={terminalContext}
          canConfigurePins={profile.role === 'ADMIN'}
          onConfigurePins={() => {
            appliedRoleLanding.current = true;
            globalThis.history?.replaceState(null, '', '/admin#admin/users');
            setCurrentScreen('admin');
            setOperatorReady(true);
          }}
          canSkip={false}
          onSkip={() => {}}
        />
      </IpadShell>
    );
  }

  // Authenticated → show POS App
  return (
    <IpadShell
      isOnline={isOnline}
      lang={lang}
      setLang={setLang}
      enabledLanguages={enabledLanguages}
      onLogout={handleLogout}
      onLock={lockTerminal}
      onSwitchStaff={adminAccount ? undefined : handleSwitchStaff}
      onChangeTerminal={hasEffectivePermission('terminal.deactivate') ? handleChangeTerminal : undefined}
      userEmail={session?.user?.email}
      onOpenProfile={() => setIsProfileOpen(true)}
      terminalContext={terminalContext}
      staffName={profile?.name}
      shiftStatus={activeShift?.status || 'No open shift'}
      onCurrentShift={!adminAccount && hasEffectivePermission('cash.shift.view') ? () => setCurrentScreen('cashShift') : undefined}
    >
      {/* Screen 1: Welcome Screen */}
      {currentScreen === 'welcome' && (
        <WelcomeScreen
          onStartOrder={handleStartOrder}
          onOpenKitchen={() => setCurrentScreen('kitchen')}
          onOpenReadyToServe={() => setCurrentScreen('readyToServe')}
          onOpenReports={() => setCurrentScreen('reports')}
          onOpenTables={() => setCurrentScreen('tableManagement')}
          onOpenUnpaidOrders={() => setCurrentScreen('unpaidOrders')}
          onOpenCashShift={() => setCurrentScreen('cashShift')}
          onOpenProducts={() => {
            globalThis.history?.replaceState(null, '', '/admin#admin/products');
            setCurrentScreen('admin');
          }}
          onOpenAdmin={() => {
            globalThis.history?.replaceState(null, '', '/admin#admin/dashboard');
            setCurrentScreen('admin');
          }}
          canStartOrder={canStartOrder}
          canAccessKitchen={canAccessKitchen}
          canAccessReadyToServe={canAccessReadyToServe}
          canAccessReports={canAccessReports}
          canAccessTables={canAccessTables}
          canAccessUnpaidOrders={canAccessUnpaidOrders}
          canAccessCashShift={canAccessCashShift}
          canManageProducts={canManageProducts}
          canAccessAdmin={canAccessAdmin}
          lang={lang}
          setLang={setLang}
          enabledLanguages={enabledLanguages}
          installPrompt={installPrompt}
          handleInstallPwa={handleInstallPwa}
        />
      )}
      {currentScreen === 'cashShift' && canAccessCashShift && <CashShiftScreen onBack={() => setCurrentScreen('welcome')} canMoveCash={canMoveCash} canOpen={hasEffectivePermission('cash.shift.open')} canClose={hasEffectivePermission('cash.shift.close')} canOpenDrawer={hasEffectivePermission('cash.drawer.open')} staffName={profile?.name} terminalId={terminalContext?.terminalId} />}

      {/* Screen 2: Menu Home Screen */}
      {currentScreen === 'menu' && (
        <MenuHomeScreen
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          cart={cart}
          activeOrder={activeOrder}
          operationalContext={{
            branchCode: terminalContext?.branchCode,
            terminalCode: terminalContext?.terminalCode,
            staffName: profile?.name,
          }}
          orderHistory={orderHistory}
          operationError={orderSubmitError}
          onOpenCustomization={handleOpenCustomization}
          onCheckout={handleCheckoutFromMenu}
          diningMode={diningMode}
          selectedTable={selectedTableLabel}
          lang={lang}
          setLang={setLang}
          onChangeTable={handleChangeTable}
          onDashboard={handleReturnToDashboard}
        />
      )}

      {/* Screen 4: Shopping Cart & Order Review Screen */}
      {currentScreen === 'cartReview' && (
        <CartReviewScreen
          cart={cart}
          orderHistory={orderHistory}
          onChangeQuantity={handleChangeCartQuantity}
          onRemoveItem={handleRemoveCartItem}
          onClearCart={handleClearCart}
          onBackToMenu={() => setCurrentScreen('menu')}
          onOpenCustomization={handleOpenCustomization}
          onReviewOrder={handleReviewOrder}
          submitError={orderSubmitError}
          takeawayPackaging={takeawayPackaging}
          onTakeawayPackagingChange={setTakeawayPackaging}
          diningMode={diningMode}
          selectedTable={selectedTableLabel}
          isAddOn={Boolean(activeOrder?.id && activeOrder.status !== 'DRAFT')}
          authoritativeBillTotal={authoritativeTotal}
          activeOrder={activeOrder}
          onApplyVoucher={applyVoucher}
          onRemoveVoucher={removeVoucher}
          lang={lang}
        />
      )}

      {currentScreen === 'orderReview' && (
        <ReviewOrderScreen
          cart={cart}
          diningMode={diningMode}
          selectedTable={selectedTableLabel}
          isAddOn={Boolean(activeOrder?.id && activeOrder.status !== 'DRAFT')}
          isSending={isSendingOrder}
          submitError={orderSubmitError}
          onEdit={() => setCurrentScreen('cartReview')}
          onConfirm={handleReviewConfirmation}
          lang={lang}
        />
      )}

      {/* Screen 5: Table & Dining Mode Selection Screen */}
      {currentScreen === 'tableSelection' && (
        <TableSelectionScreen
          diningMode={diningMode}
          setDiningMode={setDiningMode}
          selectedTable={selectedTable}
          setSelectedTable={setSelectedTable}
          tables={tables}
          tablesLoading={tablesLoading}
          tablesError={tablesError}
          onBack={() => setCurrentScreen(tableSelectionBackScreen)}
          onContinue={handleOpenOrderContext}
          isOpeningOrder={isOpeningOrder}
          onRefreshTables={async () => { setOrderContextError(''); await refreshTables(); }}
          contextError={orderContextError}
          grandTotal={authoritativeTotal ?? grandTotal}
          takeawayOrders={activeTakeawayOrders}
          takeawayOrdersLoading={unpaidOrdersLoading}
          takeawayOrdersError={unpaidOrdersError}
          onOpenTakeawayOrder={(order) => handleOpenUnpaidOrder(order, 'tableSelection')}
          onCheckOrderStatus={handleCheckTableOrderStatus}
          lang={lang}
        />
      )}

      {/* Screen 6: Payment Method Screen */}
      {currentScreen === 'payment' && canAccessPayments && (
        <PaymentScreen
          orderId={pendingOrder?.id || activeOrder?.id}
          onBack={handleBackFromPayment}
          onPaymentSubmit={handlePayment}
          onApplyVoucher={applyVoucher}
          lang={lang}
        />
      )}

      {currentScreen === 'splitBill' && canAccessPayments && splitBillOrderId && (
        <SplitBillScreen orderId={splitBillOrderId} onBack={() => setCurrentScreen('orderDetail')} onDone={handleSplitBillDone} lang={lang} />
      )}

      {currentScreen === 'paymentConfirmation' && paymentConfirmation && (
        <PaymentConfirmationScreen
          confirmation={paymentConfirmation}
          onDone={handlePaymentConfirmationDone}
          lang={lang}
        />
      )}

      {currentScreen === 'kitchen' && canAccessKitchen && (
        <Suspense fallback={<OperationalScreenLoader lang={lang} />}>
          <KitchenScreen role={profile.role} onBack={() => setCurrentScreen('welcome')} lang={lang} />
        </Suspense>
      )}

      {currentScreen === 'readyToServe' && canAccessReadyToServe && (
        <Suspense fallback={<OperationalScreenLoader lang={lang} />}>
          <ReadyToServeScreen onBack={() => setCurrentScreen('welcome')} lang={lang} />
        </Suspense>
      )}

      {currentScreen === 'reports' && canAccessReports && (
        <Suspense fallback={<OperationalScreenLoader lang={lang} />}>
          <ReportsScreen onBack={() => setCurrentScreen('welcome')} lang={lang} />
        </Suspense>
      )}

      {currentScreen === 'tableManagement' && canAccessTables && (
        <Suspense fallback={<OperationalScreenLoader lang={lang} />}>
          <TableManagementScreen role={profile.role} canManage={hasEffectivePermission('table.manage')} onBack={() => setCurrentScreen('welcome')} lang={lang} />
        </Suspense>
      )}

      {currentScreen === 'unpaidOrders' && canAccessUnpaidOrders && (
        <Suspense fallback={<OperationalScreenLoader lang={lang} />}>
          <UnpaidOrdersScreen onBack={() => setCurrentScreen('welcome')} onOpenOrder={handleOpenUnpaidOrder} lang={lang} />
        </Suspense>
      )}

      {currentScreen === 'admin' && canAccessAdmin && (
        <Suspense fallback={<OperationalScreenLoader lang={lang} />}>
          <AdminShell
            key={`${profile.id}:${profile.company_id}:${permissionState.permissions.join(',')}`}
            role={profile.role}
            permissions={permissionState.permissions}
            profile={profile}
            onProfileUpdated={() => refetchProfile({ background: true })}
            onLogout={handleLogout}
            setLang={setLang}
            enabledLanguages={enabledLanguages}
            onSwitchStaff={handleSwitchStaff}
            onBack={handleSwitchStaff}
            lang={lang}
          />
        </Suspense>
      )}

      {currentScreen === 'orderDetail' && activeOrder?.id && (
        <OrderDetailScreen
          orderId={activeOrder.id}
          canPay={Boolean(pendingOrder) && canAccessPayments}
          onBack={() => setCurrentScreen(orderDetailBackScreen)}
          onAddItems={handleAddItems}
          onPayment={handleProceedToPayment}
          onSplitBill={handleOpenSplitBill}
          lang={lang}
        />
      )}

      {/* Screen 7: Order Confirmation & Live Status Screen */}
      {currentScreen === 'orderStatus' && activeOrder && (
        <OrderStatusScreen
          orderData={activeOrder}
          notice={orderNotice}
          onResetOrder={handleResetOrder}
          onAddItems={handleAddItems}
          onProceedToPayment={handleProceedToPayment}
          canAddItems={Boolean(pendingOrder)}
          canPay={Boolean(pendingOrder) && canAccessPayments}
          diningMode={diningMode}
          selectedTable={selectedTableLabel}
          lang={lang}
        />
      )}

      {/* Screen 3: Product Customization Modal Overlay */}
      {activeCustomization.isOpen && (
        <CustomizationModal
          dish={activeCustomization.dish}
          existingCartItem={activeCustomization.existingCartItem}
          cartItemIndex={activeCustomization.cartItemIndex}
          onSave={handleSaveCustomization}
          onClose={handleCloseCustomization}
          lang={lang}
          diningMode={diningMode}
        />
      )}

      {/* Profile Modal Overlay */}
      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        onLogout={handleLogout}
        lang={lang}
      />
      {isLocked && <TerminalLockScreen staff={profile} onUnlock={unlockTerminal} onLogout={handleLogout} onSwitchStaff={handleSwitchStaff} />}
      {signOutBlocked && <div role="dialog" aria-modal="true" aria-label="Active shift" className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4"><section className="w-full max-w-md rounded-lg bg-white p-6 text-slate-950"><h2 className="text-xl font-bold">You currently have an active shift.</h2><div className="mt-6 flex flex-wrap justify-end gap-3"><button type="button" onClick={() => setSignOutBlocked(false)} className="rounded border border-slate-300 px-4 py-2 font-semibold">Return to POS</button>{hasEffectivePermission('cash.shift.view') && <button type="button" onClick={() => { setSignOutBlocked(false); setCurrentScreen('cashShift'); }} className="rounded bg-slate-950 px-4 py-2 font-semibold text-white">Close Shift</button>}</div></section></div>}
    </IpadShell>
  );
}
