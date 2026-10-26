import { describe, it, expect } from 'vitest';
import { buildRobotSuiteText } from './robotSuiteBuilder';
import type { TestSuiteItem, TestCaseItem } from '../types/operations';

function makeCase(overrides: Partial<TestCaseItem> = {}): TestCaseItem {
  return {
    id: 'tc-1', suiteId: 's1', customId: 'TC-001', title: 'Drift check', preconditions: '', steps: [],
    expectedResult: 'OK', priority: 'P2', type: 'Automated', createdAt: '2026-01-01',
    ...overrides,
  };
}

function makeSuite(testCases: TestCaseItem[]): TestSuiteItem {
  return { id: 's1', title: 'RTC Suite', description: '', module: 'Firmware', createdAt: '2026-01-01', testCases };
}

describe('buildRobotSuiteText', () => {
  it('includes only automated (or automation-candidate) cases, not manual ones', () => {
    const suite = makeSuite([
      makeCase({ customId: 'TC-AUTO', type: 'Automated' }),
      makeCase({ id: 'tc-2', customId: 'TC-CANDIDATE', type: 'Manual', automationCandidate: true }),
      makeCase({ id: 'tc-3', customId: 'TC-MANUAL-ONLY', type: 'Manual' }),
    ]);
    const text = buildRobotSuiteText(suite);
    expect(text).toContain('TC-AUTO');
    expect(text).toContain('TC-CANDIDATE');
    expect(text).not.toContain('TC-MANUAL-ONLY');
  });

  it('uses a case\'s own robotCode verbatim when it has one', () => {
    const suite = makeSuite([makeCase({ robotCode: '*** Test Cases ***\nTC_CUSTOM_001\n    Log    hi' })]);
    expect(buildRobotSuiteText(suite)).toContain('TC_CUSTOM_001');
  });

  it('falls back to a generated stub when a case has no robotCode', () => {
    const suite = makeSuite([makeCase({ customId: 'TC-042', title: 'Boots cleanly', priority: 'P1', labels: ['Firmware'] })]);
    const text = buildRobotSuiteText(suite);
    expect(text).toContain('TC-042_Boots_cleanly');
    expect(text).toContain('[Tags]    P1    Firmware');
  });

  it('always leads with the suite title in the Settings block, even with no cases', () => {
    const text = buildRobotSuiteText(makeSuite([]));
    expect(text).toContain('*** Settings ***');
    expect(text).toContain('Documentation     RTC Suite');
    expect(text).toContain('*** Test Cases ***');
  });
});
