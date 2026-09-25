import type { DocumentModel } from '../types/document';
import type { ReviewerLogItem } from '../types/operations';

/** The two states the dashboard cards drill into. Everything else
 * (drafts, published, pending sign-off...) is 'OTHER'. */
export type TrackedStatus = 'APPROVED' | 'IN_REVIEW' | 'OTHER';

export interface TrackedDocument {
  key: string;
  docNumber: string;
  title: string;
  status: TrackedStatus;
  /** Present when the document is stored in this browser. */
  stored?: DocumentModel;
}

export interface StatusCounts {
  total: number;
  approved: number;
  inReview: number;
}

function keyFor(docNumber: string | undefined, fallbackId: string): string {
  const n = (docNumber ?? '').trim().toLowerCase();
  return n ? `num:${n}` : `id:${fallbackId}`;
}

/** A document is approved once every sign-off is approved; it is in
 * review while any reviewer is still reviewing it. */
function statusFromSignoffs(entries: ReviewerLogItem[]): TrackedStatus {
  if (entries.every((e) => e.reviewStatus === 'APPROVED')) return 'APPROVED';
  if (entries.some((e) => e.reviewStatus === 'IN_REVIEW')) return 'IN_REVIEW';
  return 'OTHER';
}

function statusFromMetadata(status: DocumentModel['metadata']['status']): TrackedStatus {
  return status === 'APPROVED' ? 'APPROVED' : status === 'IN_REVIEW' ? 'IN_REVIEW' : 'OTHER';
}

/** One entry per distinct document, merging the documents stored here
 * with the reviewer sign-off log. Where the log tracks a document its
 * sign-offs decide the status; otherwise the document's own status
 * does. Log-only documents (sample sign-offs with no stored copy) are
 * included, but only shown to admins when approved, mirroring the rule
 * that non-admins only see in-progress work. */
export function buildTrackedDocuments(
  visibleStored: DocumentModel[],
  log: ReviewerLogItem[],
  isAdminUser: boolean,
): TrackedDocument[] {
  const byKey = new Map<string, ReviewerLogItem[]>();
  for (const entry of log) {
    const key = keyFor(entry.docNumber, entry.docId || entry.id);
    byKey.set(key, [...(byKey.get(key) ?? []), entry]);
  }

  const tracked: TrackedDocument[] = [];
  const seen = new Set<string>();

  for (const doc of visibleStored) {
    const key = keyFor(doc.metadata.docNumber, doc.metadata.id);
    seen.add(key);
    const entries = byKey.get(key);
    tracked.push({
      key,
      docNumber: doc.metadata.docNumber ?? '',
      title: doc.metadata.title,
      status: entries ? statusFromSignoffs(entries) : statusFromMetadata(doc.metadata.status),
      stored: doc,
    });
  }

  for (const [key, entries] of byKey) {
    if (seen.has(key)) continue;
    const status = statusFromSignoffs(entries);
    if (status === 'APPROVED' && !isAdminUser) continue;
    tracked.push({ key, docNumber: entries[0].docNumber, title: entries[0].docTitle, status });
  }
  return tracked;
}

export function countTracked(docs: TrackedDocument[]): StatusCounts {
  return {
    total: docs.length,
    approved: docs.filter((d) => d.status === 'APPROVED').length,
    inReview: docs.filter((d) => d.status === 'IN_REVIEW').length,
  };
}

export function filterTracked(docs: TrackedDocument[], status: Exclude<TrackedStatus, 'OTHER'> | null): TrackedDocument[] {
  return status ? docs.filter((d) => d.status === status) : docs;
}

/** Reviewer-log entries only carry a document number; link them to the
 * stored document with that number, if this browser has it. */
export function findDocumentByNumber(docs: DocumentModel[], docNumber: string): DocumentModel | undefined {
  const wanted = docNumber.trim().toLowerCase();
  if (!wanted) return undefined;
  return docs.find((d) => d.metadata.docNumber?.trim().toLowerCase() === wanted);
}
