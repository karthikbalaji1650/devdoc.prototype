import type { DocumentModel, DocSection } from '../types/document';

export function generateGoogleDocsHtml(docModel: DocumentModel): string {
  const { metadata, sections } = docModel;

  const topHeaderContent = `
    <table style="width: 100%; border: none; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; margin-bottom: 18px; font-family: monospace; font-size: 8.5pt; color: #64748b;">
      <tr>
        <td style="border: none; text-align: left; vertical-align: middle; width: 32%;">
          <strong style="color: #1e293b; font-size: 9.5pt;">${escapeHtml(metadata.docNumber || 'DOC-01')}</strong><br/>
          <span style="font-size: 7.5pt; color: #94a3b8;">${escapeHtml(metadata.department || 'Engineering Organization')}</span>
        </td>
        <td style="border: none; text-align: center; vertical-align: middle; width: 36%;">
          ${metadata.logoUrl ? `<img src="${metadata.logoUrl}" alt="Logo" style="height: 32px; max-width: 150px; object-fit: contain;" />` : ''}
        </td>
        <td style="border: none; text-align: right; vertical-align: middle; width: 32%;">
          <strong style="color: #1e3a8a;">${escapeHtml(metadata.classification || 'INTERNAL ONLY')}</strong><br/>
          <span style="font-size: 7.5pt; color: #94a3b8;">${escapeHtml(metadata.date || '')}</span>
        </td>
      </tr>
    </table>
  `;

  let html = `
<div style="font-family: Arial, 'Google Sans', sans-serif; color: #1e293b; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px;">
  <!-- Top Non-Editable Page Header Band (Left: Doc ID, Center: Logo, Right: Classification) -->
  ${topHeaderContent}

  <!-- Document Title Block (Editable body starts here) -->
  <h1 style="font-size: 24pt; color: #1e3a8a; margin-bottom: 4px; font-weight: 700;">${escapeHtml(metadata.title)}</h1>
  ${metadata.subtitle ? `<div style="font-size: 13pt; color: #475569; font-style: italic; margin-bottom: 16px;">${escapeHtml(metadata.subtitle)}</div>` : ''}

  <!-- Metadata Table -->
  <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; border: 1px solid #cbd5e1; font-size: 10pt;">
    <tr>
      <td style="background-color: #f1f5f9; font-weight: bold; padding: 6px 12px; border: 1px solid #cbd5e1; width: 25%;">Document ID</td>
      <td style="padding: 6px 12px; border: 1px solid #cbd5e1; width: 25%;">${escapeHtml(metadata.docNumber || 'N/A')}</td>
      <td style="background-color: #f1f5f9; font-weight: bold; padding: 6px 12px; border: 1px solid #cbd5e1; width: 25%;">Classification</td>
      <td style="padding: 6px 12px; border: 1px solid #cbd5e1; width: 25%; font-weight: bold; color: #1e3a8a;">${escapeHtml(metadata.classification || 'INTERNAL ONLY')}</td>
    </tr>
    <tr>
      <td style="background-color: #f1f5f9; font-weight: bold; padding: 6px 12px; border: 1px solid #cbd5e1;">Author</td>
      <td style="padding: 6px 12px; border: 1px solid #cbd5e1;">${escapeHtml(metadata.author || '')}</td>
      <td style="background-color: #f1f5f9; font-weight: bold; padding: 6px 12px; border: 1px solid #cbd5e1;">Date</td>
      <td style="padding: 6px 12px; border: 1px solid #cbd5e1;">${escapeHtml(metadata.date || '')}</td>
    </tr>
    <tr>
      <td style="background-color: #f1f5f9; font-weight: bold; padding: 6px 12px; border: 1px solid #cbd5e1;">Version</td>
      <td style="padding: 6px 12px; border: 1px solid #cbd5e1;">${escapeHtml(metadata.version || '1.0')}</td>
      <td style="background-color: #f1f5f9; font-weight: bold; padding: 6px 12px; border: 1px solid #cbd5e1;">Status</td>
      <td style="padding: 6px 12px; border: 1px solid #cbd5e1; font-weight: bold; color: #16a34a;">${escapeHtml(metadata.status || 'DRAFT')}</td>
    </tr>
  </table>
  <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
`;

  // Render Sections
  for (const section of sections) {
    html += renderSectionToHtml(section);
  }

  html += `
  <div style="margin-top: 40px; border-top: 1px solid #cbd5e1; padding-top: 10px; font-size: 8pt; color: #94a3b8; text-align: center;">
    ${escapeHtml(metadata.docNumber ? metadata.docNumber + ' - ' : '')} ${escapeHtml(metadata.classification || 'INTERNAL ONLY')} | Generated via DocCraft Studio
  </div>
</div>
`;

  return html;
}

export async function copyToGoogleDocsClipboard(docModel: DocumentModel): Promise<boolean> {
  const html = generateGoogleDocsHtml(docModel);
  const plainText = generatePlainText(docModel);

  try {
    const htmlBlob = new Blob([html], { type: 'text/html' });
    const textBlob = new Blob([plainText], { type: 'text/plain' });
    const data = [new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })];
    await navigator.clipboard.write(data);
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard with rich types, falling back to execCommand', err);
    // Fallback
    const listener = (e: ClipboardEvent) => {
      e.clipboardData?.setData('text/html', html);
      e.clipboardData?.setData('text/plain', plainText);
      e.preventDefault();
    };
    document.addEventListener('copy', listener);
    document.execCommand('copy');
    document.removeEventListener('copy', listener);
    return true;
  }
}

function renderSectionToHtml(section: DocSection): string {
  let output = '';

  const hTag = section.level === 1 ? 'h2' : section.level === 2 ? 'h3' : 'h4';
  const hStyle = section.level === 1 
    ? 'font-size: 16pt; color: #1e3a8a; border-bottom: 2px solid #2563eb; padding-bottom: 4px; margin-top: 24px; margin-bottom: 12px;'
    : section.level === 2
    ? 'font-size: 13pt; color: #0369a1; margin-top: 18px; margin-bottom: 8px;'
    : 'font-size: 11pt; color: #334155; margin-top: 14px; margin-bottom: 6px;';

  output += `<${hTag} style="${hStyle}">${escapeHtml(section.title)}</${hTag}>\n`;

  if (section.type === 'richText' && section.content) {
    const paragraphs = section.content.split('\n\n');
    for (const p of paragraphs) {
      if (!p.trim()) continue;
      const isList = p.trim().startsWith('- ') || p.trim().startsWith('* ') || /^\d+\.\s/.test(p.trim());
      if (isList) {
        const items = p.trim().split('\n');
        output += '<ul style="margin: 8px 0 12px 20px; padding: 0;">\n';
        for (const item of items) {
          const cleanItem = item.replace(/^[-*\d.]+\s+/, '');
          output += `<li style="margin-bottom: 4px; font-size: 10.5pt; color: #334155;">${formatInlineMarkdown(cleanItem)}</li>\n`;
        }
        output += '</ul>\n';
      } else {
        output += `<p style="font-size: 10.5pt; line-height: 1.6; color: #334155; margin-bottom: 12px;">${formatInlineMarkdown(p)}</p>\n`;
      }
    }
  } else if (section.type === 'table' && section.tableData) {
    const { headers, rows } = section.tableData;
    output += '<table style="width: 100%; border-collapse: collapse; margin: 12px 0 18px 0; border: 1px solid #cbd5e1; font-size: 9.5pt;">\n';
    if (headers && headers.length > 0) {
      output += '  <thead><tr style="background-color: #f1f5f9;">\n';
      headers.forEach(h => {
        output += `    <th style="border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; font-weight: bold; color: #0f172a;">${escapeHtml(h)}</th>\n`;
      });
      output += '  </tr></thead>\n';
    }
    if (rows && rows.length > 0) {
      output += '  <tbody>\n';
      rows.forEach((r, idx) => {
        const bg = idx % 2 === 1 ? 'background-color: #f8fafc;' : '';
        output += `  <tr style="${bg}">\n`;
        r.forEach(c => {
          output += `    <td style="border: 1px solid #cbd5e1; padding: 8px 12px; color: #334155; vertical-align: top;">${escapeHtml(c)}</td>\n`;
        });
        output += '  </tr>\n';
      });
      output += '  </tbody>\n';
    }
    output += '</table>\n';
  } else if (section.type === 'codeDiff' && section.codeSnippet) {
    const { filename, description, code, isDiff, oldCode, newCode } = section.codeSnippet;
    output += '<div style="margin: 12px 0 16px 0;">\n';
    if (filename || description) {
      output += `<div style="font-size: 9.5pt; font-weight: bold; color: #1e3a8a; margin-bottom: 4px;">File: ${escapeHtml(filename || '')} <span style="color: #64748b; font-weight: normal; font-style: italic;">(${escapeHtml(description || '')})</span></div>\n`;
    }
    if (isDiff && (oldCode || newCode)) {
      if (oldCode) {
        output += '<div style="font-size: 9pt; color: #dc2626; font-weight: bold; margin-top: 6px;">[-] Original Code:</div>\n';
        output += `<pre style="background-color: #fef2f2; border: 1px solid #fecaca; padding: 10px 14px; border-radius: 4px; font-family: Consolas, 'Roboto Mono', monospace; font-size: 8.5pt; color: #991b1b; overflow-x: auto; white-space: pre-wrap;">${escapeHtml(oldCode)}</pre>\n`;
      }
      if (newCode) {
        output += '<div style="font-size: 9pt; color: #16a34a; font-weight: bold; margin-top: 6px;">[+] Fixed Code:</div>\n';
        output += `<pre style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 10px 14px; border-radius: 4px; font-family: Consolas, 'Roboto Mono', monospace; font-size: 8.5pt; color: #166534; overflow-x: auto; white-space: pre-wrap;">${escapeHtml(newCode)}</pre>\n`;
      }
    } else if (code) {
      output += `<pre style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 14px; border-radius: 4px; font-family: Consolas, 'Roboto Mono', monospace; font-size: 8.5pt; color: #0f172a; overflow-x: auto; white-space: pre-wrap;">${escapeHtml(code)}</pre>\n`;
    }
    output += '</div>\n';
  } else if (section.type === 'verificationMatrix' && section.verificationMatrix) {
    output += '<table style="width: 100%; border-collapse: collapse; margin: 12px 0; border: 1px solid #cbd5e1; font-size: 9pt;">\n';
    output += '  <thead><tr style="background-color: #f1f5f9;">\n';
    output += '    <th style="border: 1px solid #cbd5e1; padding: 6px 8px; width: 5%;">#</th>\n';
    output += '    <th style="border: 1px solid #cbd5e1; padding: 6px 8px; width: 35%;">Root Cause Identified</th>\n';
    output += '    <th style="border: 1px solid #cbd5e1; padding: 6px 8px; width: 25%;">Specific Fix Location</th>\n';
    output += '    <th style="border: 1px solid #cbd5e1; padding: 6px 8px; width: 35%;">Verification & Resolution</th>\n';
    output += '  </tr></thead><tbody>\n';
    section.verificationMatrix.forEach((m, idx) => {
      output += '  <tr>\n';
      output += `    <td style="border: 1px solid #cbd5e1; padding: 6px 8px; font-weight: bold;">${escapeHtml(m.id || `${idx + 1}`)}</td>\n`;
      output += `    <td style="border: 1px solid #cbd5e1; padding: 6px 8px;">${escapeHtml(m.rootCause)}</td>\n`;
      output += `    <td style="border: 1px solid #cbd5e1; padding: 6px 8px; font-family: monospace; font-size: 8.5pt;">${escapeHtml(m.fixLocation)}</td>\n`;
      output += `    <td style="border: 1px solid #cbd5e1; padding: 6px 8px; color: #166534; font-weight: 500;">${escapeHtml(m.resolution)}</td>\n`;
      output += '  </tr>\n';
    });
    output += '</tbody></table>\n';
  } else if (section.type === 'testCases' && section.testCases) {
    for (const tc of section.testCases) {
      const badgeColor = tc.status === 'PASSED' ? '#16a34a' : tc.status === 'FAILED' ? '#dc2626' : '#d97706';
      output += `<div style="margin: 12px 0; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; background-color: #fafbfc;">\n`;
      output += `  <div style="font-size: 11pt; font-weight: bold; color: #1e3a8a; margin-bottom: 6px;">${escapeHtml(tc.id)}: ${escapeHtml(tc.title)} <span style="font-size: 8.5pt; background-color: ${badgeColor}; color: white; padding: 2px 8px; border-radius: 9999px; margin-left: 8px;">${tc.status}</span></div>\n`;
      if (tc.objective) {
        output += `  <p style="font-size: 9.5pt; margin: 4px 0; color: #334155;"><strong>Objective:</strong> ${escapeHtml(tc.objective)}</p>\n`;
      }
      if (tc.steps && tc.steps.length > 0) {
        output += `  <div style="font-size: 9.5pt; margin: 4px 0; color: #334155;"><strong>Steps:</strong></div>\n`;
        output += '  <ol style="margin: 4px 0 6px 20px; font-size: 9pt; color: #475569;">\n';
        tc.steps.forEach(s => {
          output += `    <li>${escapeHtml(s)}</li>\n`;
        });
        output += '  </ol>\n';
      }
      if (tc.expectedResult) {
        output += `  <p style="font-size: 9.5pt; margin: 4px 0; color: #334155;"><strong>Expected Result:</strong> ${escapeHtml(tc.expectedResult)}</p>\n`;
      }
      if (tc.actualResult) {
        output += `  <p style="font-size: 9.5pt; margin: 4px 0; color: #166534;"><strong>Actual Result:</strong> ${escapeHtml(tc.actualResult)}</p>\n`;
      }
      output += '</div>\n';
    }
  } else if (section.type === 'callout' && section.callout) {
    const { type, title, text } = section.callout;
    const border = type === 'warning' ? '#f59e0b' : type === 'success' ? '#10b981' : '#3b82f6';
    const bg = type === 'warning' ? '#fffbeb' : type === 'success' ? '#f0fdf4' : '#eff6ff';
    output += `<div style="border-left: 4px solid ${border}; background-color: ${bg}; padding: 10px 14px; margin: 12px 0; border-radius: 0 4px 4px 0;">\n`;
    if (title) {
      output += `  <strong style="color: #0f172a; font-size: 10pt; display: block; margin-bottom: 4px;">${escapeHtml(title)}</strong>\n`;
    }
    output += `  <div style="font-size: 9.5pt; color: #334155;">${escapeHtml(text)}</div>\n`;
    output += '</div>\n';
  }

  return output;
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatInlineMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code style="background-color: #f1f5f9; padding: 2px 4px; border-radius: 3px; font-family: monospace; font-size: 9pt;">$1</code>');
}

function generatePlainText(docModel: DocumentModel): string {
  let text = `${docModel.metadata.title}\n`;
  if (docModel.metadata.subtitle) text += `${docModel.metadata.subtitle}\n`;
  text += `Document Number: ${docModel.metadata.docNumber} | Classification: ${docModel.metadata.classification}\n`;
  text += `Author: ${docModel.metadata.author} | Date: ${docModel.metadata.date} | Version: ${docModel.metadata.version}\n`;
  text += `========================================================\n\n`;

  for (const s of docModel.sections) {
    text += `## ${s.title}\n\n`;
    if (s.content) text += `${s.content}\n\n`;
  }
  return text;
}
