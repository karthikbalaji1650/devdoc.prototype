import type { DocumentModel } from '../types/document';
import type { UserProfile } from '../types/auth';

type MaybeUser = Pick<UserProfile, 'id' | 'name' | 'role'> | null | undefined;

export function isAdmin(user: MaybeUser): boolean {
  return user?.role === 'admin';
}

/** Requirements #2 / #4: owners edit their own documents; admins edit any.
 *
 * The server decides by owner id, so the UI does too. `ownerId` is what the
 * server reported: a user id, or `null` when nobody owns the document (only
 * admins may edit it). `undefined` means no owner is known, which is the
 * browser-only demo or a document just created in this browser: there the
 * author name is all there is. */
export function canEditDocument(user: MaybeUser, doc: DocumentModel, ownerId?: string | null): boolean {
  if (!user) return false;
  if (isAdmin(user)) return true;
  if (ownerId === undefined) return doc.metadata.author === user.name;
  return ownerId !== null && ownerId === user.id;
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
