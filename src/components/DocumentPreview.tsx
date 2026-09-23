import React, { useState } from 'react';
import type { DocumentModel, TestCaseItem } from '../types/document';
import { ZoomIn, ZoomOut, Maximize2, Check, FileCode } from 'lucide-react';

interface DocumentPreviewProps {
  document: DocumentModel;
  viewMode: 'paginated' | 'continuous';
  onSelectSection?: (id: string) => void;
  onUpdateTestCase?: (sectionId: string, testCaseIndex: number, updates: Partial<TestCaseItem>) => void;
}

export const DocumentPreview: React.FC<DocumentPreviewProps> = ({
  document: docModel,
  viewMode,
  onSelectSection,
  onUpdateTestCase
}) => {
  const [zoom, setZoom] = useState(100);
  const { metadata, sections } = docModel;

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 10, 150));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 10, 60));
  const handleZoomReset = () => setZoom(100);

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-57px)] bg-[#0a0a0a] overflow-hidden select-text">
      <div className="flex items-center justify-between px-4 py-2 bg-[#0d0d0d] border-b border-[#242424] text-xs text-[#8a8a8a]">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#ededed]">Live Document Canvas</span>
          <span className="text-[11px] px-2 py-0.5 border border-[#242424] bg-[#111111] text-[#4ade80] font-mono uppercase tracking-[0.12em]">
            {metadata.docNumber || 'DOC-01'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-[#111111] px-2 py-1 border border-[#242424]">
            <button type="button" onClick={handleZoomOut} title="Zoom Out" className="p-1 text-[#8a8a8a] hover:text-[#ededed]">
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-mono text-[#ededed] w-10 text-center">{zoom}%</span>
            <button type="button" onClick={handleZoomIn} title="Zoom In" className="p-1 text-[#8a8a8a] hover:text-[#ededed]">
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={handleZoomReset} title="Reset Zoom" className="p-1 text-[#8a8a8a] hover:text-[#ededed] ml-1 border-l border-[#242424]">
              <Maximize2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-8 flex justify-center bg-[#0a0a0a]">
        <div 
          style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
          className="transition-transform duration-150 ease-out"
        >
          <div className={`doc-page ${viewMode === 'continuous' ? 'continuous' : ''}`}>
            
            {/* Top Running Page Header Band (Centered Logo, Document ID on Left) */}
            <div className="grid grid-cols-3 items-center pb-3 border-b border-slate-200 text-[10px] text-slate-400 font-mono uppercase tracking-wider mb-6 min-h-[38px]">
              {/* Left: Document ID & Department */}
              <div className="flex flex-col text-left justify-center">
                <span className="font-bold text-slate-800 text-xs">
                  {metadata.docNumber || 'DOC-01'}
                </span>
                <span className="text-[9px] text-slate-400 normal-case tracking-normal">
                  {metadata.department || 'Engineering Organization'}
                </span>
              </div>

              {/* Center: Organization Logo */}
              <div className="flex items-center justify-center">
                {metadata.logoUrl ? (
                  <img
                    src={metadata.logoUrl}
                    alt="Logo"
                    className="h-8 max-w-[150px] object-contain"
                  />
                ) : null}
              </div>

              {/* Right: Classification & Date */}
              <div className="flex flex-col text-right justify-center">
                <span className="font-semibold text-slate-700">
                  {metadata.classification || 'INTERNAL ONLY'}
                </span>
                <span className="text-[9px] text-slate-400">
                  {metadata.date || new Date().toISOString().split('T')[0]}
                </span>
              </div>
            </div>

            {/* Document Main Title Block (Editable body starts here) */}
            <div className="mb-6">
              <h1 className="text-2xl md:text-3xl font-extrabold text-blue-950 tracking-tight leading-tight">
                {metadata.title || 'Untitled Technical Document'}
              </h1>
              {metadata.subtitle && (
                <p className="text-sm font-medium text-slate-500 italic mt-1">
                  {metadata.subtitle}
                </p>
              )}
            </div>

            {/* Document Metadata Table */}
            <table className="doc-table mb-8 text-xs">
              <tbody>
                <tr>
                  <th className="w-1/4">Document ID / Key</th>
                  <td className="w-1/4 font-mono font-semibold text-blue-900">{metadata.docNumber || 'N/A'}</td>
                  <th className="w-1/4">Classification</th>
                  <td className="w-1/4 font-semibold text-blue-900">{metadata.classification}</td>
                </tr>
                <tr>
                  <th>Author / Team</th>
                  <td>{metadata.author || 'Engineering Team'}</td>
                  <th>Date</th>
                  <td>{metadata.date || new Date().toISOString().split('T')[0]}</td>
                </tr>
                <tr>
                  <th>Version</th>
                  <td className="font-mono">{metadata.version || '1.0'}</td>
                  <th>Status</th>
                  <td>
                    <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[11px]">
                      <Check className="w-3 h-3" />
                      {metadata.status}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Render Document Sections */}
            <div className="space-y-6">
              {sections.map((sec) => (
                <section
                  key={sec.id}
                  id={sec.id}
                  onClick={() => onSelectSection?.(sec.id)}
                  className="group cursor-pointer rounded-lg p-2 -mx-2 hover:bg-[var(--panel-alt)] transition-colors relative"
                  title="Click to jump to editor for this section"
                >
                  {/* Heading */}
                  {sec.level === 1 && (
                    <h2 className="doc-h1 flex items-center justify-between">
                      <span>{sec.title}</span>
                      <span className="text-[10px] text-slate-400 font-normal opacity-0 group-hover:opacity-100 transition-opacity font-sans">
                        Click to edit
                      </span>
                    </h2>
                  )}
                  {sec.level === 2 && <h3 className="doc-h2">{sec.title}</h3>}
                  {sec.level === 3 && <h4 className="doc-h3">{sec.title}</h4>}

                  {/* Body: Rich Text */}
                  {sec.type === 'richText' && sec.content && (
                    <div className="doc-body-text space-y-3">
                      {sec.content.split('\n\n').map((paragraph, pIdx) => {
                        if (paragraph.trim().startsWith('- ') || paragraph.trim().startsWith('* ')) {
                          const items = paragraph.trim().split('\n');
                          return (
                            <ul key={pIdx} className="list-disc pl-5 space-y-1">
                              {items.map((item, iIdx) => (
                                <li key={iIdx} dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(item.replace(/^[-*]\s+/, '')) }} />
                              ))}
                            </ul>
                          );
                        } else if (/^\d+\.\s/.test(paragraph.trim())) {
                          const items = paragraph.trim().split('\n');
                          return (
                            <ol key={pIdx} className="list-decimal pl-5 space-y-1">
                              {items.map((item, iIdx) => (
                                <li key={iIdx} dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(item.replace(/^\d+\.\s+/, '')) }} />
                              ))}
                            </ol>
                          );
                        }
                        return (
                          <p key={pIdx} dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(paragraph) }} />
                        );
                      })}
                    </div>
                  )}

                  {/* Body: Table */}
                  {sec.type === 'table' && sec.tableData && (
                    <div className="overflow-x-auto my-3">
                      <table className="doc-table">
                        {sec.tableData.headers && (
                          <thead>
                            <tr>
                              {sec.tableData.headers.map((h, hIdx) => (
                                <th key={hIdx}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                        )}
                        <tbody>
                          {sec.tableData.rows?.map((row, rIdx) => (
                            <tr key={rIdx}>
                              {row.map((cell, cIdx) => (
                                <td key={cIdx}>{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Body: Code & Diff */}
                  {sec.type === 'codeDiff' && sec.codeSnippet && (
                    <div className="my-3 space-y-2">
                      {sec.codeSnippet.filename && (
                        <div className="flex items-center gap-2 text-xs font-mono text-blue-900 font-semibold">
                          <FileCode className="w-3.5 h-3.5 text-blue-600" />
                          <span>File: {sec.codeSnippet.filename}</span>
                          {sec.codeSnippet.description && (
                            <span className="text-slate-500 font-sans italic font-normal">
                              ({sec.codeSnippet.description})
                            </span>
                          )}
                        </div>
                      )}

                      {sec.codeSnippet.isDiff ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {sec.codeSnippet.oldCode && (
                            <div>
                              <div className="text-[11px] font-bold text-rose-700 mb-1">[-] Original Code:</div>
                              <pre className="doc-code bg-[rgba(255,84,112,0.08)] border-[var(--danger)] text-[var(--text)]">
                                {sec.codeSnippet.oldCode}
                              </pre>
                            </div>
                          )}
                          {sec.codeSnippet.newCode && (
                            <div>
                              <div className="text-[11px] font-bold text-emerald-700 mb-1">[+] Fixed Code:</div>
                              <pre className="doc-code bg-[rgba(43,255,176,0.08)] border-[var(--success)] text-[var(--text)]">
                                {sec.codeSnippet.newCode}
                              </pre>
                            </div>
                          )}
                        </div>
                      ) : (
                        sec.codeSnippet.code && (
                          <pre className="doc-code">
                            {sec.codeSnippet.code}
                          </pre>
                        )
                      )}
                    </div>
                  )}

                  {/* Body: Verification Matrix */}
                  {sec.type === 'verificationMatrix' && sec.verificationMatrix && (
                    <div className="overflow-x-auto my-3">
                      <table className="doc-table">
                        <thead>
                          <tr>
                            <th className="w-8 text-center">#</th>
                            <th className="w-2/5">Root Cause Identified</th>
                            <th className="w-1/4">Specific Fix Location</th>
                            <th>Verification & Resolution</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sec.verificationMatrix.map((item, mIdx) => (
                            <tr key={mIdx}>
                              <td className="text-center font-bold font-mono">{item.id || mIdx + 1}</td>
                              <td>{item.rootCause}</td>
                              <td className="font-mono text-xs text-blue-900 font-semibold">{item.fixLocation}</td>
                              <td className="text-emerald-900 font-medium">{item.resolution}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Body: Test Cases */}
                  {sec.type === 'testCases' && sec.testCases && (
                    <div className="space-y-4 my-3">
                      {sec.testCases.map((tc, tcIdx) => (
                        <div key={tcIdx} className="border border-slate-200 rounded-lg p-3.5 bg-[var(--panel-alt)] space-y-2 text-xs">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-blue-900">{tc.id}:</span>
                              <span className="font-bold text-slate-800 text-sm">{tc.title}</span>
                            </div>
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                              tc.status === 'PASSED'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : tc.status === 'FAILED'
                                ? 'bg-rose-100 text-rose-800 border-rose-300'
                                : tc.status === 'BLOCKED'
                                ? 'bg-purple-100 text-purple-800 border-purple-300'
                                : 'bg-amber-100 text-amber-800 border-amber-300'
                            }`}>
                              {tc.status}
                            </span>
                          </div>

                          {tc.objective && (
                            <p className="text-slate-700">
                              <strong className="text-slate-900">Objective:</strong> {tc.objective}
                            </p>
                          )}

                          {tc.steps && tc.steps.length > 0 && (
                            <div>
                              <strong className="text-slate-900 block mb-1">Steps:</strong>
                              <ol className="list-decimal pl-5 space-y-0.5 text-slate-600">
                                {tc.steps.map((s, sIdx) => (
                                  <li key={sIdx}>{s}</li>
                                ))}
                              </ol>
                            </div>
                          )}

                          {tc.expectedResult && (
                            <p className="text-slate-700">
                              <strong className="text-slate-900">Expected Result:</strong> {tc.expectedResult}
                            </p>
                          )}

                          {tc.actualResult && (
                            <p className="text-emerald-800">
                              <strong className="text-slate-900">Actual Result:</strong> {tc.actualResult}
                            </p>
                          )}

                          {tc.evidenceImage && (
                            <figure className="mt-3 rounded-lg border border-blue-200 bg-white p-2">
                              <figcaption className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--blue)]">
                                Proof of Execution{tc.evidenceImageName ? `: ${tc.evidenceImageName}` : ''}
                              </figcaption>
                              <img
                                src={tc.evidenceImage}
                                alt={tc.evidenceImageName || `Evidence for ${tc.id}`}
                                className="max-h-72 w-full rounded border border-slate-200 object-contain"
                              />
                            </figure>
                          )}

                          {onUpdateTestCase && (
                            <label
                              className="mt-3 flex w-fit cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-[var(--blue)] bg-[var(--panel)] px-2.5 py-1.5 text-[10px] font-semibold text-[var(--blue)] hover:bg-[var(--panel-alt)]"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <span>{tc.evidenceImage ? 'Replace proof image' : 'Upload proof image'}</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  if (!file) return;
                                  if (!file.type.startsWith('image/')) {
                                    alert('Please choose an image file such as JPG, PNG, GIF, or WebP.');
                                    event.target.value = '';
                                    return;
                                  }
                                  if (file.size > 10 * 1024 * 1024) {
                                    alert('Proof images must be smaller than 10 MB.');
                                    event.target.value = '';
                                    return;
                                  }
                                  const reader = new FileReader();
                                  reader.onload = () => {
                                    if (typeof reader.result === 'string') {
                                      onUpdateTestCase(sec.id, tcIdx, {
                                        evidenceImage: reader.result,
                                        evidenceImageName: file.name
                                      });
                                    }
                                  };
                                  reader.readAsDataURL(file);
                                  event.target.value = '';
                                }}
                              />
                            </label>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Body: Callout */}
                  {sec.type === 'callout' && sec.callout && (
                    <div className={`doc-callout ${sec.callout.type}`}>
                      {sec.callout.title && (
                        <div className="font-bold text-slate-900 mb-1">{sec.callout.title}</div>
                      )}
                      <div>{sec.callout.text}</div>
                    </div>
                  )}
                </section>
              ))}
            </div>

            {/* Document Footer */}
            <div className="mt-16 pt-4 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-400 font-mono">
              <span>{metadata.docNumber || 'DOC-01'} | {metadata.classification}</span>
              <span>DocCraft Studio | Page 1 of 1</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function formatInlineMarkdown(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code class="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono text-[11px] text-slate-900">$1</code>');
}
