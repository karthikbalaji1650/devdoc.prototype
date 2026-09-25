import type { ReviewerLogItem } from '../types/operations';
import type { DocumentModel } from '../types/document';

const STORAGE_REVIEWERS_KEY = 'devdoc_studio_reviewers_log_v1';
const STORAGE_SHEET_URL_KEY = 'devdoc_studio_google_sheet_url_v1';

export const DEFAULT_GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1jUcXLcc0RAojAv3ZjvHgdmAPOOD2ljx-swatAujvdBA/edit?gid=0#gid=0';

export function getStoredGoogleSheetUrl(): string {
  return localStorage.getItem(STORAGE_SHEET_URL_KEY) || DEFAULT_GOOGLE_SHEET_URL;
}

export function saveStoredGoogleSheetUrl(url: string): void {
  localStorage.setItem(STORAGE_SHEET_URL_KEY, url);
}

export const INITIAL_REVIEWERS_LOG: ReviewerLogItem[] = [
  {
    id: 'rev-01',
    docId: 'wh3-1205-sample',
    docTitle: 'WebUI HPM Firmware Upgrade Failure Investigation & Fix',
    docNumber: 'WH3-1205',
    reviewerName: 'Manivannan Thangavel',
    reviewerRole: 'Software engineering manager',
    reviewStatus: 'APPROVED',
    reviewDate: '2026-08-14',
    comments: 'C backend explicit (INT8U) casting and preserve_config JSON payload verified. Architecture changes approved.'
  },
  {
    id: 'rev-02',
    docId: 'wh3-1205-sample',
    docTitle: 'WebUI HPM Firmware Upgrade Failure Investigation & Fix',
    docNumber: 'WH3-1205',
    reviewerName: 'Vaishnavi Aasaithambi',
    reviewerRole: 'Technical lead',
    reviewStatus: 'APPROVED',
    reviewDate: '2026-08-14',
    comments: 'Cybersecurity fuzzing tests passed with 0 memory leaks. Flag creation permissions verified.'
  },
  {
    id: 'rev-03',
    docId: 'wh3-1205-sample',
    docTitle: 'WebUI HPM Firmware Upgrade Failure Investigation & Fix',
    docNumber: 'WH3-1205',
    reviewerName: 'Judia Lumina',
    reviewerRole: 'Team lead',
    reviewStatus: 'APPROVED',
    reviewDate: '2026-08-15',
    comments: 'PVT3 dual-image regression validation passed on hardware testbench.'
  },
  {
    id: 'rev-04',
    docId: 'adr-0042',
    docTitle: 'ADR 0042: Migration from REST Polling to WebSocket State Streaming',
    docNumber: 'ADR-2026-042',
    reviewerName: 'Manivannan Thangavel',
    reviewerRole: 'Software engineering manager',
    reviewStatus: 'IN_REVIEW',
    reviewDate: '2026-08-15',
    comments: 'Benchmarking AST2600 CPU load under 50 concurrent active WebSocket sessions.'
  }
];

export function getStoredReviewersLog(): ReviewerLogItem[] {
  const saved = localStorage.getItem(STORAGE_REVIEWERS_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse reviewers log', e);
    }
  }
  return INITIAL_REVIEWERS_LOG;
}

export function saveStoredReviewersLog(logs: ReviewerLogItem[]): void {
  localStorage.setItem(STORAGE_REVIEWERS_KEY, JSON.stringify(logs));
}

// Sync with currently active DocCraft document
export function ensureCurrentDocReviewEntry(currentDoc: DocumentModel, logs: ReviewerLogItem[]): ReviewerLogItem[] {
  const hasEntry = logs.some(l => l.docNumber === currentDoc.metadata.docNumber || l.docTitle === currentDoc.metadata.title);
  if (!hasEntry && currentDoc.metadata.title) {
    const newEntry: ReviewerLogItem = {
      id: `rev-${Date.now()}`,
      docId: currentDoc.metadata.id,
      docTitle: currentDoc.metadata.title,
      docNumber: currentDoc.metadata.docNumber || 'DOC-01',
      reviewerName: currentDoc.metadata.author || 'Assigned Reviewer',
      reviewerRole: 'Lead Architect',
      reviewStatus: 'PENDING',
      reviewDate: new Date().toISOString().split('T')[0],
      comments: 'Initial draft submitted from DocCraft Studio. Pending formal peer sign-off.'
    };
    const updated = [newEntry, ...logs];
    saveStoredReviewersLog(updated);
    return updated;
  }
  return logs;
}

export async function exportReviewersLogToExcel(logs: ReviewerLogItem[]): Promise<void> {
  const XLSX = await import('xlsx');
  const rows = logs.map((item, idx) => ({
    '#': idx + 1,
    'Document Number': item.docNumber,
    'Document Title (From DocCraft)': item.docTitle,
    'Reviewer Name': item.reviewerName,
    'Reviewer Role': item.reviewerRole,
    'Status': item.reviewStatus,
    'Review Date': item.reviewDate,
    'Comments & Sign-off Notes': item.comments
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 4 },
    { wch: 18 },
    { wch: 45 },
    { wch: 22 },
    { wch: 20 },
    { wch: 18 },
    { wch: 14 },
    { wch: 50 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Reviewers Log');

  XLSX.writeFile(workbook, 'Engineering_Document_Reviewers_Log.xlsx');
}
