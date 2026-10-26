import * as XLSX from 'xlsx';
import type { TestSuiteItem, TestRunItem, MilestoneItem } from '../types/operations';

export function exportOperationsBackupToExcel(
  suites: TestSuiteItem[],
  runs: TestRunItem[],
  milestones: MilestoneItem[]
): void {
  const workbook = XLSX.utils.book_new();

  // ── Suites sheet ──
  const suiteRows = suites.map((s, idx) => ({
    '#': idx + 1,
    'Suite ID': s.id,
    'Title': s.title,
    'Module': s.module,
    'Description': s.description,
    'Linked TA Doc': s.taDocNumber || '',
    'Test Case Count': s.testCases?.length ?? 0,
    'Created At': s.createdAt,
  }));
  const suiteSheet = XLSX.utils.json_to_sheet(suiteRows);
  suiteSheet['!cols'] = [{ wch: 4 }, { wch: 14 }, { wch: 30 }, { wch: 18 }, { wch: 40 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(workbook, suiteSheet, 'Suites');

  // ── Test Cases sheet (flattened across all suites) ──
  const caseRows = suites.flatMap((s) =>
    (s.testCases ?? []).map((tc, idx) => ({
      '#': idx + 1,
      'Suite': s.title,
      'Case ID': tc.customId,
      'Title': tc.title,
      'Preconditions': tc.preconditions,
      'Steps': tc.steps.map((st) => `${st.step}. ${st.action} -> ${st.expected}`).join('\n'),
      'Expected Result': tc.expectedResult,
      'Priority': tc.priority,
      'Type': tc.type,
      'Status': tc.status || 'Untested',
      'Labels': tc.labels?.join(', ') || '',
      'References': tc.references?.join(', ') || '',
    }))
  );
  const caseSheet = XLSX.utils.json_to_sheet(caseRows);
  caseSheet['!cols'] = [
    { wch: 4 }, { wch: 22 }, { wch: 14 }, { wch: 30 }, { wch: 30 },
    { wch: 50 }, { wch: 30 }, { wch: 8 }, { wch: 10 }, { wch: 10 },
    { wch: 18 }, { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(workbook, caseSheet, 'Test Cases');

  // ── Runs sheet ──
  const runRows = runs.map((r, idx) => ({
    '#': idx + 1,
    'Run Name': r.name,
    'Suite': suites.find((s) => s.id === r.suiteId)?.title || r.suiteId,
    'Environment': r.environment,
    'Status': r.status,
    'Passed': r.passedCount,
    'Failed': r.failedCount,
    'Blocked': r.blockedCount,
    'Untested': r.untestedCount ?? '',
    'Milestone': r.milestone || '',
    'Assigned To': r.assignedTo || '',
    'Executed At': r.executedAt,
  }));
  const runSheet = XLSX.utils.json_to_sheet(runRows);
  runSheet['!cols'] = [
    { wch: 4 }, { wch: 26 }, { wch: 22 }, { wch: 14 }, { wch: 12 },
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(workbook, runSheet, 'Test Runs');

  // ── Milestones sheet ──
  const milestoneRows = milestones.map((m, idx) => ({
    '#': idx + 1,
    'Name': m.name,
    'Description': m.description || '',
    'Due Date': m.dueDate || '',
    'Status': m.status,
    'Passed': m.passedCount,
    'Failed': m.failedCount,
    'Blocked': m.blockedCount,
    'Untested': m.untestedCount,
    'Total': m.totalCount,
  }));
  const milestoneSheet = XLSX.utils.json_to_sheet(milestoneRows);
  milestoneSheet['!cols'] = [
    { wch: 4 }, { wch: 24 }, { wch: 34 }, { wch: 12 }, { wch: 10 },
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
  ];
  XLSX.utils.book_append_sheet(workbook, milestoneSheet, 'Milestones');

  const timestamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `Test_Management_Backup_${timestamp}.xlsx`);
}
