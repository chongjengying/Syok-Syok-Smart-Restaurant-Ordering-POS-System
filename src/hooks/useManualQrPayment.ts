import { useEffect, useState } from 'react';
import { fetchManualQrSettings } from '../repositories/qr-payment.repository';

export function useManualQrPayment(enabled = true) {
  const [settings, setSettings] = useState({ enabled: false, scheme: 'DUITNOW', mode: 'STATIC', confirmationMode: 'MANUAL', imageUrl: '', displayName: 'Restaurant DuitNow QR' });
  const [error, setError] = useState('');
  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    void fetchManualQrSettings().then(result => {
      if (!active) return;
      if (result.error) setError('QR payment configuration could not be loaded.');
      else if (result.data) setSettings(current => ({ ...current, ...result.data }));
    });
    return () => { active = false; };
  }, [enabled]);
  return { settings, error };
}
