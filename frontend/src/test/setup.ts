import { beforeEach } from 'vitest';

// Every test starts from an empty browser storage so tests can't leak
// state into each other.
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
