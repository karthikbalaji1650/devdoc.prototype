// Creates a real Google Doc in the user's Drive from the current document.
//
// Approach: upload the document's existing HTML representation (from
// generateGoogleDocsHtml, already used for the clipboard-copy path) to the
// Drive API with mimeType 'application/vnd.google-apps.document'. Drive
// converts HTML -> native Google Doc on import, preserving headings, bold/
// italic, lists, tables, and spacing without us having to hand-build Docs
// API batchUpdate requests for every section type.
import type { DocumentModel } from '../types/document';
import { generateGoogleDocsHtml } from './googleDocsExporter';
import { getGoogleAccessToken } from '../services/googleAuthService';
import { fetchWithTimeout } from '../services/fetchWithTimeout';

const DRIVE_UPLOAD_URL =
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink';
const BOUNDARY = 'devdoc-studio-export-boundary';

export async function exportToGoogleDoc(docModel: DocumentModel): Promise<string> {
  const accessToken = await getGoogleAccessToken();
  const html = generateGoogleDocsHtml(docModel);
  const title = docModel.metadata.title?.trim() || docModel.metadata.docNumber || 'Untitled Document';

  const metadataPart = JSON.stringify({
    name: title,
    mimeType: 'application/vnd.google-apps.document',
  });

  const body =
    `--${BOUNDARY}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadataPart}\r\n` +
    `--${BOUNDARY}\r\n` +
    `Content-Type: text/html; charset=UTF-8\r\n\r\n` +
    `${html}\r\n` +
    `--${BOUNDARY}--`;

  // A large document can take a while to upload; not retried, since
  // retrying a partially-succeeded upload could create a duplicate Doc.
  const response = await fetchWithTimeout(DRIVE_UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${BOUNDARY}`,
    },
    body,
    timeoutMs: 30_000,
  });

  if (!response.ok) {
    let message = `Google Drive API error (${response.status})`;
    try {
      const errBody = await response.json();
      message = errBody?.error?.message || message;
    } catch {
      // response body wasn't JSON; keep the generic message
    }
    throw new Error(message);
  }

  const data: { id: string; webViewLink?: string } = await response.json();
  return data.webViewLink || `https://docs.google.com/document/d/${data.id}/edit`;
}
