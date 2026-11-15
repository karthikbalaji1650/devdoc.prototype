// URLs for Release Master, so a release (or one of its builds) can be
// bookmarked, shared and reached with the browser's Back button:
//
//   /releases                              the list
//   /releases/new                          the new-release form
//   /releases/:id                          overview
//   /releases/:id/builds                   builds
//   /releases/:id/builds/:buildId          builds, with that one in view
//   /releases/:id/blockers | notes | audit

export type ReleaseTab = 'overview' | 'builds' | 'blockers' | 'notes' | 'audit';
export const RELEASE_TABS: ReleaseTab[] = ['overview', 'builds', 'blockers', 'notes', 'audit'];

export type ReleaseRoute =
  | { view: 'list' }
  | { view: 'new' }
  | { view: 'release'; releaseId: string; tab: ReleaseTab; buildId: string | null };

export const isReleasesPath = (pathname: string): boolean => pathname === '/releases' || pathname.startsWith('/releases/');

export function parseReleasesPath(pathname: string): ReleaseRoute {
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] !== 'releases' || parts.length === 1) return { view: 'list' };
  if (parts[1] === 'new' && parts.length === 2) return { view: 'new' };
  const tab = (parts[2] ?? 'overview') as ReleaseTab;
  if (!RELEASE_TABS.includes(tab)) return { view: 'release', releaseId: parts[1], tab: 'overview', buildId: null };
  return { view: 'release', releaseId: parts[1], tab, buildId: tab === 'builds' ? parts[3] ?? null : null };
}

export function releasesPath(route: ReleaseRoute = { view: 'list' }): string {
  if (route.view === 'list') return '/releases';
  if (route.view === 'new') return '/releases/new';
  const base = `/releases/${encodeURIComponent(route.releaseId)}`;
  if (route.tab === 'overview') return base;
  const build = route.tab === 'builds' && route.buildId ? `/${encodeURIComponent(route.buildId)}` : '';
  return `${base}/${route.tab}${build}`;
}

const CHANGED = 'devdoc:locationchange';

/** Moves to `path` without reloading, and tells every listener. */
export function navigateTo(path: string, { replace = false }: { replace?: boolean } = {}): void {
  if (window.location.pathname === path) return;
  window.history[replace ? 'replaceState' : 'pushState'](null, '', path);
  window.dispatchEvent(new Event(CHANGED));
}

/** Subscribes to location changes (links, Back and Forward); returns the unsubscribe. */
export function onLocationChange(listener: () => void): () => void {
  window.addEventListener('popstate', listener);
  window.addEventListener(CHANGED, listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener(CHANGED, listener);
  };
}
