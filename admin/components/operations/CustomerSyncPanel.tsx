import React, { useState, useEffect } from 'react';
import { Button } from '../../../components/Button.tsx';
import { LoadingSpinner } from '../ui/index.ts';

interface SyncStatus {
  enabled: boolean;
  syncHour: number;
  nextRunAt: string;
  lastRun: {
    id: string;
    runType: string;
    startedAt: string;
    finishedAt: string | null;
    status: string;
    locationsProcessed: number;
    ordersCreated: number;
    ordersSkipped: number;
    ordersErrored: number;
    ordersDeleted: number;
    detectionUpdates: number;
    errorMessage: string | null;
  } | null;
}

interface SyncLogEntry {
  id: string;
  runType: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  locationsProcessed: number;
  ordersCreated: number;
  ordersSkipped: number;
  ordersErrored: number;
  ordersDeleted: number;
  detectionUpdates: number;
  errorMessage: string | null;
}

interface RawSyncLogEntry {
  id?: string;
  runType?: string;
  run_type?: string;
  startedAt?: string;
  started_at?: string;
  finishedAt?: string | null;
  finished_at?: string | null;
  status?: string;
  locationsProcessed?: number;
  locations_processed?: number;
  ordersCreated?: number;
  orders_created?: number;
  ordersSkipped?: number;
  orders_skipped?: number;
  ordersErrored?: number;
  orders_errored?: number;
  ordersDeleted?: number;
  orders_deleted?: number;
  detectionUpdates?: number;
  detection_updates?: number;
  errorMessage?: string | null;
  error_message?: string | null;
}

interface PreviewLocation {
  location: { id: string; address: string; customer: string };
  collectionDay: string | null;
  frequency: string;
  dates: string[];
  existing?: string[];
  status: string;
}

interface PreviewResult {
  total: number;
  wouldCreate: number;
  wouldSkip: number;
  preview: PreviewLocation[];
}

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
};

const formatShortDate = (dateStr: string) => {
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric',
    });
  } catch {
    return dateStr;
  }
};

const normalizeSyncLog = (log: RawSyncLogEntry): SyncLogEntry => ({
  id: String(log.id || ''),
  runType: log.runType || log.run_type || 'manual',
  startedAt: log.startedAt || log.started_at || '',
  finishedAt: log.finishedAt ?? log.finished_at ?? null,
  status: log.status || 'unknown',
  locationsProcessed: Number(log.locationsProcessed ?? log.locations_processed ?? 0),
  ordersCreated: Number(log.ordersCreated ?? log.orders_created ?? 0),
  ordersSkipped: Number(log.ordersSkipped ?? log.orders_skipped ?? 0),
  ordersErrored: Number(log.ordersErrored ?? log.orders_errored ?? 0),
  ordersDeleted: Number(log.ordersDeleted ?? log.orders_deleted ?? 0),
  detectionUpdates: Number(log.detectionUpdates ?? log.detection_updates ?? 0),
  errorMessage: log.errorMessage ?? log.error_message ?? null,
});

const CustomerSyncPanel: React.FC = () => {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [history, setHistory] = useState<SyncLogEntry[]>([]);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/admin/optimoroute/sync/status', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const normalizedLastRun = data.lastRun ? normalizeSyncLog(data.lastRun) : null;
        setStatus({
          enabled: Boolean(data.enabled),
          syncHour: Number(data.syncHour || 0),
          nextRunAt: String(data.nextRunAt || ''),
          lastRun: normalizedLastRun,
        });
      }
    } catch {}
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/admin/optimoroute/sync/history?limit=20', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setHistory(Array.isArray(data.logs) ? data.logs.map((log: RawSyncLogEntry) => normalizeSyncLog(log)) : []);
      }
    } catch {}
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const loadPreview = async () => {
    setLoading(true);
    setError('');
    setSuccessMsg('');
    setPreview(null);
    try {
      const res = await fetch('/api/admin/optimoroute/sync/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ preview: true }),
      });
      if (res.ok) {
        setPreview(await res.json());
      } else {
        setError('Failed to load preview');
      }
    } catch {
      setError('Network error loading preview');
    } finally {
      setLoading(false);
    }
  };

  const executeSync = async () => {
    setSyncing(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/admin/optimoroute/sync/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ preview: false }),
      });
      if (res.ok) {
        const data = await res.json();
        setSuccessMsg(
          `Sync complete: ${data.ordersCreated} created, ${data.ordersSkipped} skipped, ${data.ordersDeleted} cleaned up`
        );
        setPreview(null);
        fetchStatus();
      } else {
        setError('Sync failed — server returned an error');
      }
    } catch {
      setError('Sync failed — network error');
    } finally {
      setSyncing(false);
    }
  };

  const detectDays = async () => {
    setDetecting(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/admin/optimoroute/sync/detect-days', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setSuccessMsg(`Day detection: ${data.updated} updated, ${data.noData} no data, ${data.skipped} skipped`);
      } else {
        setError('Day detection failed');
      }
    } catch {
      setError('Day detection failed — network error');
    } finally {
      setDetecting(false);
    }
  };

  const toggleHistory = () => {
    if (!showHistory) fetchHistory();
    setShowHistory(!showHistory);
  };

  const statusColor = (s: string) => {
    if (s === 'completed') return 'bg-green-100 text-green-700';
    if (s === 'running') return 'bg-blue-100 text-blue-700';
    if (s === 'failed') return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="space-y-4">
      {/* Status Banner */}
      {status && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-black uppercase text-gray-400">Automated Sync Status</h3>
            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${status.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {status.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase">Last Run</p>
              <p className="text-sm font-bold text-gray-900">
                {status.lastRun ? formatDate(status.lastRun.startedAt) : 'Never'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase">Last Status</p>
              {status.lastRun ? (
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${statusColor(status.lastRun.status)}`}>
                  {status.lastRun.status}
                </span>
              ) : (
                <p className="text-sm text-gray-400">-</p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase">Next Scheduled</p>
              <p className="text-sm font-bold text-gray-900">{formatDate(status.nextRunAt)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase">Daily Run Hour</p>
              <p className="text-sm font-bold text-gray-900">{status.syncHour}:00</p>
            </div>
          </div>
          {status.lastRun && (
            <div className="grid grid-cols-5 gap-2 mt-3 pt-3 border-t border-gray-100">
              <div className="text-center">
                <p className="text-lg font-black text-gray-900">{status.lastRun.locationsProcessed}</p>
                <p className="text-[9px] font-bold text-gray-400 uppercase">Locations</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-black text-green-600">{status.lastRun.ordersCreated}</p>
                <p className="text-[9px] font-bold text-gray-400 uppercase">Created</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-black text-gray-500">{status.lastRun.ordersSkipped}</p>
                <p className="text-[9px] font-bold text-gray-400 uppercase">Skipped</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-black text-orange-600">{status.lastRun.ordersDeleted}</p>
                <p className="text-[9px] font-bold text-gray-400 uppercase">Cleaned Up</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-black text-red-600">{status.lastRun.ordersErrored}</p>
                <p className="text-[9px] font-bold text-gray-400 uppercase">Errors</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={loadPreview} disabled={loading || syncing}>
          {loading ? 'Scanning...' : 'Preview Sync'}
        </Button>
        <Button onClick={executeSync} disabled={syncing || loading} className="bg-green-600 hover:bg-green-700">
          {syncing ? 'Syncing...' : 'Run Sync Now'}
        </Button>
        <Button onClick={detectDays} disabled={detecting} variant="secondary">
          {detecting ? 'Detecting...' : 'Detect Collection Days'}
        </Button>
        <Button onClick={toggleHistory} variant="ghost" size="sm">
          {showHistory ? 'Hide History' : 'View History'}
        </Button>
      </div>

      {(loading || syncing || detecting) && <LoadingSpinner />}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center justify-between">
          <span className="text-sm text-red-700 font-bold">{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 text-xs font-bold">Dismiss</button>
        </div>
      )}

      {successMsg && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center justify-between">
          <span className="text-sm text-green-700 font-bold">{successMsg}</span>
          <button onClick={() => setSuccessMsg('')} className="text-green-400 hover:text-green-600 text-xs font-bold">Dismiss</button>
        </div>
      )}

      {/* Sync History */}
      {showHistory && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="text-xs font-black uppercase text-gray-400">Sync History</h3>
          </div>
          {history.length === 0 ? (
            <p className="p-4 text-sm text-gray-400 text-center">No sync runs recorded yet</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">When</th>
                  <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Type</th>
                  <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Status</th>
                  <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-right">Properties</th>
                  <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-right">Created</th>
                  <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-right">Skipped</th>
                  <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-right">Deleted</th>
                  <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-right">Errors</th>
                </tr>
              </thead>
              <tbody>
                {history.map(log => (
                  <tr key={log.id} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-700">{formatDate(log.startedAt)}</td>
                    <td className="px-4 py-2">
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${log.runType === 'manual' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                        {log.runType}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${statusColor(log.status)}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-bold text-gray-900">{log.locationsProcessed}</td>
                    <td className="px-4 py-2 text-right font-bold text-green-600">{log.ordersCreated}</td>
                    <td className="px-4 py-2 text-right text-gray-500">{log.ordersSkipped}</td>
                    <td className="px-4 py-2 text-right text-orange-600">{log.ordersDeleted}</td>
                    <td className="px-4 py-2 text-right text-red-600">{log.ordersErrored}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Preview Results */}
      {preview && !loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-bold text-gray-400 uppercase">Total Locations</p>
              <p className="text-xl font-black text-gray-900 mt-1">{preview.total}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-bold text-gray-400 uppercase">Orders to Create</p>
              <p className="text-xl font-black text-green-600 mt-1">{preview.wouldCreate}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-bold text-gray-400 uppercase">Up to Date</p>
              <p className="text-xl font-black text-gray-500 mt-1">
                {preview.preview.filter(p => p.status === 'up_to_date').length}
              </p>
            </div>
          </div>

          {/* Per-property breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-xs font-black uppercase text-gray-400">Location Breakdown</h3>
              {preview.wouldCreate > 0 && (
                <Button size="sm" onClick={executeSync} disabled={syncing}>
                  {syncing ? 'Creating...' : `Create ${preview.wouldCreate} Order(s)`}
                </Button>
              )}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Customer</th>
                  <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Address</th>
                  <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Day</th>
                  <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Frequency</th>
                  <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">New Dates</th>
                  <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.preview.map((item, i) => (
                  <tr key={item.location.id || i} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2 font-bold text-gray-900">{item.location.customer}</td>
                    <td className="px-4 py-2 text-gray-700 max-w-[200px] truncate">{item.location.address}</td>
                    <td className="px-4 py-2 text-gray-700 capitalize">{item.collectionDay || '-'}</td>
                    <td className="px-4 py-2 text-gray-700 capitalize">{item.frequency || '-'}</td>
                    <td className="px-4 py-2">
                      {item.dates.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {item.dates.slice(0, 4).map(d => (
                            <span key={d} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-50 text-green-700">
                              {formatShortDate(d)}
                            </span>
                          ))}
                          {item.dates.length > 4 && (
                            <span className="text-[10px] text-gray-400">+{item.dates.length - 4} more</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                        item.status === 'will_create' ? 'bg-green-100 text-green-700' :
                        item.status === 'up_to_date' ? 'bg-gray-100 text-gray-500' :
                        item.status === 'no_collection_day' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {item.status === 'will_create' ? 'Will Create' :
                         item.status === 'up_to_date' ? 'Up to Date' :
                         item.status === 'no_collection_day' ? 'No Day Set' :
                         item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerSyncPanel;
