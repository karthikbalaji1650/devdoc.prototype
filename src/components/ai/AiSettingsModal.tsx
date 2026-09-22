import React, { useState } from 'react';
import { 
  SlidersHorizontal, 
  X, 
  Check, 
  Key, 
  Cpu, 
  Globe, 
  ShieldCheck 
} from 'lucide-react';
import { 
  getStoredAiConfig, 
  saveStoredAiConfig, 
  type AiConfig, 
  type AiProvider 
} from '../../services/aiService';

interface AiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AiSettingsModal: React.FC<AiSettingsModalProps> = ({ isOpen, onClose }) => {
  const [config, setConfig] = useState<AiConfig>(getStoredAiConfig());
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    saveStoredAiConfig(config);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">AI Writing Assistant Settings</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Provider Selection */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-800">Choose AI Provider</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'builtin', name: 'Smart Built-in (Offline)', desc: 'Zero setup, works immediately' },
                { id: 'gemini', name: 'Google Gemini', desc: 'Gemini 1.5 Flash / Pro API' },
                { id: 'openai', name: 'OpenAI', desc: 'GPT-4o / GPT-4o-mini' },
                { id: 'ollama', name: 'Local Ollama', desc: 'Private local models' }
              ].map((prov) => (
                <button
                  key={prov.id}
                  type="button"
                  onClick={() => setConfig(prev => ({ ...prev, provider: prov.id as AiProvider }))}
                  className={`relative p-2.5 rounded-xl border text-left transition-all ${
                    config.provider === prov.id
                      ? 'bg-[var(--panel-alt)] border-[var(--success)] shadow-[0_0_0_1px_var(--success)]'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900'
                  }`}
                >
                  {config.provider === prov.id && (
                    <Check className="w-3.5 h-3.5 text-[var(--success)] absolute top-2 right-2" />
                  )}
                  <div className={`font-semibold text-xs pr-4 ${config.provider === prov.id ? 'text-[var(--success)]' : 'text-slate-900'}`}>{prov.name}</div>
                  <div className={`text-[10px] mt-0.5 ${config.provider === prov.id ? 'text-[var(--text-dim)]' : 'text-slate-500'}`}>{prov.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Gemini Settings */}
          {config.provider === 'gemini' && (
            <div className="space-y-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 flex items-center gap-1">
                  <Key className="w-3.5 h-3.5 text-blue-600" />
                  <span>Gemini API Key</span>
                </label>
                <input
                  type="password"
                  value={config.apiKey || ''}
                  onChange={(e) => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                  placeholder="AIzaSy..."
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500 font-mono shadow-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Model Name</label>
                <select
                  value={config.model || 'gemini-1.5-flash'}
                  onChange={(e) => setConfig(prev => ({ ...prev, model: e.target.value }))}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
                >
                  <option value="gemini-1.5-flash">gemini-1.5-flash (Fast & Accurate)</option>
                  <option value="gemini-1.5-pro">gemini-1.5-pro (Deep Reasoning)</option>
                  <option value="gemini-2.0-flash">gemini-2.0-flash (Latest Next-Gen)</option>
                </select>
              </div>
            </div>
          )}

          {/* OpenAI Settings */}
          {config.provider === 'openai' && (
            <div className="space-y-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 flex items-center gap-1">
                  <Key className="w-3.5 h-3.5 text-emerald-600" />
                  <span>OpenAI API Key</span>
                </label>
                <input
                  type="password"
                  value={config.apiKey || ''}
                  onChange={(e) => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                  placeholder="sk-..."
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500 font-mono shadow-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Model Name</label>
                <select
                  value={config.model || 'gpt-4o-mini'}
                  onChange={(e) => setConfig(prev => ({ ...prev, model: e.target.value }))}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
                >
                  <option value="gpt-4o-mini">gpt-4o-mini (Fast & Cost Efficient)</option>
                  <option value="gpt-4o">gpt-4o (Most Intelligent)</option>
                </select>
              </div>
            </div>
          )}

          {/* Ollama Settings */}
          {config.provider === 'ollama' && (
            <div className="space-y-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-purple-600" />
                  <span>Ollama Base URL</span>
                </label>
                <input
                  type="text"
                  value={config.baseUrl || 'http://localhost:11434'}
                  onChange={(e) => setConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500 font-mono shadow-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 flex items-center gap-1">
                  <Cpu className="w-3.5 h-3.5 text-purple-600" />
                  <span>Local Model Name</span>
                </label>
                <input
                  type="text"
                  value={config.model || 'llama3'}
                  onChange={(e) => setConfig(prev => ({ ...prev, model: e.target.value }))}
                  placeholder="llama3 or qwen2.5-coder"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500 font-mono shadow-xs"
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-[11px] text-slate-600 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
            <span>API keys are stored strictly in your browser local storage and never sent to third-party servers.</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50 text-xs">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-xs transition-colors"
          >
            {savedSuccess ? <Check className="w-3.5 h-3.5 text-white" /> : null}
            <span>{savedSuccess ? 'Saved!' : 'Save Settings'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
