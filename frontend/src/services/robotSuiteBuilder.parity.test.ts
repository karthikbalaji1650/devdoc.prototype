import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { TestSuiteItem } from '../types/operations';
import { buildRobotSuiteText } from './robotSuiteBuilder';

// The backend builds the same script for scheduled runs
// (backend/app/services/robot_suite.py). Both sides are pinned to the same
// fixture and expected text, so they cannot drift apart.
// Vitest runs from frontend/ (import.meta.url is not a file: URL under jsdom).
const dir = path.resolve(process.cwd(), '../backend/tests/fixtures') + '/';
const fixture = JSON.parse(readFileSync(`${dir}robot_suite.json`, 'utf8'));
const expected = readFileSync(`${dir}robot_suite.expected.robot`, 'utf8');

describe('buildRobotSuiteText parity with the backend', () => {
  it('matches the shared expected script', () => {
    const suite = { ...fixture.suite, testCases: fixture.cases } as TestSuiteItem;
    expect(buildRobotSuiteText(suite)).toBe(expected);
  });
});
