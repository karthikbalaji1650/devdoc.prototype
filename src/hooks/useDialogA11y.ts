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
      // Always decide the next focus ourselves and never fall through to
      // native Tab handling: WebKit's default tab order (unlike Chromium's
      // and Firefox's) doesn't reliably keep a tabindex="-1" dialog
      // container in the loop, so relying on it for even one keypress let
      // Tab escape the dialog entirely there - most visible on a dialog
      // with only one focusable item (Doc Bin, empty).
      e.preventDefault();
      const items = focusable();
      if (items.length === 0) return;
      const index = items.indexOf(window.document.activeElement as HTMLElement);
      // index is -1 while focus is still on the dialog container itself
      // (just after opening, before any Tab press): a forward Tab should
      // land on the first item and a shift+Tab should wrap to the last.
      const nextIndex = index === -1
        ? (e.shiftKey ? items.length - 1 : 0)
        : (index + (e.shiftKey ? -1 : 1) + items.length) % items.length;
      items[nextIndex].focus();
    };

    window.document.addEventListener('keydown', onKeyDown);
    return () => {
      window.document.removeEventListener('keydown', onKeyDown);
      opener?.focus?.();
    };
  }, []);

  return ref;
}
