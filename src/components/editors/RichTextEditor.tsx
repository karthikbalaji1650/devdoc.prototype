import React, { useRef } from 'react';
import { Bold, Italic, Code, List, ListOrdered, Quote, Minus, Sparkles } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  onTriggerAi?: (text: string) => void;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder = 'Type section content in Markdown or plain text...',
  onTriggerAi
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertFormatting = (prefix: string, suffix: string = '') => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = el.value;
    const selected = text.substring(start, end);
    const replacement = `${prefix}${selected || 'text'}${suffix}`;

    const newText = text.substring(0, start) + replacement + text.substring(end);
    onChange(newText);

    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length + (selected.length || 4));
    }, 0);
  };

  const insertList = (numbered: boolean) => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    const start = el.selectionStart;
    const text = el.value;
    const prefix = numbered ? '1. ' : '- ';
    const newText = text.substring(0, start) + `\n${prefix}` + text.substring(start);
    onChange(newText);
  };

  const handleAiClick = () => {
    if (!textareaRef.current) {
      onTriggerAi?.(value);
      return;
    }
    const el = textareaRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = el.value.substring(start, end);
    // If text is highlighted, rephrase the selection, otherwise rephrase the entire field
    const textToRephrase = selected.trim() ? selected : value;
    onTriggerAi?.(textToRephrase);
  };

  return (
    <div className="border border-slate-300 rounded-xl overflow-hidden bg-white flex flex-col shadow-xs">
      {/* Markdown Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200 text-slate-700">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => insertFormatting('**', '**')}
            title="Bold (**text**)"
            className="p-1.5 rounded hover:bg-slate-200 hover:text-slate-900 transition-colors"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting('*', '*')}
            title="Italic (*text*)"
            className="p-1.5 rounded hover:bg-slate-200 hover:text-slate-900 transition-colors"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting('`', '`')}
            title="Inline Code (`code`)"
            className="p-1.5 rounded hover:bg-slate-200 hover:text-slate-900 transition-colors"
          >
            <Code className="w-3.5 h-3.5" />
          </button>
          <div className="h-4 w-[1px] bg-slate-200 mx-1" />
          <button
            type="button"
            onClick={() => insertList(false)}
            title="Bullet List (- item)"
            className="p-1.5 rounded hover:bg-slate-200 hover:text-slate-900 transition-colors"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertList(true)}
            title="Numbered List (1. item)"
            className="p-1.5 rounded hover:bg-slate-200 hover:text-slate-900 transition-colors"
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting('> ')}
            title="Quote (> quote)"
            className="p-1.5 rounded hover:bg-slate-200 hover:text-slate-900 transition-colors"
          >
            <Quote className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting('\n---\n')}
            title="Divider Line (---)"
            className="p-1.5 rounded hover:bg-slate-200 hover:text-slate-900 transition-colors"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* AI Rephrase Action Button */}
        <div className="flex items-center gap-2">
          {onTriggerAi && (
            <button
              type="button"
              onClick={handleAiClick}
              title="Rephrase, polish or summarize text with AI"
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-all shadow-xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              <span>AI Rephrase</span>
            </button>
          )}
        </div>
      </div>

      {/* Editor Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={8}
        className="w-full p-3 bg-transparent text-sm text-slate-900 placeholder-slate-400 focus:outline-none resize-y font-mono leading-relaxed"
      />
    </div>
  );
};
