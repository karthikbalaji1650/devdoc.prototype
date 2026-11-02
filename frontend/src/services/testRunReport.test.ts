import { describe, expect, it } from 'vitest';
import type { TestRunItem } from '../types/operations';
import { buildRunReportCsv, buildRunReportHtml, reportFileName, summarizeRun } from './testRunReport';

const run: TestRunItem = {
  id: 'run-1', name: '[Regression] v5.67 <RC2>', suiteId: 's1', environment: 'AST2600 Staging', status: 'In Progress',
  passedCount: 0, failedCount: 0, blockedCount: 0, executedAt: '2026-11-02T09:00:00Z',
  caseResults: [
    { caseId: 'a', customId: 'TC-001', title: 'Boot', status: 'Passed', testedBy: 'Vaishnavi', testedAt: '2026-11-02T09:10:00Z' },
    { caseId: 'b', customId: 'TC-002', title: 'Flash, "dual" bank', status: 'Failed', defects: ['WH3-1210', '#482'], comment: 'Bank B not selected' },
    { caseId: 'c', customId: 'TC-003', title: 'NTP', status: 'Untested' },
  ],
};

describe('summarizeRun', () => {
  it('derives completion from executed cases and pass rate from executed only', () => {
    const s = summarizeRun(run.caseResults!);
    expect(s).toMatchObject({ total: 3, executed: 2, completionPct: 67, passRatePct: 50 });
    expect(s.counts).toMatchObject({ Passed: 1, Failed: 1, Untested: 1, Blocked: 0 });
  });

  it('handles an empty run', () => {
    expect(summarizeRun([])).toMatchObject({ total: 0, completionPct: 0, passRatePct: 0 });
  });
});

describe('reports', () => {
  it('HTML report carries the template sections, verdict, defects, and escapes content', () => {
    const html = buildRunReportHtml(run, 'Firmware Suite');
    for (const section of ['1. Identification', '2. Summary', '3. Failures and defects', '4. Detailed results', '5. Sign-off']) {
      expect(html).toContain(section);
    }
    expect(html).toContain('Not passed');
    expect(html).toContain('WH3-1210, #482');
    expect(html).toContain('[Regression] v5.67 &lt;RC2&gt;');
    expect(html).not.toContain('<RC2>');
    expect(html).not.toContain('<script'); // the app's CSP forbids inline scripts
  });

  it('CSV report has one row per result with quoted cells and defects', () => {
    const lines = buildRunReportCsv(run, 'Firmware Suite').replace(/^\ufeff/, '').trim().split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('Run,Suite,Environment,Case ID,Title,Status,Assigned To,Tested By,Tested At,Defects,Comment');
    expect(lines[2]).toContain('"Flash, ""dual"" bank",Failed');
    expect(lines[2]).toContain('WH3-1210 #482');
  });

  it('builds a safe file name', () => {
    expect(reportFileName(run, 'pdf')).toBe('Regression_v5_67_RC2_test_summary.pdf');
  });
});
