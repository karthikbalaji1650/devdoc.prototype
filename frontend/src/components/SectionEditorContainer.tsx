import React from 'react';
import type { DocSection, SectionType } from '../types/document';
import { RichTextEditor } from './editors/RichTextEditor';
import { TableEditor } from './editors/TableEditor';
import { CodeDiffEditor } from './editors/CodeDiffEditor';
import { TestCasesEditor } from './editors/TestCasesEditor';
import { VerificationMatrixEditor } from './editors/VerificationMatrixEditor';
import { CalloutEditor } from './editors/CalloutEditor';
import { 
  FileText, 
  Table, 
  Code, 
  CheckSquare, 
  ShieldCheck, 
  AlertCircle, 
  Trash2, 
  Copy, 
  ChevronUp, 
  ChevronDown,
  Sparkles
} from 'lucide-react';

interface SectionEditorContainerProps {
  section: DocSection;
  onUpdate: (updates: Partial<DocSection>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onTriggerAi?: (text: string, onApply: (newText: string) => void) => void;
  isFirst: boolean;
  isLast: boolean;
}

export const SectionEditorContainer: React.FC<SectionEditorContainerProps> = ({
  section,
  onUpdate,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onTriggerAi,
  isFirst,
  isLast
}) => {
  const sectionTypes: { id: SectionType; label: string; icon: any }[] = [
    { id: 'richText', label: 'Rich Text / Markdown', icon: FileText },
    { id: 'table', label: 'Data Table', icon: Table },
    { id: 'codeDiff', label: 'Code & Diff', icon: Code },
    { id: 'testCases', label: 'Test Case Matrix', icon: CheckSquare },
    { id: 'verificationMatrix', label: 'RCA vs Resolution', icon: ShieldCheck },
    { id: 'callout', label: 'Callout Alert', icon: AlertCircle }
  ];

  return (
    <div className="bg-[#0f0f0f] border border-[#242424] overflow-hidden animate-fade-in space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#242424]">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <div className="flex items-center bg-[#111111] p-1 border border-[#242424]">
            <button
              type="button"
              onClick={() => onUpdate({ level: 1 })}
              className={`px-2 py-0.5 text-xs font-bold ${section.level === 1 ? 'bg-[#4ade80] text-[#0a0a0a]' : 'text-[#8a8a8a] hover:text-[#ededed]'}`}
            >
              H1
            </button>
            <button
              type="button"
              onClick={() => onUpdate({ level: 2 })}
              className={`px-2 py-0.5 text-xs font-bold ${section.level === 2 ? 'bg-[#4ade80] text-[#0a0a0a]' : 'text-[#8a8a8a] hover:text-[#ededed]'}`}
            >
              H2
            </button>
            <button
              type="button"
              onClick={() => onUpdate({ level: 3 })}
              className={`px-2 py-0.5 text-xs font-bold ${section.level === 3 ? 'bg-[#4ade80] text-[#0a0a0a]' : 'text-[#8a8a8a] hover:text-[#ededed]'}`}
            >
              H3
            </button>
          </div>

          <div className="flex-1 relative flex items-center">
            <input
              type="text"
              value={section.title}
              onChange={(e) => onUpdate({ title: e.target.value })}
              placeholder="Section Heading Title..."
              className="w-full bg-[#111111] border border-[#242424] px-3 py-1.5 text-sm font-semibold text-[#ededed] focus:outline-none focus:border-[#4ade80] pr-8"
            />
            {onTriggerAi && section.title && (
              <button
                type="button"
                onClick={() => onTriggerAi(section.title, (newTitle) => onUpdate({ title: newTitle }))}
                title="AI Polish Title"
                className="absolute right-2 text-[#a78bfa] hover:text-[#c8b5ff] p-0.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            title="Move Section Up"
            className="p-1.5 border border-[#242424] bg-[#111111] text-[#8a8a8a] disabled:opacity-40 hover:text-[#ededed] transition-colors"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast}
            title="Move Section Down"
            className="p-1.5 border border-[#242424] bg-[#111111] text-[#8a8a8a] disabled:opacity-40 hover:text-[#ededed] transition-colors"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onDuplicate}
            title="Duplicate Section"
            className="p-1.5 border border-[#242424] bg-[#111111] text-[#8a8a8a] hover:text-[#ededed] transition-colors"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Delete Section"
            className="p-1.5 border border-[#7d2d2d] bg-[#1a1111] text-[#f87171] hover:bg-[#201414] transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 bg-[#111111] p-1.5 border border-[#242424]">
        <span className="text-[11px] font-semibold text-[#8a8a8a] px-2 font-mono uppercase tracking-[0.12em]">Type:</span>
        {sectionTypes.map((st) => {
          const Icon = st.icon;
          const isActive = section.type === st.id;
          return (
            <button
              key={st.id}
              type="button"
              onClick={() => onUpdate({ type: st.id })}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium transition-all ${
                isActive
                  ? 'bg-[#4ade80] text-[#0a0a0a]'
                  : 'text-[#8a8a8a] hover:text-[#ededed] hover:bg-[#181818]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{st.label}</span>
            </button>
          );
        })}
      </div>

      {/* Render Specific Editor based on section type */}
      <div className="pt-2">
        {section.type === 'richText' && (
          <RichTextEditor
            value={section.content || ''}
            onChange={(content) => onUpdate({ content })}
            onTriggerAi={onTriggerAi ? (text) => onTriggerAi(text, (newText) => onUpdate({ content: newText })) : undefined}
          />
        )}

        {section.type === 'table' && (
          <TableEditor
            tableData={section.tableData}
            onChange={(tableData) => onUpdate({ tableData })}
          />
        )}

        {section.type === 'codeDiff' && (
          <CodeDiffEditor
            codeSnippet={section.codeSnippet}
            onChange={(codeSnippet) => onUpdate({ codeSnippet })}
          />
        )}

        {section.type === 'testCases' && (
          <TestCasesEditor
            testCases={section.testCases}
            onChange={(testCases) => onUpdate({ testCases })}
          />
        )}

        {section.type === 'verificationMatrix' && (
          <VerificationMatrixEditor
            matrix={section.verificationMatrix}
            onChange={(verificationMatrix) => onUpdate({ verificationMatrix })}
          />
        )}

        {section.type === 'callout' && (
          <CalloutEditor
            callout={section.callout}
            onChange={(callout) => onUpdate({ callout })}
          />
        )}
      </div>
    </div>
  );
};
