import React, { useState } from 'react';
import { Button } from '../../../components/Button.tsx';
import { LoadingSpinner } from '../ui/index.ts';

interface SyncResult {
  total: number;
  withOrders: number;
  missing: any[];
  created?: number;
}

const CustomerSyncPanel: React.FC = () => {
  const [preview, setPreview] = useState<SyncResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ created: number } | null>(null);
  const [error, setError] = useState('');

  const loadPreview = async () => {
    setLoading(true);
    setSyncResult(null);
    setError('');
    try {
      const res = await fetch('/api/admin/optimoroute/customers/sync-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ preview: true }),
      });
      if (res.ok) {
        const data = await res.json();
        setPreview(data);
      }
    } catch (e) {
      console.error('Failed to load sync preview:', e);
    } finally {
      setLoading(false);
    }
  };

  const executeSync = async () => {
    setSyncing(true);
    setError('');
    try {
      const res = await fetch('/api/admin/optimoroute/customers/sync-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ preview: false }),
      });
      if (res.ok) {
        const data = await res.json();
        setSyncResult({ created: data.created || 0 });
        setPreview(null);
      } else {
        setError('Sync failed — server returned an error');
      }
    } catch {
      setError('Sync failed — network error');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button onClick={loadPreview} disabled={loading}>
          {loading ? 'Scanning...' : 'Scan Properties'}
        </Button>
        <p className="text-sm text-gray-500">
          Checks active properties with subscriptions for upcoming OptimoRoute orders
        </p>
      </div>

      {loading && <LoadingSpinner />}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center justify-between">
          <span className="text-sm text-red-700 font-bold">{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 text-xs font-bold">Dismiss</button>
        </div>
      )}

      {syncResult && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 font-bold">
          Created {syncResult.created} order{syncResult.created !== 1 ? 's' : ''} in OptimoRoute
        </div>
      )}

      {preview && !loading && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-bold text-gray-400 uppercase">Total Properties</p>
              <p className="text-xl font-black text-gray-900 mt-1">{preview.total}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-bold text-gray-400 uppercase">With Orders</p>
              <p className="text-xl font-black text-green-600 mt-1">{preview.withOrders}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-bold text-gray-400 uppercase">Missing Orders</p>
              <p className="text-xl font-black text-red-600 mt-1">{preview.missing.length}</p>
            </div>
          </div>

          {/* Missing list */}
          {preview.missing.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-black uppercase text-gray-400">Properties Without Upcoming Orders</h3>
                <Button onClick={executeSync} disabled={syncing}>
                  {syncing ? 'Creating...' : `Create ${preview.missing.length} Order(s)`}
                </Button>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Customer</th>
                      <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Address</th>
                      <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Upcoming Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.missing.map((item: any, i: number) => (
                      <tr key={item.property?.id || i} className="border-t border-gray-100">
                        <td className="px-4 py-2 font-bold text-gray-900">{item.property?.customer || '—'}</td>
                        <td className="px-4 py-2 text-gray-700 max-w-[250px] truncate">{item.property?.address || '—'}</td>
                        <td className="px-4 py-2">
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                            {item.error ? 'Error' : 'None'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <p className="text-green-700 font-bold">All properties with active subscriptions have upcoming orders</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CustomerSyncPanel;
