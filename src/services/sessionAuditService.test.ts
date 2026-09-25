import { describe, it, expect } from 'vitest';
import { recordLogin, recordLogout, getSessionAuditLog } from './sessionAuditService';

describe('session audit log (#11)', () => {
  it('seeds illustrative entries for other demo users on first use', () => {
    const log = getSessionAuditLog();
    expect(log.length).toBeGreaterThanOrEqual(3);
    expect(log.every((e) => e.userName && e.loginTime)).toBe(true);
  });

  it('seeds only once', () => {
    const first = getSessionAuditLog().length;
    const second = getSessionAuditLog().length;
    expect(second).toBe(first);
  });

  it('records a login as an active session (no logout time)', () => {
    recordLogin('u-real', 'Real User', 'admin');
    const entry = getSessionAuditLog().find((e) => e.userId === 'u-real');
    expect(entry).toMatchObject({ userName: 'Real User', role: 'admin', logoutTime: null });
  });

  it('closes the open session on logout', () => {
    recordLogin('u-real', 'Real User', 'admin');
    recordLogout('u-real');
    const entry = getSessionAuditLog().find((e) => e.userId === 'u-real');
    expect(entry?.logoutTime).not.toBeNull();
  });

  it('only closes the matching user, not everyone', () => {
    recordLogin('u-a', 'A', 'admin');
    recordLogin('u-b', 'B', 'admin');
    recordLogout('u-a');
    const log = getSessionAuditLog();
    expect(log.find((e) => e.userId === 'u-a')?.logoutTime).not.toBeNull();
    expect(log.find((e) => e.userId === 'u-b')?.logoutTime).toBeNull();
  });

  it('logout with no open session is a harmless no-op', () => {
    expect(() => recordLogout('ghost')).not.toThrow();
  });

  it('closes the newest session when a user has logged in twice', () => {
    recordLogin('u-x', 'X', 'admin');
    recordLogout('u-x');
    recordLogin('u-x', 'X', 'admin');
    const mine = getSessionAuditLog().filter((e) => e.userId === 'u-x');
    expect(mine).toHaveLength(2);
    expect(mine.filter((e) => e.logoutTime === null)).toHaveLength(1);
  });

  it('lists the newest login first', () => {
    recordLogin('u-new', 'New', 'admin');
    expect(getSessionAuditLog()[0].userId).toBe('u-new');
  });

  it('caps the stored log at 100 entries', () => {
    for (let i = 0; i < 120; i++) recordLogin(`u-${i}`, `U${i}`, 'admin');
    expect(getSessionAuditLog().length).toBeLessThanOrEqual(100);
  });
});
