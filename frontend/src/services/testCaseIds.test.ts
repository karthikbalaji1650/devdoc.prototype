import { describe, expect, it } from 'vitest';
import { nextTestCaseId } from './testCaseIds';

const suite = (...ids: string[]) => ({ testCases: ids.map((customId) => ({ customId })) }) as never;

describe('nextTestCaseId', () => {
  it('starts at TC-001', () => {
    expect(nextTestCaseId([])).toBe('TC-001');
    expect(nextTestCaseId([{ testCases: undefined }])).toBe('TC-001');
  });

  it('continues after the highest ID across all suites', () => {
    expect(nextTestCaseId([suite('TC-003', 'TC-001'), suite('TC-012')])).toBe('TC-013');
  });

  it('ignores IDs in other formats', () => {
    expect(nextTestCaseId([suite('C1', 'C4821', 'TC-RTC-001', 'tc-007')])).toBe('TC-008');
  });

  it('grows past three digits', () => {
    expect(nextTestCaseId([suite('TC-999')])).toBe('TC-1000');
  });
});
