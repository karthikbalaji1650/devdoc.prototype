import React from 'react';
import type { TableData } from '../../types/document';
import { Trash2, Columns, Rows, Sparkles } from 'lucide-react';

interface TableEditorProps {
  tableData?: TableData;
  onChange: (tableData: TableData) => void;
}

export const TableEditor: React.FC<TableEditorProps> = ({
  tableData = { headers: ['Column 1', 'Column 2'], rows: [['', '']] },
  onChange
}) => {
  const { headers, rows } = tableData;

  const updateHeader = (index: number, val: string) => {
    const newHeaders = [...headers];
    newHeaders[index] = val;
    onChange({ headers: newHeaders, rows });
  };

  const updateCell = (rowIdx: number, colIdx: number, val: string) => {
    const newRows = rows.map((r, ri) => 
      ri === rowIdx ? r.map((c, ci) => ci === colIdx ? val : c) : [...r]
    );
    onChange({ headers, rows: newRows });
  };

  const addColumn = () => {
    const newHeaders = [...headers, `Column ${headers.length + 1}`];
    const newRows = rows.map(r => [...r, '']);
    onChange({ headers: newHeaders, rows: newRows });
  };

  const removeColumn = (colIdx: number) => {
    if (headers.length <= 1) return;
    const newHeaders = headers.filter((_, i) => i !== colIdx);
    const newRows = rows.map(r => r.filter((_, i) => i !== colIdx));
    onChange({ headers: newHeaders, rows: newRows });
  };

  const addRow = () => {
    const newRow = Array.from({ length: headers.length }, () => '');
    onChange({ headers, rows: [...rows, newRow] });
  };

  const removeRow = (rowIdx: number) => {
    if (rows.length <= 1) {
      onChange({ headers, rows: [Array.from({ length: headers.length }, () => '')] });
      return;
    }
    const newRows = rows.filter((_, i) => i !== rowIdx);
    onChange({ headers, rows: newRows });
  };

  const applyPreset = (preset: 'env' | 'comparison' | 'matrix' | 'defect') => {
    if (preset === 'env') {
      onChange({
        headers: ['Parameter', 'Description / Value'],
        rows: [
          ['Product / Model', 'iXsystem BMC Platform'],
          ['Target Firmware', 'Revision 13.03.01'],
          ['Impacted Packages', 'packages/spx_restservice-src, packages/webui_html5-src'],
          ['Test Environment', 'PVT3 Lab Node 172.17.45.150']
        ]
      });
    } else if (preset === 'comparison') {
      onChange({
        headers: ['Metric / Behavior', 'Old Implementation', 'Proposed Implementation'],
        rows: [
          ['Request Payload', 'Empty JSON object ({})', 'JSON with preserve_config flag'],
          ['Type Handling', 'Unparsed string passed to backend', 'Explicit parseInt(val, 10) casting'],
          ['Status', 'Hangs on first packet (HTTP 500)', 'Succeeds 100% full flash upload']
        ]
      });
    } else if (preset === 'defect') {
      onChange({
        headers: ['Defect ID', 'Severity', 'Summary', 'Status', 'Resolution'],
        rows: [
          ['DEF-101', 'Critical', 'Firmware flash hang on packet 1', 'FIXED', 'Added preserve_config payload flag'],
          ['DEF-102', 'Minor', 'UI progress bar flicker', 'DEFERRED', 'Scheduled for next release sprint']
        ]
      });
    }
  };

  return (
    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-4 shadow-xs">
      {/* Table Actions Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-white hover:bg-slate-100 text-xs text-slate-700 border border-slate-300 transition-colors shadow-xs"
          >
            <Rows className="w-3.5 h-3.5 text-blue-600" />
            <span>Add Row</span>
          </button>
          <button
            type="button"
            onClick={addColumn}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-white hover:bg-slate-100 text-xs text-slate-700 border border-slate-300 transition-colors shadow-xs"
          >
            <Columns className="w-3.5 h-3.5 text-emerald-600" />
            <span>Add Column</span>
          </button>
        </div>

        {/* Table Presets */}
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Sparkles className="w-3 h-3 text-amber-500" />
          <span className="text-[11px]">Presets:</span>
          <button
            type="button"
            onClick={() => applyPreset('env')}
            className="text-[11px] px-2 py-0.5 rounded bg-white hover:bg-slate-100 text-blue-700 border border-slate-200 font-medium shadow-xs"
          >
            Environment
          </button>
          <button
            type="button"
            onClick={() => applyPreset('comparison')}
            className="text-[11px] px-2 py-0.5 rounded bg-white hover:bg-slate-100 text-emerald-700 border border-slate-200 font-medium shadow-xs"
          >
            Comparison
          </button>
          <button
            type="button"
            onClick={() => applyPreset('defect')}
            className="text-[11px] px-2 py-0.5 rounded bg-white hover:bg-slate-100 text-purple-700 border border-slate-200 font-medium shadow-xs"
          >
            Defects
          </button>
        </div>
      </div>

      {/* Interactive Table Grid */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-200">
              <th className="w-8 p-2 text-center text-slate-400 font-mono text-[10px]">#</th>
              {headers.map((h, colIdx) => (
                <th key={colIdx} className="p-2 text-left border-l border-slate-200">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={h}
                      onChange={(e) => updateHeader(colIdx, e.target.value)}
                      placeholder="Header..."
                      className="bg-transparent font-semibold text-slate-900 focus:outline-none focus:text-blue-600 w-full"
                    />
                    {headers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeColumn(colIdx)}
                        title="Delete Column"
                        className="text-slate-400 hover:text-rose-600 p-0.5 rounded"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </th>
              ))}
              <th className="w-8 p-2 text-center text-slate-400"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-[var(--panel-alt)]">
                <td className="p-2 text-center text-slate-400 font-mono text-[10px] bg-slate-50">
                  {rowIdx + 1}
                </td>
                {row.map((cell, colIdx) => (
                  <td key={colIdx} className="p-2 border-l border-slate-200">
                    <textarea
                      value={cell}
                      onChange={(e) => updateCell(rowIdx, colIdx, e.target.value)}
                      rows={1}
                      placeholder="Cell value..."
                      className="w-full bg-transparent text-slate-900 placeholder-slate-400 focus:outline-none resize-y text-xs font-mono"
                    />
                  </td>
                ))}
                <td className="p-2 text-center">
                  <button
                    type="button"
                    onClick={() => removeRow(rowIdx)}
                    title="Delete Row"
                    className="text-slate-400 hover:text-rose-600 p-0.5 rounded"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
