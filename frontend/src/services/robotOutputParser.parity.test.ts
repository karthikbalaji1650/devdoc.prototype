import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseRobotOutputXml } from './robotOutputParserService';

// The browser's output.xml import and the server's CI upload
// (backend/app/services/robot_output.py) read the same files to the same
// results: both are pinned to these fixtures.
const dir = path.resolve(process.cwd(), '../backend/tests/fixtures');
const expected = JSON.parse(readFileSync(path.join(dir, 'robot_output.expected.json'), 'utf8'));

describe('parseRobotOutputXml', () => {
  for (const name of ['robot_output_rf7.xml', 'robot_output_rf6.xml']) {
    it(`reads ${name} like the server does`, () => {
      const { results, run } = parseRobotOutputXml(readFileSync(path.join(dir, name), 'utf8'), 's1');
      expect(results).toEqual(expected[name].results);
      expect(run.name).toBe(`${expected[name].suiteTitle} Execution Run`);
    });
  }

  it('counts each test by its own status: skipped and not-run are skipped, never blocked', () => {
    const { run } = parseRobotOutputXml(readFileSync(path.join(dir, 'robot_output_rf7.xml'), 'utf8'), 's1');
    expect([run.passedCount, run.failedCount, run.skippedCount, run.blockedCount, run.status]).toEqual([1, 1, 2, 0, 'Failed']);
  });

  it('a nested keyword failure does not fail a passing test', () => {
    const xml = '<robot><suite name="S"><test name="T"><kw name="k"><status status="FAIL"/></kw><status status="PASS" elapsed="0.5"/></test></suite></robot>';
    expect(parseRobotOutputXml(xml, 's').results[0]).toEqual({ customId: 'TC-1', title: 'T', status: 'PASS', elapsedTimeMs: 500 });
  });
});
