import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithTimeout, TimeoutError } from './fetchWithTimeout';

const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); vi.useFakeTimers(); });
afterEach(() => { fetchMock.mockReset(); vi.unstubAllGlobals(); vi.useRealTimers(); });

/** A fetch that never settles on its own until aborted — exactly like a
 * server that accepted the connection and then hung. */
function abortableHang(signal?: AbortSignal): Promise<Response> {
  return new Promise((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
}

describe('fetchWithTimeout', () => {
  it('passes a normal response straight through', async () => {
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }));
    const res = await fetchWithTimeout('http://x.test/api');
    expect(res.status).toBe(200);
  });

  it('aborts and throws TimeoutError when the server never responds', async () => {
    fetchMock.mockImplementation((_url, init) => abortableHang(init?.signal));
    const promise = fetchWithTimeout('http://x.test/api', { timeoutMs: 5000 });
    const assertion = expect(promise).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
  });

  it("the timeout error names the request's host and the number of seconds", async () => {
    fetchMock.mockImplementation((_url, init) => abortableHang(init?.signal));
    const promise = fetchWithTimeout('http://api.example.com/x', { timeoutMs: 8000 });
    const assertion = expect(promise).rejects.toThrow('Request to api.example.com timed out after 8s.');
    await vi.advanceTimersByTimeAsync(8000);
    await assertion;
  });

  it('does not retry by default', async () => {
    fetchMock.mockResolvedValue(new Response('err', { status: 503 }));
    const res = await fetchWithTimeout('http://x.test/api');
    expect(res.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a 5xx up to the given count, then returns the last response', async () => {
    fetchMock.mockResolvedValue(new Response('err', { status: 500 }));
    const promise = fetchWithTimeout('http://x.test/api', { retries: 2 });
    await vi.runAllTimersAsync();
    const res = await promise;
    expect(res.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 original + 2 retries
  });

  it('stops retrying once a request succeeds', async () => {
    fetchMock.mockResolvedValueOnce(new Response('err', { status: 500 }));
    fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const promise = fetchWithTimeout('http://x.test/api', { retries: 3 });
    await vi.runAllTimersAsync();
    const res = await promise;
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never retries a 4xx — that is the server correctly rejecting the request', async () => {
    fetchMock.mockResolvedValue(new Response('bad', { status: 404 }));
    const res = await fetchWithTimeout('http://x.test/api', { retries: 3 });
    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries after a network failure, and eventually gives up and rethrows it', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const promise = fetchWithTimeout('http://x.test/api', { retries: 2 });
    const assertion = expect(promise).rejects.toThrow('Failed to fetch');
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("respects the caller's own AbortSignal without misreporting it as a timeout", async () => {
    fetchMock.mockImplementation((_url, init) => abortableHang(init?.signal));
    const controller = new AbortController();
    const promise = fetchWithTimeout('http://x.test/api', { timeoutMs: 30_000, signal: controller.signal });
    const assertion = expect(promise).rejects.not.toBeInstanceOf(TimeoutError);
    controller.abort();
    await assertion;
  });
});
