import React from 'react';
import type { CodeSnippet } from '../../types/document';
import { Code, FileCode, SplitSquareVertical } from 'lucide-react';

interface CodeDiffEditorProps {
  codeSnippet?: CodeSnippet;
  onChange: (snippet: CodeSnippet) => void;
}

const LANGUAGES = [
  'javascript', 'typescript', 'c', 'cpp', 'python', 'bash', 'go', 'rust', 'json', 'yaml', 'html', 'css', 'sql'
];

export const CodeDiffEditor: React.FC<CodeDiffEditorProps> = ({
  codeSnippet = {
    filename: '',
    language: 'javascript',
    description: '',
    code: '',
    isDiff: false,
    oldCode: '',
    newCode: ''
  },
  onChange
}) => {
  return (
    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-4 shadow-xs">
      {/* Code Header Settings */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pb-3 border-b border-slate-200">
        <div className="sm:col-span-1 space-y-1">
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <FileCode className="w-3.5 h-3.5 text-blue-600" />
            <span>File Path / Name</span>
          </label>
          <input
            type="text"
            value={codeSnippet.filename}
            onChange={(e) => onChange({ ...codeSnippet, filename: e.target.value })}
            placeholder="e.g. packages/spx_restservice/maintenance.c"
            className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <Code className="w-3.5 h-3.5 text-indigo-600" />
            <span>Language</span>
          </label>
          <select
            value={codeSnippet.language}
            onChange={(e) => onChange({ ...codeSnippet, language: e.target.value })}
            className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1 flex flex-col justify-end">
          <button
            type="button"
            onClick={() => onChange({ ...codeSnippet, isDiff: !codeSnippet.isDiff })}
            className={`flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
              codeSnippet.isDiff
                ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-xs'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100 shadow-xs'
            }`}
          >
            <SplitSquareVertical className="w-3.5 h-3.5" />
            <span>{codeSnippet.isDiff ? 'Diff Mode (Old vs New)' : 'Single Snippet Mode'}</span>
          </button>
        </div>

        <div className="sm:col-span-3 space-y-1">
          <label className="text-xs font-semibold text-slate-700">Description / Context</label>
          <input
            type="text"
            value={codeSnippet.description || ''}
            onChange={(e) => onChange({ ...codeSnippet, description: e.target.value })}
            placeholder="e.g. Added preserve_config payload and explicit integer casting"
            className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
          />
        </div>
      </div>

      {/* Code Textareas */}
      {codeSnippet.isDiff ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Old Code */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium text-rose-700">
              <span>[-] Original / Buggy Code</span>
              <span className="text-[10px] text-slate-500 font-mono">Before Fix</span>
            </div>
            <textarea
              value={codeSnippet.oldCode || ''}
              onChange={(e) => onChange({ ...codeSnippet, oldCode: e.target.value })}
              placeholder="// Paste original implementation here..."
              rows={10}
              className="w-full p-3 bg-rose-50/50 border border-rose-200 rounded-lg text-xs font-mono text-rose-900 placeholder-slate-400 focus:outline-none focus:border-rose-500 leading-relaxed resize-y"
            />
          </div>

          {/* New Code */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium text-emerald-700">
              <span>[+] Fixed / Proposed Code</span>
              <span className="text-[10px] text-slate-500 font-mono">After Fix</span>
            </div>
            <textarea
              value={codeSnippet.newCode || ''}
              onChange={(e) => onChange({ ...codeSnippet, newCode: e.target.value })}
              placeholder="// Paste proposed fix implementation here..."
              rows={10}
              className="w-full p-3 bg-emerald-50/50 border border-emerald-200 rounded-lg text-xs font-mono text-emerald-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 leading-relaxed resize-y"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-700">
            <span>Code Implementation</span>
            <span className="text-[10px] text-slate-500 font-mono">{codeSnippet.language}</span>
          </div>
          <textarea
            value={codeSnippet.code || ''}
            onChange={(e) => onChange({ ...codeSnippet, code: e.target.value })}
            placeholder="// Paste code snippet here..."
            rows={10}
            className="w-full p-3 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 leading-relaxed resize-y shadow-xs"
          />
        </div>
      )}
    </div>
  );
};
