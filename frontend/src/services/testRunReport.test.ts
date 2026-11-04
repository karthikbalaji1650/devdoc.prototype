import { describe, expect, it } from 'vitest';
import type { TestRunItem, TestSuiteItem } from '../types/operations';
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
    for (const section of ['1. Identification', '2. Summary', '3. Manual and automated', '4. Comparison with an earlier run',
      '5. Failures and defects', '6. Detailed results', '7. Sign-off']) {
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
    expect(lines[0]).toBe('Run,Suite,Environment,Case ID,Title,Status,Type,Assigned To,Tested By,Tested At,Defects,Comment');
    expect(lines[2]).toContain('"Flash, ""dual"" bank",Failed');
    expect(lines[2]).toContain('WH3-1210 #482');
  });

  it('builds a safe file name', () => {
    expect(reportFileName(run, 'pdf')).toBe('Regression_v5_67_RC2_test_summary.pdf');
  });

  describe('consolidated manual + automated (DDS-SRS-031) and comparison (DDS-SRS-025)', () => {
    const suite = { id: 's1', testCases: [
      { id: 'a', customId: 'TC-001', type: 'Manual' },
      { id: 'b', customId: 'TC-002', type: 'Automated' },
    ] } as unknown as TestSuiteItem;
    const baseline: TestRunItem = {
      ...run, id: 'run-0', name: 'Nightly 41', executedAt: '2026-11-01T09:00:00Z',
      caseResults: [
        { caseId: 'x', customId: 'TC-001', title: 'Boot', status: 'Passed' },
        { caseId: 'y', customId: 'TC-002', title: 'Flash', status: 'Passed' },
      ],
    };

    it('HTML splits results by type and lists what changed since the earlier run', () => {
      const html = buildRunReportHtml(run, 'Firmware Suite', { suite, baseline });
      expect(html).toContain('Consolidated test summary report (manual + automated)');
      expect(html).toMatch(/<td>Manual<\/td><td>1<\/td><td>1<\/td><td>1<\/td>/);
      expect(html).toMatch(/<td>Automated<\/td><td>1<\/td><td>1<\/td><td>0<\/td><td>1<\/td>/);
      expect(html).toContain('<td>Not in suite</td>'); // TC-003
      expect(html).toContain('Compared with <b>Nightly 41</b>');
      expect(html).toContain('1 regression</b>');
      expect(html).toMatch(/TC-002<\/td><td>Flash, &quot;dual&quot; bank<\/td><td class="st Passed">Passed<\/td><td class="st Failed">Failed<\/td><td class="kind regression">Regression/);
    });

    it('HTML says when there is nothing to compare with', () => {
      expect(buildRunReportHtml(run, 'S')).toContain('No earlier run of this suite to compare with.');
    });

    it('CSV adds each result\'s type and its status in the earlier run', () => {
      const lines = buildRunReportCsv(run, 'S', { suite, baseline }).replace(/^\ufeff/, '').trim().split('\r\n');
      expect(lines[0].endsWith(',Status in Nightly 41,Change')).toBe(true);
      expect(lines[1]).toContain(',Passed,Manual,');
      expect(lines[2]).toContain(',Failed,Automated,');
      expect(lines[2].endsWith(',Passed,Regression')).toBe(true);
      expect(lines[3].endsWith(',,New')).toBe(true);
    });
  });
});
