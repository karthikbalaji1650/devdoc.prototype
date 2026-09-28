// Every outbound call in this app (Google, AI providers, the VS Code
// file-bridge, and the optional backend API) used to be a bare fetch()
// with no timeout: if the other end hung instead of erroring, the
// calling screen would spin forever with no way to recover except a
// reload. This wraps fetch with an abort-based timeout, and an
// optional bounded retry with backoff for calls that are safe to
// repeat (GET-style reads only — nothing that creates or changes data
// should set `retries`, since a retried write could run twice).

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export interface FetchWithTimeoutOptions extends RequestInit {
  /** Abort and reject if the request hasn't settled by then. */
  timeoutMs?: number;
  /** Extra attempts after the first, only for calls safe to repeat
   * (reads). Retries on a network failure, a timeout, or a 5xx
   * response — never on a 4xx, since that's the server correctly
   * rejecting the request, not a transient failure. */
  retries?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export async function fetchWithTimeout(url: string, options: FetchWithTimeoutOptions = {}): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, retries = 0, signal: callerSignal, ...init } = options;

  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const onCallerAbort = () => controller.abort();
    callerSignal?.addEventListener('abort', onCallerAbort);
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (!response.ok && response.status >= 500 && attempt < retries) {
        await delay(300 * 2 ** attempt);
        continue;
      }
      return response;
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === 'AbortError' && !callerSignal?.aborted;
      if (attempt < retries) {
        await delay(300 * 2 ** attempt);
        continue;
      }
      if (timedOut) {
        throw new TimeoutError(`Request to ${describeUrl(url)} timed out after ${(timeoutMs / 1000).toFixed(0)}s.`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    }
  }
}
