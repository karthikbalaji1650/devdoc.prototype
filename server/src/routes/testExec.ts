import { Router } from 'express';
import { pushScript, hasScript, startRun, getJob } from '../testExec.js';
import { requireAuth } from '../middleware.js';

export function testExecRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.post('/scripts', (req, res) => {
    const { suiteId, suiteTitle, robotCode } = req.body ?? {};
    if (typeof suiteId !== 'string' || !suiteId.trim()) {
      res.status(400).json({ error: 'suiteId is required.' });
      return;
    }
    if (typeof suiteTitle !== 'string' || !suiteTitle.trim()) {
      res.status(400).json({ error: 'suiteTitle is required.' });
      return;
    }
    if (typeof robotCode !== 'string' || !robotCode.trim()) {
      res.status(400).json({ error: 'robotCode is required.' });
      return;
    }
    pushScript(suiteId, suiteTitle, robotCode);
    res.json({ ok: true });
  });

  router.post('/runs', (req, res) => {
    const { suiteId } = req.body ?? {};
    if (typeof suiteId !== 'string' || !suiteId.trim()) {
      res.status(400).json({ error: 'suiteId is required.' });
      return;
    }
    if (!hasScript(suiteId)) {
      res.status(400).json({ error: 'No script has been pushed for this suite yet.' });
      return;
    }
    const jobId = startRun(suiteId);
    res.json({ jobId });
  });

  router.get('/runs/:jobId', (req, res) => {
    const job = getJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'No run found with that id.' });
      return;
    }
    if (job.status === 'running') {
      res.json({ status: 'running' });
      return;
    }
    res.json({ status: 'completed', results: job.results });
  });

  return router;
}
