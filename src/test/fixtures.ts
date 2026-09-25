import type { DocumentModel, DocSection } from '../types/document';
import type { UserProfile } from '../types/auth';

export function makeSection(id: string, title = id): DocSection {
  return { id, title, level: 1, type: 'richText', content: `${title} content` };
}

export function makeDoc(
  id: string,
  overrides: Partial<DocumentModel['metadata']> = {},
  sections: DocSection[] = [makeSection('s1', 'Purpose'), makeSection('s2', 'Scope')],
): DocumentModel {
  return {
    metadata: {
      id,
      title: `Doc ${id}`,
      docNumber: id.toUpperCase(),
      author: 'Ada Author',
      date: '2026-09-25',
      version: '1.0',
      classification: 'INTERNAL ONLY',
      status: 'DRAFT',
      templateType: 'technical-analysis',
      ...overrides,
    },
    sections,
  };
}

export function makeUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'usr-x',
    name: 'Ada Author',
    email: 'ada@example.com',
    title: 'Engineer',
    department: 'Eng',
    role: 'firmware-lead',
    avatarBg: 'from-blue-600 to-indigo-600',
    initials: 'AA',
    ...overrides,
  };
}
