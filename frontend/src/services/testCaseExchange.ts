// Import / export of test cases as CSV, JSON and XML (DDS-SRS-015).
//
// All three formats carry the same portable fields. Attachments and the
// evidence screenshot are left out: they are binary, would bloat CSV
// cells, and belong to the instance they were captured on.
import type { TestCaseItem, TestCaseStep } from '../types/operations';

export type ExchangeFormat = 'csv' | 'json' | 'xml';

/** A test case as it travels between tools - no internal ids or state. */
export interface PortableTestCase {
  customId: string;
  title: string;
  type: TestCaseItem['type'];
  priority: TestCaseItem['priority'];
  preconditions: string;
  steps: TestCaseStep[];
  expectedResult: string;
  postconditions: string;
  labels: string[];
  references: string[];
  estimateMin?: number;
  robotCode?: string;
}

export const JSON_SCHEMA_ID = 'devdoc-test-cases-v1';
const CSV_COLUMNS = [
  'ID', 'Title', 'Type', 'Priority', 'Preconditions', 'Steps', 'Expected Result',
  'Post-conditions', 'Labels', 'References', 'Estimate (min)', 'Robot Code',
] as const;
const PRIORITIES: TestCaseItem['priority'][] = ['P1', 'P2', 'P3', 'P4'];

export class ImportError extends Error {}

export function toPortable(tc: TestCaseItem): PortableTestCase {
  return {
    customId: tc.customId,
    title: tc.title,
    type: tc.type,
    priority: tc.priority,
    preconditions: tc.preconditions || '',
    steps: tc.steps.map((s, i) => ({ step: i + 1, action: s.action, expected: s.expected })),
    expectedResult: tc.expectedResult || '',
    postconditions: tc.postconditions || '',
    labels: tc.labels || [],
    references: tc.references || [],
    estimateMin: tc.estimateMin,
    robotCode: tc.robotCode,
  };
}

// ── Normalisation of whatever an import file contains ──────────────────────

function asString(v: unknown): string {
  return v === undefined || v === null ? '' : String(v).trim();
}

function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(asString).filter(Boolean);
  return asString(v).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
}

function normalise(raw: Partial<Record<keyof PortableTestCase, unknown>>, where: string): PortableTestCase {
  const title = asString(raw.title);
  if (!title) throw new ImportError(`${where}: a title is required.`);
  const type = asString(raw.type).toLowerCase() === 'automated' ? 'Automated' : 'Manual';
  const p = asString(raw.priority).toUpperCase();
  const priority = (PRIORITIES as string[]).includes(p) ? (p as TestCaseItem['priority']) : 'P3';
  const steps = Array.isArray(raw.steps)
    ? (raw.steps as Partial<TestCaseStep>[]).map((s, i) => ({ step: i + 1, action: asString(s.action), expected: asString(s.expected) }))
    : parseStepsCell(asString(raw.steps));
  const est = Number(asString(raw.estimateMin));
  return {
    customId: asString(raw.customId),
    title,
    type,
    priority,
    preconditions: asString(raw.preconditions),
    steps: steps.filter((s) => s.action || s.expected),
    expectedResult: asString(raw.expectedResult),
    postconditions: asString(raw.postconditions),
    labels: asList(raw.labels),
    references: asList(raw.references),
    estimateMin: Number.isFinite(est) && est > 0 ? est : undefined,
    robotCode: asString(raw.robotCode) || undefined,
  };
}

// Steps in a single CSV cell: one per line, "1. action => expected".
function formatStepsCell(steps: TestCaseStep[]): string {
  return steps.map((s, i) => `${i + 1}. ${s.action}${s.expected ? ` => ${s.expected}` : ''}`).join('\n');
}

function parseStepsCell(cell: string): TestCaseStep[] {
  return cell.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line, i) => {
    const body = line.replace(/^\d+[.)]\s*/, '');
    const [action, ...rest] = body.split('=>');
    return { step: i + 1, action: action.trim(), expected: rest.join('=>').trim() };
  });
}

// ── CSV (RFC 4180) ───────────────────────────────────────────────────────────

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(cases: TestCaseItem[]): string {
  const rows = cases.map(toPortable).map((c) => [
    c.customId, c.title, c.type, c.priority, c.preconditions, formatStepsCell(c.steps), c.expectedResult,
    c.postconditions, c.labels.join(', '), c.references.join(', '), c.estimateMin?.toString() ?? '', c.robotCode ?? '',
  ]);
  // CRLF line ends and a BOM so Excel opens UTF-8 text correctly.
  return '\ufeff' + [CSV_COLUMNS as readonly string[], ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^\ufeff/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (quoted) throw new ImportError('CSV: a quoted value is never closed.');
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const CSV_FIELD: Record<string, keyof PortableTestCase> = {
  id: 'customId', title: 'title', type: 'type', priority: 'priority', preconditions: 'preconditions',
  steps: 'steps', 'expected result': 'expectedResult', 'post-conditions': 'postconditions',
  postconditions: 'postconditions', labels: 'labels', references: 'references',
  'estimate (min)': 'estimateMin', estimate: 'estimateMin', 'robot code': 'robotCode',
};

function fromCsv(text: string): PortableTestCase[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) throw new ImportError('CSV: the file is empty.');
  const fields = header.map((h) => CSV_FIELD[h.trim().toLowerCase()]);
  if (!fields.includes('title')) throw new ImportError('CSV: no "Title" column found.');
  return rows.map((cells, r) => {
    const raw: Partial<Record<keyof PortableTestCase, unknown>> = {};
    fields.forEach((f, c) => { if (f) raw[f] = cells[c] ?? ''; });
    return normalise(raw, `CSV row ${r + 2}`);
  });
}

// ── JSON ─────────────────────────────────────────────────────────────────────

export function toJson(cases: TestCaseItem[], suiteTitle: string): string {
  return JSON.stringify({ _schema: JSON_SCHEMA_ID, suiteTitle, exportedAt: new Date().toISOString(), testCases: cases.map(toPortable) }, null, 2);
}

function fromJson(text: string): PortableTestCase[] {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new ImportError('JSON: the file is not valid JSON.'); }
  const list = Array.isArray(data) ? data : (data as { testCases?: unknown })?.testCases;
  if (!Array.isArray(list)) throw new ImportError('JSON: expected a "testCases" array.');
  return list.map((c, i) => normalise((c ?? {}) as Record<string, unknown>, `JSON test case ${i + 1}`));
}

// ── XML ──────────────────────────────────────────────────────────────────────

function xmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function toXml(cases: TestCaseItem[], suiteTitle: string): string {
  const el = (tag: string, value: string | undefined, pad = '    ') => (value ? `${pad}<${tag}>${xmlText(value)}</${tag}>\n` : '');
  const body = cases.map(toPortable).map((c) =>
    `  <testCase id="${xmlText(c.customId)}" type="${c.type}" priority="${c.priority}">\n` +
    el('title', c.title) + el('preconditions', c.preconditions) +
    (c.steps.length
      ? `    <steps>\n${c.steps.map((s) => `      <step number="${s.step}">\n${el('action', s.action, '        ')}${el('expected', s.expected, '        ')}      </step>\n`).join('')}    </steps>\n`
      : '') +
    el('expectedResult', c.expectedResult) + el('postconditions', c.postconditions) +
    el('labels', c.labels.join(', ')) + el('references', c.references.join(', ')) +
    el('estimateMin', c.estimateMin?.toString()) + el('robotCode', c.robotCode) +
    '  </testCase>\n').join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testCases suite="${xmlText(suiteTitle)}" schema="${JSON_SCHEMA_ID}">\n${body}</testCases>\n`;
}

function fromXml(text: string): PortableTestCase[] {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new ImportError('XML: the file is not well-formed XML.');
  const nodes = [...doc.getElementsByTagName('testCase')];
  if (!nodes.length) throw new ImportError('XML: no <testCase> elements found.');
  return nodes.map((n, i) => {
    const child = (tag: string) => n.getElementsByTagName(tag)[0]?.textContent ?? '';
    return normalise({
      customId: n.getAttribute('id'),
      type: n.getAttribute('type'),
      priority: n.getAttribute('priority'),
      title: child('title'),
      preconditions: child('preconditions'),
      steps: [...n.getElementsByTagName('step')].map((s) => ({
        action: s.getElementsByTagName('action')[0]?.textContent ?? '',
        expected: s.getElementsByTagName('expected')[0]?.textContent ?? '',
      })),
      expectedResult: child('expectedResult'),
      postconditions: child('postconditions'),
      labels: child('labels'),
      references: child('references'),
      estimateMin: child('estimateMin'),
      robotCode: child('robotCode'),
    }, `XML test case ${i + 1}`);
  });
}

// ── Entry points ─────────────────────────────────────────────────────────────

export function formatFromFileName(name: string): ExchangeFormat | null {
  const ext = name.toLowerCase().split('.').pop();
  return ext === 'csv' || ext === 'json' || ext === 'xml' ? ext : null;
}

/** Parses an import file. Throws ImportError with a message for the user. */
export function parseTestCases(text: string, format: ExchangeFormat): PortableTestCase[] {
  const cases = format === 'csv' ? fromCsv(text) : format === 'json' ? fromJson(text) : fromXml(text);
  if (!cases.length) throw new ImportError('The file contains no test cases.');
  return cases;
}

export function exportTestCases(cases: TestCaseItem[], suiteTitle: string, format: ExchangeFormat): { content: string; mimeType: string } {
  if (format === 'csv') return { content: toCsv(cases), mimeType: 'text/csv;charset=utf-8' };
  if (format === 'json') return { content: toJson(cases, suiteTitle), mimeType: 'application/json' };
  return { content: toXml(cases, suiteTitle), mimeType: 'application/xml' };
}
