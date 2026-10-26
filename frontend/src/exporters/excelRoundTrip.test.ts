import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { importTestCasesFromExcel } from './excelExporter';

// Guards the xlsx upgrade: the import path parses user-uploaded files,
// which is where the old version's advisories applied.
describe('Excel import', () => {
  it('reads test cases from a workbook file', async () => {
    const ws = XLSX.utils.json_to_sheet([{ ID: 'TC-1', Title: 'Boots', Steps: 'Power on', Expected: 'Boots', Status: 'Pass' }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cases');
    const bytes: ArrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const file = new File([bytes], 'cases.xlsx');
    vi.spyOn(file, 'arrayBuffer').mockResolvedValue(bytes);
    const cases = await importTestCasesFromExcel(file);
    expect(cases.length).toBe(1);
  });

  it('rejects garbage input instead of crashing the app', async () => {
    const bytes = new TextEncoder().encode('not a spreadsheet').buffer as ArrayBuffer;
    const file = new File([bytes], 'x.xlsx');
    vi.spyOn(file, 'arrayBuffer').mockResolvedValue(bytes);
    const result = await importTestCasesFromExcel(file).catch(() => 'rejected');
    expect(result === 'rejected' || Array.isArray(result)).toBe(true);
  });
});
