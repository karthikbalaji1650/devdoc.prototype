import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6 text-[var(--text)]">
        <div className="w-full max-w-md border border-[var(--border)] bg-[var(--panel)] p-6">
          <h1 className="text-lg font-bold">Something went wrong</h1>
          <p className="mt-2 text-sm text-[var(--text-dim)]">
            This screen hit an unexpected error. Your documents are stored on the server and have not been affected - anything already saved is safe.
          </p>
          <p className="mt-3 break-words border border-[var(--border)] bg-[var(--panel-alt)] px-3 py-2 font-mono text-[11px] text-[var(--danger)]">
            {this.state.error.message || String(this.state.error)}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={() => window.location.reload()} className="btn-primary px-3.5 py-2 text-xs font-semibold">
              Reload
            </button>
            <button type="button" onClick={() => this.setState({ error: null })} className="border border-[var(--border)] px-3.5 py-2 text-xs font-semibold text-[var(--text-dim)] hover:border-[var(--success)] hover:text-[var(--success)]">
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
