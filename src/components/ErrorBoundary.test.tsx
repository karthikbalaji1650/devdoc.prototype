import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ErrorBoundary } from './ErrorBoundary';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

function render(node: React.ReactNode) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.restoreAllMocks();
});

const Boom = (): React.ReactElement => { throw new Error('kaboom'); };

describe('ErrorBoundary', () => {
  it('renders children when nothing fails', () => {
    const el = render(<ErrorBoundary><p>fine</p></ErrorBoundary>);
    expect(el.textContent).toBe('fine');
  });

  it('shows a recovery screen with the message and a backup button instead of a blank page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    expect(el.textContent).toContain('Something went wrong');
    expect(el.textContent).toContain('kaboom');
    expect(el.textContent).toContain('Download data backup');
  });
});
