import { describe, it, expect } from 'vitest';
import { normalizePriority, priorityInText, PRIORITIES } from './testCasePriority';

describe('test case priority (DDS-SRS-013)', () => {
  it('uses the SRS names', () => {
    expect(PRIORITIES).toEqual(['Critical', 'High', 'Medium', 'Low']);
  });

  it('accepts current names in any case, and converts the old P1-P4', () => {
    expect(normalizePriority('high')).toBe('High');
    expect(normalizePriority(' CRITICAL ')).toBe('Critical');
    expect(['P1', 'p2', 'P3', 'P4'].map((p) => normalizePriority(p))).toEqual(['Critical', 'High', 'Medium', 'Low']);
  });

  it('falls back for anything else', () => {
    expect(normalizePriority('urgent')).toBe('Medium');
    expect(normalizePriority(undefined, 'High')).toBe('High');
  });

  it('finds a priority among Robot tags', () => {
    expect(priorityInText('    Critical    Firmware    RTC')).toBe('Critical');
    expect(priorityInText('P4    Firmware')).toBe('Low');
    expect(priorityInText('Firmware    RTC')).toBeNull();
  });
});
