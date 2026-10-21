import dns from 'node:dns/promises';
import { performance } from 'node:perf_hooks';
import http from 'node:http';
import https from 'node:https';

export interface ProbeTarget {
  id: string;
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export interface ProbeMetrics {
  targetId: string;
  url: string;
  timestamp: number;
  success: boolean;
  statusCode?: number;
  statusText?: string;
  dnsDurationMs: number;
  tcpDurationMs: number;
  tlsDurationMs: number;
  ttfbDurationMs: number;
  totalDurationMs: number;
  responseSizeBytes: number;
  resolvedIp?: string;
  errorMessage?: string;
}

const httpAgent = new http.Agent({ keepAlive: false });
const httpsAgent = new https.Agent({ keepAlive: false });

export async function executeProbe(target: ProbeTarget): Promise<ProbeMetrics> {
  const timeoutMs = target.timeoutMs ?? 10000;
  const method = target.method ?? 'GET';
  const timestamp = Date.now();
  const urlObj = new URL(target.url);

  let dnsDurationMs = 0;
  let resolvedIp: string | undefined;

  const dnsStart = performance.now();
  try {
    const lookupResult = await dns.lookup(urlObj.hostname);
    dnsDurationMs = Math.round((performance.now() - dnsStart) * 100) / 100;
    resolvedIp = lookupResult.address;
  } catch (err: unknown) {
    dnsDurationMs = Math.round((performance.now() - dnsStart) * 100) / 100;
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      targetId: target.id,
      url: target.url,
      timestamp,
      success: false,
      dnsDurationMs,
      tcpDurationMs: 0,
      tlsDurationMs: 0,
      ttfbDurationMs: 0,
      totalDurationMs: dnsDurationMs,
      responseSizeBytes: 0,
      errorMessage: `DNS Lookup Failed: ${errorMessage}`
    };
  }

  const isHttps = urlObj.protocol === 'https:';
  const requestModule = isHttps ? https : http;
  const agent = isHttps ? httpsAgent : httpAgent;

  return new Promise<ProbeMetrics>((resolve) => {
    let tcpStart = 0;
    let tcpDurationMs = 0;
    let tlsStart = 0;
    let tlsDurationMs = 0;
    let ttfbDurationMs = 0;
    let totalDurationMs = 0;
    let responseSizeBytes = 0;
    let isSettled = false;

    const requestStart = performance.now();

    const finish = (metrics: ProbeMetrics) => {
      if (!isSettled) {
        isSettled = true;
        resolve(metrics);
      }
    };

    const reqOptions: http.RequestOptions = {
      protocol: urlObj.protocol,
      hostname: resolvedIp,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: `${urlObj.pathname}${urlObj.search}`,
      method,
      headers: {
        ...target.headers,
        Host: urlObj.host
      },
      agent,
      timeout: timeoutMs
    };

    if (isHttps) {
      (reqOptions as https.RequestOptions).servername = urlObj.hostname;
    }

    const req = requestModule.request(reqOptions);

    req.on('socket', (socket) => {
      tcpStart = performance.now();

      socket.on('connect', () => {
        tcpDurationMs = Math.round((performance.now() - tcpStart) * 100) / 100;
      });

      if (isHttps) {
        tlsStart = performance.now();
        socket.on('secureConnect', () => {
          tlsDurationMs = Math.round((performance.now() - tlsStart) * 100) / 100;
        });
      }
    });

    req.on('response', (res) => {
      const ttfbEnd = performance.now();
      ttfbDurationMs = Math.round((ttfbEnd - requestStart) * 100) / 100;

      res.on('data', (chunk: Buffer) => {
        responseSizeBytes += chunk.length;
      });

      res.on('end', () => {
        const reqEnd = performance.now();
        totalDurationMs = Math.round((dnsDurationMs + (reqEnd - requestStart)) * 100) / 100;
        const statusCode = res.statusCode ?? 0;
        const success = statusCode >= 200 && statusCode < 400;

        finish({
          targetId: target.id,
          url: target.url,
          timestamp,
          success,
          statusCode,
          statusText: res.statusMessage,
          dnsDurationMs,
          tcpDurationMs,
          tlsDurationMs,
          ttfbDurationMs,
          totalDurationMs,
          responseSizeBytes,
          resolvedIp
        });
      });

      res.on('error', (err: Error) => {
        const reqEnd = performance.now();
        totalDurationMs = Math.round((dnsDurationMs + (reqEnd - requestStart)) * 100) / 100;
        finish({
          targetId: target.id,
          url: target.url,
          timestamp,
          success: false,
          statusCode: res.statusCode,
          statusText: res.statusMessage,
          dnsDurationMs,
          tcpDurationMs,
          tlsDurationMs,
          ttfbDurationMs,
          totalDurationMs,
          responseSizeBytes,
          resolvedIp,
          errorMessage: `Response Stream Error: ${err.message}`
        });
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error(`Probe timed out after ${timeoutMs}ms`));
    });

    req.on('error', (err: Error) => {
      const reqEnd = performance.now();
      totalDurationMs = Math.round((dnsDurationMs + (reqEnd - requestStart)) * 100) / 100;

      finish({
        targetId: target.id,
        url: target.url,
        timestamp,
        success: false,
        dnsDurationMs,
        tcpDurationMs,
        tlsDurationMs,
        ttfbDurationMs,
        totalDurationMs,
        responseSizeBytes: 0,
        resolvedIp,
        errorMessage: err.message
      });
    });

    if (target.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      req.write(target.body);
    }

    req.end();
  });
}

export async function runProbes(targets: ProbeTarget[]): Promise<ProbeMetrics[]> {
  return Promise.all(targets.map((target) => executeProbe(target)));
}