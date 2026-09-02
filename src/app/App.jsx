import React, { lazy, Suspense, useState, useEffect, useRef } from 'react';
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

const KitchenScreen = lazy(() => import('../components/KitchenScreen'));
const ReadyToServeScreen = lazy(() => import('../components/ReadyToServeScreen'));
const ReportsScreen = lazy(() => import('../components/ReportsScreen'));
const TableManagementScreen = lazy(() => import('../components/TableManagementScreen'));
const UnpaidOrdersScreen = lazy(() => import('../components/UnpaidOrdersScreen'));
const AdminShell = lazy(() => import('../components/admin/AdminShell'));

function OperationalScreenLoader({ lang }) {
  return <div className="w-full h-full flex items-center justify-center bg-[#121212] text-[#D4AF37] font-bold">{translate(lang, 'loading')}</div>;
}

export default function App() {
  // Auth State
  const { session, isLoading: authLoading, refreshSession, signOut, isPasswordRecovery, finishPasswordRecovery, notice: sessionNotice, clearNotice } = useAuthSession();
  const {
    profile,
    isLoading: profileLoading,
    error: profileError,
  } = useProfile(session?.user?.id || '');
  const permissionState = usePermissions(session?.user?.id || '');
  const [operatorReady, setOperatorReady] = useState(false);
  const staffHandoff = useStaffHandoff(Boolean(session) && !operatorReady, session?.user?.id || '');

  // Navigation includes order list → detail → payment → confirmation.
  const [currentScreen, setCurrentScreen] = useState(() => globalThis.location?.hash?.startsWith('#admin/') ? 'admin' : 'welcome');
  const [tableSelectionBackScreen, setTableSelectionBackScreen] = useState('welcome');
  const [orderDetailBackScreen, setOrderDetailBackScreen] = useState('unpaidOrders');
  const [paymentReturnScreen, setPaymentReturnScreen] = useState('orderDetail');
  const [paymentConfirmation, setPaymentConfirmation] = useState(null);
  const [splitBillOrderId, setSplitBillOrderId] = useState(null);
  const [stayOnDashboard, setStayOnDashboard] = useState(false);
  const [deviceMode, setDeviceMode] = useState('11inch'); // '11inch' | '129inch' | 'fullscreen'
  const [lang, setLang] = useState(() => getStoredLanguage()); // 'en' | 'zh' | 'ms'
  const hadStoredLanguageAtStartup = useRef(Boolean(globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY)));
  const appliedSystemLanguage = useRef(false);
  const appliedRoleLanding = useRef(false);
  const landingSessionId = useRef('');
  const displaySettings = usePosDisplaySettings(Boolean(session));
  const configuredLanguages = Array.isArray(displaySettings?.enabledLanguages)
    ? SUPPORTED_LANGUAGES.filter((code) => displaySettings.enabledLanguages.includes(code))
    : [];
  const enabledLanguages = configuredLanguages.length ? configuredLanguages : SUPPORTED_LANGUAGES;
  const tr = (key, variables) => translate(lang, key, variables);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

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
  const { tables, isLoading: tablesLoading, error: tablesError } = useTables(Boolean(session));
  const [grandTotal, setGrandTotal] = useState(0);
  const [orderContextError, setOrderContextError] = useState('');
  const [orderSubmitError, setOrderSubmitError] = useState('');
  const [orderNotice, setOrderNotice] = useState('');
  const [isSendingOrder, setIsSendingOrder] = useState(false);
  const [takeawayPackaging, setTakeawayPackaging] = useState(['PAPER_BAG', 'NAPKIN']);
  const canStartOrder = permissionState.hasPermission('order.view') && hasPosCapability(profile?.role, POS_CAPABILITIES.START_ORDER);
  const canAccessUnpaidOrders = permissionState.hasPermission('order.view') && hasPosCapability(profile?.role, POS_CAPABILITIES.VIEW_UNPAID_ORDERS);
  const canAccessPayments = permissionState.hasPermission('payment.view') && hasPosCapability(profile?.role, POS_CAPABILITIES.TAKE_PAYMENT);
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
    sendOrder,
    saveDraftCart,
    startNewOrderContext,
    submitPayment,
    resetCheckout,
  } = useCheckout({
    enabled: Boolean(session),
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
    await discardDraft();
    const { error } = await signOut();
    if (error) return { error };
    setIsProfileOpen(false);
    setCurrentScreen('welcome');
    clearCart();
    clearProductCache();
    resetCheckout();
    return { error: null };
  };

  const handleSwitchStaff = async () => {
    await discardDraft();
    setIsProfileOpen(false);
    globalThis.history?.replaceState(null, '', globalThis.location?.pathname || '/');
    setCurrentScreen('welcome');
    clearCart();
    clearProductCache();
    resetCheckout();
    appliedRoleLanding.current = false;
    setOperatorReady(false);
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
      replaceCart(draftCart);
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
    setGrandTotal(computedTotal);
    setOrderSubmitError('');
    setIsSendingOrder(true);
    const result = await prepareTakeawayPayment(takeawayPackaging);
    setIsSendingOrder(false);
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

  const canAccessKitchen = permissionState.hasPermission('order.view') && hasPosCapability(profile?.role, POS_CAPABILITIES.OPERATE_KITCHEN);
  const canAccessReadyToServe = permissionState.hasPermission('order.view') && hasPosCapability(profile?.role, POS_CAPABILITIES.SERVE_ORDER);
  const canAccessReports = permissionState.hasPermission('report.view') && hasPosCapability(profile?.role, POS_CAPABILITIES.VIEW_REPORTS);
  const canAccessTables = permissionState.hasPermission('table.view') && hasPosCapability(profile?.role, POS_CAPABILITIES.OPERATE_TABLES);
  const canManageProducts = ['product.create', 'product.edit', 'product.manage_image']
    .some((permission) => permissionState.hasPermission(permission));
  const canAccessAdmin = hasAdminWorkspaceAccess(permissionState.permissions);
  useEffect(() => {
    if (!permissionState.isLoading && currentScreen === 'admin' && !canAccessAdmin) {
      globalThis.history?.replaceState(null, '', globalThis.location?.pathname || '/');
      setCurrentScreen('welcome');
    }
  }, [canAccessAdmin, currentScreen, permissionState.isLoading]);

  useEffect(() => {
    if (!session) {
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
    const landing = getRoleLanding(profile.role);
    if (landing === 'admin') {
      globalThis.history?.replaceState(null, '', '#admin/dashboard');
      setCurrentScreen('admin');
    } else if (landing === 'kitchen') {
      globalThis.history?.replaceState(null, '', globalThis.location?.pathname || '/');
      setCurrentScreen('kitchen');
    } else {
      globalThis.history?.replaceState(null, '', globalThis.location?.pathname || '/');
      setCurrentScreen('welcome');
    }
  }, [operatorReady, permissionState.isLoading, profile, profileLoading, session]);

  useEffect(() => {
    if (!session || profileLoading || permissionState.isLoading) return;
    if (!canAccessProtectedScreen(currentScreen, profile?.role, permissionState.permissions)) {
      globalThis.history?.replaceState(null, '', globalThis.location?.pathname || '/');
      setCurrentScreen(profile?.role === 'KITCHEN' && canAccessKitchen ? 'kitchen' : 'welcome');
    }
  }, [canAccessAdmin, canAccessKitchen, canAccessPayments, canAccessReadyToServe, canAccessReports, canAccessTables, canAccessUnpaidOrders, canStartOrder, currentScreen, permissionState.isLoading, permissionState.permissions, profile, profileLoading, session]);
  // Show a full-screen loading state while checking session
  if (authLoading || (session && (profileLoading || checkoutRestoring))) {
    return (
      <IpadShell
        deviceMode={deviceMode}
        setDeviceMode={setDeviceMode}
        isOnline={isOnline}
        lang={lang}
        setLang={setLang}
        enabledLanguages={enabledLanguages}
      >
        <StaffAccessStatusScreen isOnline={isOnline} mode={checkoutRestoring ? 'restoring' : 'checking'} />
      </IpadShell>
    );
  }

  // Not authenticated → show Login Screen (inside IpadShell for consistent framing)
  if (!session || isPasswordRecovery) {
    return (
      <IpadShell
        deviceMode={deviceMode}
        setDeviceMode={setDeviceMode}
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
          onSignedIn={refreshSession}
          sessionNotice={sessionNotice}
          onDismissSessionNotice={clearNotice}
        />
      </IpadShell>
    );
  }

  if (profileError || !profile || profile.status !== 'ACTIVE') {
    return (
      <IpadShell
        deviceMode={deviceMode}
        setDeviceMode={setDeviceMode}
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

  if (!operatorReady) {
    return (
      <IpadShell deviceMode={deviceMode} setDeviceMode={setDeviceMode} isOnline={isOnline} lang={lang} setLang={setLang} enabledLanguages={enabledLanguages}>
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
          canConfigurePins={profile.role === 'ADMIN'}
          onConfigurePins={() => {
            appliedRoleLanding.current = true;
            globalThis.history?.replaceState(null, '', '#admin/users');
            setCurrentScreen('admin');
            setOperatorReady(true);
          }}
          canSkip={profile?.role === 'ADMIN'}
          onSkip={() => setOperatorReady(true)}
        />
      </IpadShell>
    );
  }

  // Authenticated → show POS App
  return (
    <IpadShell
      deviceMode={deviceMode}
      setDeviceMode={setDeviceMode}
      isOnline={isOnline}
      lang={lang}
      setLang={setLang}
      enabledLanguages={enabledLanguages}
      onLogout={handleLogout}
      onSwitchStaff={handleSwitchStaff}
      userEmail={session?.user?.email}
      onOpenProfile={() => setIsProfileOpen(true)}
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
          onOpenProducts={() => {
            globalThis.history?.replaceState(null, '', '#admin/products');
            setCurrentScreen('admin');
          }}
          onOpenAdmin={() => {
            globalThis.history?.replaceState(null, '', '#admin/dashboard');
            setCurrentScreen('admin');
          }}
          canStartOrder={canStartOrder}
          canAccessKitchen={canAccessKitchen}
          canAccessReadyToServe={canAccessReadyToServe}
          canAccessReports={canAccessReports}
          canAccessTables={canAccessTables}
          canAccessUnpaidOrders={canAccessUnpaidOrders}
          canManageProducts={canManageProducts}
          canAccessAdmin={canAccessAdmin}
          lang={lang}
          setLang={setLang}
          enabledLanguages={enabledLanguages}
          installPrompt={installPrompt}
          handleInstallPwa={handleInstallPwa}
        />
      )}

      {/* Screen 2: Menu Home Screen */}
      {currentScreen === 'menu' && (
        <MenuHomeScreen
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          cart={cart}
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
          <TableManagementScreen role={profile.role} onBack={() => setCurrentScreen('welcome')} lang={lang} />
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
            role={profile.role}
            permissions={permissionState.permissions}
            onSwitchStaff={handleSwitchStaff}
            onBack={() => {
              globalThis.history?.replaceState(null, '', globalThis.location?.pathname || '/');
              setCurrentScreen('welcome');
            }}
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
    </IpadShell>
  );
}
