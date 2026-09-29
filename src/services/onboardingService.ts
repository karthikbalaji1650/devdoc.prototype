// Tracks, per browser, whether the first-run welcome guide has been
// shown, so it appears once (not on every login) and can be replayed
// on demand from the dashboard's Help button.
const SEEN_KEY = 'devdoc_studio_welcome_seen_v1';

export function hasSeenWelcome(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true; // storage unavailable: don't force it, act as already seen
  }
}

export function markWelcomeSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // best-effort — if this fails the guide just reappears next time
  }
}
