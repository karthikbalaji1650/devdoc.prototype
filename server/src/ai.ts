// Proxies AI rephrase requests to Gemini / OpenAI using an API key that
// lives only in this process's environment, never in the browser. This
// is what closes the "AI keys stored in plaintext in localStorage"
// gap - the frontend's own per-browser key setup (src/services/
// aiService.ts) still exists and still works; this is an additional,
// safer path a deployment can turn on instead.

export type AiProxyProvider = 'gemini' | 'openai';

export function configuredProviders(): AiProxyProvider[] {
  const providers: AiProxyProvider[] = [];
  if (process.env.GEMINI_API_KEY) providers.push('gemini');
  if (process.env.OPENAI_API_KEY) providers.push('openai');
  return providers;
}

async function callGemini(text: string, instruction: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY!;
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const prompt = buildPrompt(text, instruction);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message || `Gemini API returned status ${res.status}`);
  }
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const generated = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return cleanOutput(generated || text);
}

async function callOpenAi(text: string, instruction: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY!;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are an expert technical writer and principal systems engineer. Rephrase the user input according to their instructions. Return ONLY the improved technical text without preamble or conversational remarks.' },
        { role: 'user', content: `Instruction: ${instruction}\n\nInput Text:\n${text}` },
      ],
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message || `OpenAI API returned status ${res.status}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return cleanOutput(data.choices?.[0]?.message?.content || text);
}

function buildPrompt(text: string, instruction: string): string {
  return `You are a Principal Software & Systems Architect assisting in writing technical documentation.
Task: ${instruction}

Input Text:
"""
${text}
"""

Respond with ONLY the rephrased text. Do not include introductory notes, markdown wrappers like \`\`\`markdown, or extra conversational comments.`;
}

function cleanOutput(str: string): string {
  return str.replace(/^```[a-z]*\n/i, '').replace(/\n```$/, '').trim();
}

export async function rephraseViaProxy(provider: AiProxyProvider, text: string, instruction: string): Promise<string> {
  if (provider === 'gemini') return callGemini(text, instruction);
  return callOpenAi(text, instruction);
}
