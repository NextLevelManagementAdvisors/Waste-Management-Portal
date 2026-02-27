import React, { useState, useEffect, useRef } from 'react';

interface RouteOptimizerModalProps {
  date: string;
  onClose: () => void;
  onComplete: () => void;
}

const RouteOptimizerModal: React.FC<RouteOptimizerModalProps> = ({ date, onClose, onComplete }) => {
  const [planDate, setPlanDate] = useState(date);
  const [balancing, setBalancing] = useState<'OFF' | 'ON' | 'ON_FORCE'>('OFF');
  const [balanceBy, setBalanceBy] = useState<'WT' | 'NUM'>('WT');
  const [startWith, setStartWith] = useState<'EMPTY' | 'CURRENT'>('EMPTY');
  const [clustering, setClustering] = useState(false);
  const [running, setRunning] = useState(false);
  const [planningId, setPlanningId] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startPlanning = async () => {
    setRunning(true);
    setError('');
    setStatus('Starting...');
    try {
      const res = await fetch('/api/admin/optimoroute/planning/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ date: planDate, balancing, balanceBy, startWith, clustering }),
      });
      const data = await res.json();
      if (data.success && data.planningId) {
        setPlanningId(data.planningId);
        setStatus('Running');
        pollRef.current = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/admin/optimoroute/planning/status?planningId=${data.planningId}`, { credentials: 'include' });
            const statusData = await statusRes.json();
            setProgress(statusData.percentageComplete || 0);
            if (statusData.status === 'F') {
              setStatus('Finished');
              setRunning(false);
              if (pollRef.current) clearInterval(pollRef.current);
              onComplete();
            } else if (statusData.status === 'E') {
              setStatus('Error');
              setError('Optimization failed');
              setRunning(false);
              if (pollRef.current) clearInterval(pollRef.current);
            } else if (statusData.status === 'C') {
              setStatus('Cancelled');
              setRunning(false);
              if (pollRef.current) clearInterval(pollRef.current);
            }
          } catch {}
        }, 2000);
      } else {
        setError(data.code || 'Failed to start planning');
        setRunning(false);
      }
    } catch {
      setError('Failed to start planning');
      setRunning(false);
    }
  };

  const stopPlanning = async () => {
    if (!planningId) return;
    try {
      await fetch('/api/admin/optimoroute/planning/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ planningId }),
      });
      setStatus('Stopping...');
    } catch {}
  };

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-black text-gray-900 mb-4">Route Optimization</h2>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3 mb-4">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Date</label>
            <input type="date" value={planDate} onChange={e => setPlanDate(e.target.value)} disabled={running}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 disabled:opacity-50" />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Balancing</label>
            <select value={balancing} onChange={e => setBalancing(e.target.value as any)} disabled={running}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 disabled:opacity-50">
              <option value="OFF">Off — Best routes</option>
              <option value="ON">On — Balance workload</option>
              <option value="ON_FORCE">Force — Use all drivers</option>
            </select>
          </div>

          {balancing !== 'OFF' && (
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Balance By</label>
              <select value={balanceBy} onChange={e => setBalanceBy(e.target.value as any)} disabled={running}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 disabled:opacity-50">
                <option value="WT">Working Time</option>
                <option value="NUM">Number of Orders</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Start With</label>
            <select value={startWith} onChange={e => setStartWith(e.target.value as any)} disabled={running}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 disabled:opacity-50">
              <option value="EMPTY">Empty — Fresh routes</option>
              <option value="CURRENT">Current — Keep existing routes</option>
            </select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={clustering} onChange={e => setClustering(e.target.checked)} disabled={running}
              className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
            <span className="text-sm font-medium text-gray-700">Clustering (minimize route overlap)</span>
          </label>

          {running && (
            <div>
              <div className="flex items-center justify-between text-xs font-bold text-gray-500 mb-1">
                <span>{status}</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-teal-600 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {status === 'Finished' && (
            <p className="text-sm text-green-600 font-bold text-center">Optimization complete! Routes have been refreshed.</p>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
            Close
          </button>
          {running ? (
            <button type="button" onClick={stopPlanning} className="px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors">
              Stop
            </button>
          ) : status !== 'Finished' ? (
            <button type="button" onClick={startPlanning} className="px-4 py-2 text-sm font-bold text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors">
              Start Optimization
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default RouteOptimizerModal;
