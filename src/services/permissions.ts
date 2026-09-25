import type { DocumentModel } from '../types/document';
import type { UserProfile } from '../types/auth';

type MaybeUser = Pick<UserProfile, 'name' | 'role'> | null | undefined;

export function isAdmin(user: MaybeUser): boolean {
  return user?.role === 'admin';
}

/** Requirements #2 / #4: authors edit their own documents; admins edit any. */
export function canEditDocument(user: MaybeUser, doc: DocumentModel): boolean {
  if (!user) return false;
  return isAdmin(user) || doc.metadata.author === user.name;
}

/** Deleting follows the same rule as editing. */
export const canDeleteDocument = canEditDocument;

/** Requirement #8: data management is admin-only. */
export function canAccessDataManagement(user: MaybeUser): boolean {
  return isAdmin(user);
}

/** Requirements #1 / #3: admins see every document; everyone else sees
 * only documents still in progress. */
export function visibleDocumentsFor(user: MaybeUser, docs: DocumentModel[]): DocumentModel[] {
  if (isAdmin(user)) return docs;
  return docs.filter((d) => d.metadata.status === 'DRAFT' || d.metadata.status === 'IN_REVIEW');
}
