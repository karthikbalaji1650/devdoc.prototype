import React, { useState, useRef } from 'react';
import type { TestCaseItem } from '../../types/document';
import { 
  Plus, 
  Trash2, 
  Table, 
  LayoutList, 
  FileSpreadsheet, 
  Upload, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Clock, 
  Filter 
  ,ImagePlus
  ,X
} from 'lucide-react';
import { exportTestCasesToExcel, importTestCasesFromExcel } from '../../exporters/excelExporter';

interface TestCasesEditorProps {
  testCases?: TestCaseItem[];
  onChange: (testCases: TestCaseItem[]) => void;
}

export const TestCasesEditor: React.FC<TestCasesEditorProps> = ({
  testCases = [],
  onChange
}) => {
  const [viewMode, setViewMode] = useState<'spreadsheet' | 'cards'>('spreadsheet');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addTestCase = () => {
    const newId = `TC-${String(testCases.length + 1).padStart(2, '0')}`;
    const newTC: TestCaseItem = {
      id: newId,
      title: 'New Verification Test Case',
      objective: 'Verify expected operation under test conditions.',
      steps: ['Step 1: Navigate to component', 'Step 2: Trigger action'],
      expectedResult: 'Operation completes successfully.',
      status: 'PENDING',
      actualResult: '',
      notes: ''
    };
    onChange([...testCases, newTC]);
  };

  const updateTestCase = (index: number, updates: Partial<TestCaseItem>) => {
    const updated = testCases.map((tc, i) => (i === index ? { ...tc, ...updates } : tc));
    onChange(updated);
  };

  const removeTestCase = (index: number) => {
    onChange(testCases.filter((_, i) => i !== index));
  };

  const updateStep = (tcIndex: number, stepIndex: number, text: string) => {
    const tc = testCases[tcIndex];
    const newSteps = [...tc.steps];
    newSteps[stepIndex] = text;
    updateTestCase(tcIndex, { steps: newSteps });
  };

  const addStep = (tcIndex: number) => {
    const tc = testCases[tcIndex];
    const newSteps = [...tc.steps, `Step ${tc.steps.length + 1}: `];
    updateTestCase(tcIndex, { steps: newSteps });
  };

  const removeStep = (tcIndex: number, stepIndex: number) => {
    const tc = testCases[tcIndex];
    const newSteps = tc.steps.filter((_, i) => i !== stepIndex);
    updateTestCase(tcIndex, { steps: newSteps });
  };

  const handleEvidenceImage = (tcIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file such as JPG, PNG, GIF, or WebP.');
      e.target.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('Evidence images must be smaller than 10 MB.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateTestCase(tcIndex, {
          evidenceImage: reader.result,
          evidenceImageName: file.name
        });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const importedTCs = await importTestCasesFromExcel(file);
        if (importedTCs.length > 0) {
          onChange([...testCases, ...importedTCs]);
          alert(`Successfully imported ${importedTCs.length} test cases from Excel!`);
        } else {
          alert('No test cases found in spreadsheet.');
        }
      } catch (err) {
        console.error('Error importing Excel:', err);
        alert('Could not parse Excel/CSV file. Please check format.');
      }
    }
    if (e.target) e.target.value = '';
  };

  // Metrics
  const passedCount = testCases.filter(t => t.status === 'PASSED').length;
  const failedCount = testCases.filter(t => t.status === 'FAILED').length;
  const blockedCount = testCases.filter(t => t.status === 'BLOCKED').length;
  const pendingCount = testCases.filter(t => t.status === 'PENDING').length;

  const filteredList = testCases.filter(tc => {
    if (filterStatus === 'ALL') return true;
    return tc.status === filterStatus;
  });

  return (
    <div className="space-y-4">
      {/* Hidden File Input for Excel Import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleExcelImport}
        accept=".xlsx,.xls,.csv"
        className="hidden"
      />

      {/* Top Header: Controls, View Switcher & Excel Actions */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        {/* Left: Summary Metrics */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="font-bold text-slate-900">
            Total Tests ({testCases.length})
          </span>
          <div className="flex items-center gap-1.5 ml-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-[11px]">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              {passedCount} Passed
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-semibold text-[11px]">
              <XCircle className="w-3 h-3 text-rose-600" />
              {failedCount} Failed
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 font-semibold text-[11px]">
              <AlertCircle className="w-3 h-3 text-purple-600" />
              {blockedCount} Blocked
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold text-[11px]">
              <Clock className="w-3 h-3 text-amber-600" />
              {pendingCount} Pending
            </span>
          </div>
        </div>

        {/* Right: Actions (Import/Export Excel, Mode Switcher, Add TC) */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Excel Import / Export Buttons */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Import test cases from Excel spreadsheet (.xlsx, .xls, .csv)"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors shadow-xs"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-600" />
            <span>Import Excel</span>
          </button>

          <button
            type="button"
            onClick={() => exportTestCasesToExcel(testCases)}
            title="Export test cases to formatted Excel workbook (.xlsx)"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors shadow-xs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
            <span>Export Excel</span>
          </button>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-white p-0.5 rounded-lg border border-slate-200 text-xs shadow-xs">
            <button
              type="button"
              onClick={() => setViewMode('spreadsheet')}
              title="Excel Spreadsheet Grid View"
              className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
                viewMode === 'spreadsheet'
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Spreadsheet</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              title="Step-by-Step Card View"
              className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
                viewMode === 'cards'
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cards</span>
            </button>
          </div>

          {/* Add Test Case Button */}
          <button
            type="button"
            onClick={addTestCase}
            className="flex items-center gap-1 px-3 py-1 text-xs font-semibold btn-primary rounded-lg shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Test Case</span>
          </button>
        </div>
      </div>

      {/* Filter Row */}
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <Filter className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-[11px] font-semibold">Filter Status:</span>
        {['ALL', 'PASSED', 'FAILED', 'BLOCKED', 'PENDING'].map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setFilterStatus(st)}
            className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
              filterStatus === st
                ? 'bg-blue-600 text-white border-blue-600 font-bold'
                : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 shadow-xs'
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      {/* View 1: Spreadsheet Grid View (Excel-like) */}
      {viewMode === 'spreadsheet' && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <th className="p-2.5 text-left w-20">Test ID</th>
                <th className="p-2.5 text-left w-56">Test Title / Summary</th>
                <th className="p-2.5 text-left w-28">Status</th>
                <th className="p-2.5 text-left min-w-[200px]">Objective</th>
                <th className="p-2.5 text-left min-w-[220px]">Steps</th>
                <th className="p-2.5 text-left min-w-[200px]">Expected Result</th>
                <th className="p-2.5 text-left min-w-[180px]">Actual Result</th>
                <th className="p-2.5 text-left min-w-[150px]">Proof</th>
                <th className="p-2.5 text-center w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredList.map((tc, idx) => {
                const originalIndex = testCases.findIndex(t => t.id === tc.id && t.title === tc.title);
                return (
                  <tr key={idx} className="hover:bg-[var(--panel-alt)] transition-colors">
                    {/* ID */}
                    <td className="p-2 align-top">
                      <input
                        type="text"
                        value={tc.id}
                        onChange={(e) => updateTestCase(originalIndex, { id: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs font-mono font-bold text-blue-600 focus:outline-none focus:border-blue-500"
                      />
                    </td>

                    {/* Title */}
                    <td className="p-2 align-top">
                      <textarea
                        value={tc.title}
                        onChange={(e) => updateTestCase(originalIndex, { title: e.target.value })}
                        rows={2}
                        placeholder="Test Title..."
                        className="w-full bg-slate-50 border border-slate-300 rounded p-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500 resize-y"
                      />
                    </td>

                    {/* Status */}
                    <td className="p-2 align-top">
                      <select
                        value={tc.status}
                        onChange={(e) => updateTestCase(originalIndex, { status: e.target.value as any })}
                        className={`w-full text-xs font-bold px-2 py-1.5 rounded border focus:outline-none ${
                          tc.status === 'PASSED'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : tc.status === 'FAILED'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : tc.status === 'BLOCKED'
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        <option value="PASSED">PASSED</option>
                        <option value="FAILED">FAILED</option>
                        <option value="BLOCKED">BLOCKED</option>
                        <option value="PENDING">PENDING</option>
                      </select>
                    </td>

                    {/* Objective */}
                    <td className="p-2 align-top">
                      <textarea
                        value={tc.objective}
                        onChange={(e) => updateTestCase(originalIndex, { objective: e.target.value })}
                        rows={2}
                        placeholder="Objective..."
                        className="w-full bg-slate-50 border border-slate-300 rounded p-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 resize-y"
                      />
                    </td>

                    {/* Steps */}
                    <td className="p-2 align-top">
                      <textarea
                        value={Array.isArray(tc.steps) ? tc.steps.join('\n') : tc.steps}
                        onChange={(e) => updateTestCase(originalIndex, { 
                          steps: e.target.value.split('\n').filter(s => s.trim().length > 0)
                        })}
                        rows={2}
                        placeholder="Steps (1 per line)..."
                        className="w-full bg-slate-50 border border-slate-300 rounded p-1.5 text-xs font-mono text-slate-800 focus:outline-none focus:border-blue-500 resize-y"
                      />
                    </td>

                    {/* Expected Result */}
                    <td className="p-2 align-top">
                      <textarea
                        value={tc.expectedResult}
                        onChange={(e) => updateTestCase(originalIndex, { expectedResult: e.target.value })}
                        rows={2}
                        placeholder="Expected Result..."
                        className="w-full bg-slate-50 border border-slate-300 rounded p-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 resize-y"
                      />
                    </td>

                    {/* Actual Result */}
                    <td className="p-2 align-top">
                      <textarea
                        value={tc.actualResult || ''}
                        onChange={(e) => updateTestCase(originalIndex, { actualResult: e.target.value })}
                        rows={2}
                        placeholder="Actual Result..."
                        className="w-full bg-slate-50 border border-slate-300 rounded p-1.5 text-xs text-emerald-700 focus:outline-none focus:border-blue-500 resize-y"
                      />
                    </td>

                    {/* Evidence Image */}
                    <td className="p-2 align-top">
                      <div className="space-y-1.5">
                        {tc.evidenceImage && (
                          <img
                            src={tc.evidenceImage}
                            alt={tc.evidenceImageName || 'Test execution evidence'}
                            className="h-16 w-full rounded border border-slate-200 object-contain bg-white"
                          />
                        )}
                        <label className="flex items-center justify-center gap-1 px-2 py-1.5 rounded border border-blue-200 bg-blue-50 text-[10px] font-semibold text-blue-700 hover:bg-blue-100 cursor-pointer">
                          <ImagePlus className="w-3 h-3" />
                          <span>{tc.evidenceImage ? 'Replace' : 'Upload Image'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleEvidenceImage(originalIndex, e)}
                            className="hidden"
                          />
                        </label>
                        {tc.evidenceImage && (
                          <button
                            type="button"
                            onClick={() => updateTestCase(originalIndex, { evidenceImage: undefined, evidenceImageName: undefined })}
                            className="w-full text-[10px] text-slate-500 hover:text-rose-600"
                          >
                            Remove proof
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Delete */}
                    <td className="p-2 align-top text-center">
                      <button
                        type="button"
                        onClick={() => removeTestCase(originalIndex)}
                        title="Delete Test Case"
                        className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* View 2: Step-by-Step Card Mode */}
      {viewMode === 'cards' && (
        <div className="space-y-3">
          {filteredList.map((tc, tcIdx) => {
            const originalIndex = testCases.findIndex(t => t.id === tc.id && t.title === tc.title);
            return (
              <div
                key={tcIdx}
                className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs"
              >
                {/* Header: ID, Title, Status, Delete */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
                  <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                    <input
                      type="text"
                      value={tc.id}
                      onChange={(e) => updateTestCase(originalIndex, { id: e.target.value })}
                      placeholder="TC-01"
                      className="w-20 bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs font-bold text-blue-600 focus:outline-none focus:border-blue-500"
                    />
                    <input
                      type="text"
                      value={tc.title}
                      onChange={(e) => updateTestCase(originalIndex, { title: e.target.value })}
                      placeholder="Test Case Title..."
                      className="flex-1 bg-slate-50 border border-slate-300 rounded px-2.5 py-1 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={tc.status}
                      onChange={(e) => updateTestCase(originalIndex, { status: e.target.value as any })}
                      className={`text-xs font-bold px-2 py-1 rounded border focus:outline-none ${
                        tc.status === 'PASSED'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : tc.status === 'FAILED'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : tc.status === 'BLOCKED'
                          ? 'bg-purple-50 text-purple-700 border-purple-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      <option value="PASSED">PASSED</option>
                      <option value="FAILED">FAILED</option>
                      <option value="BLOCKED">BLOCKED</option>
                      <option value="PENDING">PENDING</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => removeTestCase(originalIndex)}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-slate-100 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Objective */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600">Objective</label>
                  <input
                    type="text"
                    value={tc.objective}
                    onChange={(e) => updateTestCase(originalIndex, { objective: e.target.value })}
                    placeholder="What is being validated?"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Steps */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                    <span>Execution Steps</span>
                    <button
                      type="button"
                      onClick={() => addStep(originalIndex)}
                      className="text-blue-600 hover:text-blue-700 text-[10px] font-semibold"
                    >
                      + Add Step
                    </button>
                  </div>
                  <div className="space-y-1">
                    {tc.steps.map((step, sIdx) => (
                      <div key={sIdx} className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-400 font-mono w-4 text-right">
                          {sIdx + 1}.
                        </span>
                        <input
                          type="text"
                          value={step}
                          onChange={(e) => updateStep(originalIndex, sIdx, e.target.value)}
                          placeholder="Step instruction..."
                          className="flex-1 bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                        />
                        {tc.steps.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeStep(originalIndex, sIdx)}
                            className="text-slate-400 hover:text-rose-600 p-1"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Expected & Actual Results */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-600">Expected Result</label>
                    <textarea
                      value={tc.expectedResult}
                      onChange={(e) => updateTestCase(originalIndex, { expectedResult: e.target.value })}
                      placeholder="Expected behavior..."
                      rows={2}
                      className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-blue-500 resize-y"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-600">Actual Result / Notes</label>
                    <textarea
                      value={tc.actualResult || ''}
                      onChange={(e) => updateTestCase(originalIndex, { actualResult: e.target.value })}
                      placeholder="Actual outcome observed during test execution..."
                      rows={2}
                      className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-blue-500 resize-y"
                    />
                  </div>
                </div>

                {/* Evidence image */}
                <div className="border border-dashed border-blue-200 rounded-lg bg-[var(--panel-alt)] p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700">Proof of Execution</label>
                      <p className="text-[10px] text-slate-500">Upload a screenshot or image showing the result.</p>
                    </div>
                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-blue-200 text-[11px] font-semibold text-blue-700 hover:bg-blue-50 cursor-pointer transition-colors">
                      <ImagePlus className="w-3.5 h-3.5" />
                      <span>{tc.evidenceImage ? 'Replace Image' : 'Upload Image'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleEvidenceImage(originalIndex, e)}
                        className="hidden"
                      />
                    </label>
                  </div>
                  {tc.evidenceImage ? (
                    <div className="relative w-fit max-w-full">
                      <img
                        src={tc.evidenceImage}
                        alt={tc.evidenceImageName || 'Test execution evidence'}
                        className="max-h-44 max-w-full rounded-md border border-slate-200 object-contain bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => updateTestCase(originalIndex, { evidenceImage: undefined, evidenceImageName: undefined })}
                        title="Remove evidence image"
                        className="absolute -right-2 -top-2 rounded-full bg-white border border-slate-200 p-1 text-slate-500 hover:text-rose-600 shadow-xs"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      <p className="mt-1 text-[10px] text-slate-500 truncate max-w-64">{tc.evidenceImageName}</p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-16 rounded-md bg-white/70 text-[11px] text-slate-400">
                      No evidence image uploaded
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
