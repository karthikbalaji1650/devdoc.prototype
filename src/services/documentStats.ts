import type { DocumentModel, DocStatus } from '../types/document';

export interface StatusCounts {
  total: number;
  approved: number;
  inReview: number;
}

/** Dashboard counts come from the real documents, so each number matches
 * the list you land on when you click it. */
export function countByStatus(docs: DocumentModel[]): StatusCounts {
  return {
    total: docs.length,
    approved: docs.filter((d) => d.metadata.status === 'APPROVED').length,
    inReview: docs.filter((d) => d.metadata.status === 'IN_REVIEW').length,
  };
}

export function filterByStatus(docs: DocumentModel[], status: DocStatus | null): DocumentModel[] {
  return status ? docs.filter((d) => d.metadata.status === status) : docs;
}

/** Reviewer-log entries only carry a document number; link them to the
 * stored document with that number, if this browser has it. */
export function findDocumentByNumber(docs: DocumentModel[], docNumber: string): DocumentModel | undefined {
  const wanted = docNumber.trim().toLowerCase();
  if (!wanted) return undefined;
  return docs.find((d) => d.metadata.docNumber?.trim().toLowerCase() === wanted);
}
