import { useCallback, useEffect, useState } from 'react';
import { listSelectableStaff, setOwnStaffPin, startStaffPinSession } from '../features/auth/authService';

export function useStaffHandoff(enabled, currentUserId) {
  const [staff, setStaff] = useState([]);
  const [selected, setSelected] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(enabled));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [pinResetRequired, setPinResetRequired] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    const result = await listSelectableStaff();
    setStaff(result.data || []);
    setError(result.error?.message || '');
    setIsLoading(false);
  }, [enabled]);

  useEffect(() => { if (enabled) void refresh(); }, [enabled, refresh]);

  const submitPin = useCallback(async (pin) => {
    if (!selected || isSubmitting) return false;
    setIsSubmitting(true);
    setError('');
    const result = await startStaffPinSession(selected.id, pin);
    setIsSubmitting(false);
    if (result.error) {
      setError(result.error.message);
      return { ok: false, pinResetRequired: false };
    }
    const mustResetPin = Boolean(result.data?.pinResetRequired);
    setPinResetRequired(mustResetPin);
    return { ok: true, pinResetRequired: mustResetPin };
  }, [isSubmitting, selected]);

  const setupPin = useCallback(async (pin) => {
    if (!selected || isSubmitting) return false;
    if (!pinResetRequired && selected.id !== currentUserId) {
      setError('This staff member must sign in with their own account to set a new PIN.');
      return false;
    }
    setIsSubmitting(true);
    setError('');
    const result = await setOwnStaffPin(pin);
    setIsSubmitting(false);
    if (result.error) {
      setError(result.error.message);
      return false;
    }
    setStaff(current => current.map(person => person.id === selected.id ? { ...person, pin_status: 'ACTIVE', pin_setup_required: false } : person));
    setSelected(current => current ? { ...current, pin_status: 'ACTIVE', pin_setup_required: false } : current);
    setPinResetRequired(false);
    return true;
  }, [currentUserId, isSubmitting, pinResetRequired, selected]);

  return { staff, selected, select: (value) => { setSelected(value); setError(''); setPinResetRequired(false); }, cancel: () => { setSelected(null); setError(''); setPinResetRequired(false); }, isLoading, isSubmitting, error, pinResetRequired, refresh, submitPin, setupPin };
}
