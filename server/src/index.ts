import http from 'http';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import monitorRoutes from './routes/monitors';
import { runSchedulerTick, probeAllMonitors } from './services/prober';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
const SCHEDULER_INTERVAL_MS = process.env.SCHEDULER_INTERVAL_MS
  ? parseInt(process.env.SCHEDULER_INTERVAL_MS, 10)
  : 1000;

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/monitors', monitorRoutes);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

const server = http.createServer(app);

let isTickRunning = false;

const schedulerTimer = setInterval(async () => {
  if (isTickRunning) {
    return;
  }
  isTickRunning = true;
  try {
    await runSchedulerTick();
  } catch (error) {
    console.error('Scheduler tick failure:', error);
  } finally {
    isTickRunning = false;
  }
}, SCHEDULER_INTERVAL_MS);

server.listen(PORT, async () => {
  console.log(`PulseLog server running on port ${PORT}`);
  try {
    await probeAllMonitors();
  } catch (error) {
    console.error('Initial probe run failure:', error);
  }
});

function gracefulShutdown(signal: string) {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  clearInterval(schedulerTimer);
  server.close(() => {
    console.log('HTTP server closed. Exiting process.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Force exiting due to pending handles.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { app, server };