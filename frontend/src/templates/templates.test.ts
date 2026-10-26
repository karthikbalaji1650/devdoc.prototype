import { describe, it, expect } from 'vitest';
import { TEMPLATE_REGISTRY, getDefaultDocument } from './index';

describe('template registry', () => {
  it('offers exactly Technical Analysis and Impact Analysis', () => {
    expect(TEMPLATE_REGISTRY.map((t) => t.name)).toEqual(['Technical Analysis Document', 'Impact Analysis']);
  });

  it('has unique template ids', () => {
    const ids = TEMPLATE_REGISTRY.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(TEMPLATE_REGISTRY.map((t) => [t.name, t] as const))('%s produces valid sample and blank documents', (_n, tmpl) => {
    for (const doc of [tmpl.getSampleDoc(), tmpl.getBlankDoc()]) {
      expect(doc.metadata.title).toBeTruthy();
      expect(doc.sections.length).toBeGreaterThan(0);
      const sectionIds = doc.sections.map((s) => s.id);
      expect(new Set(sectionIds).size).toBe(sectionIds.length);
    }
  });

  it('returns an independent copy each call (callers mutate the result)', () => {
    const a = TEMPLATE_REGISTRY[0].getBlankDoc();
    a.metadata.id = 'mutated';
    a.metadata.title = 'mutated';
    a.sections.pop();
    const b = TEMPLATE_REGISTRY[0].getBlankDoc();
    expect(b.metadata.id).not.toBe('mutated');
    expect(b.metadata.title).not.toBe('mutated');
    expect(b.sections.length).toBe(a.sections.length + 1);
  });

  it('default document is a deep copy too', () => {
    const a = getDefaultDocument();
    a.metadata.title = 'changed';
    expect(getDefaultDocument().metadata.title).not.toBe('changed');
  });
});
