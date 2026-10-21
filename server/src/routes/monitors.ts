import { Router, Request, Response } from 'express';
import { store } from '../services/store';
import { prober } from '../services/prober';
import {
  CreateMonitorDTO,
  UpdateMonitorDTO,
  HttpMethod,
  MonitorStatus,
} from '../../../shared/types';

const router = Router();

const VALID_HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

function validateMonitorPayload(body: any, isUpdate = false): { valid: boolean; error?: string } {
  if (!isUpdate || body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return { valid: false, error: 'Field "name" must be non-empty string' };
    }
  }

  if (!isUpdate || body.url !== undefined) {
    if (typeof body.url !== 'string') {
      return { valid: false, error: 'Field "url" must be string' };
    }
    try {
      const parsed = new URL(body.url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { valid: false, error: 'Field "url" must use HTTP or HTTPS protocol' };
      }
    } catch {
      return { valid: false, error: 'Field "url" must be valid URL' };
    }
  }

  if (body.method !== undefined) {
    if (!VALID_HTTP_METHODS.includes(body.method)) {
      return { valid: false, error: `Field "method" must be one of: ${VALID_HTTP_METHODS.join(', ')}` };
    }
  }

  if (body.intervalSeconds !== undefined) {
    if (typeof body.intervalSeconds !== 'number' || body.intervalSeconds < 5 || body.intervalSeconds > 86400) {
      return { valid: false, error: 'Field "intervalSeconds" must be number between 5 and 86400' };
    }
  }

  if (body.timeoutMs !== undefined) {
    if (typeof body.timeoutMs !== 'number' || body.timeoutMs < 500 || body.timeoutMs > 60000) {
      return { valid: false, error: 'Field "timeoutMs" must be number between 500 and 60000' };
    }
  }

  if (body.expectedStatusCode !== undefined) {
    if (
      typeof body.expectedStatusCode !== 'number' ||
      body.expectedStatusCode < 100 ||
      body.expectedStatusCode > 599
    ) {
      return { valid: false, error: 'Field "expectedStatusCode" must be valid HTTP status code (100-599)' };
    }
  }

  if (body.headers !== undefined && (typeof body.headers !== 'object' || body.headers === null || Array.isArray(body.headers))) {
    return { valid: false, error: 'Field "headers" must be key-value object' };
  }

  if (body.body !== undefined && typeof body.body !== 'string' && typeof body.body !== 'object') {
    return { valid: false, error: 'Field "body" must be string or JSON object' };
  }

  if (body.latencyThresholdMs !== undefined) {
    if (typeof body.latencyThresholdMs !== 'number' || body.latencyThresholdMs <= 0) {
      return { valid: false, error: 'Field "latencyThresholdMs" must be positive number' };
    }
  }

  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
    return { valid: false, error: 'Field "isActive" must be boolean' };
  }

  return { valid: true };
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    const monitors = await store.getMonitors();
    return res.status(200).json(monitors);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed fetch monitors', details: err.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const monitor = await store.getMonitorById(req.params.id);
    if (!monitor) {
      return res.status(404).json({ error: 'Monitor not found' });
    }
    return res.status(200).json(monitor);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed fetch monitor', details: err.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const validation = validateMonitorPayload(req.body, false);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const payload: CreateMonitorDTO = {
      name: req.body.name.trim(),
      url: req.body.url.trim(),
      method: req.body.method || 'GET',
      intervalSeconds: req.body.intervalSeconds ?? 60,
      timeoutMs: req.body.timeoutMs ?? 10000,
      expectedStatusCode: req.body.expectedStatusCode ?? 200,
      headers: req.body.headers ?? {},
      body: req.body.body ? (typeof req.body.body === 'object' ? JSON.stringify(req.body.body) : req.body.body) : undefined,
      latencyThresholdMs: req.body.latencyThresholdMs ?? 2000,
      isActive: req.body.isActive ?? true,
    };

    const monitor = await store.createMonitor(payload);

    if (monitor.isActive) {
      prober.schedule(monitor);
    }

    return res.status(201).json(monitor);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed create monitor', details: err.message });
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await store.getMonitorById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Monitor not found' });
    }

    const validation = validateMonitorPayload(req.body, true);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const payload: UpdateMonitorDTO = {};

    if (req.body.name !== undefined) payload.name = req.body.name.trim();
    if (req.body.url !== undefined) payload.url = req.body.url.trim();
    if (req.body.method !== undefined) payload.method = req.body.method;
    if (req.body.intervalSeconds !== undefined) payload.intervalSeconds = req.body.intervalSeconds;
    if (req.body.timeoutMs !== undefined) payload.timeoutMs = req.body.timeoutMs;
    if (req.body.expectedStatusCode !== undefined) payload.expectedStatusCode = req.body.expectedStatusCode;
    if (req.body.headers !== undefined) payload.headers = req.body.headers;
    if (req.body.body !== undefined) {
      payload.body = typeof req.body.body === 'object' ? JSON.stringify(req.body.body) : req.body.body;
    }
    if (req.body.latencyThresholdMs !== undefined) payload.latencyThresholdMs = req.body.latencyThresholdMs;
    if (req.body.isActive !== undefined) payload.isActive = req.body.isActive;

    const updated = await store.updateMonitor(id, payload);
    if (!updated) {
      return res.status(404).json({ error: 'Monitor not found' });
    }

    prober.reschedule(updated);

    return res.status(200).json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed update monitor', details: err.message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await store.getMonitorById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Monitor not found' });
    }

    prober.cancel(id);
    await store.deleteMonitor(id);

    return res.status(204).send();
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed delete monitor', details: err.message });
  }
});

router.post('/:id/test', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const monitor = await store.getMonitorById(id);
    if (!monitor) {
      return res.status(404).json({ error: 'Monitor not found' });
    }

    const checkResult = await prober.runSingleCheck(monitor);
    return res.status(200).json(checkResult);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed execute probe check', details: err.message });
  }
});

router.get('/:id/history', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const monitor = await store.getMonitorById(id);
    if (!monitor) {
      return res.status(404).json({ error: 'Monitor not found' });
    }

    const limitQuery = req.query.limit;
    const sinceQuery = req.query.since;

    const limit = limitQuery ? Math.min(Math.max(parseInt(String(limitQuery), 10) || 50, 1), 1000) : 50;
    const since = sinceQuery ? parseInt(String(sinceQuery), 10) : undefined;

    const history = await store.getLatencyHistory(id, { limit, since });
    return res.status(200).json(history);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed fetch latency history', details: err.message });
  }
});

router.get('/:id/stats', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const monitor = await store.getMonitorById(id);
    if (!monitor) {
      return res.status(404).json({ error: 'Monitor not found' });
    }

    const periodMs = req.query.periodMs ? parseInt(String(req.query.periodMs), 10) : 86400000;
    const stats = await store.getMonitorStats(id, periodMs);

    return res.status(200).json(stats);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed calculate monitor stats', details: err.message });
  }
});

export default router;