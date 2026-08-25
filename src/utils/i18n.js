export const LANGUAGE_STORAGE_KEY = 'pos.language';
export const SUPPORTED_LANGUAGES = ['en', 'zh', 'ms'];
export const LANGUAGE_LABELS = {
  en: 'English',
  zh: '简体中文',
  ms: 'Bahasa Melayu',
};

export function getStoredLanguage() {
  const storedLanguage = globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
  return SUPPORTED_LANGUAGES.includes(storedLanguage) ? storedLanguage : 'en';
}

export function getCurrentLanguage() {
  if (typeof document !== 'undefined') {
    const htmlLanguage = document.documentElement?.dataset?.language;
    if (SUPPORTED_LANGUAGES.includes(htmlLanguage)) return htmlLanguage;
  }
  return getStoredLanguage();
}

export const translations = {
  en: {
    // Welcome Screen
    welcomeTitle: "Experience Fine Dining at Your Fingertips",
    welcomeSubtitle: "Handcrafted Culinary Excellence & Seamless iPad Ordering",
    startOrder: "START ORDER",
    language: "Language",
    
    // Header & Navigation
    searchPlaceholder: "Search Food...",
    dineIn: "Dine In",
    takeaway: "Takeaway",
    table: "Table",
    popular: "Popular",
    mains: "Mains",
    drinks: "Drinks",
    desserts: "Desserts",
    promos: "Promos",
    
    // Dish & Cart UI
    add: "+ Add",
    addToOrder: "Add to Order",
    myOrder: "MY ORDER",
    subtotal: "Subtotal",
    sst: "SST (6%)",
    serviceCharge: "Service Charge (10%)",
    total: "TOTAL",
    checkout: "CHECKOUT",
    emptyCart: "Your cart is empty",
    emptyCartSub: "Select dishes from the menu to start your fine dining experience.",
    backToMenu: "Back to Menu",
    
    // Customization Modal
    portionSize: "Portion Size",
    regular: "Regular",
    large: "Large",
    addOns: "Add-ons",
    specialRequest: "Special Request",
    specialPlaceholder: "E.g. Extra hot, allergies, no pepper...",
    addToCartBtn: "ADD TO CART",
    editItemBtn: "UPDATE ITEM",
    lessOil: "Less Oil",
    noOnions: "No Onions",
    sauceOnSide: "Sauce on Side",
    extraSpicy: "Extra Spicy",
    
    // Order Review Screen
    itemsReview: "ITEMS REVIEW",
    orderSummary: "ORDER SUMMARY",
    confirmAndPay: "CONFIRM & PAY",
    edit: "Edit",
    delete: "Delete",
    clearCart: "Clear Cart",
    
    // Dining Mode & Table Selection
    selectDiningOption: "SELECT DINING OPTION",
    chooseTable: "Choose Your Table",
    vacant: "VACANT",
    selected: "SELECTED",
    occupied: "OCCUPIED",
    proceedToPayment: "PROCEED TO PAYMENT",
    
    // Payment Method Screen
    selectPaymentMethod: "SELECT PAYMENT METHOD",
    cardPayment: "Credit / Debit Card",
    cardDesc: "Visa, Mastercard, MyDebit",
    eWallet: "E-Wallet",
    eWalletDesc: "GrabPay, Touch 'n Go, QR Pay",
    counterPayment: "Pay at Counter",
    counterDesc: "Pay cash or card to cashier",
    tapCardInstruction: "PLEASE TAP OR INSERT CARD ON TERMINAL BELOW",
    paymentVerified: "Payment Verified Successfully!",
    
    // Live Order Status Screen
    orderReceived: "ORDER RECEIVED SUCCESSFULLY!",
    orderNumberLabel: "YOUR ORDER NUMBER IS",
    statusPlaced: "Order Placed",
    statusPreparing: "Preparing",
    statusReady: "Ready",
    estimatedWait: "Estimated Waiting Time",
    mins: "Mins",
    items: "Items",
    printReceipt: "PRINT RECEIPT",
    done: "DONE / NEW ORDER",
    
    // PWA & Network Status
    onlineStatus: "Online - Kitchen Connected",
    offlineStatus: "Offline Mode - Orders Queued Locally",
    installPwa: "Install iPad POS App"
  },
  
  zh: {
    // Welcome Screen
    welcomeTitle: "指尖上的臻致餐饮体验",
    welcomeSubtitle: "匠心烹饪美馔 · iPad 极速自主点餐",
    startOrder: "开始点餐",
    language: "语言",
    
    // Header & Navigation
    searchPlaceholder: "搜索美食...",
    dineIn: "堂食",
    takeaway: "外带",
    table: "桌号",
    popular: "🔥 热门推荐",
    mains: "主菜",
    drinks: "饮品",
    desserts: "甜品",
    promos: "优惠促销",
    
    // Dish & Cart UI
    add: "+ 添加",
    addToOrder: "加入订单",
    myOrder: "我的已选",
    subtotal: "小计",
    sst: "SST 服务税 (6%)",
    serviceCharge: "服务费 (10%)",
    total: "总计",
    checkout: "去结算",
    emptyCart: "购物车空空如也",
    emptyCartSub: "请从菜单中选择精致美馔，开启您的美食之旅。",
    backToMenu: "返回菜单",
    
    // Customization Modal
    portionSize: "份量选择",
    regular: "标准份",
    large: "大份",
    addOns: "加配选项",
    specialRequest: "特殊要求",
    specialPlaceholder: "例如：少油、不放洋葱、酱汁另放...",
    addToCartBtn: "加入购物车",
    editItemBtn: "更新此项",
    lessOil: "少油",
    noOnions: "不加洋葱",
    sauceOnSide: "酱汁另放",
    extraSpicy: "加辣",
    
    // Order Review Screen
    itemsReview: "已选美馔确认",
    orderSummary: "费用明细",
    confirmAndPay: "确认并支付",
    edit: "修改",
    delete: "删除",
    clearCart: "清空",
    
    // Dining Mode & Table Selection
    selectDiningOption: "选择用餐方式",
    chooseTable: "选择您的餐桌",
    vacant: "空休闲",
    selected: "已选择",
    occupied: "使用中",
    proceedToPayment: "继续支付",
    
    // Payment Method Screen
    selectPaymentMethod: "选择支付方式",
    cardPayment: "信用卡 / 借记卡",
    cardDesc: "Visa, Mastercard, MyDebit",
    eWallet: "电子钱包",
    eWalletDesc: "GrabPay, Touch 'n Go, 扫码支付",
    counterPayment: "柜台结账",
    counterDesc: "前往柜台支付现金或刷卡",
    tapCardInstruction: "请在下方终端刷卡、插卡或感应支付",
    paymentVerified: "支付成功验证完成！",
    
    // Live Order Status Screen
    orderReceived: "订单已成功提交！",
    orderNumberLabel: "您的取餐/用餐编号",
    statusPlaced: "已接单",
    statusPreparing: "出厨准备中",
    statusReady: "美馔已齐",
    estimatedWait: "预计等待时间",
    mins: "分钟",
    items: "项美食",
    printReceipt: "打印收据",
    done: "完成 / 新订单",
    
    // PWA & Network Status
    onlineStatus: "在线 - 厨房实时联网",
    offlineStatus: "离线模式 - 订单本地暂存",
    installPwa: "安装 iPad POS 应用"
  },
  
  ms: {
    // Welcome Screen
    welcomeTitle: "Pengalaman Makanan Mewah di Hujung Jari Anda",
    welcomeSubtitle: "Kelezatan Seni Kulinari & Pesanan iPad Terpantas",
    startOrder: "MULA PESANAN",
    language: "Bahasa",
    
    // Header & Navigation
    searchPlaceholder: "Cari Makanan...",
    dineIn: "Makan Di Sini",
    takeaway: "Bawa Pulang",
    table: "Meja",
    popular: "🔥 Popular",
    mains: "Hidangan Utama",
    drinks: "Minuman",
    desserts: "Pencuci Mulut",
    promos: "Promosi",
    
    // Dish & Cart UI
    add: "+ Tambah",
    addToOrder: "Tambah Pesanan",
    myOrder: "PESANAN SAYA",
    subtotal: "Jumlah Kecil",
    sst: "SST (6%)",
    serviceCharge: "Caj Perkhidmatan (10%)",
    total: "JUMLAH KESELURUHAN",
    checkout: "BAYAR SEKARANG",
    emptyCart: "Troli anda kosong",
    emptyCartSub: "Sila pilih hidangan daripada menu untuk memulakan pesanan anda.",
    backToMenu: "Kembali ke Menu",
    
    // Customization Modal
    portionSize: "Saiz Hidangan",
    regular: "Biasa",
    large: "Besar",
    addOns: "Tambah-pilihan",
    specialRequest: "Permintaan Khas",
    specialPlaceholder: "Cth. Kurang minyak, tiada bawang...",
    addToCartBtn: "TAMBAH KE TROLI",
    editItemBtn: "KEMAS KINI ITEM",
    lessOil: "Kurang Minyak",
    noOnions: "Tiada Bawang",
    sauceOnSide: "Sos Di Tepi",
    extraSpicy: "Lebih Pedas",
    
    // Order Review Screen
    itemsReview: "SEMAKAN ITEM",
    orderSummary: "RINGKASAN PESANAN",
    confirmAndPay: "SAHKAN & BAYAR",
    edit: "Edit",
    delete: "Padam",
    clearCart: "Kosongkan",
    
    // Dining Mode & Table Selection
    selectDiningOption: "PILIH CARA MAKAN",
    chooseTable: "Pilih Meja Anda",
    vacant: "KOSONG",
    selected: "DIPILIH",
    occupied: "DIDUDUKI",
    proceedToPayment: "TERUSKAN KE PEMBAYARAN",
    
    // Payment Method Screen
    selectPaymentMethod: "PILIH KAEDAH PEMBAYARAN",
    cardPayment: "Kad Kredit / Debit",
    cardDesc: "Visa, Mastercard, MyDebit",
    eWallet: "E-Dompet",
    eWalletDesc: "GrabPay, Touch 'n Go, Imbas QR",
    counterPayment: "Bayar di Kaunter",
    counterDesc: "Bayar tunai kepada juruwang",
    tapCardInstruction: "SILA SENTUH ATAU MASUKKAN KAD PADA TERMINAL",
    paymentVerified: "Pembayaran Berjaya Disahkan!",
    
    // Live Order Status Screen
    orderReceived: "PESANAN BERJAYA DITERIMA!",
    orderNumberLabel: "NOMBOR PESANAN ANDA",
    statusPlaced: "Diterima",
    statusPreparing: "Sedang Disediakan",
    statusReady: "Sedia Hidang",
    estimatedWait: "Masa Menunggu Anggaran",
    mins: "Minit",
    items: "Item",
    printReceipt: "CETAK RESIT",
    done: "SELESAI / PESANAN BARU",
    
    // PWA & Network Status
    onlineStatus: "Dalam Talian - Dapur Terhubung",
    offlineStatus: "Mod Luar Talian - Pesanan Disimpan Lokal",
    installPwa: "Pasang Aplikasi iPad POS"
  }
};

// Shared operational copy. Keeping this in one dictionary prevents individual
// POS screens from silently falling back to hardcoded English.
const operationalCopy = {
  en: {
    dashboard: 'Dashboard', refresh: 'Refresh', loading: 'Loading…', retry: 'Retry', cancel: 'Cancel', save: 'Save', back: 'Back',
    loadingTerminal: 'Loading Terminal…', terminalUnavailable: 'Terminal access unavailable', signOut: 'Sign out',
    profile: 'Profile', lockTerminal: 'Lock Terminal', viewProfile: 'View Profile', canvasMode: 'iPad Canvas Mode:', landscapeMode: 'iPad Landscape @2x',
    kitchenQueue: 'Kitchen Queue', loadingKitchen: 'Loading persisted kitchen orders…', noKitchenOrders: 'No active kitchen orders',
    order: 'Order', orderNumber: 'Order #{number}', tableNumber: 'Table {number}', takeawayPickup: 'Takeaway Pickup',
    round: 'ROUND {number}', addOnRound: 'ADD-ON • ROUND {number}', takeawayBadge: '🥡 TAKEAWAY', kitchenPending: 'KITCHEN PENDING',
    preparingElapsed: 'Preparing {time}', readyFront: 'Ready for front-of-house', waitingStart: 'Waiting to start', updating: 'UPDATING…',
    start: 'START', ready: 'READY', request: 'Request: {request}', packaging: 'Packaging',
    readyServeCollect: 'Ready to Serve / Collect', loadingReady: 'Loading ready orders…', noReadyOrders: 'No orders are ready to serve',
    packWithOrder: 'Pack with order', collecting: 'COLLECTING…', serving: 'SERVING…', markCollected: 'MARK COLLECTED', markServed: 'MARK SERVED',
    dailySales: 'Daily Sales', from: 'From', to: 'To', paidOrders: 'Paid orders', netPaid: 'Net paid',
    loadingReport: 'Loading report…', noSales: 'No paid sales for this date range.', paidAt: 'Paid at', method: 'Method', mode: 'Mode', amount: 'Amount',
    reviewOrder: 'Review Order', orderDestination: 'Order destination', addOnRoundLabel: 'ADD-ON ROUND', tax: 'Tax', totalPreview: 'Total preview',
    takeawayPackaging: 'Takeaway Packaging', packagingHelp: 'Select what the kitchen must pack with this order.', edit: 'Edit', processing: 'Processing…',
    continuePay: 'Continue to Pay', sendOrder: 'Send Order', authoritativeNotice: 'Product availability and final prices are validated again by Supabase during submission.',
    takeawayPaymentNotice: 'Payment submits the order to the kitchen.', dineInSubmitNotice: 'Confirming sends these items to the kitchen.',
    orderRounds: 'Order Rounds', discount: 'Discount', pay: 'Pay', addItems: 'Add Items', unsentPayment: 'Send or remove all draft items before payment.',
    payment: 'Payment', loadingOrder: 'Loading authoritative order…', orderNotFound: 'Order was not found.', choosePayment: 'Choose payment method', loadingMethods: 'Loading methods…',
    cash: 'Cash', card: 'Card', paymentMethodUnavailable: 'Provider not configured', cashReceived: 'Cash received', change: 'Change', receivedInsufficient: 'Received amount must cover the total.',
    confirmPayment: 'Confirm Payment', recordingPayment: 'Recording payment…', paySubmitTakeaway: 'Pay & Submit Takeaway', paymentDbNotice: 'The database validates the final amount inside complete_payment().',
    paymentConfirmed: 'Payment Confirmed', fulfillmentContinues: 'Payment is persisted. Kitchen preparation and serving will continue.', paymentPersisted: 'The payment and completed order are persisted in Supabase.',
    paymentNumber: 'Payment number', paymentMethod: 'Payment method', totalPaid: 'Total paid', received: 'Received', done: 'Done', printReceipt: 'Print Receipt',
    unpaidOrders: 'Unpaid Orders', loadingUnpaid: 'Loading unpaid orders…', noUnpaid: 'No unpaid orders', unpaid: 'UNPAID', viewOrder: 'View Order',
    tableOperations: 'Table Operations', loadingTables: 'Loading tables…', noTables: 'No restaurant tables are configured.', noActiveOrder: 'No active order',
    reserve: 'Reserve', releaseReservation: 'Release Reservation', cleaningComplete: 'Cleaning Complete', startCleaning: 'Start Cleaning', move: 'Move', outOfService: 'Out of Service', restore: 'Restore',
    moveOrder: 'Move Order', destinationHelp: 'The source table will enter CLEANING. The destination will become OCCUPIED atomically.', noDestination: 'No destination table is available.',
    productImageUnavailable: 'Product image unavailable', categories: 'Categories', loadingCategories: 'Loading categories…', allProducts: 'All Products',
    loadingProducts: 'Loading products…', noProductsCategory: 'No products available in this category', noProducts: 'No products available', soldOut: 'Sold Out', price: 'Price',
    changeTable: 'Change', newAddOnRound: 'New Add-On Round', readOnlyRounds: 'Read-only · will not be sent again', newItemsRound: 'New items this round',
    startTakeaway: 'Start a New Takeaway Order', temporaryTakeaway: 'Temporary Takeaway Tables', temporaryTakeawayHelp: 'Open an existing takeaway order here. It disappears after payment.',
    loadingTakeaway: 'Loading takeaway orders…', noTakeaway: 'No active unpaid takeaway orders', noTakeawayHelp: 'New takeaway orders will appear here after being sent.', takeawayTable: 'Takeaway Table', itemCount: '{count} items',
    startTakeawayOrder: 'Start Takeaway Order', startNewBill: 'Start New Table Bill', openTableOrder: 'Open Table Order', startTableOrder: 'Start Table Order',
    orderInProgress: 'ORDER IN PROGRESS', currentUnpaidTotal: 'Current unpaid total', viewBillPay: 'View Bill / Pay',
    loadingOrderDetails: 'Loading order details from Supabase…', roundsHelp: 'Every round belongs to this single bill. Submitted items are never resent.',
    noPersistedItems: 'No persisted order items were returned.', grandTotal: 'GRAND TOTAL', thankYou: 'Thank you for dining with us!', paymentStatus: 'Payment status: {status}', printThermal: 'Print Thermal Receipt',
    loginTitle: 'Welcome Back', loginSubtitle: 'Sign in to access your terminal', signupTitle: 'Create Terminal Account', signupSubtitle: 'Register a new terminal operator account',
    fullName: 'Full Name', email: 'Email Address', password: 'Password', signingIn: 'Signing In…', creatingAccount: 'Creating Account…', signIn: 'SIGN IN', register: 'REGISTER ACCOUNT', securedAuth: 'Secured with Supabase Authentication',
    saveChanges: 'SAVE CHANGES', saving: 'Saving…', logout: 'LOG OUT', phoneNumber: 'Phone Number', username: 'Username',
    screenLoadError: 'The POS screen could not load', screenLoadHelp: 'A cached or incompatible interface module caused a runtime error.', reloadApp: 'Reload App',
  },
  zh: {
    dashboard: '仪表板', refresh: '刷新', loading: '加载中…', retry: '重试', cancel: '取消', save: '保存', back: '返回',
    loadingTerminal: '终端加载中…', terminalUnavailable: '终端访问不可用', signOut: '退出登录', profile: '个人资料', lockTerminal: '锁定终端', viewProfile: '查看个人资料', canvasMode: 'iPad 画布模式：', landscapeMode: 'iPad 横屏 @2x',
    kitchenQueue: '厨房队列', loadingKitchen: '正在加载厨房订单…', noKitchenOrders: '暂无厨房订单', order: '订单', orderNumber: '订单 #{number}', tableNumber: '餐桌 {number}', takeawayPickup: '外带取餐',
    round: '第 {number} 轮', addOnRound: '加单 · 第 {number} 轮', takeawayBadge: '🥡 外带', kitchenPending: '等待厨房接单', preparingElapsed: '制作中 {time}', readyFront: '可交由前厅', waitingStart: '等待开始', updating: '更新中…', start: '开始', ready: '已备妥', request: '要求：{request}', packaging: '包装用品',
    readyServeCollect: '待上菜 / 待取餐', loadingReady: '正在加载待上菜订单…', noReadyOrders: '暂无待上菜订单', packWithOrder: '随餐包装', collecting: '取餐处理中…', serving: '上菜处理中…', markCollected: '标记已取餐', markServed: '标记已上菜',
    dailySales: '每日销售', from: '从', to: '至', paidOrders: '已付款订单', netPaid: '实收', loadingReport: '报表加载中…', noSales: '此日期范围内没有已付款销售。', paidAt: '付款时间', method: '方式', mode: '类型', amount: '金额',
    reviewOrder: '检查订单', orderDestination: '订单目的地', addOnRoundLabel: '加单轮次', tax: '税费', totalPreview: '预计总额', takeawayPackaging: '外带包装', packagingHelp: '选择厨房需随订单包装的用品。', edit: '修改', processing: '处理中…', continuePay: '继续付款', sendOrder: '发送订单', authoritativeNotice: '提交时，Supabase 会再次验证商品供应状态与最终价格。', takeawayPaymentNotice: '付款后订单将发送至厨房。', dineInSubmitNotice: '确认后这些商品将发送至厨房。',
    orderRounds: '订单轮次', discount: '折扣', pay: '付款', addItems: '添加商品', unsentPayment: '付款前请发送或移除所有草稿商品。', payment: '付款', loadingOrder: '正在加载正式订单…', orderNotFound: '找不到订单。', choosePayment: '选择付款方式', loadingMethods: '正在加载付款方式…', cash: '现金', card: '银行卡', paymentMethodUnavailable: '付款服务尚未配置', cashReceived: '收到现金', change: '找零', receivedInsufficient: '收款金额必须不少于总额。', confirmPayment: '确认付款', recordingPayment: '正在记录付款…', paySubmitTakeaway: '付款并提交外带订单', paymentDbNotice: '数据库会在 complete_payment() 内验证最终金额。',
    paymentConfirmed: '付款已确认', fulfillmentContinues: '付款已保存，厨房制作与上菜流程将继续。', paymentPersisted: '付款及已完成订单已保存至 Supabase。', paymentNumber: '付款编号', paymentMethod: '付款方式', totalPaid: '已付总额', received: '实收', done: '完成', printReceipt: '打印收据',
    unpaidOrders: '未付款订单', loadingUnpaid: '正在加载未付款订单…', noUnpaid: '暂无未付款订单', unpaid: '未付款', viewOrder: '查看订单', tableOperations: '餐桌管理', loadingTables: '正在加载餐桌…', noTables: '尚未设置餐桌。', noActiveOrder: '无进行中订单', reserve: '预留', releaseReservation: '取消预留', cleaningComplete: '清洁完成', startCleaning: '开始清洁', move: '转桌', outOfService: '停用', restore: '恢复', moveOrder: '转移订单', destinationHelp: '原桌将进入清洁状态，目标桌会自动变为使用中。', noDestination: '没有可用的目标餐桌。',
    productImageUnavailable: '商品图片不可用', categories: '分类', loadingCategories: '正在加载分类…', allProducts: '全部商品', loadingProducts: '正在加载商品…', noProductsCategory: '此分类暂无商品', noProducts: '暂无商品', soldOut: '售罄', price: '价格', changeTable: '更换', newAddOnRound: '新增加单轮次', readOnlyRounds: '仅供查看 · 不会重复发送', newItemsRound: '本轮新增商品',
    startTakeaway: '开始新的外带订单', temporaryTakeaway: '临时外带订单', temporaryTakeawayHelp: '在此打开现有外带订单，付款后会消失。', loadingTakeaway: '正在加载外带订单…', noTakeaway: '暂无未付款外带订单', noTakeawayHelp: '新外带订单发送后会显示在这里。', takeawayTable: '外带订单', itemCount: '{count} 项', startTakeawayOrder: '开始外带订单', startNewBill: '开始新账单', openTableOrder: '打开餐桌订单', startTableOrder: '开始餐桌订单',
    orderInProgress: '订单进行中', currentUnpaidTotal: '当前未付款总额', viewBillPay: '查看账单 / 付款', loadingOrderDetails: '正在从 Supabase 加载订单详情…', roundsHelp: '所有轮次属于同一账单，已提交商品不会重复发送。', noPersistedItems: '没有返回已保存的订单商品。', grandTotal: '总计', thankYou: '感谢您的光临！', paymentStatus: '付款状态：{status}', printThermal: '打印热敏收据',
    loginTitle: '欢迎回来', loginSubtitle: '登录以使用终端', signupTitle: '创建终端账户', signupSubtitle: '注册新的终端操作员账户', fullName: '姓名', email: '电子邮件', password: '密码', signingIn: '登录中…', creatingAccount: '创建账户中…', signIn: '登录', register: '注册账户', securedAuth: '由 Supabase 身份验证保护', saveChanges: '保存更改', saving: '保存中…', logout: '退出登录', phoneNumber: '电话号码', username: '用户名', screenLoadError: 'POS 页面无法加载', screenLoadHelp: '缓存或不兼容的界面模块导致运行错误。', reloadApp: '重新加载应用',
  },
  ms: {
    dashboard: 'Papan Pemuka', refresh: 'Muat Semula', loading: 'Memuatkan…', retry: 'Cuba Lagi', cancel: 'Batal', save: 'Simpan', back: 'Kembali',
    loadingTerminal: 'Terminal Sedang Dimuatkan…', terminalUnavailable: 'Akses terminal tidak tersedia', signOut: 'Log keluar', profile: 'Profil', lockTerminal: 'Kunci Terminal', viewProfile: 'Lihat Profil', canvasMode: 'Mod Kanvas iPad:', landscapeMode: 'Landskap iPad @2x',
    kitchenQueue: 'Barisan Dapur', loadingKitchen: 'Memuatkan pesanan dapur…', noKitchenOrders: 'Tiada pesanan dapur aktif', order: 'Pesanan', orderNumber: 'Pesanan #{number}', tableNumber: 'Meja {number}', takeawayPickup: 'Pengambilan Bawa Pulang',
    round: 'PUSINGAN {number}', addOnRound: 'TAMBAHAN • PUSINGAN {number}', takeawayBadge: '🥡 BAWA PULANG', kitchenPending: 'MENUNGGU DAPUR', preparingElapsed: 'Sedang disediakan {time}', readyFront: 'Sedia untuk bahagian hadapan', waitingStart: 'Menunggu untuk dimulakan', updating: 'MENGEMAS KINI…', start: 'MULA', ready: 'SEDIA', request: 'Permintaan: {request}', packaging: 'Pembungkusan',
    readyServeCollect: 'Sedia Dihidang / Diambil', loadingReady: 'Memuatkan pesanan sedia…', noReadyOrders: 'Tiada pesanan sedia untuk dihidang', packWithOrder: 'Bungkus bersama pesanan', collecting: 'MENGAMBIL…', serving: 'MENGHIDANG…', markCollected: 'TANDA DIAMBIL', markServed: 'TANDA DIHIDANG',
    dailySales: 'Jualan Harian', from: 'Dari', to: 'Hingga', paidOrders: 'Pesanan dibayar', netPaid: 'Bayaran bersih', loadingReport: 'Memuatkan laporan…', noSales: 'Tiada jualan berbayar untuk julat tarikh ini.', paidAt: 'Dibayar pada', method: 'Kaedah', mode: 'Mod', amount: 'Jumlah',
    reviewOrder: 'Semak Pesanan', orderDestination: 'Destinasi pesanan', addOnRoundLabel: 'PUSINGAN TAMBAHAN', tax: 'Cukai', totalPreview: 'Pratonton jumlah', takeawayPackaging: 'Pembungkusan Bawa Pulang', packagingHelp: 'Pilih item yang perlu dibungkus oleh dapur.', edit: 'Edit', processing: 'Memproses…', continuePay: 'Teruskan Bayaran', sendOrder: 'Hantar Pesanan', authoritativeNotice: 'Ketersediaan produk dan harga akhir disahkan semula oleh Supabase semasa penghantaran.', takeawayPaymentNotice: 'Bayaran akan menghantar pesanan ke dapur.', dineInSubmitNotice: 'Pengesahan menghantar item ini ke dapur.',
    orderRounds: 'Pusingan Pesanan', discount: 'Diskaun', pay: 'Bayar', addItems: 'Tambah Item', unsentPayment: 'Hantar atau buang semua item draf sebelum bayaran.', payment: 'Bayaran', loadingOrder: 'Memuatkan pesanan rasmi…', orderNotFound: 'Pesanan tidak ditemui.', choosePayment: 'Pilih kaedah bayaran', loadingMethods: 'Memuatkan kaedah…', cash: 'Tunai', card: 'Kad', paymentMethodUnavailable: 'Penyedia belum dikonfigurasi', cashReceived: 'Tunai diterima', change: 'Baki', receivedInsufficient: 'Jumlah diterima mesti mencukupi.', confirmPayment: 'Sahkan Bayaran', recordingPayment: 'Merekod bayaran…', paySubmitTakeaway: 'Bayar & Hantar Bawa Pulang', paymentDbNotice: 'Pangkalan data mengesahkan jumlah akhir dalam complete_payment().',
    paymentConfirmed: 'Bayaran Disahkan', fulfillmentContinues: 'Bayaran disimpan. Penyediaan dapur dan hidangan akan diteruskan.', paymentPersisted: 'Bayaran dan pesanan lengkap disimpan dalam Supabase.', paymentNumber: 'Nombor bayaran', paymentMethod: 'Kaedah bayaran', totalPaid: 'Jumlah dibayar', received: 'Diterima', done: 'Selesai', printReceipt: 'Cetak Resit',
    unpaidOrders: 'Pesanan Belum Dibayar', loadingUnpaid: 'Memuatkan pesanan belum dibayar…', noUnpaid: 'Tiada pesanan belum dibayar', unpaid: 'BELUM DIBAYAR', viewOrder: 'Lihat Pesanan', tableOperations: 'Operasi Meja', loadingTables: 'Memuatkan meja…', noTables: 'Tiada meja restoran dikonfigurasi.', noActiveOrder: 'Tiada pesanan aktif', reserve: 'Tempah', releaseReservation: 'Lepaskan Tempahan', cleaningComplete: 'Pembersihan Selesai', startCleaning: 'Mula Membersih', move: 'Pindah', outOfService: 'Tidak Beroperasi', restore: 'Pulihkan', moveOrder: 'Pindah Pesanan', destinationHelp: 'Meja asal akan menjadi PEMBERSIHAN dan meja destinasi menjadi DIDUDUKI secara atomik.', noDestination: 'Tiada meja destinasi tersedia.',
    productImageUnavailable: 'Imej produk tidak tersedia', categories: 'Kategori', loadingCategories: 'Memuatkan kategori…', allProducts: 'Semua Produk', loadingProducts: 'Memuatkan produk…', noProductsCategory: 'Tiada produk dalam kategori ini', noProducts: 'Tiada produk tersedia', soldOut: 'Habis Dijual', price: 'Harga', changeTable: 'Tukar', newAddOnRound: 'Pusingan Tambahan Baharu', readOnlyRounds: 'Baca sahaja · tidak akan dihantar semula', newItemsRound: 'Item baharu pusingan ini',
    startTakeaway: 'Mulakan Pesanan Bawa Pulang', temporaryTakeaway: 'Meja Bawa Pulang Sementara', temporaryTakeawayHelp: 'Buka pesanan bawa pulang sedia ada di sini. Ia hilang selepas bayaran.', loadingTakeaway: 'Memuatkan pesanan bawa pulang…', noTakeaway: 'Tiada pesanan bawa pulang belum dibayar', noTakeawayHelp: 'Pesanan bawa pulang baharu akan muncul selepas dihantar.', takeawayTable: 'Meja Bawa Pulang', itemCount: '{count} item', startTakeawayOrder: 'Mulakan Pesanan Bawa Pulang', startNewBill: 'Mulakan Bil Meja Baharu', openTableOrder: 'Buka Pesanan Meja', startTableOrder: 'Mulakan Pesanan Meja',
    orderInProgress: 'PESANAN SEDANG BERJALAN', currentUnpaidTotal: 'Jumlah semasa belum dibayar', viewBillPay: 'Lihat Bil / Bayar', loadingOrderDetails: 'Memuatkan butiran pesanan daripada Supabase…', roundsHelp: 'Setiap pusingan berada dalam satu bil. Item dihantar tidak akan dihantar semula.', noPersistedItems: 'Tiada item pesanan tersimpan dikembalikan.', grandTotal: 'JUMLAH BESAR', thankYou: 'Terima kasih kerana makan bersama kami!', paymentStatus: 'Status bayaran: {status}', printThermal: 'Cetak Resit Termal',
    loginTitle: 'Selamat Kembali', loginSubtitle: 'Log masuk untuk mengakses terminal', signupTitle: 'Cipta Akaun Terminal', signupSubtitle: 'Daftar akaun operator terminal baharu', fullName: 'Nama Penuh', email: 'Alamat E-mel', password: 'Kata Laluan', signingIn: 'Sedang Log Masuk…', creatingAccount: 'Mencipta Akaun…', signIn: 'LOG MASUK', register: 'DAFTAR AKAUN', securedAuth: 'Dilindungi dengan Pengesahan Supabase', saveChanges: 'SIMPAN PERUBAHAN', saving: 'Menyimpan…', logout: 'LOG KELUAR', phoneNumber: 'Nombor Telefon', username: 'Nama Pengguna', screenLoadError: 'Skrin POS tidak dapat dimuatkan', screenLoadHelp: 'Modul antara muka cache atau tidak serasi menyebabkan ralat.', reloadApp: 'Muat Semula Aplikasi',
  },
};

for (const language of Object.keys(operationalCopy)) {
  Object.assign(translations[language], operationalCopy[language]);
}

Object.assign(translations.en, {
  registerTab: 'REGISTER', loginRequired: 'Please enter both email and password.', nameRequired: 'Please enter your name.', passwordLength: 'Password must be at least 8 characters long.', accountCreated: 'Account created! Please check your email to confirm registration.', unexpectedRetry: 'An unexpected error occurred. Please try again.',
  profileLoadFailed: 'Failed to load profile details.', profileLoadUnexpected: 'An unexpected error occurred while loading profile.', fullNameRequired: 'Full Name is required.', usernameRequired: 'Username is required.', profileUpdated: 'Profile updated successfully!', profileSaveUnexpected: 'An unexpected error occurred while updating profile.',
  fineDiningTerminal: 'Fine Dining POS Terminal v2.4', activeKitchenPaymentWarning: 'Kitchen rounds are still waiting, preparing, or ready to serve. I confirm this final payment completes only this bill. Kitchen fulfillment continues and the occupied table may start a separate new bill.', paidKitchenNotice: 'The bill is completed, but its active kitchen rounds remain visible until served. The dine-in table stays occupied and can start a separate new bill; paid items cannot be edited or reused.',
  takeawayStartHelp: 'Use the button below to create a separate temporary pickup order.', openCount: '{count} OPEN', paidNewBill: 'PAID · NEW BILL AVAILABLE', checkFoodStatus: 'Check {number} food status',
  selectOrderTable: 'Select Order Type & Table', guests: '{count} guests', opened: 'Opened {date}', occupiedNoBill: 'No unpaid bill · a new bill may be started, or cleaning can begin after kitchen fulfillment.', confirmOutOfService: 'Mark this table out of service? It will be unavailable for new orders.', confirmCleaned: 'Confirm this table has been cleaned and is ready for guests?', confirmStartCleaning: 'Start cleaning this served table now?', moveConfirm: 'Move {order} to table {table}?',
  customization: 'Customization', basePrice: 'Base Price', chefNote: "Chef's Note", chefNoteText: 'All meals are prepared fresh to order using the finest ingredients.', itemService: 'Item service', packTakeaway: '🥡 Pack as Takeaway', serveDineIn: 'Serve Dine-In', required: 'Required', chooseRange: 'Choose {min}-{max}', included: 'Included', selectMinimum: 'Select at least {count} option before adding this item.', submittedReadOnly: 'Already submitted items are read-only and will not be sent again.', itemsUpper: '{count} ITEMS', unit: 'unit', portion: 'Portion', previewOnly: 'Preview only', currentDatabaseBill: 'Current database bill', reviewAddOn: 'Review Add-on Items',
  editOrder: 'Edit Order', specialNote: 'Special Note', noSpecialNote: 'No special note',
});
Object.assign(translations.zh, {
  registerTab: '注册', loginRequired: '请输入电子邮件和密码。', nameRequired: '请输入姓名。', passwordLength: '密码必须至少为 8 个字符。', accountCreated: '账户已创建！请检查电子邮件并确认注册。', unexpectedRetry: '发生意外错误，请重试。',
  profileLoadFailed: '无法加载个人资料。', profileLoadUnexpected: '加载个人资料时发生意外错误。', fullNameRequired: '姓名为必填项。', usernameRequired: '用户名为必填项。', profileUpdated: '个人资料更新成功！', profileSaveUnexpected: '更新个人资料时发生意外错误。',
  fineDiningTerminal: '精品餐饮 POS 终端 v2.4', activeKitchenPaymentWarning: '厨房轮次仍在等待、制作或待上菜。我确认此最终付款只完成当前账单；厨房履单会继续，使用中的餐桌可以开始另一张新账单。', paidKitchenNotice: '账单已完成，但进行中的厨房轮次会保留至上菜。堂食餐桌保持使用中并可开始新账单；已付款商品不可编辑或重复使用。',
  takeawayStartHelp: '使用下方按钮创建独立的临时取餐订单。', openCount: '{count} 个进行中', paidNewBill: '已付款 · 可开新账单', checkFoodStatus: '查看 {number} 餐点状态',
  selectOrderTable: '选择订单类型与餐桌', guests: '{count} 位客人', opened: '开单时间 {date}', occupiedNoBill: '没有未付款账单 · 可开始新账单，或在厨房履单后开始清洁。', confirmOutOfService: '确定停用此餐桌吗？停用后无法接收新订单。', confirmCleaned: '确认餐桌已清洁并可接待客人吗？', confirmStartCleaning: '现在开始清洁此餐桌吗？', moveConfirm: '将 {order} 转移至餐桌 {table}？',
  customization: '商品定制', basePrice: '基础价格', chefNote: '厨师提示', chefNoteText: '所有餐点均按单新鲜制作，并采用优质食材。', itemService: '商品服务方式', packTakeaway: '🥡 外带包装', serveDineIn: '堂食上菜', required: '必选', chooseRange: '选择 {min}-{max} 项', included: '已包含', selectMinimum: '添加商品前请至少选择 {count} 项。', submittedReadOnly: '已提交商品仅供查看，不会重复发送。', itemsUpper: '{count} 项', unit: '份', portion: '份量', previewOnly: '仅供预览', currentDatabaseBill: '当前数据库账单', reviewAddOn: '检查加单商品',
  editOrder: '修改订单', specialNote: '特别备注', noSpecialNote: '无特别备注',
});
Object.assign(translations.ms, {
  registerTab: 'DAFTAR', loginRequired: 'Sila masukkan e-mel dan kata laluan.', nameRequired: 'Sila masukkan nama anda.', passwordLength: 'Kata laluan mestilah sekurang-kurangnya 8 aksara.', accountCreated: 'Akaun dicipta! Sila semak e-mel untuk mengesahkan pendaftaran.', unexpectedRetry: 'Ralat tidak dijangka berlaku. Sila cuba lagi.',
  profileLoadFailed: 'Gagal memuatkan butiran profil.', profileLoadUnexpected: 'Ralat tidak dijangka berlaku semasa memuatkan profil.', fullNameRequired: 'Nama Penuh diperlukan.', usernameRequired: 'Nama Pengguna diperlukan.', profileUpdated: 'Profil berjaya dikemas kini!', profileSaveUnexpected: 'Ralat tidak dijangka berlaku semasa mengemas kini profil.',
  fineDiningTerminal: 'Terminal POS Santapan Mewah v2.4', activeKitchenPaymentWarning: 'Pusingan dapur masih menunggu, disediakan atau sedia dihidang. Saya mengesahkan bayaran akhir ini hanya melengkapkan bil ini; pemenuhan dapur diteruskan dan meja boleh memulakan bil baharu.', paidKitchenNotice: 'Bil selesai, tetapi pusingan dapur aktif kekal kelihatan sehingga dihidang. Meja kekal diduduki dan boleh memulakan bil baharu; item dibayar tidak boleh diedit atau digunakan semula.',
  takeawayStartHelp: 'Gunakan butang di bawah untuk mencipta pesanan pengambilan sementara.', openCount: '{count} DIBUKA', paidNewBill: 'DIBAYAR · BIL BAHARU TERSEDIA', checkFoodStatus: 'Semak status makanan {number}',
  selectOrderTable: 'Pilih Jenis Pesanan & Meja', guests: '{count} tetamu', opened: 'Dibuka {date}', occupiedNoBill: 'Tiada bil belum dibayar · bil baharu boleh dimulakan atau pembersihan boleh bermula selepas dapur selesai.', confirmOutOfService: 'Tandakan meja ini tidak beroperasi? Ia tidak tersedia untuk pesanan baharu.', confirmCleaned: 'Sahkan meja ini telah dibersihkan dan sedia untuk tetamu?', confirmStartCleaning: 'Mulakan pembersihan meja ini sekarang?', moveConfirm: 'Pindah {order} ke meja {table}?',
  customization: 'Penyesuaian', basePrice: 'Harga Asas', chefNote: 'Nota Cef', chefNoteText: 'Semua hidangan disediakan segar mengikut pesanan menggunakan bahan berkualiti.', itemService: 'Servis item', packTakeaway: '🥡 Bungkus Bawa Pulang', serveDineIn: 'Hidang Makan Di Sini', required: 'Diperlukan', chooseRange: 'Pilih {min}-{max}', included: 'Termasuk', selectMinimum: 'Pilih sekurang-kurangnya {count} pilihan sebelum menambah item.', submittedReadOnly: 'Item yang dihantar adalah baca sahaja dan tidak akan dihantar semula.', itemsUpper: '{count} ITEM', unit: 'unit', portion: 'Saiz', previewOnly: 'Pratonton sahaja', currentDatabaseBill: 'Bil pangkalan data semasa', reviewAddOn: 'Semak Item Tambahan',
  editOrder: 'Edit Pesanan', specialNote: 'Nota Khas', noSpecialNote: 'Tiada nota khas',
});

Object.assign(translations.en, {
  languageName: 'English', diningInHelp: 'Enjoy food prepared and served directly at your designated table', takeawayHelp: 'Packed carefully in eco-friendly thermal takeaway packaging',
  loadingTablesExtended: 'Loading restaurant tables...', unableToLoadTables: 'Unable to load tables: {error}', noRestaurantTables: 'No active restaurant tables are configured.',
  paidStatusLine: 'paid · {status}', notePrefix: 'Note: {note}', sentAt: 'Sent {date}', loadingBackendOrder: 'Loading the persisted order from the backend...',
  backendRefreshFailed: 'The order was placed, but the latest backend details could not be refreshed.', backendOrderSynced: 'Persisted order synced from the backend',
  dineInDraftPaymentWarning: 'Dine-in draft items must be submitted before payment.', orderNotPayableState: 'This order cannot be paid in its current state: {status} / {paymentStatus}.',
  currentSubmittedOrderLocked: 'The current submitted order must remain on its existing table. Reopen that table to add items.', selectTableBeforeContinuing: 'Select a table before continuing.',
  tableUnavailableForOrdering: 'This table is not available for ordering.', paymentRoleRequired: 'A cashier, manager or administrator must complete payment.',
  noActiveProgressOrder: 'This table does not have an active order in progress to check.', qrPayment: 'QR Payment', ewalletPayment: 'E-Wallet',
  terminalBadge: 'Fine Dining POS PWA', appBrand: 'AURA POS', appBrandSubtitle: 'Fine Dining', footerVersion: 'Table Service iPad POS v2.4 • Smart Fine Dining',
  footerKitchenConnected: 'Kitchen Live Connected', footerTouchOptimized: 'Touch Screen Optimized (48pt+)', unpaidOrderAction: 'Unpaid Orders', salesReports: 'Sales Reports',
  transactionDetails: 'Transaction Details', transactionLoadFailed: 'Unable to load transaction details.', actions: 'Actions', view: 'View', close: 'Close', status: 'Status', items: 'Items',
  dailySalesSummary: 'Daily Sales Summary', productSalesReport: 'Product Sales Report', productReportDateHelp: 'Required date range · finalized paid orders by Malaysia business date', dailyReportDateHelp: 'Payment transactions within the selected date range', productsSold: 'Products Sold', unitsSold: 'Units Sold', productGrossSales: 'Product Gross Sales', loadingProductReport: 'Loading product sales report...', noProductSales: 'No finalized product sales were found for this date range.', productCode: 'Product Code', product: 'Product', category: 'Category', quantitySold: 'Quantity Sold', orderCount: 'Order Count', averagePrice: 'Average Price', grossSales: 'Gross Sales',
  splitBill: 'Split Bill', configureSplit: 'Configure Split', splitEqually: 'Split Equally', splitByItem: 'Split by Item', numberOfBills: 'Number of Bills', bill: 'Bill', createBills: 'Create Bills', selectBill: 'Select a Bill', mixedPayment: 'Mixed Payment', remainingAmount: 'Remaining', paid: 'Paid', paymentExceedsBalance: 'Payment cannot exceed the remaining balance.',
  orderTotal: 'Order Total', alreadyPaid: 'Already Paid', remainingBalance: 'Remaining Balance', splitModeFULL: 'Pay Full', splitModeEQUAL: 'Equal', splitModeAMOUNT: 'Amount', splitModeITEM: 'Items', payFullRemaining: 'Pay the full remaining balance', paymentAmount: 'Payment amount', numberOfPeople: 'Number of people', personNumber: 'Person {number}', createEqualSplit: 'Create Equal Split', quantityRemaining: '{count} remaining', selectedTotal: 'Selected total', exactAmountDefault: 'Exact amount by default', reviewPayment: 'Review Payment', paymentHistory: 'Payment History', noPaymentsRecorded: 'No successful payments recorded.', billFullyPaid: 'This order is fully paid.', splitType: 'Split type', remainingBefore: 'Remaining before payment', remainingAfter: 'Remaining after payment', payRemaining: 'Pay Remaining', selectPaymentMethod: 'Select an available payment method.', selectEqualPart: 'Select the equal share being paid.', positivePaymentRequired: 'Enter or select an amount greater than zero.', paymentSummaryFailed: 'Unable to load the payment summary.', splitCreateFailed: 'Unable to create the equal split.', splitPaymentFailed: 'Unable to record the split payment.', receipt: 'Receipt', paymentReceipt: 'Payment Receipt', cashier: 'Cashier', dateTime: 'Date / Time',
});
Object.assign(translations.zh, {
  languageName: '简体中文', diningInHelp: '享用直接送至指定餐桌的新鲜餐点', takeawayHelp: '以环保保温外带包装细心打包', loadingTablesExtended: '正在加载餐桌...', unableToLoadTables: '无法加载餐桌：{error}', noRestaurantTables: '没有可用的餐桌配置。',
  paidStatusLine: '已付款 · {status}', notePrefix: '备注：{note}', sentAt: '已发送 {date}', loadingBackendOrder: '正在从后端加载已保存订单...', backendRefreshFailed: '订单已提交，但无法刷新最新后端详情。', backendOrderSynced: '已从后端同步订单',
  dineInDraftPaymentWarning: '堂食草稿商品必须先提交后才能付款。', orderNotPayableState: '此订单当前状态无法付款：{status} / {paymentStatus}。', currentSubmittedOrderLocked: '当前已提交订单必须保留在原餐桌。请重新打开该桌以加单。', selectTableBeforeContinuing: '请先选择餐桌。',
  tableUnavailableForOrdering: '此餐桌当前不可下单。', paymentRoleRequired: '必须由收银员、经理或管理员完成付款。', noActiveProgressOrder: '此餐桌目前没有可查看进度的进行中订单。', qrPayment: '二维码支付', ewalletPayment: '电子钱包',
  terminalBadge: '精品餐饮 POS PWA', appBrand: 'AURA POS', appBrandSubtitle: '精品餐饮', footerVersion: '餐桌服务 iPad POS v2.4 • 智能精品餐饮', footerKitchenConnected: '厨房实时连接', footerTouchOptimized: '触控优化（48pt+）', unpaidOrderAction: '未付款订单', salesReports: '销售报表',
  transactionDetails: '交易详情', transactionLoadFailed: '无法加载交易详情。', actions: '操作', view: '查看', close: '关闭', status: '状态', items: '商品',
  dailySalesSummary: '每日销售摘要', productSalesReport: '商品销售报表', productReportDateHelp: '必须选择日期范围 · 按马来西亚营业日统计已完成付款订单', dailyReportDateHelp: '所选日期范围内的付款交易', productsSold: '已售商品种类', unitsSold: '售出数量', productGrossSales: '商品销售总额', loadingProductReport: '正在加载商品销售报表…', noProductSales: '此日期范围内没有已完成的商品销售。', productCode: '商品编号', product: '商品', category: '分类', quantitySold: '售出数量', orderCount: '订单数量', averagePrice: '平均价格', grossSales: '销售总额',
  splitBill: '拆分账单', configureSplit: '配置拆单', splitEqually: '平均拆分', splitByItem: '按商品拆分', numberOfBills: '账单数量', bill: '账单', createBills: '创建账单', selectBill: '选择账单', mixedPayment: '混合付款', remainingAmount: '剩余金额', paid: '已付款', paymentExceedsBalance: '付款金额不能超过剩余余额。',
  orderTotal: '订单总额', alreadyPaid: '已付金额', remainingBalance: '剩余余额', splitModeFULL: '付清余额', splitModeEQUAL: '平均', splitModeAMOUNT: '按金额', splitModeITEM: '按商品', payFullRemaining: '支付全部剩余余额', paymentAmount: '付款金额', numberOfPeople: '人数', personNumber: '第 {number} 位', createEqualSplit: '创建平均拆分', quantityRemaining: '剩余 {count}', selectedTotal: '所选总额', exactAmountDefault: '默认实收金额相同', reviewPayment: '检查付款', paymentHistory: '付款记录', noPaymentsRecorded: '暂无成功付款。', billFullyPaid: '此订单已全额付款。', splitType: '拆分方式', remainingBefore: '付款前余额', remainingAfter: '付款后余额', payRemaining: '支付余额', selectPaymentMethod: '请选择可用付款方式。', selectEqualPart: '请选择当前支付的份额。', positivePaymentRequired: '请输入或选择大于零的金额。', paymentSummaryFailed: '无法加载付款摘要。', splitCreateFailed: '无法创建平均拆分。', splitPaymentFailed: '无法记录拆分付款。', receipt: '收据', paymentReceipt: '付款收据', cashier: '收银员', dateTime: '日期／时间',
});
Object.assign(translations.ms, {
  languageName: 'Bahasa Melayu', diningInHelp: 'Nikmati makanan yang disediakan dan dihidang terus ke meja anda', takeawayHelp: 'Dibungkus rapi menggunakan pembungkusan bawa pulang mesra alam',
  loadingTablesExtended: 'Memuatkan meja restoran...', unableToLoadTables: 'Tidak dapat memuatkan meja: {error}', noRestaurantTables: 'Tiada meja restoran aktif dikonfigurasi.',
  paidStatusLine: 'dibayar · {status}', notePrefix: 'Nota: {note}', sentAt: 'Dihantar {date}', loadingBackendOrder: 'Memuatkan pesanan tersimpan dari backend...', backendRefreshFailed: 'Pesanan telah dibuat, tetapi butiran backend terkini tidak dapat dimuat semula.', backendOrderSynced: 'Pesanan tersimpan diselaraskan dari backend',
  dineInDraftPaymentWarning: 'Item draf makan di sini mesti dihantar sebelum bayaran.', orderNotPayableState: 'Pesanan ini tidak boleh dibayar dalam keadaan semasa: {status} / {paymentStatus}.', currentSubmittedOrderLocked: 'Pesanan yang telah dihantar mesti kekal pada meja asal. Buka semula meja itu untuk menambah item.', selectTableBeforeContinuing: 'Pilih meja sebelum meneruskan.',
  tableUnavailableForOrdering: 'Meja ini tidak tersedia untuk pesanan.', paymentRoleRequired: 'Juruwang, pengurus atau pentadbir mesti melengkapkan bayaran.', noActiveProgressOrder: 'Meja ini tidak mempunyai pesanan aktif yang sedang berjalan untuk diperiksa.', qrPayment: 'Bayaran QR', ewalletPayment: 'E-Dompet',
  terminalBadge: 'POS Santapan Mewah PWA', appBrand: 'AURA POS', appBrandSubtitle: 'Santapan Mewah', footerVersion: 'iPad POS Servis Meja v2.4 • Santapan Pintar', footerKitchenConnected: 'Dapur Bersambung Langsung', footerTouchOptimized: 'Dioptimumkan untuk Sentuhan (48pt+)', unpaidOrderAction: 'Pesanan Belum Dibayar', salesReports: 'Laporan Jualan',
  transactionDetails: 'Butiran Transaksi', transactionLoadFailed: 'Tidak dapat memuatkan butiran transaksi.', actions: 'Tindakan', view: 'Lihat', close: 'Tutup', status: 'Status', items: 'Item',
  dailySalesSummary: 'Ringkasan Jualan Harian', productSalesReport: 'Laporan Jualan Produk', productReportDateHelp: 'Julat tarikh diperlukan · pesanan berbayar muktamad mengikut hari perniagaan Malaysia', dailyReportDateHelp: 'Transaksi bayaran dalam julat tarikh dipilih', productsSold: 'Produk Terjual', unitsSold: 'Unit Terjual', productGrossSales: 'Jualan Kasar Produk', loadingProductReport: 'Memuatkan laporan jualan produk...', noProductSales: 'Tiada jualan produk muktamad untuk julat tarikh ini.', productCode: 'Kod Produk', product: 'Produk', category: 'Kategori', quantitySold: 'Kuantiti Terjual', orderCount: 'Bilangan Pesanan', averagePrice: 'Harga Purata', grossSales: 'Jualan Kasar',
  splitBill: 'Pecah Bil', configureSplit: 'Konfigurasi Pecahan', splitEqually: 'Pecah Sama Rata', splitByItem: 'Pecah Mengikut Item', numberOfBills: 'Bilangan Bil', bill: 'Bil', createBills: 'Cipta Bil', selectBill: 'Pilih Bil', mixedPayment: 'Bayaran Campuran', remainingAmount: 'Baki', paid: 'Dibayar', paymentExceedsBalance: 'Bayaran tidak boleh melebihi baki.',
  orderTotal: 'Jumlah Pesanan', alreadyPaid: 'Sudah Dibayar', remainingBalance: 'Baki Tertunggak', splitModeFULL: 'Bayar Penuh', splitModeEQUAL: 'Sama Rata', splitModeAMOUNT: 'Amaun', splitModeITEM: 'Item', payFullRemaining: 'Bayar semua baki tertunggak', paymentAmount: 'Amaun bayaran', numberOfPeople: 'Bilangan orang', personNumber: 'Orang {number}', createEqualSplit: 'Cipta Pecahan Sama Rata', quantityRemaining: '{count} berbaki', selectedTotal: 'Jumlah dipilih', exactAmountDefault: 'Amaun tepat secara lalai', reviewPayment: 'Semak Bayaran', paymentHistory: 'Sejarah Bayaran', noPaymentsRecorded: 'Tiada bayaran berjaya direkodkan.', billFullyPaid: 'Pesanan ini telah dibayar penuh.', splitType: 'Jenis pecahan', remainingBefore: 'Baki sebelum bayaran', remainingAfter: 'Baki selepas bayaran', payRemaining: 'Bayar Baki', selectPaymentMethod: 'Pilih kaedah bayaran yang tersedia.', selectEqualPart: 'Pilih bahagian sama rata yang dibayar.', positivePaymentRequired: 'Masukkan atau pilih amaun melebihi sifar.', paymentSummaryFailed: 'Tidak dapat memuatkan ringkasan bayaran.', splitCreateFailed: 'Tidak dapat mencipta pecahan sama rata.', splitPaymentFailed: 'Tidak dapat merekodkan bayaran pecahan.', receipt: 'Resit', paymentReceipt: 'Resit Bayaran', cashier: 'Juruwang', dateTime: 'Tarikh / Masa',
});

export function translate(language, key, variables = {}) {
  const template = translations[language]?.[key] ?? translations.en[key] ?? key;
  return String(template).replace(/\{(\w+)\}/g, (_, name) => String(variables[name] ?? `{${name}}`));
}

export function translateStatus(language, status) {
  const normalized = String(status || '').toUpperCase();
  const labels = {
    en: { DRAFT: 'Draft', CONFIRMED: 'Confirmed', SUBMITTED: 'Submitted', PENDING: 'Pending', PREPARING: 'Preparing', READY: 'Ready', SERVED: 'Served', COMPLETED: 'Completed', CANCELLED: 'Cancelled', UNPAID: 'Unpaid', PARTIALLY_PAID: 'Partially Paid', PAID: 'Paid', AVAILABLE: 'Available', OCCUPIED: 'Occupied', RESERVED: 'Reserved', CLEANING: 'Cleaning', DISABLED: 'Disabled' },
    zh: { DRAFT: '草稿', CONFIRMED: '已确认', SUBMITTED: '已提交', PENDING: '等待中', PREPARING: '制作中', READY: '已备妥', SERVED: '已上菜', COMPLETED: '已完成', CANCELLED: '已取消', UNPAID: '未付款', PARTIALLY_PAID: '部分付款', PAID: '已付款', AVAILABLE: '可用', OCCUPIED: '使用中', RESERVED: '已预留', CLEANING: '清洁中', DISABLED: '已停用' },
    ms: { DRAFT: 'Draf', CONFIRMED: 'Disahkan', SUBMITTED: 'Dihantar', PENDING: 'Menunggu', PREPARING: 'Sedang Disediakan', READY: 'Sedia', SERVED: 'Dihidang', COMPLETED: 'Selesai', CANCELLED: 'Dibatalkan', UNPAID: 'Belum Dibayar', PARTIALLY_PAID: 'Dibayar Sebahagian', PAID: 'Dibayar', AVAILABLE: 'Tersedia', OCCUPIED: 'Diduduki', RESERVED: 'Ditempah', CLEANING: 'Pembersihan', DISABLED: 'Dilumpuhkan' },
  };
  return labels[language]?.[normalized] ?? labels.en[normalized] ?? normalized;
}

export function translatePackaging(language, code) {
  const labels = {
    CUP_LID: ['Cup Lid', '杯盖', 'Penutup Cawan'], PAPER_BAG: ['Paper Bag', '纸袋', 'Beg Kertas'], TAKEAWAY_BOX: ['Takeaway Box', '外带盒', 'Kotak Bawa Pulang'],
    CUTLERY: ['Cutlery', '餐具', 'Peralatan Makan'], STRAW: ['Straw', '吸管', 'Penyedut Minuman'], SAUCE: ['Sauce', '酱料', 'Sos'], NAPKIN: ['Napkin', '餐巾纸', 'Tisu'],
  };
  const index = language === 'zh' ? 1 : language === 'ms' ? 2 : 0;
  return labels[code]?.[index] ?? String(code || '').replaceAll('_', ' ');
}
