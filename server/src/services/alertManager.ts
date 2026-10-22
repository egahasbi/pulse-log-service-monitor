import crypto from 'crypto';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import { Monitor, ProbeResult, WebhookPayload } from '../../../shared/types';
import { store } from './store';

interface FailureTracker {
  consecutiveFailures: number;
  lastReportedStatus: 'UP' | 'DOWN' | 'UNKNOWN';
}

export class AlertManager {
  private trackers: Map<string, FailureTracker> = new Map();
  private defaultSecret: string = process.env.PULSELOG_WEBHOOK_SECRET || 'pulselog-webhook-secret-token';

  public evaluateProbe(monitor: Monitor, result: ProbeResult): void {
    let tracker = this.trackers.get(monitor.id);

    if (!tracker) {
      tracker = {
        consecutiveFailures: 0,
        lastReportedStatus: monitor.status === 'DEGRADED' ? 'DOWN' : monitor.status
      };
      this.trackers.set(monitor.id, tracker);
    }

    const failureThreshold = Math.max(1, monitor.failureThreshold || 3);

    if (!result.isHealthy) {
      tracker.consecutiveFailures += 1;

      if (tracker.consecutiveFailures >= failureThreshold && tracker.lastReportedStatus !== 'DOWN') {
        tracker.lastReportedStatus = 'DOWN';
        this.triggerAlert(monitor, 'DOWN', result, tracker.consecutiveFailures);
      }
    } else {
      const wasDown = tracker.lastReportedStatus === 'DOWN';
      tracker.consecutiveFailures = 0;

      if (wasDown) {
        tracker.lastReportedStatus = 'UP';
        this.triggerAlert(monitor, 'UP', result, 0);
      } else if (tracker.lastReportedStatus === 'UNKNOWN') {
        tracker.lastReportedStatus = 'UP';
      }
    }
  }

  public resetMonitorTracker(monitorId: string): void {
    this.trackers.delete(monitorId);
  }

  private triggerAlert(
    monitor: Monitor,
    newStatus: 'UP' | 'DOWN',
    result: ProbeResult,
    failuresCount: number
  ): void {
    store.updateMonitorStatus(monitor.id, newStatus);

    const payload: WebhookPayload = {
      event: newStatus === 'DOWN' ? 'monitor.down' : 'monitor.recovered',
      timestamp: Date.now(),
      monitor: {
        id: monitor.id,
        name: monitor.name,
        targetUrl: monitor.targetUrl,
        status: newStatus,
        failureThreshold: monitor.failureThreshold
      },
      incident: {
        consecutiveFailures: failuresCount,
        statusCode: result.statusCode,
        latencyMs: result.latencyMs,
        errorMessage: result.errorMessage || null
      }
    };

    const webhookUrls: string[] = [];

    if (monitor.webhookUrl && monitor.webhookUrl.trim().length > 0) {
      webhookUrls.push(monitor.webhookUrl.trim());
    }

    const globalWebhook = process.env.PULSELOG_DEFAULT_WEBHOOK_URL;
    if (globalWebhook && !webhookUrls.includes(globalWebhook)) {
      webhookUrls.push(globalWebhook);
    }

    if (webhookUrls.length === 0) {
      return;
    }

    const secret = monitor.webhookSecret || this.defaultSecret;
    const body = JSON.stringify(payload);
    const signature = this.generateSignature(body, secret);

    for (const url of webhookUrls) {
      this.dispatchWebhook(url, body, signature).catch((err) => {
        console.error(`Failed to dispatch webhook for monitor ${monitor.id} to ${url}:`, err.message);
      });
    }
  }

  private generateSignature(body: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
  }

  private dispatchWebhook(targetUrl: string, body: string, signature: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(targetUrl);
      } catch (err) {
        return reject(new Error(`Invalid target URL: ${targetUrl}`));
      }

      const client = parsedUrl.protocol === 'https:' ? https : http;
      const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'PulseLog-AlertManager/1.0',
        'X-PulseLog-Signature': `sha256=${signature}`,
        'X-PulseLog-Timestamp': Date.now().toString()
      };

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: 'POST',
        headers,
        timeout: 10000
      };

      const req = client.request(options, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Webhook endpoint returned HTTP status ${res.statusCode}`));
        }
      });

      req.on('timeout', () => {
        req.destroy(new Error('Webhook request timed out after 10000ms'));
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.write(body);
      req.end();
    });
  }
}

export const alertManager = new AlertManager();