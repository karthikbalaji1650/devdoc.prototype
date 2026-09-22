import React, { useState } from 'react';
import type { DocSection, SectionType } from '../types/document';
import { 
  FileText, 
  Table, 
  Code, 
  CheckSquare, 
  ShieldCheck, 
  AlertCircle, 
  Plus, 
  Sliders, 
  Search, 
  Hash, 
  ChevronRight, 
  ListTree,
  GripVertical
} from 'lucide-react';

interface DocumentSidebarProps {
  sections: DocSection[];
  activeSectionId: string | 'metadata';
  onSelectSection: (id: string | 'metadata') => void;
  onAddSection: (level: 1 | 2 | 3, type: SectionType, title?: string) => void;
  onReorderSections: (draggedId: string, targetId: string) => void;
}

export const DocumentSidebar: React.FC<DocumentSidebarProps> = ({
  sections,
  activeSectionId,
  onSelectSection,
  onAddSection,
  onReorderSections
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const filteredSections = sections.filter(s => 
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getSectionIcon = (type: SectionType) => {
    switch (type) {
      case 'table': return Table;
      case 'codeDiff': return Code;
      case 'testCases': return CheckSquare;
      case 'verificationMatrix': return ShieldCheck;
      case 'callout': return AlertCircle;
      default: return FileText;
    }
  };

  return (
    <aside className="w-80 bg-[#0f0f0f] border-r border-[#242424] flex flex-col h-[calc(100vh-57px)] sticky top-[57px] select-none">
      <div className="p-3 border-b border-[#242424] space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] font-bold text-[#ededed] uppercase tracking-[0.12em] font-mono">
            <ListTree className="w-4 h-4 text-[#4ade80]" />
            <span>Document Outline</span>
          </div>
          <span className="text-[9px] px-2 py-0.5 border border-[#242424] bg-[#111111] text-[#8a8a8a] font-mono uppercase tracking-[0.1em]">
            {sections.length} Sections
          </span>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[#8a8a8a] absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter sections..."
            className="w-full bg-[#111111] border border-[#242424] pl-8 pr-2 py-1.5 text-xs text-[#ededed] placeholder-[#4a4a4a] focus:outline-none focus:border-[#4ade80]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <button
          type="button"
          onClick={() => onSelectSection('metadata')}
          className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-left transition-all border ${
            activeSectionId === 'metadata'
              ? 'bg-[#131313] text-[#ededed] border-l-2 border-l-[#4ade80] border-[#242424]'
              : 'text-[#8a8a8a] hover:bg-[#131313] hover:text-[#ededed] border-transparent'
          }`}
        >
          <Sliders className="w-4 h-4 text-[#4ade80]" />
          <span className="flex-1">Document Header & Metadata</span>
        </button>

        <div className="pt-2 pb-1 px-2 text-[10px] font-bold text-[#8a8a8a] uppercase tracking-[0.12em] font-mono">
          Sections & Headings
        </div>

        {/* Section List */}
        {filteredSections.map((sec, idx) => {
          const Icon = getSectionIcon(sec.type);
          const isActive = activeSectionId === sec.id;
          const indent = sec.level === 1 ? 'pl-2' : sec.level === 2 ? 'pl-5' : 'pl-8';

          return (
            <button
              key={sec.id}
              type="button"
              draggable
              onDragStart={(event) => {
                setDraggedSectionId(sec.id);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', sec.id);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                if (draggedSectionId !== sec.id) setDropTargetId(sec.id);
              }}
              onDragLeave={() => setDropTargetId(null)}
              onDrop={(event) => {
                event.preventDefault();
                const draggedId = event.dataTransfer.getData('text/plain') || draggedSectionId;
                if (draggedId && draggedId !== sec.id) onReorderSections(draggedId, sec.id);
                setDraggedSectionId(null);
                setDropTargetId(null);
              }}
              onDragEnd={() => {
                setDraggedSectionId(null);
                setDropTargetId(null);
              }}
              onClick={() => onSelectSection(sec.id)}
              className={`w-full flex items-center gap-2 py-1.5 px-2.5 text-xs text-left transition-all border ${indent} ${
                isActive
                  ? 'bg-[#131313] text-[#ededed] border-l-2 border-l-[#4ade80] border-[#242424]'
                  : 'text-[#8a8a8a] hover:bg-[#131313] hover:text-[#ededed] border-transparent'
              } ${dropTargetId === sec.id ? 'border-t-2 border-[#4ade80]' : ''} ${draggedSectionId === sec.id ? 'opacity-40' : ''}`}
            >
              <GripVertical className="w-3.5 h-3.5 flex-shrink-0 text-[#8a8a8a] cursor-grab" />
              <span className={`text-[10px] font-mono opacity-80 ${isActive ? 'text-[#ededed]' : 'text-[#8a8a8a]'}`}>
                {sec.level === 1 ? 'H1' : sec.level === 2 ? 'H2' : 'H3'}
              </span>
              <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-[#4ade80]' : 'text-[#8a8a8a]'}`} />
              <span className="flex-1 truncate">{sec.title || `Untitled Section ${idx + 1}`}</span>
              {isActive && <ChevronRight className="w-3.5 h-3.5 text-[#4ade80] flex-shrink-0" />}
            </button>
          );
        })}
      </div>

      <div className="p-3 border-t border-[#242424] relative">
        <button
          type="button"
          onClick={() => setAddMenuOpen(!addMenuOpen)}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 border border-[#242424] bg-[#111111] text-[#ededed] text-xs font-semibold transition-all font-mono uppercase tracking-[0.12em]"
        >
          <Plus className="w-4 h-4 text-[#4ade80]" />
          <span>Insert New Section</span>
        </button>

        {addMenuOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setAddMenuOpen(false)} />
            <div className="absolute bottom-16 left-3 right-3 bg-[#111111] border border-[#242424] z-40 p-2 animate-fade-in space-y-1">
              <div className="text-[10px] font-bold text-[#8a8a8a] uppercase tracking-[0.12em] font-mono px-2 py-1">
                Choose Section Type
              </div>
              <button
                type="button"
                onClick={() => {
                  onAddSection(1, 'richText', 'New Major Section');
                  setAddMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-[#ededed] hover:bg-[#131313] text-left font-medium"
              >
                <Hash className="w-3.5 h-3.5 text-[#4ade80]" />
                <span>Heading 1 (Major Section)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onAddSection(2, 'richText', 'New Subsection');
                  setAddMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-[#ededed] hover:bg-[#131313] text-left font-medium"
              >
                <Hash className="w-3.5 h-3.5 text-[#a78bfa]" />
                <span>Heading 2 (Subsection)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onAddSection(1, 'table', 'Data & Environment Table');
                  setAddMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-[#ededed] hover:bg-[#131313] text-left font-medium"
              >
                <Table className="w-3.5 h-3.5 text-[#4ade80]" />
                <span>Data Table</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onAddSection(2, 'codeDiff', 'Code Changes');
                  setAddMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-[#ededed] hover:bg-[#131313] text-left font-medium"
              >
                <Code className="w-3.5 h-3.5 text-[#a78bfa]" />
                <span>Code Block & Diff</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onAddSection(1, 'testCases', 'Validation & Test Cases');
                  setAddMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-lg text-left font-medium"
              >
                <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                <span>Test Case Matrix</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onAddSection(1, 'verificationMatrix', 'RCA vs Resolution Matrix');
                  setAddMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-lg text-left font-medium"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                <span>RCA vs Resolution Matrix</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onAddSection(2, 'callout', 'Key Observation');
                  setAddMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-lg text-left font-medium"
              >
                <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                <span>Callout Alert Box</span>
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
};
