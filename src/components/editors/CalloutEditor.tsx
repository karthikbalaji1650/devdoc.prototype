import React from 'react';
import type { CalloutData } from '../../types/document';
import { AlertCircle, AlertTriangle, CheckCircle, Info } from 'lucide-react';

interface CalloutEditorProps {
  callout?: CalloutData;
  onChange: (callout: CalloutData) => void;
}

export const CalloutEditor: React.FC<CalloutEditorProps> = ({
  callout = { type: 'info', title: 'Note', text: '' },
  onChange
}) => {
  return (
    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-4 shadow-xs">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-slate-200">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700">Callout Style</label>
          <div className="grid grid-cols-4 gap-2">
            {[
              { id: 'info', label: 'Info', icon: Info, color: 'text-blue-700 border-blue-200 bg-blue-50 font-semibold' },
              { id: 'warning', label: 'Warning', icon: AlertTriangle, color: 'text-amber-700 border-amber-200 bg-amber-50 font-semibold' },
              { id: 'success', label: 'Success', icon: CheckCircle, color: 'text-emerald-700 border-emerald-200 bg-emerald-50 font-semibold' },
              { id: 'tip', label: 'Tip', icon: AlertCircle, color: 'text-purple-700 border-purple-200 bg-purple-50 font-semibold' },
            ].map((t) => {
              const Icon = t.icon;
              const isSelected = callout.type === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onChange({ ...callout, type: t.id as any })}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium border transition-all min-w-0 ${
                    isSelected ? t.color : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 shadow-xs'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700">Callout Title (Optional)</label>
          <input
            type="text"
            value={callout.title || ''}
            onChange={(e) => onChange({ ...callout, title: e.target.value })}
            placeholder="e.g. 100% Reproducibility or Release Gate Approved"
            className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-slate-700">Message / Content</label>
        <textarea
          value={callout.text}
          onChange={(e) => onChange({ ...callout, text: e.target.value })}
          placeholder="Callout text description..."
          rows={3}
          className="w-full p-3 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-blue-500 resize-y shadow-xs"
        />
      </div>
    </div>
  );
};
