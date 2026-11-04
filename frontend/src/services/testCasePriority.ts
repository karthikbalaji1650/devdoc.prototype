// Test case priority (DDS-SRS-013): Critical / High / Medium / Low, as the
// SRS names them. Cases saved before the rename used P1-P4; anything coming
// in (server data, imports, Robot tags, AI output) goes through
// normalizePriority, which accepts both.
export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'] as const;
export type TestCasePriority = (typeof PRIORITIES)[number];

export const DEFAULT_PRIORITY: TestCasePriority = 'Medium';

const LEGACY: Record<string, TestCasePriority> = { P1: 'Critical', P2: 'High', P3: 'Medium', P4: 'Low' };

/** A priority from any source: a current name (any case) or a legacy P1-P4. */
function recognise(value: unknown): TestCasePriority | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return PRIORITIES.find((p) => p.toLowerCase() === v.toLowerCase()) ?? LEGACY[v.toUpperCase()] ?? null;
}

export function normalizePriority(value: unknown, fallback: TestCasePriority = DEFAULT_PRIORITY): TestCasePriority {
  return recognise(value) ?? fallback;
}

/** The priority named in free text such as a Robot "[Tags]" line, if any. */
export function priorityInText(text: string): TestCasePriority | null {
  for (const token of text.split(/[\s,|]+/)) {
    const p = recognise(token);
    if (p) return p;
  }
  return null;
}
