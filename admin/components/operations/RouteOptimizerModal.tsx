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
  const [balancingFactor, setBalancingFactor] = useState(50);
  const [startWith, setStartWith] = useState<'EMPTY' | 'CURRENT'>('EMPTY');
  const [lockType, setLockType] = useState<'NONE' | 'ROUTES' | 'RESOURCES'>('NONE');
  const [clustering, setClustering] = useState(false);
  const [depotTrips, setDepotTrips] = useState(false);
  const [depotVisitDuration, setDepotVisitDuration] = useState(10);
  const [includeScheduledOrders, setIncludeScheduledOrders] = useState(false);
  const [useDateRange, setUseDateRange] = useState(false);
  const [dateRangeTo, setDateRangeTo] = useState(date);
  const [showAdvanced, setShowAdvanced] = useState(false);
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
        body: JSON.stringify({
          ...(useDateRange ? { dateRange: { from: planDate, to: dateRangeTo } } : { date: planDate }),
          balancing, balanceBy, startWith, clustering, lockType,
          ...(balancing !== 'OFF' && { balancingFactor }),
          ...(depotTrips && { depotTrips: true, depotVisitDuration }),
          ...(includeScheduledOrders && { includeScheduledOrders: true }),
        }),
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

          <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} disabled={running}
            className="text-xs font-bold text-teal-600 hover:text-teal-800 transition-colors">
            {showAdvanced ? 'Hide' : 'Show'} Advanced Options
          </button>

          {showAdvanced && (
            <div className="space-y-4 border-t border-gray-100 pt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={useDateRange} onChange={e => setUseDateRange(e.target.checked)} disabled={running}
                  className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                <span className="text-sm font-medium text-gray-700">Plan date range (weekly)</span>
              </label>

              {useDateRange && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">End Date</label>
                  <input type="date" value={dateRangeTo} onChange={e => setDateRangeTo(e.target.value)} disabled={running}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 disabled:opacity-50" />
                </div>
              )}

              {balancing !== 'OFF' && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Balancing Factor ({balancingFactor}%)</label>
                  <input type="range" min={0} max={100} value={balancingFactor} onChange={e => setBalancingFactor(Number(e.target.value))} disabled={running}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-teal-600 disabled:opacity-50" />
                  <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                    <span>Shorter routes</span>
                    <span>Even workload</span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Lock Type</label>
                <select value={lockType} onChange={e => setLockType(e.target.value as any)} disabled={running}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 disabled:opacity-50">
                  <option value="NONE">None — Full re-optimization</option>
                  <option value="ROUTES">Routes — Keep assigned stops, reorder</option>
                  <option value="RESOURCES">Resources — Keep driver assignments</option>
                </select>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={depotTrips} onChange={e => setDepotTrips(e.target.checked)} disabled={running}
                  className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                <span className="text-sm font-medium text-gray-700">Allow depot trips (multi-trip routes)</span>
              </label>

              {depotTrips && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Depot Visit Duration (minutes)</label>
                  <input type="number" min={1} max={60} value={depotVisitDuration} onChange={e => setDepotVisitDuration(Number(e.target.value))} disabled={running}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 disabled:opacity-50" />
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={includeScheduledOrders} onChange={e => setIncludeScheduledOrders(e.target.checked)} disabled={running}
                  className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                <span className="text-sm font-medium text-gray-700">Include already-scheduled orders</span>
              </label>
            </div>
          )}

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
