import React, { useState } from 'react';
import { Monitor, MonitorStatus } from '../../../shared/types';

interface MonitorCardProps {
  monitor: Monitor;
  onToggleStatus: (id: string, active: boolean) => Promise<void>;
  onTriggerCheck?: (id: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onClick?: (id: string) => void;
}

export const MonitorCard: React.FC<MonitorCardProps> = ({
  monitor,
  onToggleStatus,
  onTriggerCheck,
  onDelete,
  onClick,
}) => {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const getStatusBadge = (status: MonitorStatus, isActive: boolean) => {
    if (!isActive) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
          <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-zinc-500"></span>
          Paused
        </span>
      );
    }

    switch (status) {
      case 'UP':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
            <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Operational
          </span>
        );
      case 'DEGRADED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-950/80 text-amber-400 border border-amber-800/60">
            <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-amber-400"></span>
            Degraded
          </span>
        );
      case 'DOWN':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-950/80 text-rose-400 border border-rose-800/60">
            <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-rose-500 animate-ping"></span>
            Down
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
            <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-zinc-400"></span>
            Pending
          </span>
        );
    }
  };

  const getStatusCodeBadge = (statusCode?: number) => {
    if (!statusCode) {
      return <span className="text-xs font-mono text-zinc-500">N/A</span>;
    }

    let color = 'text-zinc-400 bg-zinc-800/70 border-zinc-700';
    if (statusCode >= 200 && statusCode < 300) {
      color = 'text-emerald-400 bg-emerald-950/40 border-emerald-800/50';
    } else if (statusCode >= 300 && statusCode < 400) {
      color = 'text-blue-400 bg-blue-950/40 border-blue-800/50';
    } else if (statusCode >= 400 && statusCode < 500) {
      color = 'text-amber-400 bg-amber-950/40 border-amber-800/50';
    } else if (statusCode >= 500) {
      color = 'text-rose-400 bg-rose-950/40 border-rose-800/50';
    }

    return (
      <span className={`px-2 py-0.5 font-mono text-xs rounded border ${color}`}>
        {statusCode}
      </span>
    );
  };

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setLoadingAction('toggle');
      await onToggleStatus(monitor.id, !monitor.active);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleTrigger = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onTriggerCheck) return;
    try {
      setLoadingAction('trigger');
      await onTriggerCheck(monitor.id);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDelete) return;
    try {
      setLoadingAction('delete');
      await onDelete(monitor.id);
    } finally {
      setLoadingAction(null);
    }
  };

  const uptime = monitor.uptimePercentage !== undefined ? monitor.uptimePercentage : 100;
  const uptimeColor =
    uptime >= 99 ? 'text-emerald-400' : uptime >= 95 ? 'text-amber-400' : 'text-rose-400';

  return (
    <div
      onClick={() => onClick && onClick(monitor.id)}
      className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 hover:border-zinc-700 transition duration-150 ease-in-out cursor-pointer relative shadow-sm hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-semibold border border-zinc-700">
              {monitor.method || 'GET'}
            </span>
            <h3 className="text-base font-semibold text-zinc-100 truncate" title={monitor.name}>
              {monitor.name}
            </h3>
            {getStatusBadge(monitor.status, monitor.active)}
          </div>
          <p className="text-xs font-mono text-zinc-400 truncate max-w-md" title={monitor.url}>
            {monitor.url}
          </p>
        </div>

        <div className="flex items-center space-x-1">
          {onTriggerCheck && (
            <button
              onClick={handleTrigger}
              disabled={loadingAction !== null || !monitor.active}
              title="Run Check Now"
              className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition disabled:opacity-40"
            >
              <svg className={`w-4 h-4 ${loadingAction === 'trigger' ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}

          <button
            onClick={handleToggle}
            disabled={loadingAction !== null}
            title={monitor.active ? 'Pause Monitor' : 'Resume Monitor'}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition disabled:opacity-40"
          >
            {monitor.active ? (
              <svg className="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
            )}
          </button>

          {onDelete && (
            <button
              onClick={handleDelete}
              disabled={loadingAction !== null}
              title="Delete Monitor"
              className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 rounded transition disabled:opacity-40"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mt-5 pt-4 border-t border-zinc-800/80 text-sm">
        <div>
          <span className="text-zinc-500 block text-xs">Uptime (24h)</span>
          <span className={`font-mono font-medium text-base ${uptimeColor}`}>
            {uptime.toFixed(2)}%
          </span>
        </div>

        <div>
          <span className="text-zinc-500 block text-xs">Last Status</span>
          <div className="mt-0.5">{getStatusCodeBadge(monitor.lastStatusCode)}</div>
        </div>

        <div>
          <span className="text-zinc-500 block text-xs">Latency</span>
          <span className="font-mono text-zinc-200 text-sm">
            {monitor.lastLatencyMs !== undefined ? `${monitor.lastLatencyMs}ms` : '—'}
          </span>
        </div>

        <div>
          <span className="text-zinc-500 block text-xs">Interval</span>
          <span className="font-mono text-zinc-400 text-sm">
            {monitor.intervalSeconds}s
          </span>
        </div>
      </div>
    </div>
  );
};
export default MonitorCard;