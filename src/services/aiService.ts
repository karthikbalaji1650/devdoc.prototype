// AI Rephrase & Engineering Text Enhancement Service

export type AiProvider = 'builtin' | 'gemini' | 'openai' | 'ollama';

export interface AiConfig {
  provider: AiProvider;
  apiKey?: string;
  model?: string;
  baseUrl?: string; // e.g. for Ollama http://localhost:11434
}

export type RephraseTone = 
  | 'professional' 
  | 'concise' 
  | 'technical' 
  | 'rca-formal' 
  | 'executive' 
  | 'fix-grammar';

export const REPHRASE_TONES: { id: RephraseTone; label: string; icon: string; prompt: string }[] = [
  {
    id: 'professional',
    label: 'Professional & Clear',
    icon: '✨',
    prompt: 'Rewrite the following engineering text in a professional, clear, and authoritative tone suitable for enterprise documentation. Maintain technical accuracy.'
  },
  {
    id: 'technical',
    label: 'Deep Technical & Precise',
    icon: '⚡',
    prompt: 'Enhance this text with rigorous system engineering terminology, precise hardware/software concepts, and structured reasoning. Avoid fluff.'
  },
  {
    id: 'concise',
    label: 'Concise & Bullet Points',
    icon: '🎯',
    prompt: 'Condense the following text into crisp, high-impact bullet points and short executive sentences while preserving all core facts and parameters.'
  },
  {
    id: 'rca-formal',
    label: 'Formal RCA & Problem Statement',
    icon: '🛠️',
    prompt: 'Format this text into an industry-standard Root Cause Analysis (RCA) or Incident Statement with clear cause-and-effect relationship.'
  },
  {
    id: 'fix-grammar',
    label: 'Fix Grammar & Typos',
    icon: '🔍',
    prompt: 'Correct any grammatical errors, spelling mistakes, awkward phrasing, and passive voice in this text while keeping the original meaning exact.'
  }
];

const STORAGE_AI_CONFIG_KEY = 'devdoc_studio_ai_config_v1';

export function getStoredAiConfig(): AiConfig {
  const saved = localStorage.getItem(STORAGE_AI_CONFIG_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse AI config', e);
    }
  }
  return {
    provider: 'builtin',
    model: 'gemini-1.5-flash'
  };
}

export function saveStoredAiConfig(config: AiConfig): void {
  localStorage.setItem(STORAGE_AI_CONFIG_KEY, JSON.stringify(config));
}

export async function rephraseText(
  originalText: string,
  tone: RephraseTone,
  customInstruction?: string
): Promise<string> {
  const config = getStoredAiConfig();
  const toneObj = REPHRASE_TONES.find(t => t.id === tone) || REPHRASE_TONES[0];
  const systemPrompt = customInstruction 
    ? `${toneObj.prompt}\nAdditional instruction: ${customInstruction}`
    : toneObj.prompt;

  if (config.provider === 'gemini' && config.apiKey) {
    return callGeminiApi(originalText, systemPrompt, config);
  } else if (config.provider === 'openai' && config.apiKey) {
    return callOpenAiApi(originalText, systemPrompt, config);
  } else if (config.provider === 'ollama') {
    return callOllamaApi(originalText, systemPrompt, config);
  }

  // Fallback to built-in smart engineering rephrase heuristic
  return simulateSmartRephrase(originalText, tone, customInstruction);
}

// 1. Google Gemini API integration
async function callGeminiApi(text: string, instruction: string, config: AiConfig): Promise<string> {
  const model = config.model || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;

  const prompt = `You are a Principal Software & Systems Architect assisting in writing technical documentation.
Task: ${instruction}

Input Text:
"""
${text}
"""

Respond with ONLY the rephrased text. Do not include introductory notes, markdown wrappers like \`\`\`markdown, or extra conversational comments.`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048
      }
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Gemini API returned status ${response.status}`);
  }

  const data = await response.json();
  const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return cleanOutput(generatedText || text);
}

// 2. OpenAI API integration
async function callOpenAiApi(text: string, instruction: string, config: AiConfig): Promise<string> {
  const model = config.model || 'gpt-4o-mini';
  const url = 'https://api.openai.com/v1/chat/completions';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert technical writer and principal systems engineer. Rephrase the user input according to their instructions. Return ONLY the improved technical text without preamble or conversational remarks.'
        },
        {
          role: 'user',
          content: `Instruction: ${instruction}\n\nInput Text:\n${text}`
        }
      ],
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `OpenAI API returned status ${response.status}`);
  }

  const data = await response.json();
  return cleanOutput(data.choices?.[0]?.message?.content || text);
}

// 3. Local Ollama Integration
async function callOllamaApi(text: string, instruction: string, config: AiConfig): Promise<string> {
  const baseUrl = config.baseUrl || 'http://localhost:11434';
  const model = config.model || 'llama3';

  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: `[INST] You are a technical documentation assistant. ${instruction}\n\nInput:\n${text}\n\nReturn ONLY the improved text: [/INST]`,
      stream: false
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama returned status ${response.status}. Ensure Ollama is running at ${baseUrl}`);
  }

  const data = await response.json();
  return cleanOutput(data.response || text);
}

function cleanOutput(str: string): string {
  return str
    .replace(/^```[a-z]*\n/i, '')
    .replace(/\n```$/, '')
    .trim();
}

// Smart Built-in Offline Heuristic Engine (Works without any external API keys!)
function simulateSmartRephrase(text: string, tone: RephraseTone, _custom?: string): Promise<string> {
  return new Promise((resolve) => {
    setTimeout(() => {
      let result = text.trim();

      if (tone === 'fix-grammar') {
        result = result
          .replace(/\bi\b/g, 'I')
          .replace(/\bteh\b/gi, 'the')
          .replace(/\bdont\b/gi, "don't")
          .replace(/\bcant\b/gi, "cannot")
          .replace(/\bwont\b/gi, "will not")
          .replace(/\boccur\b/gi, 'transpire')
          .replace(/\s+/g, ' ')
          .replace(/\s,/, ',');
        
        // Capitalize sentences
        result = result.replace(/(^\s*|[.!?]\s+)([a-z])/g, (_, p1, p2) => p1 + p2.toUpperCase());
        resolve(result);
        return;
      }

      if (tone === 'concise') {
        const sentences = text.split(/[.\n]+/).map(s => s.trim()).filter(Boolean);
        if (sentences.length > 1) {
          result = sentences.map(s => `- **${s.slice(0, 30).trim()}...**: ${s}`).join('\n');
        } else {
          result = `- **Summary**: ${text.replace(/\b(in order to|as a matter of fact|due to the fact that)\b/gi, 'to')}`;
        }
        resolve(result);
        return;
      }

      if (tone === 'technical') {
        result = text
          .replace(/\b(bug|error|problem)\b/gi, 'non-conformance anomaly')
          .replace(/\b(slow|laggy)\b/gi, 'latency-degraded')
          .replace(/\b(fix|patch)\b/gi, 'remediation patch')
          .replace(/\b(breaks|crashes)\b/gi, 'triggers fatal exception state')
          .replace(/\b(check|tested)\b/gi, 'systematically verified');
        
        if (!result.includes('Specifically,') && result.length > 50) {
          result = `Investigation revealed that ${result.charAt(0).toLowerCase() + result.slice(1)}`;
        }
        resolve(result);
        return;
      }

      if (tone === 'rca-formal') {
        result = `**Root Cause Statement**:\n${result}\n\n**Impact & Scope**:\n- Affects target firmware execution and client interaction.\n- Remediation requires deterministic input sanitization and strict schema enforcement.`;
        resolve(result);
        return;
      }

      // Default 'professional'
      result = text
        .replace(/\b(kinda|sorta|pretty much)\b/gi, 'substantially')
        .replace(/\b(got|get)\b/gi, 'obtained')
        .replace(/\b(make sure)\b/gi, 'ensure')
        .replace(/\b(lots of)\b/gi, 'multiple')
        .replace(/\b(shows that)\b/gi, 'indicates that');

      if (!/^[A-Z]/.test(result)) {
        result = result.charAt(0).toUpperCase() + result.slice(1);
      }
      if (!/[.!?]$/.test(result)) {
        result += '.';
      }

      resolve(result);
    }, 400); // realistic slight async delay
  });
}
