import React, { useEffect, useId, useRef } from 'react';

// Native modal dialogs keep keyboard focus inside the active dialog and make
// the background inert, including when one dialog opens another dialog.
export default function AccessibleDialog({ title, onClose, children, className = 'max-w-2xl', panelClassName = 'rounded-2xl bg-white p-6 shadow-2xl', dismissOnBackdrop = true }) {
  const panel = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const node = panel.current;
    node.showModal();
    return () => {
      node.close();
      if (previous?.isConnected) previous.focus?.();
    };
  }, []);
  return (
    <dialog
      ref={panel}
      aria-labelledby={titleId}
      tabIndex={-1}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const node = event.currentTarget;
        const controls = [...node.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')]
          .filter((item) => item.getClientRects().length && !item.closest('[inert]'));
        const first = controls[0], last = controls.at(-1);
        if (!first) { event.preventDefault(); node.focus(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === node)) {
          event.preventDefault(); first.focus();
        }
      }}
      onClick={(event) => {
        if (!dismissOnBackdrop || event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
      }}
      className={`pos-dialog fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto border-0 text-slate-900 ${panelClassName} ${className}`}
    >
      <h2 id={titleId} className="sr-only">{title}</h2>
      {children}
    </dialog>
  );
}
