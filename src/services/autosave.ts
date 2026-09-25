export interface DebouncedSaver<T> {
  /** Remember the latest value and (re)start the delay. */
  schedule: (value: T) => void;
  /** Save the latest value right now if one is waiting. */
  flush: () => void;
  /** Drop the waiting value without saving. */
  cancel: () => void;
  hasPending: () => boolean;
}

/** Collapses a burst of changes into one save of the most recent value.
 * Call flush() before anything that reads the saved copy, and when the
 * page is being hidden, so a pending edit is never lost. */
export function createDebouncedSaver<T>(save: (value: T) => void, delayMs: number): DebouncedSaver<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { value: T } | null = null;

  const run = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!pending) return;
    const { value } = pending;
    pending = null;
    save(value);
  };

  return {
    schedule(value) {
      pending = { value };
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, delayMs);
    },
    flush: run,
    cancel() {
      if (timer) { clearTimeout(timer); timer = null; }
      pending = null;
    },
    hasPending: () => pending !== null,
  };
}
