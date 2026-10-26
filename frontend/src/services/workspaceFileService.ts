import type { DocumentModel } from '../types/document';
import { saveAs } from 'file-saver';
import { fetchWithTimeout } from './fetchWithTimeout';

/** Dynamic helper to resolve file-bridge URL (port 8081) */
export function getStoredFileBridgeUrl(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('devdoc_file_bridge_url');
    if (stored && stored.trim()) return stored.trim();

    const vscodeUrl = localStorage.getItem('devdoc_vscode_url');
    if (vscodeUrl) {
      try {
        const parsed = new URL(vscodeUrl);
        return `${parsed.protocol}//${parsed.hostname}:8081`;
      } catch {
        // ignore
      }
    }
    const host = window.location.hostname || 'localhost';
    return `http://${host}:8081`;
  }
  return 'http://localhost:8081';
}

/**
 * Converts a DocCraft DocumentModel into clean GitHub-flavored Markdown text.
 */
export function convertDocumentToMarkdown(doc: DocumentModel): string {
  let md = `# ${doc.metadata.title}\n\n`;
  if (doc.metadata.subtitle) {
    md += `> **Subtitle:** ${doc.metadata.subtitle}\n\n`;
  }

  md += `**Document Number:** ${doc.metadata.docNumber || 'N/A'}  \n`;
  md += `**Author:** ${doc.metadata.author || 'N/A'}  \n`;
  md += `**Date:** ${doc.metadata.date || new Date().toISOString().split('T')[0]}  \n`;
  md += `**Classification:** ${doc.metadata.classification || 'INTERNAL ONLY'}  \n`;
  md += `**Status:** ${doc.metadata.status || 'DRAFT'}  \n\n`;
  md += `---\n\n`;

  doc.sections.forEach((sec) => {
    const headingHashes = '#'.repeat(Math.min(sec.level || 1, 6));
    md += `${headingHashes} ${sec.title}\n\n`;

    if (sec.type === 'richText' || !sec.type) {
      md += `${sec.content || ''}\n\n`;
    } else if (sec.type === 'codeDiff' && sec.codeSnippet) {
      if (sec.codeSnippet.oldCode || sec.codeSnippet.newCode) {
        md += `\`\`\`diff\n# Old Code:\n${sec.codeSnippet.oldCode || ''}\n\n# New Code:\n${sec.codeSnippet.newCode || ''}\n\`\`\`\n\n`;
      } else if (sec.codeSnippet.code) {
        md += `\`\`\`${sec.codeSnippet.language || 'text'}\n${sec.codeSnippet.code}\n\`\`\`\n\n`;
      }
    } else if (sec.type === 'table' && sec.tableData) {
      const { headers, rows } = sec.tableData;
      if (headers && headers.length > 0) {
        md += `| ${headers.join(' | ')} |\n`;
        md += `| ${headers.map(() => '---').join(' | ')} |\n`;
        rows.forEach((row) => {
          md += `| ${row.join(' | ')} |\n`;
        });
        md += `\n`;
      }
    } else if (sec.content) {
      md += `${sec.content}\n\n`;
    }
  });

  return md;
}

/**
 * Converts a TestSuiteItem (with test cases) into a Markdown file suitable
 * for Robot Framework script generation by Cline.
 */
export function convertTestSuiteToMarkdown(suite: {
  title: string;
  description: string;
  module: string;
  taDocNumber?: string;
  testCases?: {
    customId: string;
    title: string;
    priority: string;
    type: string;
    preconditions: string;
    steps: { step: number; action: string; expected: string }[];
    expectedResult: string;
    robotCode?: string;
  }[];
}): string {
  const today = new Date().toISOString().split('T')[0];
  let md = `# Test Suite: ${suite.title}\n\n`;
  md += `**Module:** ${suite.module}  \n`;
  if (suite.taDocNumber) md += `**Linked TA Doc:** ${suite.taDocNumber}  \n`;
  md += `**Generated:** ${today}  \n\n`;
  md += `> ${suite.description}\n\n---\n\n`;

  (suite.testCases || []).forEach((tc, idx) => {
    md += `## ${idx + 1}. [${tc.customId}] ${tc.title}\n\n`;
    md += `- **Priority:** ${tc.priority}\n`;
    md += `- **Type:** ${tc.type}\n\n`;
    md += `**Preconditions:** ${tc.preconditions}\n\n`;
    md += `### Steps\n\n`;
    tc.steps.forEach(st => {
      md += `${st.step}. **Action:** ${st.action}  \n   **Expected:** ${st.expected}\n\n`;
    });
    md += `**Expected Outcome:** ${tc.expectedResult}\n\n`;
    if (tc.robotCode) {
      md += `### Robot Framework Script\n\n\`\`\`robot\n${tc.robotCode}\n\`\`\`\n\n`;
    }
    md += `---\n\n`;
  });

  return md;
}

/**
 * Saves a test suite as a .md file to the VS Code workspace at
 * /home/coder/project/test-suites/ and /home/coder/project/specs/ via the file-bridge server.
 * Returns { filename, savedToWorkspace }
 */
export async function pushTestSuiteToVsCode(suite: Parameters<typeof convertTestSuiteToMarkdown>[0]): Promise<{ filename: string; savedToWorkspace: boolean }> {
  const today = new Date().toISOString().split('T')[0];
  const cleanTitle = suite.title.toLowerCase().replace(/[^a-z0-9]/gi, '_');
  const filename = `${cleanTitle}_${today}.md`;
  const content = convertTestSuiteToMarkdown(suite);

  const savedToWorkspace = await pushFileToVsCodeWorkspace('/save-suite', filename, content);
  return { filename, savedToWorkspace };
}

/**
 * Posts a file to the VS Code file-bridge server (port 8081).
 * Returns true on success, false if the bridge is unreachable.
 */
export async function pushFileToVsCodeWorkspace(
  endpoint: '/save-doc' | '/save-results' | '/save-suite' | '/save-spec',
  filename: string,
  content: string
): Promise<boolean> {
  const bridgeUrl = getStoredFileBridgeUrl();
  try {
    const res = await fetchWithTimeout(`${bridgeUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, content }),
    });
    return res.ok;
  } catch (err) {
    console.warn(`[file-bridge] Unreachable at ${bridgeUrl}${endpoint}:`, err);
    return false;
  }
}

/**
 * Downloads document as .docx and .md, AND pushes the .md directly into the
 * VS Code workspace at /home/coder/project/docs/ via the file-bridge server.
 */
export async function exportDocToVsCodeSpecs(doc: DocumentModel): Promise<{ docxBlob: Blob; mdContent: string; fileName: string; savedToWorkspace: boolean }> {
  const cleanTitle = (doc.metadata.title || 'technical_analysis_doc')
    .toLowerCase()
    .replace(/[^a-z0-9]/gi, '_');
  
  const prefix = doc.metadata.docNumber ? `${doc.metadata.docNumber}_` : '';
  const baseName = `${prefix}${cleanTitle}`;
  
  // 1. Generate DOCX Blob and download
  const { generateDocxBlob } = await import('../exporters/docxExporter');
  const docxBlob = await generateDocxBlob(doc);
  saveAs(docxBlob, `${baseName}.docx`);

  // 2. Generate Markdown and download
  const mdContent = convertDocumentToMarkdown(doc);
  const mdBlob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
  saveAs(mdBlob, `${baseName}.md`);

  // 3. Also push .md directly into VS Code workspace via file-bridge
  const savedToWorkspace = await pushFileToVsCodeWorkspace('/save-doc', `${baseName}.md`, mdContent);

  return { docxBlob, mdContent, fileName: baseName, savedToWorkspace };
}

/**
 * Sample Interactive HTML Report for Robot Framework Output HTML Viewer
 */
export function getSampleRobotHtmlReport(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Robot Framework Test Report & Log</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 20px; }
    .header { background: #1e293b; padding: 20px; border-radius: 12px; border: 1px solid #334155; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
    .title { font-size: 20px; font-weight: bold; color: #38bdf8; }
    .subtitle { font-size: 12px; color: #94a3b8; margin-top: 4px; }
    .stats-bar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 25px; }
    .stat-card { background: #1e293b; border: 1px solid #334155; padding: 15px; border-radius: 10px; text-align: center; }
    .stat-val { font-size: 24px; font-weight: bold; }
    .stat-lbl { font-size: 11px; color: #94a3b8; text-transform: uppercase; margin-top: 4px; }
    .pass { color: #4ade80; }
    .fail { color: #f87171; }
    .skip { color: #fbbf24; }
    .table-container { background: #1e293b; border-radius: 12px; border: 1px solid #334155; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
    th { background: #0f172a; padding: 12px 16px; color: #94a3b8; font-weight: 600; border-bottom: 1px solid #334155; }
    td { padding: 12px 16px; border-bottom: 1px solid #334155; }
    tr:hover { background: #334155/30; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; }
    .badge-pass { background: rgba(74, 222, 128, 0.15); color: #4ade80; border: 1px solid rgba(74, 222, 128, 0.3); }
    .badge-fail { background: rgba(248, 113, 113, 0.15); color: #f87171; border: 1px solid rgba(248, 113, 113, 0.3); }
    .log-box { font-family: monospace; background: #090d16; padding: 10px; border-radius: 6px; font-size: 11px; color: #cbd5e1; margin-top: 6px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">🤖 Robot Framework Execution Report (report.html)</div>
      <div class="subtitle">Generated by VS Code + Cline Test Automation Engine • Target: AST2600 RTC & Dual-Flash Suite</div>
    </div>
    <div style="font-size: 12px; font-weight: bold; background: rgba(56, 189, 248, 0.1); color: #38bdf8; padding: 6px 12px; border-radius: 20px; border: 1px solid rgba(56, 189, 248, 0.3);">
      STATUS: ALL TESTS PASSED (100%)
    </div>
  </div>

  <div class="stats-bar">
    <div class="stat-card">
      <div class="stat-val">3</div>
      <div class="stat-lbl">Total Executed</div>
    </div>
    <div class="stat-card">
      <div class="stat-val pass">3</div>
      <div class="stat-lbl">Passed</div>
    </div>
    <div class="stat-card">
      <div class="stat-val fail">0</div>
      <div class="stat-lbl">Failed</div>
    </div>
    <div class="stat-card">
      <div class="stat-val skip">0</div>
      <div class="stat-lbl">Skipped</div>
    </div>
  </div>

  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th>Test Name / Custom ID</th>
          <th>Tags</th>
          <th>Status</th>
          <th>Elapsed Time</th>
          <th>Keyword Log Summary</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>TC_RTC_001_Clock_Drift_Verification</strong></td>
          <td><span style="color:#94a3b8">P1, Firmware, RTC</span></td>
          <td><span class="badge badge-pass">PASS</span></td>
          <td>4.120 s</td>
          <td>
            <div class="log-box">
              INFO: BMC system connected at 192.168.1.100<br/>
              INFO: Applied stress load for 3600 seconds.<br/>
              PASS: RTC drift measured at 12ms (Threshold: &lt; 50ms)
            </div>
          </td>
        </tr>
        <tr>
          <td><strong>TC_RTC_002_NTP_Synchronization_Failover</strong></td>
          <td><span style="color:#94a3b8">P1, Network, NTP</span></td>
          <td><span class="badge badge-pass">PASS</span></td>
          <td>2.325 s</td>
          <td>
            <div class="log-box">
              INFO: Disconnected primary NTP server ntp.pool.org<br/>
              PASS: Secondary NTP server pool engaged within 1.2s.
            </div>
          </td>
        </tr>
        <tr>
          <td><strong>TC_HPM_002_Preserve_Config_Flash</strong></td>
          <td><span style="color:#94a3b8">P1, REST_API, Firmware</span></td>
          <td><span class="badge badge-pass">PASS</span></td>
          <td>2.345 s</td>
          <td>
            <div class="log-box">
              INFO: POST /api/v1/system/firmware/upload { preserve_config: true }<br/>
              PASS: Status code 200 returned. Bank switched successfully.
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</body>
</html>`;
}
