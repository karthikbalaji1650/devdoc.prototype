/** Server-side copy of the same rules the frontend applies
 * (src/services/permissions.ts). SRS #1 flags client-only enforcement
 * as a gap; every route in this API re-checks these rules itself
 * rather than trusting the browser. */

export interface AuthUser {
  id: string;
  name: string;
  role: string;
}

export interface DocRow {
  author: string | null;
  status: string;
}

export function isAdmin(user: AuthUser): boolean {
  return user.role === 'admin';
}

export function canEditDocument(user: AuthUser, doc: DocRow): boolean {
  return isAdmin(user) || doc.author === user.name;
}

export const canDeleteDocument = canEditDocument;

export function isVisible(user: AuthUser, doc: DocRow): boolean {
  return isAdmin(user) || doc.status === 'DRAFT' || doc.status === 'IN_REVIEW';
}
