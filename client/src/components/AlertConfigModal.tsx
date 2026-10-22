import React, { useState, useEffect } from 'react';
import { Monitor, AlertConfig } from '../../../shared/types';

interface AlertConfigModalProps {
  monitor: Monitor | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (monitorId: string, alertConfig: AlertConfig) => Promise<void>;
}

export const AlertConfigModal: React.FC<AlertConfigModalProps> = ({
  monitor,
  isOpen,
  onClose,
  onSave,
}) => {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [secretToken, setSecretToken] = useState('');
  const [failureThreshold, setFailureThreshold] = useState(3);
  const [enabled, setEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (monitor) {
      setWebhookUrl(monitor.alertConfig?.webhookUrl || '');
      setSecretToken(monitor.alertConfig?.secretToken || '');
      setFailureThreshold(monitor.alertConfig?.failureThreshold ?? 3);
      setEnabled(monitor.alertConfig?.enabled ?? true);
      setError(null);
    }
  }, [monitor, isOpen]);

  if (!isOpen || !monitor) {
    return null;
  }

  const validateUrl = (url: string): boolean => {
    if (!url.trim()) return true;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedUrl = webhookUrl.trim();
    if (enabled && trimmedUrl && !validateUrl(trimmedUrl)) {
      setError('Webhook URL must be valid HTTP or HTTPS address');
      return;
    }

    if (failureThreshold < 1 || failureThreshold > 100) {
      setError('Failure threshold must be between 1 and 100');
      return;
    }

    setIsSubmitting(true);
    try {
      const alertConfig: AlertConfig = {
        enabled,
        webhookUrl: trimmedUrl,
        secretToken: secretToken.trim(),
        failureThreshold: Number(failureThreshold),
      };

      await onSave(monitor.id, alertConfig);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Save alert configuration failed';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black bg-opacity-70 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl text-slate-100">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">Alert Trigger Rules</h2>
            <p className="text-xs text-slate-400 mt-1">
              Target: <span className="text-cyan-400 font-mono">{monitor.name}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-md hover:bg-slate-800"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded bg-rose-950/50 border border-rose-800 text-rose-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/60 border border-slate-700/50">
            <div>
              <span className="text-sm font-semibold text-white">Enable Alerts</span>
              <p className="text-xs text-slate-400">Trigger outbound payload when checks fail</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
            </label>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Webhook Endpoint URL
            </label>
            <input
              type="url"
              placeholder="https://api.example.com/alerts/webhook"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Webhook Secret Token
            </label>
            <input
              type="password"
              placeholder="Optional Bearer token or HMAC key"
              value={secretToken}
              onChange={(e) => setSecretToken(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono"
            />
            <p className="text-xs text-slate-500 mt-1">Sent inside X-PulseLog-Token request header.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Failure Threshold Count
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={failureThreshold}
              onChange={(e) => setFailureThreshold(parseInt(e.target.value, 10) || 1)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              required
            />
            <p className="text-xs text-slate-500 mt-1">Consecutive failed probes before alert dispatches.</p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-cyan-600/20 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Saving...</span>
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AlertConfigModal;