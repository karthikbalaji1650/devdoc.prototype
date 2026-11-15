import { useEffect, useRef } from 'react';
import type { AppView, OperationsTab } from '../types/appState';
import { isReleasesPath, navigateTo, onLocationChange, releasesPath } from '../services/releasesRoute';

/** True when the address bar asks for Release Master (a bookmark or shared link). */
export const startsOnReleases = (): boolean => typeof window !== 'undefined' && isReleasesPath(window.location.pathname);

/**
 * Keeps the address bar and the app's screen in step for Release Master:
 * opening it puts /releases in the address bar, leaving it takes that out,
 * and Back / Forward move between the app's screens and the releases'.
 * (Inside Release Master the screens manage their own paths.)
 */
export function useReleasesUrl(
  currentApp: AppView,
  activeOpsTab: OperationsTab,
  open: (app: AppView, tab?: OperationsTab) => void,
  signedIn: boolean,
): void {
  const onReleases = signedIn && currentApp === 'operations' && activeOpsTab === 'releases';
  const wasOnReleases = useRef(onReleases);

  useEffect(() => {
    const inUrl = isReleasesPath(window.location.pathname);
    if (onReleases && !inUrl) navigateTo(releasesPath());
    // Leaving adds a history entry, so Back returns; a link opened while signed
    // out was never "visited", so signing in just replaces it.
    if (!onReleases && inUrl && signedIn) navigateTo('/', { replace: !wasOnReleases.current });
    wasOnReleases.current = onReleases;
  }, [onReleases, signedIn]);

  useEffect(() => onLocationChange(() => {
    const inUrl = isReleasesPath(window.location.pathname);
    if (inUrl && !onReleases && signedIn) open('operations', 'releases');
    if (!inUrl && onReleases) open('dashboard');
  }), [onReleases, signedIn, open]);
}
