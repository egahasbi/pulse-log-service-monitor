export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type MonitorStatus = 'UP' | 'DOWN' | 'DEGRADED' | 'PAUSED' | 'PENDING';

export type IncidentStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface WebhookAlertConfig {
  url: string;
  enabled: boolean;
  failureThreshold: number;
  recoveryThreshold: number;
  headers?: Record<string, string>;
  sendResolved: boolean;
}

export interface MonitorHeader {
  key: string;
  value: string;
}

export interface Monitor {
  id: string;
  name: string;
  url: string;
  method: HttpMethod;
  headers?: MonitorHeader[];
  body?: string;
  intervalMs: number;
  timeoutMs: number;
  expectedStatusCodes: number[];
  status: MonitorStatus;
  consecutiveFailures: number;
  alertConfig?: WebhookAlertConfig;
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
  responseHeaders?: Record<string, string>;
  responseBodySnippet?: string;
}

export interface LatencyMetrics {
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  avg: number;
}

export interface MonitorStats {
  monitorId: string;
  uptimePercentage: number;
  totalProbes: number;
  successfulProbes: number;
  failedProbes: number;
  latencyMetrics: LatencyMetrics;
  lastProbe?: ProbeResult;
}

export interface AlertEvent {
  id: string;
  monitorId: string;
  monitorName: string;
  severity: AlertSeverity;
  type: 'DOWN' | 'RECOVERED' | 'LATENCY_HIGH' | 'DEGRADED';
  message: string;
  timestamp: string;
  consecutiveFailures: number;
  probeResult?: ProbeResult;
}

export interface IncidentSummary {
  id: string;
  monitorId: string;
  monitorName: string;
  status: IncidentStatus;
  startedAt: string;
  resolvedAt?: string;
  durationMs?: number;
  rootCause: string;
  failureCount: number;
  lastStatusCode?: number;
  acknowledgedAt?: string;
}

export interface CreateMonitorInput {
  name: string;
  url: string;
  method?: HttpMethod;
  headers?: MonitorHeader[];
  body?: string;
  intervalMs?: number;
  timeoutMs?: number;
  expectedStatusCodes?: number[];
  alertConfig?: WebhookAlertConfig;
}

export interface UpdateMonitorInput {
  name?: string;
  url?: string;
  method?: HttpMethod;
  headers?: MonitorHeader[];
  body?: string;
  intervalMs?: number;
  timeoutMs?: number;
  expectedStatusCodes?: number[];
  status?: MonitorStatus;
  alertConfig?: WebhookAlertConfig;
}

export interface DashboardOverview {
  monitorsCount: number;
  upCount: number;
  downCount: number;
  degradedCount: number;
  pausedCount: number;
  globalUptime: number;
  activeIncidents: IncidentSummary[];
  recentAlerts: AlertEvent[];
}

export interface WebSocketMessage<T = unknown> {
  event: 'PROBE_RESULT' | 'MONITOR_STATUS_CHANGE' | 'ALERT_TRIGGERED' | 'INCIDENT_UPDATE';
  payload: T;
  timestamp: string;
}