import http from 'http';
import https from 'https';
import { URL } from 'url';
import { Monitor, ProbeResult } from '../../../shared/types';
import { store } from './store';
import { alertManager } from './alertManager';

interface ProbeExecutionOutput {
  statusCode: number | null;
  latencyMs: number;
  isHealthy: boolean;
  errorMessage?: string;
  responseBodySnippet?: string;
}

class ProberService {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private inFlight: Set<string> = new Set();
  private running: boolean = false;

  public start(): void {
    if (this.running) return;
    this.running = true;

    const monitors = store.getAllMonitors();
    for (const monitor of monitors) {
      if (monitor.active) {
        this.scheduleMonitor(monitor);
      }
    }
  }

  public stop(): void {
    this.running = false;
    for (const [id, timer] of this.timers.entries()) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this.inFlight.clear();
  }

  public registerMonitor(monitor: Monitor): void {
    this.unregisterMonitor(monitor.id);
    if (this.running && monitor.active) {
      this.scheduleMonitor(monitor);
    }
  }

  public unregisterMonitor(monitorId: string): void {
    const timer = this.timers.get(monitorId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(monitorId);
    }
    this.inFlight.delete(monitorId);
  }

  public triggerImmediateProbe(monitorId: string): Promise<ProbeResult | null> {
    const monitor = store.getMonitor(monitorId);
    if (!monitor) return Promise.resolve(null);
    return this.executeProbe(monitor);
  }

  private scheduleMonitor(monitor: Monitor): void {
    const intervalMs = Math.max(1000, monitor.intervalSeconds * 1000);

    const runCycle = async () => {
      if (!this.running) return;

      const currentMonitor = store.getMonitor(monitor.id);
      if (!currentMonitor || !currentMonitor.active) {
        this.unregisterMonitor(monitor.id);
        return;
      }

      await this.executeProbe(currentMonitor);

      if (this.running) {
        const nextTimer = setTimeout(runCycle, intervalMs);
        this.timers.set(monitor.id, nextTimer);
      }
    };

    const initialDelay = Math.floor(Math.random() * Math.min(2000, intervalMs));
    const timer = setTimeout(runCycle, initialDelay);
    this.timers.set(monitor.id, timer);
  }

  private async executeProbe(monitor: Monitor): Promise<ProbeResult> {
    if (this.inFlight.has(monitor.id)) {
      const activeMonitor = store.getMonitor(monitor.id) || monitor;
      return {
        id: `skip_${Date.now()}`,
        monitorId: monitor.id,
        timestamp: Date.now(),
        statusCode: null,
        latencyMs: 0,
        isHealthy: false,
        errorMessage: 'Probe skipped: prior probe still in flight',
      };
    }

    this.inFlight.add(monitor.id);
    const probeStartTime = Date.now();

    let output: ProbeExecutionOutput;
    try {
      output = await this.performHttpProbe(monitor);
    } catch (err: unknown) {
      const error = err as Error;
      output = {
        statusCode: null,
        latencyMs: Date.now() - probeStartTime,
        isHealthy: false,
        errorMessage: error.message || 'Unknown network error',
      };
    } finally {
      this.inFlight.delete(monitor.id);
    }

    const probeResult: ProbeResult = {
      id: `probe_${monitor.id}_${probeStartTime}`,
      monitorId: monitor.id,
      timestamp: probeStartTime,
      statusCode: output.statusCode,
      latencyMs: output.latencyMs,
      isHealthy: output.isHealthy,
      errorMessage: output.errorMessage,
      responseBodySnippet: output.responseBodySnippet,
    };

    store.recordProbeResult(monitor.id, probeResult);

    const latestMonitorState = store.getMonitor(monitor.id);
    if (latestMonitorState) {
      alertManager.evaluateProbe(latestMonitorState, probeResult);
    }

    return probeResult;
  }

  private performHttpProbe(monitor: Monitor): Promise<ProbeExecutionOutput> {
    return new Promise((resolve) => {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(monitor.url);
      } catch (err) {
        resolve({
          statusCode: null,
          latencyMs: 0,
          isHealthy: false,
          errorMessage: 'Invalid monitor URL format',
        });
        return;
      }

      const isHttps = parsedUrl.protocol === 'https:';
      const lib = isHttps ? https : http;
      const timeoutMs = (monitor.timeoutSeconds || 10) * 1000;
      const startTime = process.hrtime.bigint();

      const requestOptions: https.RequestOptions = {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: monitor.method || 'GET',
        headers: {
          'User-Agent': 'PulseLog-Synthetic-Prober/1.0',
          Accept: '*/*',
          ...(monitor.headers || {}),
        },
        timeout: timeoutMs,
      };

      let timerCleaned = false;
      let reqTimeout: NodeJS.Timeout | null = null;

      const finish = (output: ProbeExecutionOutput) => {
        if (timerCleaned) return;
        timerCleaned = true;
        if (reqTimeout) clearTimeout(reqTimeout);
        resolve(output);
      };

      const req = lib.request(requestOptions, (res) => {
        let bodyBuffer = '';
        res.setEncoding('utf8');

        res.on('data', (chunk: string) => {
          if (bodyBuffer.length < 1024) {
            bodyBuffer += chunk;
          }
        });

        res.on('end', () => {
          const endTime = process.hrtime.bigint();
          const latencyMs = Number((endTime - startTime) / 1000000n);
          const statusCode = res.statusCode || null;

          const expectedStatus = monitor.expectedStatusCode || 200;
          const statusOk = statusCode !== null && statusCode === expectedStatus;
          const latencyOk = !monitor.latencyThresholdMs || latencyMs <= monitor.latencyThresholdMs;
          const isHealthy = statusOk && latencyOk;

          let errorMessage: string | undefined;
          if (!statusOk) {
            errorMessage = `Expected HTTP ${expectedStatus}, received ${statusCode}`;
          } else if (!latencyOk) {
            errorMessage = `Latency ${latencyMs}ms exceeded threshold ${monitor.latencyThresholdMs}ms`;
          }

          finish({
            statusCode,
            latencyMs,
            isHealthy,
            errorMessage,
            responseBodySnippet: bodyBuffer ? bodyBuffer.slice(0, 512) : undefined,
          });
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error(`Probe timed out after ${timeoutMs}ms`));
      });

      req.on('error', (err: Error) => {
        const endTime = process.hrtime.bigint();
        const latencyMs = Number((endTime - startTime) / 1000000n);
        finish({
          statusCode: null,
          latencyMs,
          isHealthy: false,
          errorMessage: err.message || 'Network socket error',
        });
      });

      if (monitor.body && (monitor.method === 'POST' || monitor.method === 'PUT' || monitor.method === 'PATCH')) {
        req.write(monitor.body);
      }

      req.end();

      reqTimeout = setTimeout(() => {
        req.destroy(new Error(`Probe hard timeout exceeded ${timeoutMs}ms`));
      }, timeoutMs + 1000);
    });
  }
}

export const prober = new ProberService();
export default prober;