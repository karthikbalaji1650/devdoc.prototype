import React from 'react';
import type { VerificationMatrixItem } from '../../types/document';
import { Plus, Trash2 } from 'lucide-react';

interface VerificationMatrixEditorProps {
  matrix?: VerificationMatrixItem[];
  onChange: (matrix: VerificationMatrixItem[]) => void;
}

export const VerificationMatrixEditor: React.FC<VerificationMatrixEditorProps> = ({
  matrix = [],
  onChange
}) => {
  const addItem = () => {
    const newItem: VerificationMatrixItem = {
      id: `${matrix.length + 1}`,
      rootCause: '',
      fixLocation: '',
      resolution: '',
      status: 'PASSED'
    };
    onChange([...matrix, newItem]);
  };

  const updateItem = (index: number, updates: Partial<VerificationMatrixItem>) => {
    const updated = matrix.map((item, i) => (i === index ? { ...item, ...updates } : item));
    onChange(updated);
  };

  const removeItem = (index: number) => {
    onChange(matrix.filter((_, i) => i !== index));
  };

  return (
    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-4 shadow-xs">
      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
        <div>
          <h4 className="text-xs font-semibold text-slate-900">
            Root Cause vs. Resolution Verification Matrix
          </h4>
          <p className="text-[11px] text-slate-500">
            Maps identified root causes directly to specific code fixes and verification status.
          </p>
        </div>
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white shadow-xs transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Matrix Row</span>
        </button>
      </div>

      <div className="space-y-3">
        {matrix.map((item, idx) => (
          <div
            key={idx}
            className="p-3 bg-white border border-slate-200 rounded-lg space-y-2.5 shadow-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-blue-600 font-mono">#{idx + 1}</span>
                <input
                  type="text"
                  value={item.fixLocation}
                  onChange={(e) => updateItem(idx, { fixLocation: e.target.value })}
                  placeholder="Fix Location (e.g. HpmFirmwareUpdateView.js:startApp)"
                  className="bg-slate-50 border border-slate-300 rounded px-2.5 py-1 text-xs font-mono text-emerald-700 focus:outline-none focus:border-blue-500 w-72"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={item.status}
                  onChange={(e) => updateItem(idx, { status: e.target.value as any })}
                  className="text-xs font-bold px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 focus:outline-none"
                >
                  <option value="PASSED">PASSED</option>
                  <option value="FAILED">FAILED</option>
                  <option value="PENDING">PENDING</option>
                </select>
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  className="text-slate-400 hover:text-rose-600 p-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-600">Root Cause Identified</label>
                <textarea
                  value={item.rootCause}
                  onChange={(e) => updateItem(idx, { rootCause: e.target.value })}
                  placeholder="Describe root cause (e.g. Missing preserve_config payload)..."
                  rows={2}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-900 focus:outline-none focus:border-blue-500 resize-y"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-600">Verification & How It Resolves</label>
                <textarea
                  value={item.resolution}
                  onChange={(e) => updateItem(idx, { resolution: e.target.value })}
                  placeholder="Describe resolution & verification evidence..."
                  rows={2}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-900 focus:outline-none focus:border-blue-500 resize-y"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
