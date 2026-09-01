import { useCallback, useEffect, useState } from 'react';
import { getEinvoiceFeatureForBranch, requestEinvoice } from './einvoiceService';
export function useEinvoice(branchId) {
  const [profile, setProfile] = useState(null);
  const [requested, setRequested] = useState(false);
  useEffect(() => { let mounted = true; if (branchId) getEinvoiceFeatureForBranch(branchId).then((value) => mounted && setProfile(value)); return () => { mounted = false; }; }, [branchId]);
  const submitRequest = useCallback(async (orderId, taxProfileId) => { if (!profile) return { data: null, error: new Error('e-Invoice is not enabled for this branch.') }; const result = await requestEinvoice(orderId, profile.id, taxProfileId); if (!result.error) setRequested(true); return result; }, [profile]);
  return { enabled: Boolean(profile), profile, requested, submitRequest };
}
