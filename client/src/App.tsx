import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MonitorCard } from './components/MonitorCard';
import { IncidentHistory } from './components/IncidentHistory';
import { LatencyChart } from './components/LatencyChart';
import { AlertConfigModal } from './components/AlertConfigModal';
import { Monitor, Incident, AlertConfig, ProbeResult } from '../../shared/types';

export const App: React.FC = () => {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [probeResults, setProbeResults] = useState<Record<string, ProbeResult[]>>({});
  const [selectedMonitorId, setSelectedMonitorId] = useState<string | null>(null);
  const [editingAlertMonitor, setEditingAlertMonitor] = useState<Monitor | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newMonitor, setNewMonitor] = useState({
    name: '',
    url: '',
    interval: 10,
    timeout: 5000,
    expectedStatus: 200,
  });

  const failureDetectedRef = useRef(false);

  const fetchIncidents = useCallback(async () => {
    try {
      const res = await fetch('/api/incidents');
      if (!res.ok) throw new Error('Fetch incidents fail');
      const data: Incident[] = await res.json();
      setIncidents(data);
    } catch (err: unknown) {
      console.error(err);
    }
  }, []);

  const fetchProbeResults = useCallback(async (monitorId: string) => {
    try {
      const res = await fetch(`/api/monitors/${monitorId}/probes`);
      if (!res.ok) return;
      const data: ProbeResult[] = await res.json();
      setProbeResults((prev) => ({ ...prev, [monitorId]: data }));
    } catch (err: unknown) {
      console.error(err);
    }
  }, []);

  const fetchMonitors = useCallback(async () => {
    try {
      const res = await fetch('/api/monitors');
      if (!res.ok) throw new Error('Fetch monitors fail');
      const data: Monitor[] = await res.json();
      setMonitors(data);

      const hasDown = data.some((m) => m.status === 'down');
      failureDetectedRef.current = hasDown;

      if (hasDown) {
        await fetchIncidents();
      }

      data.forEach((m) => {
        fetchProbeResults(m.id);
      });

      if (!selectedMonitorId && data.length > 0) {
        setSelectedMonitorId(data[0].id);
      }
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [fetchIncidents, fetchProbeResults, selectedMonitorId]);

  useEffect(() => {
    fetchMonitors();
    fetchIncidents();

    const monitorInterval = setInterval(fetchMonitors, 5000);
    return () => clearInterval(monitorInterval);
  }, [fetchMonitors, fetchIncidents]);

  useEffect(() => {
    let incidentInterval: NodeJS.Timeout | null = null;
    if (failureDetectedRef.current) {
      incidentInterval = setInterval(fetchIncidents, 3000);
    }
    return () => {
      if (incidentInterval) clearInterval(incidentInterval);
    };
  }, [monitors, fetchIncidents]);

  const handleCreateMonitor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/monitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newMonitor,
          interval: Number(newMonitor.interval),
          timeout: Number(newMonitor.timeout),
          expectedStatus: Number(newMonitor.expectedStatus),
        }),
      });
      if (!res.ok) throw new Error('Create monitor fail');
      const created: Monitor = await res.json();
      setMonitors((prev) => [...prev, created]);
      setIsCreating(false);
      setNewMonitor({
        name: '',
        url: '',
        interval: 10,
        timeout: 5000,
        expectedStatus: 200,
      });
      setSelectedMonitorId(created.id);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Create fail');
    }
  };

  const handleDeleteMonitor = async (id: string) => {
    if (!confirm('Delete monitor?')) return;
    try {
      const res = await fetch(`/api/monitors/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete fail');
      setMonitors((prev) => prev.filter((m) => m.id !== id));
      if (selectedMonitorId === id) {
        setSelectedMonitorId(monitors.find((m) => m.id !== id)?.id || null);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Delete fail');
    }
  };

  const handleUpdateAlertConfig = async (monitorId: string, alertConfig: AlertConfig) => {
    try {
      const res = await fetch(`/api/monitors/${monitorId}/alerts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertConfig),
      });
      if (!res.ok) throw new Error('Update alert config fail');
      const updated: Monitor = await res.json();
      setMonitors((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setEditingAlertMonitor(null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Update alert fail');
    }
  };

  const selectedMonitor = monitors.find((m) => m.id === selectedMonitorId) || null;
  const selectedProbes = selectedMonitorId ? probeResults[selectedMonitorId] || [] : [];
  const selectedIncidents = selectedMonitorId
    ? incidents.filter((inc) => inc.monitorId === selectedMonitorId)
    : incidents;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      <header className="border-b border-slate-800 bg-slate-950 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
          <h1 className="text-xl font-bold tracking-tight text-white">PulseLog</h1>
          <span className="text-xs font-mono uppercase bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
            Observability Engine
          </span>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded shadow transition"
        >
          Add Monitor
        </button>
      </header>

      {error && (
        <div className="bg-rose-950 border-b border-rose-800 text-rose-200 px-6 py-2 text-sm">
          {error}
        </div>
      )}

      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden">
        <div className="lg:col-span-4 flex flex-col gap-4 overflow-y-auto">
          <h2 className="text-sm font-semibold uppercase text-slate-400 tracking-wider">
            Monitors ({monitors.length})
          </h2>
          {loading && monitors.length === 0 ? (
            <div className="text-slate-500 text-sm">Loading monitors...</div>
          ) : monitors.length === 0 ? (
            <div className="text-slate-500 text-sm">No monitors configured. Add one.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {monitors.map((m) => (
                <div
                  key={m.id}
                  onClick={() => setSelectedMonitorId(m.id)}
                  className={`cursor-pointer rounded-lg border transition ${
                    selectedMonitorId === m.id
                      ? 'border-emerald-500 bg-slate-800/80 shadow-lg ring-1 ring-emerald-500'
                      : 'border-slate-800 bg-slate-800/40 hover:border-slate-700'
                  }`}
                >
                  <MonitorCard
                    monitor={m}
                    onDelete={() => handleDeleteMonitor(m.id)}
                    onConfigureAlerts={() => setEditingAlertMonitor(m)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-8 flex flex-col gap-6 overflow-y-auto">
          {selectedMonitor ? (
            <>
              <div className="bg-slate-800/40 border border-slate-800 rounded-lg p-5">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-white">{selectedMonitor.name}</h2>
                    <p className="text-sm font-mono text-slate-400">{selectedMonitor.url}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingAlertMonitor(selectedMonitor)}
                      className="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded text-slate-200 transition"
                    >
                      Alert Settings
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="bg-slate-900/60 p-3 rounded border border-slate-800/80">
                    <span className="text-xs text-slate-500 uppercase font-semibold">Status</span>
                    <div className="text-lg font-bold mt-1 capitalize flex items-center gap-2">
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${
                          selectedMonitor.status === 'up'
                            ? 'bg-emerald-400'
                            : selectedMonitor.status === 'down'
                            ? 'bg-rose-500'
                            : 'bg-amber-400'
                        }`}
                      />
                      {selectedMonitor.status}
                    </div>
                  </div>
                  <div className="bg-slate-900/60 p-3 rounded border border-slate-800/80">
                    <span className="text-xs text-slate-500 uppercase font-semibold">Interval</span>
                    <div className="text-lg font-bold mt-1 text-slate-200 font-mono">
                      {selectedMonitor.interval}s
                    </div>
                  </div>
                  <div className="bg-slate-900/60 p-3 rounded border border-slate-800/80">
                    <span className="text-xs text-slate-500 uppercase font-semibold">P95 Latency</span>
                    <div className="text-lg font-bold mt-1 text-slate-200 font-mono">
                      {selectedProbes.length > 0
                        ? `${Math.round(
                            selectedProbes
                              .map((p) => p.latency)
                              .sort((a, b) => a - b)[
                              Math.floor(selectedProbes.length * 0.95)
                            ] || 0
                          )}ms`
                        : 'N/A'}
                    </div>
                  </div>
                </div>

                <LatencyChart data={selectedProbes} />
              </div>

              <div className="bg-slate-800/40 border border-slate-800 rounded-lg p-5">
                <h3 className="text-sm font-semibold uppercase text-slate-400 tracking-wider mb-4">
                  Incidents ({selectedIncidents.length})
                </h3>
                <IncidentHistory incidents={selectedIncidents} />
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-500 border border-slate-800 rounded-lg">
              Select monitor to inspect metrics.
            </div>
          )}
        </div>
      </main>

      {isCreating && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleCreateMonitor}
            className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-lg p-6 flex flex-col gap-4 shadow-xl"
          >
            <h3 className="text-lg font-bold text-white">Create Health Probe</h3>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-400 block mb-1">
                Name
              </label>
              <input
                required
                type="text"
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                value={newMonitor.name}
                onChange={(e) => setNewMonitor({ ...newMonitor, name: e.target.value })}
                placeholder="Billing API Health"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-400 block mb-1">
                Endpoint URL
              </label>
              <input
                required
                type="url"
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                value={newMonitor.url}
                onChange={(e) => setNewMonitor({ ...newMonitor, url: e.target.value })}
                placeholder="https://api.example.com/health"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-semibold uppercase text-slate-400 block mb-1">
                  Interval (s)
                </label>
                <input
                  required
                  type="number"
                  min="1"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  value={newMonitor.interval}
                  onChange={(e) => setNewMonitor({ ...newMonitor, interval: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-slate-400 block mb-1">
                  Timeout (ms)
                </label>
                <input
                  required
                  type="number"
                  min="100"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  value={newMonitor.timeout}
                  onChange={(e) => setNewMonitor({ ...newMonitor, timeout: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-slate-400 block mb-1">
                  Status
                </label>
                <input
                  required
                  type="number"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  value={newMonitor.expectedStatus}
                  onChange={(e) =>
                    setNewMonitor({ ...newMonitor, expectedStatus: Number(e.target.value) })
                  }
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-4 py-2 text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {editingAlertMonitor && (
        <AlertConfigModal
          monitor={editingAlertMonitor}
          onClose={() => setEditingAlertMonitor(null)}
          onSave={(config) => handleUpdateAlertConfig(editingAlertMonitor.id, config)}
        />
      )}
    </div>
  );
};

export default App;