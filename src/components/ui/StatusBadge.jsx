import React from 'react';
import { AlertCircle, CheckCircle2, Clock3, Info, XCircle } from 'lucide-react';

const success = new Set(['ACTIVE', 'AVAILABLE', 'READY', 'PAID', 'COMPLETED', 'CONNECTED', 'VALID']);
const warning = new Set(['DRAFT', 'PENDING', 'PREPARING', 'UNPAID', 'PARTIALLY_PAID', 'QUEUED', 'RETRYING']);
const danger = new Set(['FAILED', 'INVALID', 'CANCELLED', 'VOIDED', 'REFUNDED', 'CONNECTION_ERROR']);
const info = new Set(['SUBMITTED', 'PROCESSING', 'CONFIRMED', 'OCCUPIED']);

export default function StatusBadge({ value, className = '' }) {
  const code = String(value || 'UNKNOWN').toUpperCase();
  const config = success.has(code)
    ? ['pos-status-success', CheckCircle2]
    : warning.has(code)
      ? ['pos-status-warning', Clock3]
      : danger.has(code)
        ? ['pos-status-danger', code === 'FAILED' ? AlertCircle : XCircle]
        : info.has(code)
          ? ['pos-status-info', Info]
          : ['pos-status-neutral', Info];
  const Icon = config[1];
  return <span className={`pos-status-badge ${config[0]} ${className}`}><Icon aria-hidden="true" size={12} /><span>{code.replaceAll('_', ' ')}</span></span>;
}
