import { hasPosCapability, POS_CAPABILITIES } from '../shared/permissions';

const ADMIN_PERMISSIONS = new Set([
  'dashboard.view', 'product.create', 'product.edit', 'category.create', 'category.edit',
  'user.view', 'role.view', 'order.manage', 'payment.refund', 'table.manage', 'report.view',
  'audit.view', 'system.health.view', 'settings.view',
]);

export function getRoleLanding(role) {
  if (role === 'ADMIN') return 'admin';
  if (role === 'KITCHEN') return 'kitchen';
  return 'welcome';
}

export function hasAdminWorkspaceAccess(permissions = []) {
  return permissions.some((permission) => ADMIN_PERMISSIONS.has(permission));
}

export function canAccessProtectedScreen(screen, role, permissions = []) {
  const granted = new Set(permissions);
  const can = (permission, capability) => granted.has(permission) && hasPosCapability(role, capability);
  const rules = {
    menu: can('order.view', POS_CAPABILITIES.START_ORDER),
    cartReview: can('order.view', POS_CAPABILITIES.START_ORDER),
    orderReview: can('order.view', POS_CAPABILITIES.START_ORDER),
    tableSelection: can('order.view', POS_CAPABILITIES.START_ORDER),
    payment: can('payment.view', POS_CAPABILITIES.TAKE_PAYMENT),
    splitBill: can('payment.view', POS_CAPABILITIES.TAKE_PAYMENT),
    kitchen: can('order.view', POS_CAPABILITIES.OPERATE_KITCHEN),
    readyToServe: can('order.view', POS_CAPABILITIES.SERVE_ORDER),
    reports: can('report.view', POS_CAPABILITIES.VIEW_REPORTS),
    tableManagement: can('table.view', POS_CAPABILITIES.OPERATE_TABLES),
    unpaidOrders: can('order.view', POS_CAPABILITIES.VIEW_UNPAID_ORDERS),
    admin: hasAdminWorkspaceAccess(permissions),
    orderDetail: can('order.view', POS_CAPABILITIES.VIEW_UNPAID_ORDERS),
    orderStatus: can('order.view', POS_CAPABILITIES.VIEW_UNPAID_ORDERS) || can('order.view', POS_CAPABILITIES.OPERATE_KITCHEN),
  };
  return !(screen in rules) || rules[screen];
}
