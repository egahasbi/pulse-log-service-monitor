# PulseLog

Real-Time API Health Monitor & Synthetic Prober. Probe endpoints, calculate p50/p90/p99 latency metrics, trigger automated alert webhooks, track incident timelines.

## Architecture

- Client: React 18, Vite, Tailwind CSS, Recharts, Lucide Icons.
- Server: Node.js, Express, TypeScript, Server-Sent Events (SSE).
- Storage: In-memory store with periodic snapshotting / persistence layer.
- Prober: Node HTTP/HTTPS agent with synthetic cron timers and rolling window latency buffer.

## Quickstart

```bash
npm install
npm run build
npm run dev
```

Dashboard runs on `http://localhost:5173`. API server runs on `http://localhost:3000`.

---

## Webhook Alerting

PulseLog emits HTTP `POST` requests when monitor states transition between `HEALTHY`, `DEGRADED`, and `DOWN`.

### Delivery Headers

| Header | Description |
| :--- | :--- |
| `Content-Type` | `application/json` |
| `User-Agent` | `PulseLog-Webhook-Prober/1.0` |
| `X-PulseLog-Event` | Event identifier (`incident.triggered`, `incident.resolved`, `incident.escalated`) |
| `X-PulseLog-Timestamp` | Unix epoch millisecond string |
| `X-PulseLog-Signature` | Hex-encoded HMAC-SHA256 signature generated over `${timestamp}.${rawBody}` using configured monitor signing secret |

### Payload Schema

```json
{
  "eventId": "evt_01HZX87K4N8M1W2E3R4T5Y6U7I",
  "eventType": "incident.triggered",
  "timestamp": 1718020800000,
  "monitor": {
    "id": "mon_core_auth_api",
    "name": "Auth Service Probe",
    "targetUrl": "https://auth.internal.domain/v1/health",
    "intervalSeconds": 10,
    "timeoutMs": 3000,
    "thresholds": {
      "consecutiveFailures": 3,
      "latencyP95DegradedMs": 450,
      "latencyP99DownMs": 1200
    }
  },
  "incident": {
    "id": "inc_99ABC123XYZ",
    "status": "OPEN",
    "severity": "CRITICAL",
    "startedAt": 1718020780000,
    "resolvedAt": null,
    "reason": "Synthetic probe failed with HTTP 503 Service Unavailable for 3 consecutive attempts.",
    "metricsSnapshot": {
      "httpStatus": 503,
      "latencyMs": 3120,
      "p50Ms": 240,
      "p90Ms": 890,
      "p99Ms": 3120,
      "packetLossPercent": 33.3
    }
  }
}
```

---

## HMAC Signature Verification

PulseLog calculates HMAC-SHA256 over canonical string `${timestamp}.${rawJsonBody}`. Always use raw bytes before JSON parse. Do not re-serialize parsed objects; property order change breaks hash verification.

### Node.js (Express) Verification Example

```typescript
import crypto from 'node:crypto';
import express, { Request, Response, NextFunction } from 'express';

const app = express();
const WEBHOOK_SECRET = process.env.PULSELOG_WEBHOOK_SECRET || 'your-signing-secret';

// Capture raw body buffer for verification
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

function verifyPulseLogSignature(req: Request, res: Response, next: NextFunction) {
  const signatureHeader = req.header('X-PulseLog-Signature');
  const timestampHeader = req.header('X-PulseLog-Timestamp');

  if (!signatureHeader || !timestampHeader) {
    return res.status(401).json({ error: 'Missing security headers' });
  }

  // Prevent replay attacks (reject payloads older than 5 minutes)
  const webhookTime = parseInt(timestampHeader, 10);
  const currentTime = Date.now();
  if (Number.isNaN(webhookTime) || Math.abs(currentTime - webhookTime) > 300_000) {
    return res.status(401).json({ error: 'Webhook timestamp expired or invalid' });
  }

  const rawBody = (req as any).rawBody as Buffer;
  const canonicalPayload = `${timestampHeader}.${rawBody.toString('utf8')}`;

  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(canonicalPayload, 'utf8')
    .digest('hex');

  const signatureBuffer = Buffer.from(signatureHeader, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return res.status(401).json({ error: 'Invalid HMAC signature' });
  }

  return next();
}

app.post('/api/webhooks/pulselog', verifyPulseLogSignature, (req: Request, res: Response) => {
  const { eventType, monitor, incident } = req.body;

  console.log(`[PulseLog] Received valid event: ${eventType} for ${monitor.name}`);
  console.log(`Incident ID: ${incident.id}, Severity: ${incident.severity}`);

  res.status(200).json({ received: true });
});

app.listen(8080, () => console.log('Receiver running on port 8080'));
```

---

## Incident Retention & Eviction Policy

PulseLog keeps incident and probe time-series data bounded in memory to prevent heap leak.

### Eviction Rules

1. **Active Incidents (`status: "OPEN"`):**
   - Retained permanently in active memory until recovery probe triggers resolution.
   - Never evicted during active degradation.

2. **Resolved Incidents (`status: "RESOLVED"`):**
   - Maximum retention duration: **30 days** (`RETENTION_DAYS=30`).
   - Hard cap ceiling: **1,000 incident records** per monitor (`MAX_INCIDENTS_PER_MONITOR=1000`).
   - Buffer overflow policy: Oldest resolved incident dropped first (FIFO) when hard limit reached.

3. **Raw Probe Samples:**
   - Kept in sliding circular ring buffer.
   - Default capacity: **2,880 samples** per monitor (equivalent to 24 hours at 30-second interval).
   - Downsampled hourly into p50/p90/p99 aggregates before drop.

### Manual Cleanup Endpoint

Force clean stale historical items via maintenance route:

```bash
POST /api/v1/maintenance/cleanup
Content-Type: application/json
Authorization: Bearer <ADMIN_API_KEY>

{
  "olderThanDays": 14,
  "purgeResolvedOnly": true
}
```