import React, { useRef } from 'react';
import type { DocumentMetadata, DocClassification, DocStatus } from '../../types/document';
import { ShieldCheck, Calendar, User, Tag, FileText, CheckCircle2, Image, Upload, Trash2, Sparkles, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';

interface MetadataEditorProps {
  metadata: DocumentMetadata;
  onChange: (updates: Partial<DocumentMetadata>) => void;
  onTriggerAi?: (text: string, onApply: (newText: string) => void) => void;
}

// Preset modern engineering logos (Base64 SVGs)
const LOGO_PRESETS = [
  {
    name: 'Hardware / Chip',
    icon: '⚡',
    svg: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" fill="none"><rect width="40" height="40" y="10" rx="8" fill="%232563EB"/><path d="M14 24h12v12H14z" fill="white"/><path d="M20 18v6m0 12v6m-6-12H8m24 0h-6" stroke="white" stroke-width="2" stroke-linecap="round"/><text x="50" y="38" fill="%231E3A8A" font-family="Arial" font-weight="bold" font-size="20">FIRMWARE</text></svg>'
  },
  {
    name: 'Cloud / Server',
    icon: '☁️',
    svg: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" fill="none"><rect width="40" height="40" y="10" rx="8" fill="%230284C7"/><path d="M14 34a6 6 0 0 1 1.5-11.8 8 8 0 0 1 15 2.8 5 5 0 0 1-1.5 9H14z" fill="white"/><text x="50" y="38" fill="%230369A1" font-family="Arial" font-weight="bold" font-size="20">PLATFORM</text></svg>'
  },
  {
    name: 'Security Shield',
    icon: '🛡️',
    svg: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" fill="none"><rect width="40" height="40" y="10" rx="8" fill="%23059669"/><path d="M20 18l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11v-6l8-3z" fill="white"/><text x="50" y="38" fill="%23065F46" font-family="Arial" font-weight="bold" font-size="20">SECURITY</text></svg>'
  },
  {
    name: 'Enterprise Tech',
    icon: '🏢',
    svg: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" fill="none"><rect width="40" height="40" y="10" rx="8" fill="%234F46E5"/><circle cx="20" cy="30" r="8" fill="white"/><text x="50" y="38" fill="%233730A3" font-family="Arial" font-weight="bold" font-size="20">ENTERPRISE</text></svg>'
  }
];

export const MetadataEditor: React.FC<MetadataEditorProps> = ({ metadata, onChange, onTriggerAi }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        onChange({ logoUrl: result, logoPosition: 'center' });
      };
      reader.readAsDataURL(file);
    }
  };

  const currentLogoPos = metadata.logoPosition || 'center';

  return (
    <div className="bg-white rounded-xl p-4 md:p-5 border border-slate-200 shadow-xs space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-600" />
          <h3 className="font-semibold text-sm text-slate-900">Document Overview & Header Properties</h3>
        </div>
        <span className="text-xs text-slate-500">Word / Docs Metadata</span>
      </div>

      {/* Header Logo Upload Section */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image className="w-4 h-4 text-indigo-600" />
            <div>
              <label className="text-xs font-semibold text-slate-800">Page Header Logo</label>
              <p className="text-[10px] text-slate-500">Embedded in the top running page header margin (outside document body)</p>
            </div>
          </div>
          {metadata.logoUrl && (
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-white rounded-lg p-0.5 border border-slate-200 text-[11px]">
                <button
                  type="button"
                  onClick={() => onChange({ logoPosition: 'left' })}
                  title="Align Left"
                  className={`flex items-center gap-1 px-2 py-0.5 rounded ${
                    currentLogoPos === 'left' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <AlignLeft className="w-3 h-3" />
                  <span>Left</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ logoPosition: 'center' })}
                  title="Align Center"
                  className={`flex items-center gap-1 px-2 py-0.5 rounded ${
                    currentLogoPos === 'center' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <AlignCenter className="w-3 h-3" />
                  <span>Center</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ logoPosition: 'right' })}
                  title="Align Right"
                  className={`flex items-center gap-1 px-2 py-0.5 rounded ${
                    currentLogoPos === 'right' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <AlignRight className="w-3 h-3" />
                  <span>Right</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => onChange({ logoUrl: undefined })}
                className="flex items-center gap-1 text-[11px] text-rose-600 hover:text-rose-700 px-2 py-1 rounded hover:bg-rose-50 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                <span>Remove</span>
              </button>
            </div>
          )}
        </div>

        {/* Logo Preview or Upload Box */}
        <div className="flex flex-wrap items-center gap-4">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
          />

          {metadata.logoUrl ? (
            <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-slate-200 shadow-xs">
              <img
                src={metadata.logoUrl}
                alt="Document Logo"
                className="h-8 max-w-[140px] object-contain"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2 py-1 rounded hover:bg-slate-100 transition-colors"
              >
                Change Image
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-slate-300 hover:border-blue-500 bg-white hover:bg-slate-50 text-xs text-slate-700 transition-colors shadow-xs"
            >
              <Upload className="w-4 h-4 text-blue-600" />
              <span>Upload Custom Logo (PNG, SVG, JPG)</span>
            </button>
          )}

          {/* Quick Presets */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-slate-500 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>Presets:</span>
            </span>
            {LOGO_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => onChange({ logoUrl: preset.svg, logoPosition: 'center' })}
                className="text-[11px] px-2 py-1 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors flex items-center gap-1 shadow-xs font-medium"
              >
                <span>{preset.icon}</span>
                <span>{preset.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Document Title */}
        <div className="md:col-span-2 space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-700">Document Title</label>
            {onTriggerAi && metadata.title && (
              <button
                type="button"
                onClick={() => onTriggerAi(metadata.title, (newT) => onChange({ title: newT }))}
                className="flex items-center gap-1 text-[11px] text-purple-600 hover:text-purple-700 font-medium"
              >
                <Sparkles className="w-3 h-3" />
                <span>AI Polish Title</span>
              </button>
            )}
          </div>
          <input
            type="text"
            value={metadata.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="e.g. WebUI HPM Firmware Upgrade Failure Investigation"
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 transition-colors shadow-xs"
          />
        </div>

        {/* Subtitle */}
        <div className="md:col-span-2 space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-700">Subtitle / Scope Description</label>
            {onTriggerAi && metadata.subtitle && (
              <button
                type="button"
                onClick={() => onTriggerAi(metadata.subtitle || '', (newS) => onChange({ subtitle: newS }))}
                className="flex items-center gap-1 text-[11px] text-purple-600 hover:text-purple-700 font-medium"
              >
                <Sparkles className="w-3 h-3" />
                <span>AI Polish Subtitle</span>
              </button>
            )}
          </div>
          <input
            type="text"
            value={metadata.subtitle || ''}
            onChange={(e) => onChange({ subtitle: e.target.value })}
            placeholder="e.g. Root Cause Investigation, Code Fixes & Verification Matrix"
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 transition-colors shadow-xs"
          />
        </div>

        {/* Document ID / Ticket Key */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-blue-600" />
            <span>Document ID / Ticket Key</span>
          </label>
          <input
            type="text"
            value={metadata.docNumber}
            onChange={(e) => onChange({ docNumber: e.target.value })}
            placeholder="e.g. WH3-1205 or TR-2026-08"
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500 transition-colors shadow-xs"
          />
        </div>

        {/* Author / Engineering Team */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-indigo-600" />
            <span>Author / Team</span>
          </label>
          <input
            type="text"
            value={metadata.author}
            onChange={(e) => onChange({ author: e.target.value })}
            placeholder="e.g. Firmware Platform Engineering"
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500 transition-colors shadow-xs"
          />
        </div>

        {/* Department / Organization */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700">Department / Organization</label>
          <input
            type="text"
            value={metadata.department || ''}
            onChange={(e) => onChange({ department: e.target.value })}
            placeholder="e.g. Platform Software Development"
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500 transition-colors shadow-xs"
          />
        </div>

        {/* Date */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-emerald-600" />
            <span>Date</span>
          </label>
          <input
            type="date"
            value={metadata.date}
            onChange={(e) => onChange({ date: e.target.value })}
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500 transition-colors shadow-xs"
          />
        </div>

        {/* Version */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700">Document Version</label>
          <input
            type="text"
            value={metadata.version}
            onChange={(e) => onChange({ version: e.target.value })}
            placeholder="e.g. 1.0 or 2.1"
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500 transition-colors shadow-xs"
          />
        </div>

        {/* Classification */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
            <span>Security Classification</span>
          </label>
          <select
            value={metadata.classification}
            onChange={(e) => onChange({ classification: e.target.value as DocClassification })}
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500 transition-colors shadow-xs"
          >
            <option value="INTERNAL ONLY">INTERNAL ONLY</option>
            <option value="CONFIDENTIAL">CONFIDENTIAL</option>
            <option value="PUBLIC">PUBLIC</option>
          </select>
        </div>

        {/* Status */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Document Status</span>
          </label>
          <select
            value={metadata.status}
            onChange={(e) => onChange({ status: e.target.value as DocStatus })}
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500 transition-colors shadow-xs"
          >
            <option value="DRAFT">DRAFT</option>
            <option value="IN_REVIEW">IN REVIEW</option>
            <option value="APPROVED">APPROVED</option>
            <option value="PUBLISHED">PUBLISHED</option>
          </select>
        </div>
      </div>
    </div>
  );
};
