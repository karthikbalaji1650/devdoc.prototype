import type { TestSuiteItem } from '../types/operations';

const TC_ID = /^TC-(\d+)$/i;

/** The next sequential test case ID across every suite: "TC-001",
 * "TC-002", ... (DDS-SRS-013). Only IDs already in this format count
 * towards the sequence; older ones like "C1" or "TC-RTC-001" are left
 * as they are and never collide with it. */
export function nextTestCaseId(suites: Pick<TestSuiteItem, 'testCases'>[]): string {
  let max = 0;
  for (const suite of suites) {
    for (const tc of suite.testCases ?? []) {
      const match = TC_ID.exec(tc.customId);
      if (match) max = Math.max(max, Number(match[1]));
    }
  }
  return `TC-${String(max + 1).padStart(3, '0')}`;
}
