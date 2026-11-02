import { describe, expect, it } from 'vitest';
import type { TestCaseItem } from '../types/operations';
import { exportTestCases, formatFromFileName, ImportError, parseCsv, parseTestCases, toPortable } from './testCaseExchange';

const tc = (over: Partial<TestCaseItem> = {}): TestCaseItem => ({
  id: 'tc-1', suiteId: 's1', customId: 'TC-001', title: 'Flash, then reboot "cleanly"',
  preconditions: 'BMC powered\nNTP synced', type: 'Automated', priority: 'P1',
  steps: [
    { step: 1, action: 'Upload image, v13.03', expected: 'HTTP 200' },
    { step: 2, action: 'Reboot', expected: '' },
  ],
  expectedResult: 'Boots to the new image', postconditions: 'Primary bank active',
  labels: ['Firmware', 'Flash'], references: ['WH3-1205'], estimateMin: 15,
  robotCode: '*** Test Cases ***\nFlash\n    Log    <ok> & done',
  createdAt: '2026-11-01T00:00:00Z',
  attachments: [{ id: 'a', name: 'x.log', mimeType: 'text/plain', size: 1, dataUrl: 'data:,x', addedAt: '' }],
  ...over,
});

describe.each(['csv', 'json', 'xml'] as const)('%s round trip', (format) => {
  it('keeps every portable field, including commas, quotes, newlines and markup', () => {
    const cases = [tc(), tc({ id: 'tc-2', customId: 'TC-002', title: 'Manual check', type: 'Manual', priority: 'P4', steps: [], labels: [], references: [], estimateMin: undefined, robotCode: undefined, postconditions: '' })];
    const { content } = exportTestCases(cases, 'RTC & Flash', format);
    expect(parseTestCases(content, format)).toEqual(cases.map(toPortable));
  });

  it('leaves attachments out of the export', () => {
    expect(exportTestCases([tc()], 'S', format).content).not.toContain('x.log');
  });
});

describe('import validation', () => {
  it('rejects malformed files with a readable message', () => {
    expect(() => parseTestCases('{nope', 'json')).toThrow(ImportError);
    expect(() => parseTestCases('<testCases><testCase>', 'xml')).toThrow(/not well-formed/);
    expect(() => parseTestCases('Name,Steps\nx,y', 'csv')).toThrow(/Title/);
    expect(() => parseTestCases('ID,Title\nTC-1,', 'csv')).toThrow(/row 2: a title is required/);
  });

  it('accepts a bare JSON array and fills defaults for missing fields', () => {
    const [c] = parseTestCases('[{"title":"Only a title","priority":"high"}]', 'json');
    expect(c).toMatchObject({ title: 'Only a title', type: 'Manual', priority: 'P3', steps: [], customId: '' });
  });

  it('reads CSV written by other tools: any column order, steps as numbered lines', () => {
    const [c] = parseTestCases('Title,Steps,Priority\r\nBoot,"1) Power on => LED green\n2. Login",P2\r\n', 'csv');
    expect(c.steps).toEqual([{ step: 1, action: 'Power on', expected: 'LED green' }, { step: 2, action: 'Login', expected: '' }]);
    expect(c.priority).toBe('P2');
  });

  it('parses quoted CSV cells', () => {
    expect(parseCsv('a,"b,""c""\nd",e')).toEqual([['a', 'b,"c"\nd', 'e']]);
  });

  it('maps file extensions to formats', () => {
    expect(formatFromFileName('cases.CSV')).toBe('csv');
    expect(formatFromFileName('cases.xlsx')).toBeNull();
  });
});
