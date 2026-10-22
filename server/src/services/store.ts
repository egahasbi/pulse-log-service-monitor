import crypto from 'crypto';

export interface AlertConfig {
  consecutiveThreshold: number;
  latencyThresholdMs?: number;
  notifyEmail?: string;
  notifyWebhook?: string;
}

export type MonitorStatus = 'up' | 'down' | 'degraded' | 'pending';

export interface Monitor {
  id: string;
  name: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  headers?: Record<string, string>;
  body?: string;
  intervalSeconds: number;
  timeoutMs: number;
  status: MonitorStatus;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastCheckedAt?: string;
  lastLatencyMs?: number;
  uptimePercent: number;
  totalChecks: number;
  successfulChecks: number;
  alertConfig: AlertConfig;
  createdAt: string;
  updatedAt: string;
}

export interface ProbeResult {
  id: string;
  monitorId: string;
  timestamp: string;
  statusCode: number;
  latencyMs: number;
  isUp: boolean;
  errorMessage?: string;
}

export interface IncidentEvent {
  id: string;
  monitorId: string;
  monitorName: string;
  type: 'incident_started' | 'incident_resolved' | 'latency_spike';
  message: string;
  timestamp: string;
  consecutiveFailures: number;
  resolvedAt?: string;
}

export interface CreateMonitorInput {
  name: string;
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  headers?: Record<string, string>;
  body?: string;
  intervalSeconds?: number;
  timeoutMs?: number;
  alertConfig?: Partial<AlertConfig>;
}

export interface UpdateMonitorInput {
  name?: string;
  url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  headers?: Record<string, string>;
  body?: string;
  intervalSeconds?: number;
  timeoutMs?: number;
  alertConfig?: Partial<AlertConfig>;
}

const MAX_PROBES_PER_MONITOR = 1000;
const MAX_INCIDENT_EVENTS = 500;

class Store {
  private monitors: Map<string, Monitor> = new Map();
  private probeResults: Map<string, ProbeResult[]> = new Map();
  private incidents: IncidentEvent[] = [];

  constructor() {
    this.seedDefaultData();
  }

  private seedDefaultData(): void {
    const demoMonitors: CreateMonitorInput[] = [
      {
        name: 'JSONPlaceholder API',
        url: 'https://jsonplaceholder.typicode.com/posts/1',
        method: 'GET',
        intervalSeconds: 15,
        timeoutMs: 5000,
        alertConfig: {
          consecutiveThreshold: 3,
          latencyThresholdMs: 800,
        },
      },
      {
        name: 'GitHub Status API',
        url: 'https://www.githubstatus.com/api/v2/status.json',
        method: 'GET',
        intervalSeconds: 30,
        timeoutMs: 4000,
        alertConfig: {
          consecutiveThreshold: 2,
          latencyThresholdMs: 500,
        },
      },
    ];

    for (const item of demoMonitors) {
      this.createMonitor(item);
    }
  }

  public getAllMonitors(): Monitor[] {
    return Array.from(this.monitors.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public getMonitorById(id: string): Monitor | undefined {
    return this.monitors.get(id);
  }

  public createMonitor(input: CreateMonitorInput): Monitor {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const monitor: Monitor = {
      id,
      name: input.name,
      url: input.url,
      method: input.method || 'GET',
      headers: input.headers,
      body: input.body,
      intervalSeconds: input.intervalSeconds ?? 30,
      timeoutMs: input.timeoutMs ?? 5000,
      status: 'pending',
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      uptimePercent: 100,
      totalChecks: 0,
      successfulChecks: 0,
      alertConfig: {
        consecutiveThreshold: input.alertConfig?.consecutiveThreshold ?? 3,
        latencyThresholdMs: input.alertConfig?.latencyThresholdMs,
        notifyEmail: input.alertConfig?.notifyEmail,
        notifyWebhook: input.alertConfig?.notifyWebhook,
      },
      createdAt: now,
      updatedAt: now,
    };

    this.monitors.set(id, monitor);
    this.probeResults.set(id, []);
    return monitor;
  }

  public updateMonitor(id: string, input: UpdateMonitorInput): Monitor | undefined {
    const existing = this.monitors.get(id);
    if (!existing) {
      return undefined;
    }

    const updatedAlertConfig: AlertConfig = {
      ...existing.alertConfig,
      ...(input.alertConfig || {}),
      consecutiveThreshold:
        input.alertConfig?.consecutiveThreshold ?? existing.alertConfig.consecutiveThreshold,
    };

    const updated: Monitor = {
      ...existing,
      name: input.name ?? existing.name,
      url: input.url ?? existing.url,
      method: input.method ?? existing.method,
      headers: input.headers !== undefined ? input.headers : existing.headers,
      body: input.body !== undefined ? input.body : existing.body,
      intervalSeconds: input.intervalSeconds ?? existing.intervalSeconds,
      timeoutMs: input.timeoutMs ?? existing.timeoutMs,
      alertConfig: updatedAlertConfig,
      updatedAt: new Date().toISOString(),
    };

    this.monitors.set(id, updated);
    return updated;
  }

  public deleteMonitor(id: string): boolean {
    const exists = this.monitors.has(id);
    if (!exists) {
      return false;
    }

    this.monitors.delete(id);
    this.probeResults.delete(id);
    this.incidents = this.incidents.filter((incident) => incident.monitorId !== id);
    return true;
  }

  public recordProbeResult(
    monitorId: string,
    result: { statusCode: number; latencyMs: number; isUp: boolean; errorMessage?: string }
  ): { monitor: Monitor; probe: ProbeResult; newIncident?: IncidentEvent } | undefined {
    const monitor = this.monitors.get(monitorId);
    if (!monitor) {
      return undefined;
    }

    const now = new Date().toISOString();
    const probe: ProbeResult = {
      id: crypto.randomUUID(),
      monitorId,
      timestamp: now,
      statusCode: result.statusCode,
      latencyMs: result.latencyMs,
      isUp: result.isUp,
      errorMessage: result.errorMessage,
    };

    const results = this.probeResults.get(monitorId) || [];
    results.push(probe);
    if (results.length > MAX_PROBES_PER_MONITOR) {
      results.shift();
    }
    this.probeResults.set(monitorId, results);

    const totalChecks = monitor.totalChecks + 1;
    const successfulChecks = monitor.successfulChecks + (result.isUp ? 1 : 0);
    const uptimePercent = Number(((successfulChecks / totalChecks) * 100).toFixed(2));

    let consecutiveFailures = result.isUp ? 0 : monitor.consecutiveFailures + 1;
    let consecutiveSuccesses = result.isUp ? monitor.consecutiveSuccesses + 1 : 0;

    let status: MonitorStatus = monitor.status;
    let newIncident: IncidentEvent | undefined;

    const threshold = monitor.alertConfig.consecutiveThreshold || 3;
    const latencyThreshold = monitor.alertConfig.latencyThresholdMs;

    if (!result.isUp) {
      if (consecutiveFailures >= threshold) {
        if (monitor.status !== 'down') {
          status = 'down';
          newIncident = {
            id: crypto.randomUUID(),
            monitorId: monitor.id,
            monitorName: monitor.name,
            type: 'incident_started',
            message: `Service down: ${consecutiveFailures} consecutive probe failures. Error: ${result.errorMessage || `HTTP ${result.statusCode}`}`,
            timestamp: now,
            consecutiveFailures,
          };
          this.addIncident(newIncident);
        }
      } else {
        status = 'degraded';
      }
    } else {
      if (monitor.status === 'down') {
        newIncident = {
          id: crypto.randomUUID(),
          monitorId: monitor.id,
          monitorName: monitor.name,
          type: 'incident_resolved',
          message: `Service recovered after outage. Responded with HTTP ${result.statusCode} in ${result.latencyMs}ms.`,
          timestamp: now,
          consecutiveFailures: 0,
          resolvedAt: now,
        };
        this.addIncident(newIncident);
      }

      if (latencyThreshold && result.latencyMs > latencyThreshold) {
        status = 'degraded';
        if (monitor.lastLatencyMs && monitor.lastLatencyMs <= latencyThreshold) {
          const spikeIncident: IncidentEvent = {
            id: crypto.randomUUID(),
            monitorId: monitor.id,
            monitorName: monitor.name,
            type: 'latency_spike',
            message: `High latency detected: ${result.latencyMs}ms exceeded threshold of ${latencyThreshold}ms.`,
            timestamp: now,
            consecutiveFailures: 0,
          };
          this.addIncident(spikeIncident);
        }
      } else {
        status = 'up';
      }
    }

    const updatedMonitor: Monitor = {
      ...monitor,
      status,
      consecutiveFailures,
      consecutiveSuccesses,
      lastCheckedAt: now,
      lastLatencyMs: result.latencyMs,
      totalChecks,
      successfulChecks,
      uptimePercent,
      updatedAt: now,
    };

    this.monitors.set(monitorId, updatedMonitor);
    return { monitor: updatedMonitor, probe, newIncident };
  }

  public getProbeHistory(monitorId: string, limit = 60): ProbeResult[] {
    const list = this.probeResults.get(monitorId) || [];
    return list.slice(-limit);
  }

  public getIncidents(limit = 100): IncidentEvent[] {
    return this.incidents.slice(0, limit);
  }

  public getIncidentsByMonitorId(monitorId: string, limit = 50): IncidentEvent[] {
    return this.incidents
      .filter((incident) => incident.monitorId === monitorId)
      .slice(0, limit);
  }

  private addIncident(incident: IncidentEvent): void {
    this.incidents.unshift(incident);
    if (this.incidents.length > MAX_INCIDENT_EVENTS) {
      this.incidents.pop();
    }
  }

  public resetFailureCount(monitorId: string): Monitor | undefined {
    const monitor = this.monitors.get(monitorId);
    if (!monitor) {
      return undefined;
    }

    const updated: Monitor = {
      ...monitor,
      consecutiveFailures: 0,
      updatedAt: new Date().toISOString(),
    };

    this.monitors.set(monitorId, updated);
    return updated;
  }
}

export const store = new Store();