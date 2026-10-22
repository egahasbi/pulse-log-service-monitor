import React, { useState } from 'react';
import { LatencyChart } from './LatencyChart';
import { AlertConfigModal } from './AlertConfigModal';
import { IncidentHistory } from './IncidentHistory';
import { Monitor, ProbeResult, Incident } from '../../../shared/types';

interface MonitorCardProps {
  monitor: Monitor;
  results: ProbeResult[];
  incidents: Incident[];
  onTriggerProbe?: (monitorId: string) => Promise<void>;
  onDeleteMonitor?: (monitorId: string) => Promise<void>;
  onUpdateAlertConfig?: (monitorId: string, alertConfig: Monitor['alertConfig']) => Promise<void>;
}

export const MonitorCard: React.FC<MonitorCardProps> = ({
  monitor,
  results,
  incidents,
  onTriggerProbe,
  onDeleteMonitor,
  onUpdateAlertConfig,
}) => {
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [isIncidentsOpen, setIsIncidentsOpen] = useState(false);
  const [isProbing, setIsProbing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const monitorResults = results.filter((r) => r.monitorId === monitor.id);
  const monitorIncidents = incidents.filter((inc) => inc.monitorId === monitor.id);
  const activeIncidents = monitorIncidents.filter((inc) => inc.status === 'open');
  const latestResult = monitorResults[monitorResults.length - 1];

  const isHealthy = latestResult ? latestResult.status >= 200 && latestResult.status < 400 : true;
  const alertConfigured = Boolean(
    monitor.alertConfig &&
    (monitor.alertConfig.email ||
      monitor.alertConfig.webhookUrl ||
      monitor.alertConfig.latencyThresholdMs ||
      monitor.alertConfig.consecutiveFailuresThreshold)
  );

  const handleProbe = async () => {
    if (!onTriggerProbe || isProbing) return;
    try {
      setIsProbing(true);
      await onTriggerProbe(monitor.id);
    } finally {
      setIsProbing(false);
    }
  };

  const handleDelete = async () => {
    if (!onDeleteMonitor || isDeleting) return;
    if (!window.confirm(`Delete monitor "${monitor.name}"?`)) return;
    try {
      setIsDeleting(true);
      await onDeleteMonitor(monitor.id);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-lg flex flex-col gap-4 text-slate-100 transition-all hover:border-slate-700">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`w-3 h-3 rounded-full ${
                latestResult
                  ? isHealthy
                    ? 'bg-emerald-500 animate-pulse'
                    : 'bg-rose-500 animate-pulse'
                  : 'bg-slate-500'
              }`}
            />
            <h3 className="text-lg font-semibold tracking-tight text-white">{monitor.name}</h3>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-cyan-400">
              {monitor.method}
            </span>

            {alertConfigured ? (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-700/60 text-cyan-300">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                Alerts active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400">
                Alerts off
              </span>
            )}

            {activeIncidents.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-rose-950/80 border border-rose-700/60 text-rose-300 animate-bounce">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                {activeIncidents.length} active incident{activeIncidents.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="text-xs font-mono text-slate-400 break-all">{monitor.url}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsAlertModalOpen(true)}
            title="Configure Alert Rules"
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          <button
            onClick={handleProbe}
            disabled={isProbing}
            title="Probe Now"
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-cyan-400 disabled:opacity-50 transition"
          >
            <svg className={`w-4 h-4 ${isProbing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          {onDeleteMonitor && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              title="Delete Monitor"
              className="p-1.5 rounded bg-slate-800 hover:bg-rose-900/60 border border-slate-700 hover:border-rose-700 text-slate-400 hover:text-rose-300 disabled:opacity-50 transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800/80">
          <span className="text-slate-500 block">Status</span>
          <span className={`font-mono font-medium ${latestResult?.status && isHealthy ? 'text-emerald-400' : 'text-rose-400'}`}>
            {latestResult?.status ? `${latestResult.status} ${latestResult.statusText || ''}` : 'No Probes'}
          </span>
        </div>
        <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800/80">
          <span className="text-slate-500 block">Latency</span>
          <span className="font-mono font-medium text-slate-200">
            {latestResult?.latencyMs !== undefined ? `${latestResult.latencyMs}ms` : '--'}
          </span>
        </div>
        <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800/80">
          <span className="text-slate-500 block">Interval</span>
          <span className="font-mono font-medium text-slate-200">{monitor.intervalSeconds}s</span>
        </div>
        <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800/80">
          <span className="text-slate-500 block">Incidents</span>
          <span className="font-mono font-medium text-slate-200">{monitorIncidents.length}</span>
        </div>
      </div>

      <div className="w-full bg-slate-950/40 border border-slate-800/60 rounded p-2">
        <LatencyChart data={monitorResults} />
      </div>

      <div className="border-t border-slate-800 pt-3">
        <button
          onClick={() => setIsIncidentsOpen(!isIncidentsOpen)}
          className="w-full flex items-center justify-between text-xs font-medium text-slate-400 hover:text-slate-200 transition py-1 px-1 rounded hover:bg-slate-800/40"
        >
          <span className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Incident History ({monitorIncidents.length})
          </span>
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${isIncidentsOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isIncidentsOpen && (
          <div className="mt-2 pt-2 border-t border-slate-800/60 max-h-64 overflow-y-auto">
            <IncidentHistory incidents={monitorIncidents} />
          </div>
        )}
      </div>

      {isAlertModalOpen && (
        <AlertConfigModal
          monitor={monitor}
          isOpen={isAlertModalOpen}
          onClose={() => setIsAlertModalOpen(false)}
          onSave={async (config) => {
            if (onUpdateAlertConfig) {
              await onUpdateAlertConfig(monitor.id, config);
            }
            setIsAlertModalOpen(false);
          }}
        />
      )}
    </div>
  );
};

export default MonitorCard;