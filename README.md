# PulseLog - Real-Time API Health Monitor & Synthetic Prober

Full-stack observability system. Schedule HTTP synthetic health probes, track response latency percentiles (p50, p90, p99), trigger alerting thresholds, render live status pages.

## Architecture

```
+-------------------------------------------------------------+
|                      Client (React + Vite)                  |
|  - LatencyChart (Recharts / Canvas latency distribution)    |
|  - MonitorCard (Per-target health status, SLA, jitter)      |
|  - Polling / Event synchronization                          |
+------------------------------+------------------------------+
                               |
                        HTTP / REST API
                               |
+------------------------------v------------------------------+
|                 Server Engine (Node.js + Express)           |
|                                                             |
|  +------------------------+     +------------------------+  |
|  | routes/monitors.ts     |     | services/prober.ts     |  |
|  | - Monitor CRUD         |     | - Interval scheduler   |  |
|  | - Metric aggregations  |     | - HTTP probe runner    |  |
|  | - Incident reports     |     | - Latency calculator   |  |
|  +-----------+------------+     +-----------+------------+  |
|              |                              |               |
|              +--------------+---------------+               |
|                             |                               |
|              +--------------v---------------+               |
|              | services/store.ts            |               |
|              | - In-memory / persistent log |               |
|              | - Percentile sliding window  |               |
|              +------------------------------+               |
+-------------------------------------------------------------+
                               |
                       Network Probes
                               |
+------------------------------v------------------------------+
|               Target External Endpoints / APIs              |
+-------------------------------------------------------------+
```

## Directory Structure

```
.
├── client/                 # React frontend (Vite, Tailwind CSS, TypeScript)
│   ├── src/
│   │   ├── components/     # UI widgets: LatencyChart, MonitorCard
│   │   ├── App.tsx         # Main dashboard view
│   │   └── index.css       # Tailwind utility classes
│   └── vite.config.ts      # Vite bundler configuration
├── server/                 # Express API server (Node.js, TypeScript)
│   ├── src/
│   │   ├── routes/         # API endpoints (monitors.ts)
│   │   ├── services/       # Core probe scheduler (prober.ts) & state (store.ts)
│   │   └── index.ts        # Entry point and HTTP listener
│   └── tsconfig.json       # Node TypeScript compilation config
├── shared/                 # Shared TypeScript models and interfaces
│   └── types.ts            # Probe result, monitor, metric type definitions
├── package.json            # Root workspace config (npm workspaces)
└── tsconfig.base.json      # Shared compiler options
```

## Local Development Runbook

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

### Installation

Install root and workspace dependencies:

```bash
npm install
```

### Run Locally

Run both server (port 3001) and client (port 5173) concurrently:

```bash
npm run dev
```

Run server only:

```bash
npm run dev:server
```

Run client only:

```bash
npm run dev:client
```

### Build

Compile shared types, server backend, and Vite frontend production assets:

```bash
npm run build
```

### Production Execution

Run production backend build:

```bash
npm run start
```

## API Documentation

Base URL: `http://localhost:3001/api`

### 1. List Monitors

Retrieve all registered synthetic probers and recent metrics.

- **URL:** `/monitors`
- **Method:** `GET`
- **Response Code:** `200 OK`
- **Response Body:**

```json
[
  {
    "id": "mon_xyz123",
    "name": "Payments Gateway Probe",
    "url": "https://api.stripe.com/healthcheck",
    "intervalMs": 10000,
    "timeoutMs": 3000,
    "status": "UP",
    "lastChecked": "2025-01-15T10:00:00.000Z",
    "metrics": {
      "p50": 42.5,
      "p90": 85.2,
      "p99": 140.0,
      "uptimePercent": 99.98
    }
  }
]
```

### 2. Create Monitor

Register new synthetic probe target.

- **URL:** `/monitors`
- **Method:** `POST`
- **Headers:** `Content-Type: application/json`
- **Request Body:**

```json
{
  "name": "Auth Service",
  "url": "https://auth.internal.net/health",
  "intervalMs": 15000,
  "timeoutMs": 2000,
  "expectedStatus": 200
}
```

- **Response Code:** `201 Created`
- **Response Body:**

```json
{
  "id": "mon_abc789",
  "name": "Auth Service",
  "url": "https://auth.internal.net/health",
  "intervalMs": 15000,
  "timeoutMs": 2000,
  "expectedStatus": 200,
  "status": "PENDING",
  "createdAt": "2025-01-15T10:05:00.000Z"
}
```

### 3. Get Monitor Details

Fetch specific probe state and full history ring buffer.

- **URL:** `/monitors/:id`
- **Method:** `GET`
- **Response Code:** `200 OK` | `404 Not Found`
- **Response Body:**

```json
{
  "id": "mon_abc789",
  "name": "Auth Service",
  "url": "https://auth.internal.net/health",
  "intervalMs": 15000,
  "timeoutMs": 2000,
  "status": "UP",
  "history": [
    {
      "timestamp": "2025-01-15T10:05:15.000Z",
      "statusCode": 200,
      "latencyMs": 31.4,
      "ok": true
    }
  ]
}
```

### 4. Delete Monitor

Deregister synthetic probe and cancel internal polling timer.

- **URL:** `/monitors/:id`
- **Method:** `DELETE`
- **Response Code:** `204 No Content` | `404 Not Found`

## Environment Variables

| Variable | Target | Description | Default |
| :--- | :--- | :--- | :--- |
| `PORT` | server | HTTP port for server listener | `3001` |
| `NODE_ENV` | server | Runtime environment (`development`/`production`) | `development` |
| `VITE_API_URL` | client | Express server backend origin | `http://localhost:3001` |