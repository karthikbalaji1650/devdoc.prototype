/** localStorage writes throw once the browser quota (~5 MB) is full or
 * when storage is blocked. Wrapping them lets the app report the
 * failure instead of silently losing the save (or crashing a handler). */

export const STORAGE_ERROR_EVENT = 'devdoc:storage-error';

export interface StorageErrorDetail {
  key: string;
  reason: 'quota' | 'unavailable';
}

/** Browsers cap localStorage at roughly 5 million UTF-16 characters. */
export const APPROX_QUOTA_CHARS = 5 * 1024 * 1024;

function isQuotaError(err: unknown): boolean {
  return err instanceof DOMException && (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.code === 22 ||
    err.code === 1014
  );
}

/** Returns true when the value was stored. On failure it returns false
 * and (unless notify is false) raises STORAGE_ERROR_EVENT so the UI can
 * warn the user. */
export function safeSetItem(key: string, value: string, opts: { notify?: boolean } = {}): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    if (opts.notify !== false) {
      const detail: StorageErrorDetail = { key, reason: isQuotaError(err) ? 'quota' : 'unavailable' };
      window.dispatchEvent(new CustomEvent<StorageErrorDetail>(STORAGE_ERROR_EVENT, { detail }));
    }
    return false;
  }
}

export interface StorageUsage {
  usedChars: number;
  quotaChars: number;
  fraction: number;
}

/** Approximate usage: keys and values are both stored as UTF-16. */
export function getStorageUsage(): StorageUsage {
  let usedChars = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === null) continue;
      usedChars += key.length + (localStorage.getItem(key)?.length ?? 0);
    }
  } catch {
    // storage unavailable: report empty
  }
  return { usedChars, quotaChars: APPROX_QUOTA_CHARS, fraction: usedChars / APPROX_QUOTA_CHARS };
}
