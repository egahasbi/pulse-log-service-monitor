import React, { useState, useEffect, useCallback, useMemo } from 'react';
import MonitorCard from './components/MonitorCard';
import LatencyChart from './components/LatencyChart';
import { Monitor, CreateMonitorInput, ProbeResult } from '../../shared/types';

const API_BASE = '/api/monitors';
const POLLING_INTERVAL = 3000;

interface MonitorHistoryMap {
  [monitorId: string]: ProbeResult[];
}

export default function App() {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [history, setHistory] = useState<MonitorHistoryMap>({});
  const [selectedMonitorId, setSelectedMonitorId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD'>('GET');
  const [interval, setIntervalVal] = useState<number>(10);
  const [expectedStatus, setExpectedStatus] = useState<number>(200);
  const [latencyThreshold, setLatencyThreshold] = useState<number>(500);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const fetchMonitors = useCallback(async () => {
    try {
      const res = await fetch(API_BASE);
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch monitors`);
      const data: Monitor[] = await res.json();
      setMonitors(data);

      if (data.length > 0 && !selectedMonitorId) {
        setSelectedMonitorId(data[0].id);
      }
      setError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown network error';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [selectedMonitorId]);

  const fetchHistory = useCallback(async (monitorId: string) => {
    try {
      const res = await fetch(`${API_BASE}/${monitorId}/history`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch history`);
      const data: ProbeResult[] = await res.json();
      setHistory((prev) => ({ ...prev, [monitorId]: data }));
    } catch (err: unknown) {
      console.error(`Failed to get history for ${monitorId}:`, err);
    }
  }, []);

  useEffect(() => {
    fetchMonitors();
    const intervalId = setInterval(() => {
      fetchMonitors();
    }, POLLING_INTERVAL);
    return () => clearInterval(intervalId);
  }, [fetchMonitors]);

  useEffect(() => {
    if (selectedMonitorId) {
      fetchHistory(selectedMonitorId);
      const historyIntervalId = setInterval(() => {
        fetchHistory(selectedMonitorId);
      }, POLLING_INTERVAL);
      return () => clearInterval(historyIntervalId);
    }
  }, [selectedMonitorId, fetchHistory]);

  const handleCreateTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const payload: CreateMonitorInput = {
      name,
      url,
      method,
      interval: Number(interval),
      expectedStatus: Number(expectedStatus),
      latencyThreshold: Number(latencyThreshold)
    };

    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `HTTP ${res.status}: Failed to create monitor`);
      }
      const newMonitor: Monitor = await res.json();
      setMonitors((prev) => [newMonitor, ...prev]);
      setSelectedMonitorId(newMonitor.id);
      setIsModalOpen(false);

      // Reset form
      setName('');
      setUrl('');
      setMethod('GET');
      setIntervalVal(10);
      setExpectedStatus(200);
      setLatencyThreshold(500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Target creation failed';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteMonitor = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to delete monitor`);
      setMonitors((prev) => prev.filter((m) => m.id !== id));
      if (selectedMonitorId === id) {
        const remaining = monitors.filter((m) => m.id !== id);
        setSelectedMonitorId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Target deletion failed';
      setError(message);
    }
  };

  const handleTriggerProbe = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${API_BASE}/${id}/probe`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}: Force probe failed`);
      fetchMonitors();
      fetchHistory(id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Force probe request failed';
      setError(message);
    }
  };

  const selectedMonitor = useMemo(
    () => monitors.find((m) => m.id === selectedMonitorId) || null,
    [monitors, selectedMonitorId]
  );

  const selectedHistory = useMemo(
    () => (selectedMonitorId ? history[selectedMonitorId] || [] : []),
    [history, selectedMonitorId]
  );

  const globalStats = useMemo(() => {
    const total = monitors.length;
    const up = monitors.filter((m) => m.status === 'UP').length;
    const down = monitors.filter((m) => m.status === 'DOWN').length;
    const degraded = monitors.filter((m) => m.status === 'DEGRADED').length;
    return { total, up, down, degraded };
  }, [monitors]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 bg-emerald-500 rounded flex items-center justify-center font-bold text-slate-950 shadow-lg shadow-emerald-500/20">
            P
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white leading-tight">PulseLog</h1>
            <p className="text-xs text-slate-400">Synthetic Health & Latency Monitor</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm rounded transition cursor-pointer shadow-sm shadow-emerald-500/30"
          >
            + Add Target
          </button>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto flex flex-col gap-6">
        {/* Metric Bar */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <span className="text-xs text-slate-400 block font-medium">TOTAL PROBES</span>
            <span className="text-2xl font-bold text-white mt-1 block">{globalStats.total}</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <span className="text-xs text-slate-400 block font-medium">ONLINE (HEALTHY)</span>
            <span className="text-2xl font-bold text-emerald-400 mt-1 block">{globalStats.up}</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <span className="text-xs text-slate-400 block font-medium">DEGRADED (LATENCY)</span>
            <span className="text-2xl font-bold text-amber-400 mt-1 block">{globalStats.degraded}</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <span className="text-xs text-slate-400 block font-medium">CRITICAL (DOWN)</span>
            <span className="text-2xl font-bold text-rose-500 mt-1 block">{globalStats.down}</span>
          </div>
        </section>

        {error && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-sm flex justify-between items-center">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-rose-400 hover:text-rose-200 font-bold ml-4"
            >
              x
            </button>
          </div>
        )}

        {/* Dynamic Split Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Target Cards Column */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Targets</h2>
            {loading && monitors.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 text-center text-slate-400">
                Polling initial monitor states...
              </div>
            ) : monitors.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 text-center text-slate-500 flex flex-col items-center gap-3">
                <p>No synthetic probers registered.</p>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm rounded border border-slate-700"
                >
                  Configure first target
                </button>
              </div>
            ) : (
              monitors.map((mon) => (
                <div
                  key={mon.id}
                  onClick={() => setSelectedMonitorId(mon.id)}
                  className={`cursor-pointer transition rounded-lg border ${
                    selectedMonitorId === mon.id
                      ? 'border-emerald-500/60 ring-1 ring-emerald-500/20'
                      : 'border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <MonitorCard
                    monitor={mon}
                    onDelete={(e) => handleDeleteMonitor(mon.id, e)}
                    onProbe={(e) => handleTriggerProbe(mon.id, e)}
                  />
                </div>
              ))
            )}
          </div>

          {/* Active Target Diagnostics Column */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Diagnostics</h2>
            {selectedMonitor ? (
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col gap-6">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">{selectedMonitor.name}</h3>
                    <p className="text-xs font-mono text-slate-400 mt-0.5 break-all">
                      {selectedMonitor.method} {selectedMonitor.url}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => handleTriggerProbe(selectedMonitor.id, e)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs border border-slate-700 font-medium"
                    >
                      Instant Probe
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                  <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                    <span className="text-slate-500 block">EXPECT STATUS</span>
                    <span className="text-slate-200 font-semibold">{selectedMonitor.expectedStatus}</span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                    <span className="text-slate-500 block">THRESHOLD</span>
                    <span className="text-slate-200 font-semibold">{selectedMonitor.latencyThreshold}ms</span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                    <span className="text-slate-500 block">CADENCE</span>
                    <span className="text-slate-200 font-semibold">{selectedMonitor.interval}s</span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                    <span className="text-slate-500 block">LAST STATUS</span>
                    <span
                      className={`font-semibold ${
                        selectedMonitor.status === 'UP'
                          ? 'text-emerald-400'
                          : selectedMonitor.status === 'DEGRADED'
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {selectedMonitor.status}
                    </span>
                  </div>
                </div>

                {/* Response Chart */}
                <div className="mt-2">
                  <h4 className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">
                    Response Latency (ms)
                  </h4>
                  <LatencyChart history={selectedHistory} threshold={selectedMonitor.latencyThreshold} />
                </div>
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-12 text-center text-slate-500">
                Select a configured probe target to inspect telemetry.
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Target Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex justify-between items-center mb-5 border-b border-slate-800 pb-3">
              <h3 className="text-base font-semibold text-white">Create Prober Target</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTarget} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Target Name</label>
                <input
                  type="text"
                  required
                  placeholder="Billing Microservice"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Target URL</label>
                <div className="flex gap-2">
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as any)}
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                    <option value="HEAD">HEAD</option>
                  </select>
                  <input
                    type="url"
                    required
                    placeholder="https://api.domain.com/healthz"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-100 font-mono placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Interval (s)</label>
                  <input
                    type="number"
                    min="1"
                    max="3600"
                    required
                    value={interval}
                    onChange={(e) => setIntervalVal(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Expect Code</label>
                  <input
                    type="number"
                    min="100"
                    max="599"
                    required
                    value={expectedStatus}
                    onChange={(e) => setExpectedStatus(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Limit (ms)</label>
                  <input
                    type="number"
                    min="1"
                    max="60000"
                    required
                    value={latencyThreshold}
                    onChange={(e) => setLatencyThreshold(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded text-sm transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Registering...' : 'Save Target'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}