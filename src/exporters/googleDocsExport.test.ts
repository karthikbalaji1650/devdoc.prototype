import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeDoc } from '../test/fixtures';

vi.mock('../services/googleAuthService', () => ({
  getGoogleAccessToken: vi.fn(async () => 'test-token'),
}));

import { exportToGoogleDoc } from './googleDocsExport';
import { getGoogleAccessToken } from '../services/googleAuthService';

const fetchMock = vi.fn();
const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init });

beforeEach(() => vi.stubGlobal('fetch', fetchMock));
afterEach(() => {
  fetchMock.mockReset();
  vi.mocked(getGoogleAccessToken).mockResolvedValue('test-token');
  vi.unstubAllGlobals();
});

describe('exportToGoogleDoc', () => {
  it('uploads to Drive with the bearer token and converts the HTML to a Google Doc', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'abc', webViewLink: 'https://docs.google.com/document/d/abc/edit?usp=drivesdk' }));
    const url = await exportToGoogleDoc(makeDoc('d1', { title: 'Firmware Report' }));

    expect(url).toBe('https://docs.google.com/document/d/abc/edit?usp=drivesdk');
    const [endpoint, init] = fetchMock.mock.calls[0];
    expect(endpoint).toContain('https://www.googleapis.com/upload/drive/v3/files');
    expect(endpoint).toContain('uploadType=multipart');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(init.headers['Content-Type']).toMatch(/^multipart\/related; boundary=/);

    const body: string = init.body;
    expect(body).toContain('"mimeType":"application/vnd.google-apps.document"');
    expect(body).toContain('"name":"Firmware Report"');
    expect(body).toContain('Content-Type: text/html');
    expect(body).toContain('Firmware Report'); // document content made it into the HTML part
    expect(body.trimEnd().endsWith('--')).toBe(true); // multipart body is properly terminated
  });

  it('names the file after the document number when the title is blank', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'x' }));
    await exportToGoogleDoc(makeDoc('d1', { title: '   ', docNumber: 'WH3-1205' }));
    expect(fetchMock.mock.calls[0][1].body).toContain('"name":"WH3-1205"');
  });

  it('falls back to a generic name when there is no title or number', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'x' }));
    await exportToGoogleDoc(makeDoc('d1', { title: '', docNumber: '' }));
    expect(fetchMock.mock.calls[0][1].body).toContain('"name":"Untitled Document"');
  });

  it('builds the edit link itself when Drive returns no webViewLink', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'file-42' }));
    await expect(exportToGoogleDoc(makeDoc('d1'))).resolves.toBe('https://docs.google.com/document/d/file-42/edit');
  });

  it('shows Google\'s own error message when the upload is rejected', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'Insufficient Permission' } }, { status: 403 }));
    await expect(exportToGoogleDoc(makeDoc('d1'))).rejects.toThrow('Insufficient Permission');
  });

  it('uses a generic message with the status code when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(exportToGoogleDoc(makeDoc('d1'))).rejects.toThrow('Google Drive API error (502)');
  });

  it('does not upload anything when sign-in fails or is cancelled', async () => {
    vi.mocked(getGoogleAccessToken).mockRejectedValue(new Error('Google sign-in was cancelled.'));
    await expect(exportToGoogleDoc(makeDoc('d1'))).rejects.toThrow('cancelled');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('propagates a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(exportToGoogleDoc(makeDoc('d1'))).rejects.toThrow('Failed to fetch');
  });
});
