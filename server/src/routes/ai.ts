import { Router } from 'express';
import { configuredProviders, rephraseViaProxy, type AiProxyProvider } from '../ai.js';
import { requireAuth } from '../middleware.js';

const VALID_PROVIDERS: AiProxyProvider[] = ['gemini', 'openai'];

export function aiRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  // Lets the frontend ask, without guessing, whether it can skip asking
  // the user for their own API key.
  router.get('/providers', (_req, res) => {
    res.json({ providers: configuredProviders() });
  });

  router.post('/rephrase', async (req, res) => {
    const { provider, text, instruction } = req.body ?? {};
    if (!VALID_PROVIDERS.includes(provider)) {
      res.status(400).json({ error: `provider must be one of ${VALID_PROVIDERS.join(', ')}.` });
      return;
    }
    if (typeof text !== 'string' || !text.trim() || typeof instruction !== 'string' || !instruction.trim()) {
      res.status(400).json({ error: 'text and instruction are required.' });
      return;
    }
    if (!configuredProviders().includes(provider)) {
      res.status(501).json({ error: `This server has no ${provider} API key configured.` });
      return;
    }

    try {
      const result = await rephraseViaProxy(provider, text, instruction);
      res.json({ text: result });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'The AI provider request failed.' });
    }
  });

  return router;
}
