// Downloadable test summary reports for a test run (DDS-SRS-024): HTML, CSV,
// and the same HTML opened for the browser to print / save as PDF. The HTML follows the usual
// test summary report sections (IEEE 829 style): identification, summary,
// failures and defects, detailed results, sign-off.
import type { TestRunCaseResult, TestRunItem, TestCaseStatus } from '../types/operations';

const STATUSES: TestCaseStatus[] = ['Passed', 'Failed', 'Blocked', 'Retest', 'Skipped', 'Untested'];

export interface RunSummary {
  total: number;
  counts: Record<TestCaseStatus, number>;
  executed: number;
  /** Executed / total, 0-100. */
  completionPct: number;
  /** Passed / executed, 0-100. */
  passRatePct: number;
}

export function summarizeRun(results: TestRunCaseResult[]): RunSummary {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<TestCaseStatus, number>;
  for (const r of results) counts[r.status] += 1;
  const total = results.length;
  const executed = total - counts.Untested;
  return {
    total,
    counts,
    executed,
    completionPct: total ? Math.round((executed / total) * 100) : 0,
    passRatePct: executed ? Math.round((counts.Passed / executed) * 100) : 0,
  };
}

const esc = (s: string | undefined) =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export function reportFileName(run: TestRunItem, ext: string): string {
  return `${run.name.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '')}_test_summary.${ext}`;
}

export function buildRunReportCsv(run: TestRunItem, suiteTitle: string): string {
  const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = ['Run', 'Suite', 'Environment', 'Case ID', 'Title', 'Status', 'Assigned To', 'Tested By', 'Tested At', 'Defects', 'Comment'];
  const rows = (run.caseResults ?? []).map((r) => [
    run.name, suiteTitle, run.environment, r.customId, r.title, r.status, r.assignedTo ?? '', r.testedBy ?? '',
    r.testedAt ?? '', (r.defects ?? []).join(' '), r.comment ?? '',
  ]);
  return '\ufeff' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function buildRunReportHtml(run: TestRunItem, suiteTitle: string, opts: { generatedAt?: Date } = {}): string {
  const results = run.caseResults ?? [];
  const s = summarizeRun(results);
  const generated = (opts.generatedAt ?? new Date()).toISOString();
  const failures = results.filter((r) => r.status === 'Failed' || r.status === 'Blocked');
  const allDefects = [...new Set(results.flatMap((r) => r.defects ?? []))];
  const verdict = s.total === 0 ? 'No results' : s.counts.Failed + s.counts.Blocked > 0 ? 'Not passed' : s.counts.Untested > 0 ? 'Incomplete' : 'Passed';
  const verdictClass = verdict === 'Passed' ? 'ok' : verdict === 'Not passed' ? 'bad' : 'warn';
  const bar = STATUSES.filter((st) => s.counts[st]).map((st) =>
    `<span class="seg ${st.toLowerCase()}" style="width:${(s.counts[st] / s.total) * 100}%" title="${st}: ${s.counts[st]}"></span>`).join('');

  const meta: [string, string][] = [
    ['Test run', run.name], ['Test suite', suiteTitle], ['Environment', run.environment],
    ['Milestone', run.milestone || '—'], ['Run status', run.status], ['Executed', fmtDate(run.executedAt)],
    ['Assigned to', run.assignedTo || '—'], ['Report generated', fmtDate(generated)],
  ];

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Test summary report — ${esc(run.name)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1f2937; font-size: 10pt; margin: 0 auto; max-width: 190mm; padding: 10mm 0; }
  h1 { font-size: 17pt; color: #1f3864; margin: 0; }
  h2 { font-size: 11.5pt; color: #1f3864; margin: 7mm 0 2.5mm; border-bottom: 1px solid #d1d5db; padding-bottom: 1mm; }
  .eyebrow { font-size: 8pt; letter-spacing: .08em; text-transform: uppercase; color: #6b7280; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1f3864; padding-bottom: 3mm; }
  .verdict { font-weight: 800; padding: 1.5mm 3mm; border-radius: 1mm; font-size: 10pt; }
  .verdict.ok { background: #dcfce7; color: #166534; } .verdict.bad { background: #fee2e2; color: #991b1b; } .verdict.warn { background: #fef3c7; color: #92400e; }
  table { width: 100%; border-collapse: collapse; }
  .meta td { padding: 1.2mm 2mm; border-bottom: 1px solid #f3f4f6; } .meta td:first-child { width: 40mm; color: #6b7280; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; }
  .kpi { border: 1px solid #e5e7eb; border-radius: 2mm; padding: 2.5mm 3mm; }
  .kpi b { display: block; font-size: 16pt; color: #1f3864; } .kpi span { font-size: 8pt; color: #6b7280; text-transform: uppercase; letter-spacing: .05em; }
  .bar { display: flex; height: 4mm; border-radius: 1mm; overflow: hidden; background: #f3f4f6; margin: 3mm 0 1.5mm; }
  .seg.passed { background: #16a34a; } .seg.failed { background: #dc2626; } .seg.blocked { background: #6b7280; }
  .seg.retest { background: #7c3aed; } .seg.skipped { background: #d97706; } .seg.untested { background: #d1d5db; }
  .legend { font-size: 8.5pt; color: #4b5563; display: flex; flex-wrap: wrap; gap: 4mm; }
  .results th { background: #1f3864; color: #fff; text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; padding: 1.8mm 2mm; }
  .results td { padding: 1.6mm 2mm; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  .results tr { break-inside: avoid; }
  .id, .mono { font-family: Menlo, Consolas, monospace; font-size: 8.5pt; white-space: nowrap; }
  .st { font-weight: 700; } .st.Passed { color: #15803d; } .st.Failed { color: #b91c1c; } .st.Blocked { color: #4b5563; }
  .st.Retest { color: #6d28d9; } .st.Skipped { color: #b45309; } .st.Untested { color: #9ca3af; }
  .muted { color: #6b7280; }
  .sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; margin-top: 4mm; }
  .sign div { border-top: 1px solid #9ca3af; padding-top: 1.5mm; font-size: 8.5pt; color: #4b5563; height: 18mm; }
  .foot { margin-top: 8mm; font-size: 8pt; color: #9ca3af; }
</style></head>
<body>
  <div class="head">
    <div><div class="eyebrow">DevDoc Studio · Test summary report</div><h1>${esc(run.name)}</h1></div>
    <div class="verdict ${verdictClass}">${verdict}</div>
  </div>

  <h2>1. Identification</h2>
  <table class="meta">${meta.map(([k, v]) => `<tr><td>${k}</td><td>${esc(v)}</td></tr>`).join('')}</table>

  <h2>2. Summary</h2>
  <div class="kpis">
    <div class="kpi"><b>${s.total}</b><span>Test cases</span></div>
    <div class="kpi"><b>${s.executed}</b><span>Executed</span></div>
    <div class="kpi"><b>${s.completionPct}%</b><span>Completion</span></div>
    <div class="kpi"><b>${s.passRatePct}%</b><span>Pass rate (of executed)</span></div>
  </div>
  <div class="bar">${bar}</div>
  <div class="legend">${STATUSES.map((st) => `<span>${st}: <b>${s.counts[st]}</b></span>`).join('')}</div>

  <h2>3. Failures and defects</h2>
  ${failures.length
    ? `<table class="results"><thead><tr><th>Case</th><th>Title</th><th>Status</th><th>Defects</th><th>Comment</th></tr></thead><tbody>${failures.map((r) =>
        `<tr><td class="id">${esc(r.customId)}</td><td>${esc(r.title)}</td><td class="st ${r.status}">${r.status}</td><td class="mono">${esc((r.defects ?? []).join(', ')) || '<span class="muted">none linked</span>'}</td><td>${esc(r.comment) || ''}</td></tr>`).join('')}</tbody></table>`
    : '<p class="muted">No failed or blocked test cases.</p>'}
  <p class="muted">Linked defects: ${allDefects.length ? allDefects.map(esc).join(', ') : 'none'}.</p>

  <h2>4. Detailed results</h2>
  <table class="results"><thead><tr><th>Case</th><th>Title</th><th>Status</th><th>Tested by</th><th>Tested at</th></tr></thead><tbody>
  ${results.map((r) => `<tr><td class="id">${esc(r.customId)}</td><td>${esc(r.title)}</td><td class="st ${r.status}">${r.status}</td><td>${esc(r.testedBy) || '—'}</td><td>${fmtDate(r.testedAt)}</td></tr>`).join('')}
  </tbody></table>

  <h2>5. Sign-off</h2>
  <div class="sign"><div>Prepared by (QA)</div><div>Reviewed by (Dev Lead)</div><div>Approved by (Product Owner)</div></div>

  <p class="foot">Generated by DevDoc Studio on ${fmtDate(generated)}. Counts are computed from the per-case results listed in section 4.</p>
</body></html>`;
}
