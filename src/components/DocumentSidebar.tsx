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
    <aside className="w-80 bg-white border-r border-slate-200 flex flex-col h-[calc(100vh-57px)] sticky top-[57px] shadow-xs select-none">
      {/* Sidebar Header */}
      <div className="p-3 border-b border-slate-200 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
            <ListTree className="w-4 h-4 text-blue-600" />
            <span>Document Outline</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono border border-slate-200">
            {sections.length} Sections
          </span>
        </div>

        {/* Search / Filter Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter sections..."
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Navigation Tree */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {/* Document Overview / Metadata Option */}
        <button
          type="button"
          onClick={() => onSelectSection('metadata')}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-left transition-all ${
            activeSectionId === 'metadata'
              ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-xs'
              : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Sliders className="w-4 h-4 text-blue-600" />
          <span className="flex-1">Document Header & Metadata</span>
        </button>

        <div className="pt-2 pb-1 px-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
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
              className={`w-full flex items-center gap-2 py-1.5 px-2.5 rounded-lg text-xs text-left transition-all ${indent} ${
                isActive
                  ? 'bg-blue-600 text-white font-semibold shadow-xs'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              } ${dropTargetId === sec.id ? 'border-t-2 border-blue-500' : ''} ${draggedSectionId === sec.id ? 'opacity-40' : ''}`}
            >
              <GripVertical className="w-3.5 h-3.5 flex-shrink-0 text-slate-400 cursor-grab" />
              <span className={`text-[10px] font-mono opacity-80 ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                {sec.level === 1 ? 'H1' : sec.level === 2 ? 'H2' : 'H3'}
              </span>
              <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-white' : 'text-blue-600'}`} />
              <span className="flex-1 truncate">
                {sec.title || `Untitled Section ${idx + 1}`}
              </span>
              {isActive && <ChevronRight className="w-3.5 h-3.5 text-blue-100 flex-shrink-0" />}
            </button>
          );
        })}
      </div>

      {/* Bottom Add Section Button */}
      <div className="p-3 border-t border-slate-200 relative">
        <button
          type="button"
          onClick={() => setAddMenuOpen(!addMenuOpen)}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold transition-all shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Insert New Section</span>
        </button>

        {addMenuOpen && (
          <>
            <div 
              className="fixed inset-0 z-30" 
              onClick={() => setAddMenuOpen(false)} 
            />
            <div className="absolute bottom-16 left-3 right-3 rounded-xl glass-dropdown z-40 p-2 animate-fade-in space-y-1">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2 py-1">
                Choose Section Type
              </div>
              <button
                type="button"
                onClick={() => {
                  onAddSection(1, 'richText', 'New Major Section');
                  setAddMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-lg text-left font-medium"
              >
                <Hash className="w-3.5 h-3.5 text-blue-600" />
                <span>Heading 1 (Major Section)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onAddSection(2, 'richText', 'New Subsection');
                  setAddMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-lg text-left font-medium"
              >
                <Hash className="w-3.5 h-3.5 text-indigo-600" />
                <span>Heading 2 (Subsection)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onAddSection(1, 'table', 'Data & Environment Table');
                  setAddMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-lg text-left font-medium"
              >
                <Table className="w-3.5 h-3.5 text-emerald-600" />
                <span>Data Table</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onAddSection(2, 'codeDiff', 'Code Changes');
                  setAddMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-lg text-left font-medium"
              >
                <Code className="w-3.5 h-3.5 text-purple-600" />
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
