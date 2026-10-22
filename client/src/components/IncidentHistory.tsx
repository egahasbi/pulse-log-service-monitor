import React, { useState } from 'react';
import { Incident } from '../../../shared/types';

interface IncidentHistoryProps {
  incidents: Incident[];
  onResolve?: (incidentId: string) => Promise<void> | void;
}

export const IncidentHistory: React.FC<IncidentHistoryProps> = ({ incidents, onResolve }) => {
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const filteredIncidents = incidents
    .filter((incident) => {
      if (filter === 'open') return !incident.resolved;
      if (filter === 'resolved') return incident.resolved;
      return true;
    })
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  const handleResolve = async (id: string) => {
    if (!onResolve) return;
    try {
      setResolvingId(id);
      await onResolve(id);
    } finally {
      setResolvingId(null);
    }
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const calculateDuration = (start: string, end?: string) => {
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const diffSec = Math.max(0, Math.floor((endTime - startTime) / 1000));

    if (diffSec < 60) return `${diffSec}s`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ${diffSec % 60}s`;
    const diffHr = Math.floor(diffMin / 60);
    return `${diffHr}h ${diffMin % 60}m`;
  };

  const getStatusBadge = (statusCode?: number) => {
    if (!statusCode || statusCode === 0) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
          ERR
        </span>
      );
    }
    const colorClass =
      statusCode >= 500
        ? 'bg-rose-950/60 text-rose-300 border-rose-800/80'
        : statusCode >= 400
        ? 'bg-amber-950/60 text-amber-300 border-amber-800/80'
        : 'bg-emerald-950/60 text-emerald-300 border-emerald-800/80';

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium border ${colorClass}`}>
        HTTP {statusCode}
      </span>
    );
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 w-full shadow-lg">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-800 gap-3">
        <div>
          <h3 className="text-lg font-semibold text-zinc-100">Incident History</h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Probe failure log and outage tracking
          </p>
        </div>
        <div className="flex items-center space-x-1.5 bg-zinc-950 p-1 rounded-md border border-zinc-800 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              filter === 'all'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            All ({incidents.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('open')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              filter === 'open'
                ? 'bg-rose-950/70 text-rose-300 border border-rose-900/60'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Open ({incidents.filter((i) => !i.resolved).length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('resolved')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              filter === 'resolved'
                ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-900/60'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Resolved ({incidents.filter((i) => i.resolved).length})
          </button>
        </div>
      </div>

      {filteredIncidents.length === 0 ? (
        <div className="py-12 text-center">
          <svg
            className="mx-auto h-8 w-8 text-zinc-600 mb-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-sm text-zinc-400 font-medium">No incidents recorded</p>
          <p className="text-xs text-zinc-500 mt-1">
            {filter === 'all'
              ? 'All probes passing health checks.'
              : `No ${filter} incidents found.`}
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 font-medium uppercase tracking-wider">
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Code</th>
                <th className="py-2.5 px-3">Reason</th>
                <th className="py-2.5 px-3">Duration</th>
                {onResolve && <th className="py-2.5 px-3 text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filteredIncidents.map((incident) => {
                const isOpen = !incident.resolved;
                return (
                  <tr
                    key={incident.id}
                    className={`hover:bg-zinc-800/40 transition-colors ${
                      isOpen ? 'bg-rose-950/10' : ''
                    }`}
                  >
                    <td className="py-3 px-3 whitespace-nowrap">
                      {isOpen ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                          Open
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Resolved
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-zinc-300 font-mono whitespace-nowrap">
                      <div>{formatDate(incident.startedAt)}</div>
                      {incident.resolvedAt && (
                        <div className="text-[10px] text-zinc-500">
                          to {formatDate(incident.resolvedAt)}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {getStatusBadge(incident.statusCode)}
                    </td>
                    <td className="py-3 px-3 font-mono text-zinc-300 max-w-xs md:max-w-md truncate">
                      <span title={incident.reason || incident.message || 'Unknown probe failure'}>
                        {incident.reason || incident.message || 'Unknown probe failure'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-zinc-400 whitespace-nowrap font-mono">
                      {calculateDuration(incident.startedAt, incident.resolvedAt)}
                    </td>
                    {onResolve && (
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        {isOpen ? (
                          <button
                            type="button"
                            disabled={resolvingId === incident.id}
                            onClick={() => handleResolve(incident.id)}
                            className="px-2.5 py-1 text-[11px] font-medium rounded bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white border border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                          >
                            {resolvingId === incident.id ? 'Resolving...' : 'Resolve'}
                          </button>
                        ) : (
                          <span className="text-zinc-600 text-[11px]">Closed</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default IncidentHistory;