import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../../../components/Card.tsx';
import { LoadingSpinner, EmptyState } from '../ui/index.ts';
import CustomerSyncPanel from '../operations/CustomerSyncPanel.tsx';
import DriverSyncPanel from '../operations/DriverSyncPanel.tsx';

type SyncSection = 'customer' | 'driver' | 'history';

interface SyncLogEntry {
  id: string;
  run_type: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  properties_processed: number;
  orders_created: number;
  orders_skipped: number;
  orders_errored: number;
  orders_deleted: number;
  detection_updates: number;
  error_message: string | null;
}

const statusBadge = (status: string) => {
  switch (status) {
    case 'completed': return 'bg-green-100 text-green-700';
    case 'running': return 'bg-blue-100 text-blue-700 animate-pulse';
    case 'failed': return 'bg-red-100 text-red-700';
    default: return 'bg-gray-100 text-gray-700';
  }
};

const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return dateStr; }
};

const SyncHistoryPanel: React.FC = () => {
  const [logs, setLogs] = useState<SyncLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/optimoroute/sync/history?limit=50', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch sync history');
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading sync history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  if (loading) return <LoadingSpinner />;
  if (error) return <Card className="p-6"><div className="text-red-600 text-sm">{error}</div></Card>;
  if (logs.length === 0) return <EmptyState message="No sync history yet. Run a manual sync or wait for the next scheduled sync." />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{logs.length} sync runs</p>
        <button
          type="button"
          onClick={fetchLogs}
          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
        >
          Refresh
        </button>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600">Started</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600">Type</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600">Status</th>
                <th className="px-4 py-3 text-right text-xs font-black uppercase text-gray-600">Properties</th>
                <th className="px-4 py-3 text-right text-xs font-black uppercase text-gray-600">Created</th>
                <th className="px-4 py-3 text-right text-xs font-black uppercase text-gray-600">Skipped</th>
                <th className="px-4 py-3 text-right text-xs font-black uppercase text-gray-600">Deleted</th>
                <th className="px-4 py-3 text-right text-xs font-black uppercase text-gray-600 hidden md:table-cell">Errors</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600 hidden lg:table-cell">Duration</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => {
                const duration = log.finished_at && log.started_at
                  ? Math.round((new Date(log.finished_at).getTime() - new Date(log.started_at).getTime()) / 1000)
                  : null;
                return (
                  <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-700">{formatDateTime(log.started_at)}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-bold uppercase text-gray-500">{log.run_type}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${statusBadge(log.status)}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">{log.properties_processed}</td>
                    <td className="px-4 py-3 text-sm text-green-700 text-right font-medium">{log.orders_created}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 text-right">{log.orders_skipped}</td>
                    <td className="px-4 py-3 text-sm text-orange-600 text-right">{log.orders_deleted}</td>
                    <td className="px-4 py-3 text-sm text-right hidden md:table-cell">
                      {log.orders_errored > 0 ? (
                        <span className="text-red-600 font-bold" title={log.error_message || ''}>{log.orders_errored}</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">
                      {duration != null ? `${duration}s` : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

const SyncAutomationPanel: React.FC = () => {
  const [activeSection, setActiveSection] = useState<SyncSection>('customer');

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h3 className="text-base font-black text-gray-900">Sync & Automation</h3>
        <p className="text-sm text-gray-500 mt-1">
          Manage automated syncing between the portal and OptimoRoute.
          Schedule settings (sync hour, window, enable/disable) are configured in
          <span className="font-semibold text-teal-700"> Integrations &gt; OptimoRoute</span>.
        </p>
      </Card>

      <div className="flex gap-2">
        {([
          { key: 'customer' as const, label: 'Customer Order Sync' },
          { key: 'driver' as const, label: 'Driver Sync' },
          { key: 'history' as const, label: 'Sync History' },
        ]).map(s => (
          <button
            key={s.key}
            type="button"
            onClick={() => setActiveSection(s.key)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
              activeSection === s.key
                ? 'bg-teal-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {activeSection === 'customer' && <CustomerSyncPanel />}
      {activeSection === 'driver' && <DriverSyncPanel />}
      {activeSection === 'history' && <SyncHistoryPanel />}
    </div>
  );
};

export default SyncAutomationPanel;
