import fs from 'fs';
import path from 'path';

export interface MetricPoint {
  timestamp: number;
  statusCode: number;
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
  dnsLookupMs?: number;
  tcpConnectMs?: number;
  tlsHandshakeMs?: number;
  ttfbMs?: number;
}

export interface LatencyPercentiles {
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  avg: number;
}

export interface MonitorAggregateStats {
  monitorId: string;
  totalChecks: number;
  successCount: number;
  failureCount: number;
  uptimePercentage: number;
  lastCheckTime?: number;
  lastStatus?: boolean;
  latency: LatencyPercentiles;
}

export interface StoreSnapshot {
  version: number;
  savedAt: number;
  data: Record<string, MetricPoint[]>;
}

export class MetricRingBuffer {
  private buffer: Array<MetricPoint | undefined>;
  private capacity: number;
  private head: number = 0;
  private tail: number = 0;
  private count: number = 0;

  constructor(capacity: number = 1000) {
    if (capacity <= 0) {
      throw new Error('Capacity must be positive integer');
    }
    this.capacity = capacity;
    this.buffer = new Array<MetricPoint | undefined>(capacity);
  }

  public push(point: MetricPoint): void {
    this.buffer[this.head] = point;
    this.head = (this.head + 1) % this.capacity;

    if (this.count < this.capacity) {
      this.count++;
    } else {
      this.tail = (this.tail + 1) % this.capacity;
    }
  }

  public toArray(): MetricPoint[] {
    const result: MetricPoint[] = [];
    result.length = this.count;

    let readIndex = this.tail;
    for (let i = 0; i < this.count; i++) {
      result[i] = this.buffer[readIndex] as MetricPoint;
      readIndex = (readIndex + 1) % this.capacity;
    }
    return result;
  }

  public getRange(startTimeMs: number, endTimeMs: number = Date.now()): MetricPoint[] {
    const points = this.toArray();
    return points.filter((p) => p.timestamp >= startTimeMs && p.timestamp <= endTimeMs);
  }

  public getLatest(n?: number): MetricPoint[] {
    const points = this.toArray();
    if (!n || n >= points.length) {
      return points;
    }
    return points.slice(points.length - n);
  }

  public size(): number {
    return this.count;
  }

  public clear(): void {
    this.buffer = new Array<MetricPoint | undefined>(this.capacity);
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }
}

export class MetricStore {
  private buffers: Map<string, MetricRingBuffer> = new Map();
  private capacityPerMonitor: number;
  private snapshotFilePath: string;
  private snapshotIntervalMs: number;
  private persistTimer: NodeJS.Timeout | null = null;
  private isPersisting: boolean = false;

  constructor(
    capacityPerMonitor: number = 2000,
    snapshotFilePath?: string,
    snapshotIntervalMs: number = 60000
  ) {
    this.capacityPerMonitor = capacityPerMonitor;
    this.snapshotFilePath =
      snapshotFilePath ||
      path.resolve(process.cwd(), 'data', 'pulselog-metrics.json');
    this.snapshotIntervalMs = snapshotIntervalMs;

    this.loadSnapshot();
    this.startPersistence();
  }

  public record(monitorId: string, point: MetricPoint): void {
    let buf = this.buffers.get(monitorId);
    if (!buf) {
      buf = new MetricRingBuffer(this.capacityPerMonitor);
      this.buffers.set(monitorId, buf);
    }
    buf.push(point);
  }

  public getHistory(
    monitorId: string,
    options?: { startTime?: number; endTime?: number; limit?: number }
  ): MetricPoint[] {
    const buf = this.buffers.get(monitorId);
    if (!buf) {
      return [];
    }

    if (options?.startTime !== undefined) {
      const filtered = buf.getRange(options.startTime, options.endTime ?? Date.now());
      if (options.limit && options.limit > 0) {
        return filtered.slice(-options.limit);
      }
      return filtered;
    }

    return buf.getLatest(options?.limit);
  }

  public getStats(monitorId: string, durationMs?: number): MonitorAggregateStats {
    const now = Date.now();
    const startTime = durationMs ? now - durationMs : 0;
    const points = this.getHistory(monitorId, { startTime, endTime: now });

    const defaultLatency: LatencyPercentiles = {
      p50: 0,
      p75: 0,
      p90: 0,
      p95: 0,
      p99: 0,
      min: 0,
      max: 0,
      avg: 0,
    };

    if (points.length === 0) {
      return {
        monitorId,
        totalChecks: 0,
        successCount: 0,
        failureCount: 0,
        uptimePercentage: 100,
        latency: defaultLatency,
      };
    }

    let successCount = 0;
    let failureCount = 0;
    const latencies: number[] = [];
    let latencySum = 0;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.success) {
        successCount++;
      } else {
        failureCount++;
      }
      latencies.push(p.latencyMs);
      latencySum += p.latencyMs;
    }

    latencies.sort((a, b) => a - b);

    const calcPercentile = (p: number): number => {
      const index = Math.ceil((p / 100) * latencies.length) - 1;
      return latencies[Math.max(0, index)];
    };

    const latestPoint = points[points.length - 1];

    return {
      monitorId,
      totalChecks: points.length,
      successCount,
      failureCount,
      uptimePercentage: Number(((successCount / points.length) * 100).toFixed(2)),
      lastCheckTime: latestPoint.timestamp,
      lastStatus: latestPoint.success,
      latency: {
        p50: calcPercentile(50),
        p75: calcPercentile(75),
        p90: calcPercentile(90),
        p95: calcPercentile(95),
        p99: calcPercentile(99),
        min: latencies[0],
        max: latencies[latencies.length - 1],
        avg: Math.round(latencySum / latencies.length),
      },
    };
  }

  public getAllMonitorsStats(durationMs?: number): Record<string, MonitorAggregateStats> {
    const result: Record<string, MonitorAggregateStats> = {};
    for (const monitorId of this.buffers.keys()) {
      result[monitorId] = this.getStats(monitorId, durationMs);
    }
    return result;
  }

  public removeMonitor(monitorId: string): boolean {
    return this.buffers.delete(monitorId);
  }

  public clearAll(): void {
    this.buffers.clear();
  }

  public getTrackedMonitors(): string[] {
    return Array.from(this.buffers.keys());
  }

  public flushSync(): void {
    if (this.isPersisting) {
      return;
    }
    this.isPersisting = true;
    try {
      const data: Record<string, MetricPoint[]> = {};
      for (const [id, buf] of this.buffers.entries()) {
        data[id] = buf.toArray();
      }

      const snapshot: StoreSnapshot = {
        version: 1,
        savedAt: Date.now(),
        data,
      };

      const dir = path.dirname(this.snapshotFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const tempPath = `${this.snapshotFilePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(snapshot), 'utf8');
      fs.renameSync(tempPath, this.snapshotFilePath);
    } catch (err) {
      console.error('Failed writing snapshot sync:', err);
    } finally {
      this.isPersisting = false;
    }
  }

  public async flush(): Promise<void> {
    if (this.isPersisting) {
      return;
    }
    this.isPersisting = true;
    try {
      const data: Record<string, MetricPoint[]> = {};
      for (const [id, buf] of this.buffers.entries()) {
        data[id] = buf.toArray();
      }

      const snapshot: StoreSnapshot = {
        version: 1,
        savedAt: Date.now(),
        data,
      };

      const dir = path.dirname(this.snapshotFilePath);
      await fs.promises.mkdir(dir, { recursive: true });

      const tempPath = `${this.snapshotFilePath}.tmp`;
      await fs.promises.writeFile(tempPath, JSON.stringify(snapshot), 'utf8');
      await fs.promises.rename(tempPath, this.snapshotFilePath);
    } catch (err) {
      console.error('Failed writing snapshot async:', err);
    } finally {
      this.isPersisting = false;
    }
  }

  private loadSnapshot(): void {
    try {
      if (!fs.existsSync(this.snapshotFilePath)) {
        return;
      }
      const raw = fs.readFileSync(this.snapshotFilePath, 'utf8');
      if (!raw || raw.trim().length === 0) {
        return;
      }
      const parsed = JSON.parse(raw) as StoreSnapshot;
      if (!parsed || !parsed.data) {
        return;
      }

      for (const [monitorId, points] of Object.entries(parsed.data)) {
        if (!Array.isArray(points)) {
          continue;
        }
        const buf = new MetricRingBuffer(this.capacityPerMonitor);
        for (let i = 0; i < points.length; i++) {
          buf.push(points[i]);
        }
        this.buffers.set(monitorId, buf);
      }
    } catch (err) {
      console.error('Failed loading metric snapshot, starting fresh:', err);
    }
  }

  private startPersistence(): void {
    if (this.snapshotIntervalMs <= 0) {
      return;
    }
    this.persistTimer = setInterval(() => {
      this.flush().catch((err) => {
        console.error('Metric snapshot periodic error:', err);
      });
    }, this.snapshotIntervalMs);

    if (this.persistTimer.unref) {
      this.persistTimer.unref();
    }
  }

  public stop(): void {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = null;
    }
    this.flushSync();
  }
}

export const globalMetricStore = new MetricStore();
export default globalMetricStore;