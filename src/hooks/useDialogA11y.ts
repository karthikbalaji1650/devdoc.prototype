import { useEffect, useRef } from 'react';

/** Keyboard behaviour every modal dialog needs: Escape closes it, focus
 * moves into the dialog when it opens, Tab stays inside it, and focus
 * returns to whatever opened it when it closes. Attach the returned ref
 * to the dialog element. */
export function useDialogA11y<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    const opener = window.document.activeElement as HTMLElement | null;
    dialog?.focus();

    const focusable = () =>
      Array.from(dialog?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])
        .filter((el) => !el.hasAttribute('disabled'));

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = window.document.activeElement;
      if (e.shiftKey && (active === first || active === dialog)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };

    window.document.addEventListener('keydown', onKeyDown);
    return () => {
      window.document.removeEventListener('keydown', onKeyDown);
      opener?.focus?.();
    };
  }, []);

  return ref;
}
