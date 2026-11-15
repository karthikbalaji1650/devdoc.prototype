import { useSyncExternalStore } from 'react';
import { onLocationChange } from '../services/releasesRoute';

/** The browser's current path; re-renders on links, Back and Forward. */
export function useLocationPath(): string {
  return useSyncExternalStore(onLocationChange, () => window.location.pathname, () => '/');
}
