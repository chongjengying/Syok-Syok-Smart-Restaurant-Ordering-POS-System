import { fetchAdminOrders, fetchAdminPayments, fetchAdminReport, fetchAuditLogs } from '../repositories/admin.repository';
export const getAdminOrders = fetchAdminOrders;
export const getAdminPayments = fetchAdminPayments;
export const getAuditLogs = fetchAuditLogs;
export const getAdminReport = fetchAdminReport;
