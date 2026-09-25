import { listDocuments, saveDocument } from './documentsStoreService';
import { sampleADRDoc } from '../templates/adrTemplate';
import { safeSetItem } from './safeStorage';

const SEEDED_KEY = 'devdoc_studio_sample_docs_seeded_v1';

/** The demo reviewer log tracks ADR-2026-042 as "In review". Without a
 * stored copy the dashboard's In review card had nothing to open, so a
 * matching sample document is added once per browser (never again
 * after that, so deleting it sticks). */
export function seedSampleDocumentsIfNeeded(): boolean {
  try {
    if (localStorage.getItem(SEEDED_KEY)) return false;
  } catch {
    return false;
  }
  const alreadyThere = listDocuments().some(
    (d) => d.metadata.docNumber === sampleADRDoc.metadata.docNumber || d.metadata.id === sampleADRDoc.metadata.id,
  );
  let seeded = false;
  if (!alreadyThere) {
    const doc = JSON.parse(JSON.stringify(sampleADRDoc));
    doc.metadata.status = 'IN_REVIEW';
    seeded = saveDocument(doc);
  }
  safeSetItem(SEEDED_KEY, '1', { notify: false });
  return seeded;
}
