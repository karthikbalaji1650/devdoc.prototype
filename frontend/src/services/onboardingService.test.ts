import { describe, it, expect, vi, afterEach } from 'vitest';
import { hasSeenWelcome, markWelcomeSeen } from './onboardingService';

afterEach(() => vi.restoreAllMocks());

describe('onboarding welcome guide', () => {
  it('has not been seen on a fresh browser', () => {
    expect(hasSeenWelcome()).toBe(false);
  });

  it('is remembered as seen once marked', () => {
    markWelcomeSeen();
    expect(hasSeenWelcome()).toBe(true);
  });

  it('treats storage being unavailable as already seen, rather than forcing the guide', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(hasSeenWelcome()).toBe(true);
  });

  it('does not throw when storage is unavailable to write to', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => markWelcomeSeen()).not.toThrow();
  });
});
