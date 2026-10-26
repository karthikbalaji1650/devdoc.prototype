import * as XLSX from 'xlsx';
import type { TestCaseItem, TableData } from '../types/document';

export function exportTestCasesToExcel(testCases: TestCaseItem[], docNumber: string = 'QA_Matrix'): void {
  const rows = testCases.map((tc, idx) => ({
    '#': idx + 1,
    'Test ID': tc.id || `TC-${idx + 1}`,
    'Test Title': tc.title || '',
    'Status': tc.status || 'PENDING',
    'Objective': tc.objective || '',
    'Execution Steps': Array.isArray(tc.steps) ? tc.steps.join('\n') : (tc.steps || ''),
    'Expected Result': tc.expectedResult || '',
    'Actual Result': tc.actualResult || '',
    'Notes': tc.notes || ''
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Set column widths
  worksheet['!cols'] = [
    { wch: 4 },  // #
    { wch: 14 }, // Test ID
    { wch: 32 }, // Title
    { wch: 12 }, // Status
    { wch: 40 }, // Objective
    { wch: 50 }, // Steps
    { wch: 40 }, // Expected
    { wch: 35 }, // Actual
    { wch: 25 }  // Notes
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Test Cases');

  const filename = `${docNumber || 'Test_Cases'}_Spreadsheet.xlsx`;
  XLSX.writeFile(workbook, filename);
}

export function exportTableToExcel(tableData: TableData, title: string = 'Data_Table'): void {
  const data = [
    tableData.headers,
    ...tableData.rows
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');

  const filename = `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}.xlsx`;
  XLSX.writeFile(workbook, filename);
}

/**
 * Exports a test run execution report as an .xlsx file.
 * Columns: Test Case ID, Title, Status, Duration (ms), Failure Reason
 */
export function exportTestRunReport(
  results: { customId: string; title: string; status: 'PASS' | 'FAIL' | 'SKIP'; elapsedTimeMs: number; failureMessage?: string }[],
  suiteName: string,
  executedAt: string
): void {
  const dateStr = new Date(executedAt).toLocaleDateString('en-CA'); // YYYY-MM-DD
  const rows = results.map((r, idx) => ({
    '#': idx + 1,
    'Test Case ID': r.customId,
    'Test Case Title': r.title,
    'Status': r.status,
    'Duration (ms)': r.elapsedTimeMs,
    'Failure Reason': r.failureMessage || 'N/A'
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 4 },   // #
    { wch: 16 },  // Test Case ID
    { wch: 44 },  // Title
    { wch: 10 },  // Status
    { wch: 14 },  // Duration
    { wch: 50 },  // Failure Reason
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Test Report');

  const filename = `${suiteName.replace(/[^a-zA-Z0-9_-]/g, '_')}_report_${dateStr}.xlsx`;
  XLSX.writeFile(workbook, filename);
}

export async function importTestCasesFromExcel(file: File): Promise<TestCaseItem[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet);

  const testCases: TestCaseItem[] = rawRows.map((row, idx) => {
    // Flexible header mapping (case-insensitive)
    const findVal = (keys: string[]) => {
      for (const k of keys) {
        for (const rowKey of Object.keys(row)) {
          if (rowKey.trim().toLowerCase() === k.toLowerCase()) {
            return row[rowKey];
          }
        }
      }
      return '';
    };

    const id = findVal(['Test ID', 'ID', 'TC ID', 'TestCaseId', 'Key']) || `TC-${String(idx + 1).padStart(2, '0')}`;
    const title = findVal(['Test Title', 'Title', 'Test Name', 'Summary', 'Name', 'Feature']) || `Test Case ${idx + 1}`;
    const objective = findVal(['Objective', 'Description', 'Goal', 'Purpose']) || '';
    const stepsRaw = findVal(['Execution Steps', 'Steps', 'Test Steps', 'Procedure', 'Action']) || '';
    const expectedResult = findVal(['Expected Result', 'Expected', 'Expected Output', 'Criteria']) || '';
    const actualResult = findVal(['Actual Result', 'Actual', 'Outcome', 'Results']) || '';
    const statusRaw = (findVal(['Status', 'Result', 'Verdict', 'State']) || 'PENDING').toString().toUpperCase().trim();
    const notes = findVal(['Notes', 'Comments', 'Remark']) || '';

    const validStatus = (['PASSED', 'FAILED', 'BLOCKED', 'PENDING'].includes(statusRaw)
      ? statusRaw
      : statusRaw.includes('PASS') ? 'PASSED'
      : statusRaw.includes('FAIL') ? 'FAILED'
      : statusRaw.includes('BLOCK') ? 'BLOCKED'
      : 'PENDING') as TestCaseItem['status'];

    const steps = typeof stepsRaw === 'string'
      ? stepsRaw.split(/\r?\n|\s*;\s*|\s*\|\s*/).filter(s => s.trim().length > 0)
      : [String(stepsRaw)];

    return {
      id: String(id).trim(),
      title: String(title).trim(),
      objective: String(objective).trim(),
      steps: steps.length > 0 ? steps : ['Execute verification step'],
      expectedResult: String(expectedResult).trim(),
      actualResult: String(actualResult).trim(),
      status: validStatus,
      notes: String(notes).trim()
    };
  });

  return testCases;
}
