import { Router, Request, Response } from 'express';
import { store } from '../services/store';
import { prober } from '../services/prober';
import { alertManager } from '../services/alertManager';
import { Monitor, AlertConfig, HttpMethod } from '../../../shared/types';

export const monitorsRouter = Router();

monitorsRouter.get('/', (req: Request, res: Response) => {
  const monitors = store.getAllMonitors();
  res.json(monitors);
});

monitorsRouter.post('/', (req: Request, res: Response) => {
  const {
    name,
    url,
    method = 'GET',
    intervalMs = 30000,
    timeoutMs = 5000,
    expectedStatus = 200,
    headers = {},
    body,
    alertConfig,
  } = req.body;

  if (!name || !url) {
    res.status(400).json({ error: 'Name and URL are required' });
    return;
  }

  const validMethods: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'];
  if (!validMethods.includes(method as HttpMethod)) {
    res.status(400).json({ error: `Invalid method. Must be one of: ${validMethods.join(', ')}` });
    return;
  }

  try {
    new URL(url);
  } catch {
    res.status(400).json({ error: 'Invalid URL format' });
    return;
  }

  const defaultAlertConfig: AlertConfig = {
    webhookUrl: '',
    emailAddresses: [],
    failureThreshold: 3,
    latencyThresholdMs: 2000,
    enabled: false,
  };

  const newMonitor = store.createMonitor({
    name,
    url,
    method: method as HttpMethod,
    intervalMs: Math.max(5000, Number(intervalMs) || 30000),
    timeoutMs: Math.max(1000, Number(timeoutMs) || 5000),
    expectedStatus: Number(expectedStatus) || 200,
    headers,
    body,
    alertConfig: alertConfig ? { ...defaultAlertConfig, ...alertConfig } : defaultAlertConfig,
  });

  prober.scheduleProbe(newMonitor);
  res.status(201).json(newMonitor);
});

monitorsRouter.get('/:id', (req: Request, res: Response) => {
  const monitor = store.getMonitor(req.params.id);
  if (!monitor) {
    res.status(404).json({ error: 'Monitor not found' });
    return;
  }
  res.json(monitor);
});

monitorsRouter.put('/:id', (req: Request, res: Response) => {
  const existing = store.getMonitor(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Monitor not found' });
    return;
  }

  const {
    name,
    url,
    method,
    intervalMs,
    timeoutMs,
    expectedStatus,
    headers,
    body,
    alertConfig,
  } = req.body;

  if (url) {
    try {
      new URL(url);
    } catch {
      res.status(400).json({ error: 'Invalid URL format' });
      return;
    }
  }

  const updated = store.updateMonitor(req.params.id, {
    ...(name !== undefined && { name }),
    ...(url !== undefined && { url }),
    ...(method !== undefined && { method }),
    ...(intervalMs !== undefined && { intervalMs: Math.max(5000, Number(intervalMs)) }),
    ...(timeoutMs !== undefined && { timeoutMs: Math.max(1000, Number(timeoutMs)) }),
    ...(expectedStatus !== undefined && { expectedStatus: Number(expectedStatus) }),
    ...(headers !== undefined && { headers }),
    ...(body !== undefined && { body }),
    ...(alertConfig !== undefined && { alertConfig }),
  });

  if (!updated) {
    res.status(500).json({ error: 'Failed to update monitor' });
    return;
  }

  prober.rescheduleProbe(updated);
  res.json(updated);
});

monitorsRouter.delete('/:id', (req: Request, res: Response) => {
  const id = req.params.id;
  const existing = store.getMonitor(id);
  if (!existing) {
    res.status(404).json({ error: 'Monitor not found' });
    return;
  }

  prober.cancelProbe(id);
  store.deleteMonitor(id);
  res.status(204).send();
});

monitorsRouter.post('/:id/probe', async (req: Request, res: Response) => {
  const monitor = store.getMonitor(req.params.id);
  if (!monitor) {
    res.status(404).json({ error: 'Monitor not found' });
    return;
  }

  try {
    const result = await prober.executeImmediateProbe(monitor);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Probe execution failed' });
  }
});

monitorsRouter.get('/:id/checks', (req: Request, res: Response) => {
  const monitor = store.getMonitor(req.params.id);
  if (!monitor) {
    res.status(404).json({ error: 'Monitor not found' });
    return;
  }

  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
  const checks = store.getChecks(req.params.id, Math.min(limit, 1000));
  res.json(checks);
});

monitorsRouter.get('/:id/stats', (req: Request, res: Response) => {
  const monitor = store.getMonitor(req.params.id);
  if (!monitor) {
    res.status(404).json({ error: 'Monitor not found' });
    return;
  }

  const range = (req.query.range as string) || '24h';
  const stats = store.getStats(req.params.id, range);
  res.json(stats);
});

monitorsRouter.post('/:id/alerts', (req: Request, res: Response) => {
  const monitor = store.getMonitor(req.params.id);
  if (!monitor) {
    res.status(404).json({ error: 'Monitor not found' });
    return;
  }

  const {
    webhookUrl,
    emailAddresses,
    failureThreshold,
    latencyThresholdMs,
    enabled,
  } = req.body;

  if (webhookUrl !== undefined && webhookUrl !== '') {
    try {
      new URL(webhookUrl);
    } catch {
      res.status(400).json({ error: 'Invalid webhookUrl format' });
      return;
    }
  }

  if (emailAddresses !== undefined && !Array.isArray(emailAddresses)) {
    res.status(400).json({ error: 'emailAddresses must be an array of strings' });
    return;
  }

  const currentAlertConfig = monitor.alertConfig || {
    webhookUrl: '',
    emailAddresses: [],
    failureThreshold: 3,
    latencyThresholdMs: 2000,
    enabled: false,
  };

  const updatedAlertConfig: AlertConfig = {
    webhookUrl: webhookUrl !== undefined ? webhookUrl : currentAlertConfig.webhookUrl,
    emailAddresses: emailAddresses !== undefined ? emailAddresses : currentAlertConfig.emailAddresses,
    failureThreshold: failureThreshold !== undefined ? Math.max(1, Number(failureThreshold)) : currentAlertConfig.failureThreshold,
    latencyThresholdMs: latencyThresholdMs !== undefined ? Math.max(50, Number(latencyThresholdMs)) : currentAlertConfig.latencyThresholdMs,
    enabled: enabled !== undefined ? Boolean(enabled) : currentAlertConfig.enabled,
  };

  const updatedMonitor = store.updateMonitor(req.params.id, {
    alertConfig: updatedAlertConfig,
  });

  if (!updatedMonitor) {
    res.status(500).json({ error: 'Failed to update monitor alert configuration' });
    return;
  }

  res.json(updatedMonitor.alertConfig);
});

monitorsRouter.post('/:id/alerts/test', async (req: Request, res: Response) => {
  const monitor = store.getMonitor(req.params.id);
  if (!monitor) {
    res.status(404).json({ error: 'Monitor not found' });
    return;
  }

  try {
    const success = await alertManager.sendTestAlert(monitor);
    if (success) {
      res.json({ message: 'Test alert delivered successfully' });
    } else {
      res.status(502).json({ error: 'Failed to deliver test alert to configured destination' });
    }
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Error sending test alert' });
  }
});

monitorsRouter.get('/:id/incidents', (req: Request, res: Response) => {
  const monitor = store.getMonitor(req.params.id);
  if (!monitor) {
    res.status(404).json({ error: 'Monitor not found' });
    return;
  }

  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  const incidents = store.getIncidentsByMonitor(req.params.id, Math.min(limit, 200));
  res.json(incidents);
});

monitorsRouter.post('/:id/incidents/:incidentId/resolve', (req: Request, res: Response) => {
  const monitor = store.getMonitor(req.params.id);
  if (!monitor) {
    res.status(404).json({ error: 'Monitor not found' });
    return;
  }

  const incident = store.resolveIncident(req.params.incidentId);
  if (!incident) {
    res.status(404).json({ error: 'Incident not found or already resolved' });
    return;
  }

  res.json(incident);
});