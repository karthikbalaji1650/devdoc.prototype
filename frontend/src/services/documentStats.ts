import type { DocStatus, DocumentModel } from '../types/document';

// Dashboard numbers (DDS-SRS-005). A document's own status decides where it
// counts: the one set in the editor and stored on the server.

/** The two statuses a dashboard card opens the document list at. */
export type DocumentFilter = 'APPROVED' | 'IN_REVIEW';

export interface DocumentStats {
  total: number;
  byStatus: Record<DocStatus, number>;
}

export const DOC_STATUSES: DocStatus[] = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED'];

export function countByStatus(docs: DocumentModel[]): DocumentStats {
  const byStatus = Object.fromEntries(DOC_STATUSES.map((s) => [s, 0])) as Record<DocStatus, number>;
  for (const doc of docs) {
    if (doc.metadata.status in byStatus) byStatus[doc.metadata.status]++;
  }
  return { total: docs.length, byStatus };
}

export function filterByStatus(docs: DocumentModel[], status: DocumentFilter | null): DocumentModel[] {
  return status ? docs.filter((d) => d.metadata.status === status) : docs;
}
