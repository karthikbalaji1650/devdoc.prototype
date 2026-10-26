import React, { useState } from 'react';
import { 
  Sparkles, 
  Check, 
  X, 
  Copy, 
  RotateCw, 
  SlidersHorizontal, 
  Bot, 
  AlertCircle
} from 'lucide-react';
import { 
  rephraseText, 
  REPHRASE_TONES, 
  getStoredAiConfig,
  type RephraseTone 
} from '../../services/aiService';

interface AiRephraseModalProps {
  isOpen: boolean;
  initialText: string;
  onClose: () => void;
  onAccept: (rephrasedText: string) => void;
  onOpenSettings: () => void;
}

export const AiRephraseModal: React.FC<AiRephraseModalProps> = ({
  isOpen,
  initialText,
  onClose,
  onAccept,
  onOpenSettings
}) => {
  const [selectedTone, setSelectedTone] = useState<RephraseTone>('professional');
  const [customPrompt, setCustomPrompt] = useState('');
  const [rephrasedText, setRephrasedText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentConfig = getStoredAiConfig();

  const handleGenerate = async (toneToUse: RephraseTone = selectedTone) => {
    if (!initialText.trim()) return;
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const result = await rephraseText(initialText, toneToUse, customPrompt);
      setRephrasedText(result);
    } catch (err: any) {
      console.error('AI Rephrase error:', err);
      setErrorMsg(err.message || 'Failed to generate rephrased text.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToneSelect = (tone: RephraseTone) => {
    setSelectedTone(tone);
    handleGenerate(tone);
  };

  const handleCopy = () => {
    if (!rephrasedText) return;
    navigator.clipboard.writeText(rephrasedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-600 flex items-center justify-center shadow-xs">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>AI Technical Rephraser & Writing Assistant</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono font-semibold">
                  {currentConfig.provider === 'builtin' ? 'Smart Built-in' : currentConfig.provider.toUpperCase()}
                </span>
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenSettings}
              title="Configure AI Provider (Gemini / OpenAI / Ollama)"
              className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 px-2 py-1 rounded-lg hover:bg-slate-200 transition-colors"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>AI Settings</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Tone Presets Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5 text-blue-600" />
              <span>Select Rephrase Objective / Tone:</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {REPHRASE_TONES.map((tone) => (
                <button
                  key={tone.id}
                  type="button"
                  onClick={() => handleToneSelect(tone.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    selectedTone === tone.id
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs font-semibold'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <span>{tone.icon}</span>
                  <span>{tone.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Optional Custom Instruction */}
          <div className="space-y-1">
            <input
              type="text"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Optional: Add custom instruction (e.g. 'emphasize HTTP 500 error and flash buffer')..."
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500 placeholder:text-slate-400 shadow-xs"
            />
          </div>

          {/* Error Message if any */}
          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">AI Generation Failed</p>
                <p className="text-[11px] text-rose-700">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Comparison Panels: Original vs. Rephrased */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Original Text */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>Original Text:</span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {initialText.length} chars
                </span>
              </div>
              <div className="w-full h-48 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 overflow-y-auto font-sans leading-relaxed whitespace-pre-wrap select-text">
                {initialText || <span className="text-slate-400 italic">No text provided.</span>}
              </div>
            </div>

            {/* AI Rephrased Suggestion */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-blue-700">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>AI Suggested Version:</span>
                </div>
                {rephrasedText && (
                  <span className="text-[10px] text-slate-400 font-mono">
                    {rephrasedText.length} chars
                  </span>
                )}
              </div>

              <div className="w-full h-48 p-3 rounded-xl bg-white border border-blue-300 text-xs text-slate-900 overflow-y-auto font-sans leading-relaxed whitespace-pre-wrap relative select-text shadow-2xs">
                {isLoading ? (
                  <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-500">
                    <RotateCw className="w-5 h-5 animate-spin text-blue-600" />
                    <span className="text-xs">Polishing technical wording...</span>
                  </div>
                ) : rephrasedText ? (
                  rephrasedText
                ) : (
                  <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-400 text-center px-4">
                    <p>Click below to generate an improved version of your text.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 bg-slate-50 text-xs">
          <button
            type="button"
            onClick={() => handleGenerate()}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold transition-colors disabled:opacity-50 shadow-2xs"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{rephrasedText ? 'Regenerate' : 'Generate Rephrase'}</span>
          </button>

          <div className="flex items-center gap-2">
            {rephrasedText && (
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition-colors shadow-2xs"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={!rephrasedText || isLoading}
              onClick={() => {
                onAccept(rephrasedText);
                onClose();
              }}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50 transition-colors"
            >
              <Check className="w-4 h-4" />
              <span>Accept & Replace</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
