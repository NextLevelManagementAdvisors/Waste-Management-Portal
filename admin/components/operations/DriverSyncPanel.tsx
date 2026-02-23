import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '../../../components/Button.tsx';
import { LoadingSpinner } from '../ui/index.ts';

interface OptimoDriver {
  serial: string;
  name: string;
  externalId?: string;
  vehicleRegistration?: string | null;
  vehicleLabel?: string | null;
  totalRoutes?: number;
  totalStops?: number;
  totalDistanceKm?: number;
  totalDurationMin?: number;
  lastRouteDate?: string;
  recentStopAddresses?: string[];
}

interface LocalDriver {
  id: string;
  user_id: string;
  name: string;
  optimoroute_driver_id: string | null;
  status: string;
  first_name?: string;
  last_name?: string;
  email?: string;
}

interface SyncPreview {
  matched: { optimoDriver: OptimoDriver; localDriver: LocalDriver }[];
  unmatchedOptimo: OptimoDriver[];
  unmatchedLocal: LocalDriver[];
}

const DriverSyncPanel: React.FC = () => {
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [linkMap, setLinkMap] = useState<Record<string, string>>({});
  const [reverseLinkMap, setReverseLinkMap] = useState<Record<string, string>>({});
  const [syncing, setSyncing] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [result, setResult] = useState<{ linked: number } | null>(null);
  const [createResult, setCreateResult] = useState<{ name: string } | null>(null);
  const [expandedDriver, setExpandedDriver] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{ pushed: number; failed: number } | null>(null);
  const [pushParams, setPushParams] = useState<Record<string, { workTimeFrom: string; workTimeTo: string; enabled: boolean }>>({});

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setCreateResult(null);
    try {
      const res = await fetch('/api/admin/optimoroute/drivers/sync-preview', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPreview(data);
      }
    } catch (e) {
      console.error('Failed to load sync preview:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-load on mount
  useEffect(() => { loadPreview(); }, [loadPreview]);

  const handleCreateDriver = async (optimoDriver: OptimoDriver) => {
    setCreating(optimoDriver.serial);
    setCreateResult(null);
    try {
      const res = await fetch('/api/admin/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: optimoDriver.name,
          optimorouteDriverId: optimoDriver.serial,
        }),
      });
      if (res.ok) {
        setCreateResult({ name: optimoDriver.name });
        loadPreview();
      }
    } catch (e) {
      console.error('Failed to create driver:', e);
    } finally {
      setCreating(null);
    }
  };

  const handleSync = async () => {
    const forwardMappings = Object.entries(linkMap)
      .filter(([_, driverProfileId]) => driverProfileId)
      .map(([optimorouteSerial, driverProfileId]) => ({ optimorouteSerial, driverProfileId }));
    const reverseMappings = Object.entries(reverseLinkMap)
      .filter(([_, optimorouteSerial]) => optimorouteSerial)
      .map(([driverProfileId, optimorouteSerial]) => ({ optimorouteSerial, driverProfileId }));
    const mappings = [...forwardMappings, ...reverseMappings];

    if (mappings.length === 0) return;

    setSyncing(true);
    try {
      const res = await fetch('/api/admin/optimoroute/drivers/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mappings }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult(data);
        setLinkMap({});
        setReverseLinkMap({});
        loadPreview();
      }
    } catch {
    } finally {
      setSyncing(false);
    }
  };

  const getOrInitParams = (serial: string) => {
    return pushParams[serial] || { workTimeFrom: '08:00', workTimeTo: '17:00', enabled: true };
  };

  const handlePushToOptimo = async (serial: string) => {
    setPushing(true);
    setPushResult(null);
    const params = getOrInitParams(serial);
    const today = new Date().toISOString().split('T')[0];
    try {
      const res = await fetch('/api/admin/optimoroute/drivers/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          drivers: [{ serial, date: today, ...params }],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPushResult(data);
      }
    } catch (e) {
      console.error('Failed to push driver:', e);
    } finally {
      setPushing(false);
    }
  };

  const handlePushAllLinked = async () => {
    if (!preview?.matched.length) return;
    setPushing(true);
    setPushResult(null);
    const today = new Date().toISOString().split('T')[0];
    const drivers = preview.matched.map(m => {
      const params = getOrInitParams(m.optimoDriver.serial);
      return { serial: m.optimoDriver.serial, date: today, ...params };
    });
    try {
      const res = await fetch('/api/admin/optimoroute/drivers/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ drivers }),
      });
      if (res.ok) {
        const data = await res.json();
        setPushResult(data);
      }
    } catch (e) {
      console.error('Failed to push drivers:', e);
    } finally {
      setPushing(false);
    }
  };

  const getDriverDisplayName = (d: LocalDriver) => {
    if (d.first_name && d.last_name) return `${d.first_name} ${d.last_name}`;
    return d.name || d.email || d.id;
  };

  const DriverStats: React.FC<{ driver: OptimoDriver }> = ({ driver }) => (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
      <div className="bg-gray-50 rounded-lg p-2 text-center">
        <div className="text-lg font-black text-gray-900">{driver.totalRoutes ?? 0}</div>
        <div className="text-[10px] font-bold uppercase text-gray-400">Routes (7d)</div>
      </div>
      <div className="bg-gray-50 rounded-lg p-2 text-center">
        <div className="text-lg font-black text-gray-900">{driver.totalStops ?? 0}</div>
        <div className="text-[10px] font-bold uppercase text-gray-400">Total Stops</div>
      </div>
      <div className="bg-gray-50 rounded-lg p-2 text-center">
        <div className="text-lg font-black text-gray-900">{(driver.totalDistanceKm ?? 0).toFixed(0)}</div>
        <div className="text-[10px] font-bold uppercase text-gray-400">km Driven</div>
      </div>
      <div className="bg-gray-50 rounded-lg p-2 text-center">
        <div className="text-lg font-black text-gray-900">{((driver.totalDurationMin ?? 0) / 60).toFixed(1)}</div>
        <div className="text-[10px] font-bold uppercase text-gray-400">Hours</div>
      </div>
    </div>
  );

  const DriverDetail: React.FC<{ driver: OptimoDriver }> = ({ driver }) => (
    <div className="space-y-3 mt-3 pt-3 border-t border-gray-100">
      <DriverStats driver={driver} />
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
        {driver.vehicleLabel && <span>Vehicle: <span className="text-gray-700 font-bold">{driver.vehicleLabel}</span></span>}
        {driver.vehicleRegistration && <span>Reg: <span className="text-gray-700 font-mono">{driver.vehicleRegistration}</span></span>}
        {driver.lastRouteDate && <span>Last route: <span className="text-gray-700 font-bold">{driver.lastRouteDate}</span></span>}
        {driver.serial && driver.serial !== driver.name && <span>Serial: <span className="text-gray-700 font-mono">{driver.serial}</span></span>}
        {driver.externalId && <span>Ext ID: <span className="text-gray-700 font-mono">{driver.externalId}</span></span>}
      </div>
      {driver.recentStopAddresses && driver.recentStopAddresses.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase text-gray-400 mb-1">Recent Stops (sample)</div>
          <div className="space-y-0.5">
            {driver.recentStopAddresses.map((addr, i) => (
              <div key={i} className="text-xs text-gray-600 truncate">{addr}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const totalMappings = Object.values(linkMap).filter(Boolean).length + Object.values(reverseLinkMap).filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button onClick={loadPreview} disabled={loading}>
          {loading ? 'Scanning...' : preview ? 'Refresh' : 'Scan Drivers'}
        </Button>
        <p className="text-sm text-gray-500">
          Compares OptimoRoute drivers (from recent routes) with local driver profiles
        </p>
      </div>

      {loading && <LoadingSpinner />}

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 font-bold">
          Successfully linked {result.linked} driver{result.linked !== 1 ? 's' : ''}
        </div>
      )}

      {createResult && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 font-bold">
          Created driver profile for {createResult.name}
        </div>
      )}

      {pushResult && (
        <div className={`border rounded-lg p-3 text-sm font-bold ${pushResult.failed > 0 ? 'bg-yellow-50 border-yellow-200 text-yellow-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
          Pushed {pushResult.pushed} driver{pushResult.pushed !== 1 ? 's' : ''} to OptimoRoute
          {pushResult.failed > 0 && ` (${pushResult.failed} failed)`}
        </div>
      )}

      {preview && !loading && (
        <div className="space-y-6">
          {/* Matched drivers */}
          {preview.matched.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-black uppercase text-gray-400">Linked Drivers ({preview.matched.length})</h3>
                <button
                  type="button"
                  onClick={handlePushAllLinked}
                  disabled={pushing}
                  className="px-3 py-1 text-xs font-bold rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {pushing ? 'Pushing...' : 'Push All to OptimoRoute'}
                </button>
              </div>
              <div className="space-y-2">
                {preview.matched.map(m => (
                  <div key={m.optimoDriver.serial} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <button
                      type="button"
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                      onClick={() => setExpandedDriver(expandedDriver === m.optimoDriver.serial ? null : m.optimoDriver.serial)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-700 font-black text-sm flex items-center justify-center">
                          {m.optimoDriver.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-gray-900">{m.optimoDriver.name}</div>
                          <div className="text-xs text-gray-500">
                            Linked to {getDriverDisplayName(m.localDriver)}
                            {m.optimoDriver.totalStops != null && (
                              <span className="ml-2 text-gray-400">
                                {m.optimoDriver.totalStops} stops / {m.optimoDriver.totalRoutes} routes (7d)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-green-100 text-green-700">Linked</span>
                        <svg className={`w-4 h-4 text-gray-400 transition-transform ${expandedDriver === m.optimoDriver.serial ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </div>
                    </button>
                    {expandedDriver === m.optimoDriver.serial && (
                      <div className="px-4 pb-4">
                        <DriverDetail driver={m.optimoDriver} />
                        <div className="mt-4 pt-3 border-t border-gray-100 space-y-3">
                          <div className="text-[10px] font-black uppercase text-gray-400">Push Parameters to OptimoRoute</div>
                          <div className="flex items-center gap-4 flex-wrap">
                            <label className="flex items-center gap-2 text-xs text-gray-600">
                              <span className="font-bold">From</span>
                              <input
                                type="time"
                                value={getOrInitParams(m.optimoDriver.serial).workTimeFrom}
                                onChange={e => setPushParams(prev => ({ ...prev, [m.optimoDriver.serial]: { ...getOrInitParams(m.optimoDriver.serial), workTimeFrom: e.target.value } }))}
                                className="px-2 py-1 border border-gray-200 rounded text-xs"
                              />
                            </label>
                            <label className="flex items-center gap-2 text-xs text-gray-600">
                              <span className="font-bold">To</span>
                              <input
                                type="time"
                                value={getOrInitParams(m.optimoDriver.serial).workTimeTo}
                                onChange={e => setPushParams(prev => ({ ...prev, [m.optimoDriver.serial]: { ...getOrInitParams(m.optimoDriver.serial), workTimeTo: e.target.value } }))}
                                className="px-2 py-1 border border-gray-200 rounded text-xs"
                              />
                            </label>
                            <label className="flex items-center gap-2 text-xs text-gray-600">
                              <input
                                type="checkbox"
                                checked={getOrInitParams(m.optimoDriver.serial).enabled}
                                onChange={e => setPushParams(prev => ({ ...prev, [m.optimoDriver.serial]: { ...getOrInitParams(m.optimoDriver.serial), enabled: e.target.checked } }))}
                                className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                              />
                              <span className="font-bold">Enabled</span>
                            </label>
                            <button
                              type="button"
                              onClick={() => handlePushToOptimo(m.optimoDriver.serial)}
                              disabled={pushing}
                              className="px-3 py-1.5 text-xs font-bold rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              {pushing ? 'Pushing...' : 'Push to OptimoRoute'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unmatched OptimoRoute drivers */}
          {preview.unmatchedOptimo.length > 0 && (
            <div>
              <h3 className="text-xs font-black uppercase text-gray-400 mb-2">Unlinked OptimoRoute Drivers ({preview.unmatchedOptimo.length})</h3>
              <div className="space-y-2">
                {preview.unmatchedOptimo.map(d => (
                  <div key={d.serial} className="bg-white rounded-xl border border-orange-200 overflow-hidden">
                    <button
                      type="button"
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                      onClick={() => setExpandedDriver(expandedDriver === `optimo-${d.serial}` ? null : `optimo-${d.serial}`)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-700 font-black text-sm flex items-center justify-center">
                          {d.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-gray-900">{d.name}</div>
                          <div className="text-xs text-gray-500">
                            OptimoRoute driver — not linked to portal
                            {d.totalStops != null && (
                              <span className="ml-2 text-gray-400">
                                {d.totalStops} stops / {d.totalRoutes} routes (7d)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">Unlinked</span>
                        <svg className={`w-4 h-4 text-gray-400 transition-transform ${expandedDriver === `optimo-${d.serial}` ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </div>
                    </button>
                    {expandedDriver === `optimo-${d.serial}` && (
                      <div className="px-4 pb-4">
                        <DriverDetail driver={d} />
                        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-3 flex-wrap">
                          <select
                            value={linkMap[d.serial] || ''}
                            onChange={e => setLinkMap(prev => ({ ...prev, [d.serial]: e.target.value }))}
                            className="px-2 py-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                          >
                            <option value="">— Link to existing driver —</option>
                            {preview.unmatchedLocal.map(local => (
                              <option key={local.id} value={local.id}>
                                {getDriverDisplayName(local)} ({local.email || 'no email'})
                              </option>
                            ))}
                          </select>
                          <span className="text-xs text-gray-400 font-bold">or</span>
                          <button
                            type="button"
                            onClick={() => handleCreateDriver(d)}
                            disabled={creating === d.serial || !!linkMap[d.serial]}
                            className="px-3 py-1.5 text-xs font-bold rounded bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            {creating === d.serial ? 'Creating...' : 'Create New Driver Profile'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unmatched local drivers */}
          {preview.unmatchedLocal.length > 0 && (
            <div>
              <h3 className="text-xs font-black uppercase text-gray-400 mb-2">Local Drivers Without OptimoRoute Link ({preview.unmatchedLocal.length})</h3>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Name</th>
                      <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Email</th>
                      <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Status</th>
                      <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Link To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.unmatchedLocal.map(d => (
                      <tr key={d.id} className="border-t border-gray-100">
                        <td className="px-4 py-2 text-gray-900">{getDriverDisplayName(d)}</td>
                        <td className="px-4 py-2 text-gray-500 text-xs">{d.email || '—'}</td>
                        <td className="px-4 py-2">
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${d.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                            {d.status}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          {preview.unmatchedOptimo.length > 0 ? (
                            <select
                              value={reverseLinkMap[d.id] || ''}
                              onChange={e => setReverseLinkMap(prev => ({ ...prev, [d.id]: e.target.value }))}
                              className="px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                            >
                              <option value="">— Select OptimoRoute driver —</option>
                              {preview.unmatchedOptimo.map(od => (
                                <option key={od.serial} value={od.serial}>
                                  {od.name} ({od.serial})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs text-gray-400">No unlinked OptimoRoute drivers</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Unified action bar */}
          {totalMappings > 0 && (
            <div className="sticky bottom-0 bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3 shadow-lg">
              <Button onClick={handleSync} disabled={syncing}>
                {syncing ? 'Linking...' : `Link ${totalMappings} Driver(s)`}
              </Button>
              <span className="text-xs text-gray-500">{totalMappings} mapping{totalMappings !== 1 ? 's' : ''} selected</span>
            </div>
          )}

          {preview.matched.length === 0 && preview.unmatchedOptimo.length === 0 && preview.unmatchedLocal.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <p className="text-gray-400 font-bold">No drivers found in recent routes</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DriverSyncPanel;
