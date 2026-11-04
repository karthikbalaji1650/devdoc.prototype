// Sections and sub-sections of a test suite (DDS-SRS-012): a tree built
// from each section's parentId, and which section each case sits in.
import type { TestCaseItem, TestSection } from '../types/operations';

export interface SectionNode {
  section: TestSection;
  depth: number; // 0 for a top-level section
}

const MANUAL_TITLE = 'Manual Tests';

/** Depth-first, siblings by `order`. A section whose parent is missing (or
 * that sits in a loop) is shown at the top level rather than lost. */
export function sectionTree(sections: readonly TestSection[] = []): SectionNode[] {
  const ids = new Set(sections.map((s) => s.id));
  const children = new Map<string | undefined, TestSection[]>();
  for (const s of sections) {
    const parent = s.parentId && s.parentId !== s.id && ids.has(s.parentId) ? s.parentId : undefined;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)!.push(s);
  }
  for (const list of children.values()) list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const out: SectionNode[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | undefined, depth: number) => {
    for (const s of children.get(parent) ?? []) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push({ section: s, depth });
      walk(s.id, depth + 1);
    }
  };
  walk(undefined, 0);
  for (const s of sections) {
    if (!seen.has(s.id)) { seen.add(s.id); out.push({ section: s, depth: 0 }); walk(s.id, 1); }
  }
  return out;
}

/** The section a case is shown in. Cases saved before sections held cases
 * have no sectionId: as before, manual ones go to "Manual Tests" and
 * automated ones to the first other section. Null only when the suite has
 * no sections at all. */
export function sectionOfCase(tc: Pick<TestCaseItem, 'sectionId' | 'type'>, sections: readonly TestSection[] = []): string | null {
  if (!sections.length) return null;
  if (tc.sectionId && sections.some((s) => s.id === tc.sectionId)) return tc.sectionId;
  const ordered = sectionTree(sections).map((n) => n.section);
  const manual = ordered.find((s) => s.title === MANUAL_TITLE);
  if (tc.type === 'Manual') return (manual ?? ordered[0]).id;
  return (ordered.find((s) => s.title !== MANUAL_TITLE) ?? ordered[0]).id;
}

/** `order` for a new section placed last under `parentId`. */
export function nextSectionOrder(sections: readonly TestSection[] = [], parentId?: string): number {
  const siblings = sections.filter((s) => (s.parentId ?? undefined) === parentId);
  return siblings.reduce((max, s) => Math.max(max, (s.order ?? 0) + 1), 0);
}

/** Whether a section can be deleted: no sub-sections and no cases in it. */
export function isSectionEmpty(sectionId: string, sections: readonly TestSection[], cases: readonly TestCaseItem[]): boolean {
  return !sections.some((s) => s.parentId === sectionId)
    && !cases.some((tc) => sectionOfCase(tc, sections) === sectionId);
}
