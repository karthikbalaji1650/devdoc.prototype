import type { TestSuiteItem } from '../types/operations';

/** Assembles a suite's automated test cases into one Robot Framework
 * script - used both by the "Export .robot" button and by pushing a
 * script to a remote execution backend, so the two can't drift apart.
 *
 * Known limitation: each case's own robotCode usually already includes
 * its own *** Settings *** / *** Test Cases *** headers (from AI
 * generation or manual authoring), so concatenating several repeats
 * those headers in the combined file. Not fixed here - flagged rather
 * than guessed at without knowing how the target runner expects files. */
export function buildRobotSuiteText(suite: TestSuiteItem): string {
  const cases = (suite.testCases || []).filter((tc) => tc.type === 'Automated' || tc.automationCandidate);
  const lines = [`*** Settings ***\nDocumentation     ${suite.title}\nLibrary           RequestsLibrary\n\n*** Test Cases ***`];
  cases.forEach((tc) => {
    const code = tc.robotCode || `${tc.customId}_${tc.title.replace(/\s+/g, '_')}\n    [Tags]    ${tc.priority}    ${(tc.labels || []).join('    ')}\n    Log    Test: ${tc.title}`;
    lines.push('\n' + code);
  });
  return lines.join('\n');
}
