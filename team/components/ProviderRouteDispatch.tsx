import React, { useState, useEffect } from 'react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';

interface ProviderRoute {
  id: string;
  name: string;
  zone_name?: string;
  scheduled_date: string;
  stop_count: number;
  provider_dispatch_status: string;
  provider_per_stop_rate?: number;
  assigned_driver_id?: string;
  assigned_driver_name?: string;
  assigned_vehicle_id?: string;
  assigned_vehicle_label?: string;
  provider_declined_reason?: string;
}

interface DispatchOption {
  id: string;
  name: string;
  optimoroute_driver_id?: string;
}

interface VehicleOption {
  id: string;
  label: string;
  status: string;
  registration_expires_at?: string;
}

const ProviderRouteDispatch: React.FC = () => {
  const [routes, setRoutes] = useState<ProviderRoute[]>([]);
  const [members, setMembers] = useState<DispatchOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Dispatch state per route
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<Record<string, string>>({});
  const [selectedVehicle, setSelectedVehicle] = useState<Record<string, string>>({});
  const [declineReason, setDeclineReason] = useState<Record<string, string>>({});
  const [decliningId, setDecliningId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [routesRes, membersRes, vehiclesRes] = await Promise.all([
        fetch('/api/team/my-provider/routes', { credentials: 'include' }),
        fetch('/api/team/my-provider/members', { credentials: 'include' }),
        fetch('/api/team/my-provider/vehicles', { credentials: 'include' }),
      ]);
      if (routesRes.ok) setRoutes((await routesRes.json()).routes || []);
      if (membersRes.ok) {
        const data = (await membersRes.json()).members || [];
        setMembers(data.map((m: any) => ({ id: m.user_id, name: m.name, optimoroute_driver_id: m.optimoroute_driver_id })));
      }
      if (vehiclesRes.ok) {
        const data = (await vehiclesRes.json()).vehicles || [];
        setVehicles(data.filter((v: any) => v.status === 'active').map((v: any) => ({
          id: v.id,
          label: `${v.year} ${v.make} ${v.model}${v.license_plate ? ` (${v.license_plate})` : ''}`,
          status: v.status,
          registration_expires_at: v.registration_expires_at,
        })));
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const showMsg = (msg: string, isError = false) => {
    if (isError) { setError(msg); setSuccess(''); }
    else { setSuccess(msg); setError(''); }
    setTimeout(() => { setError(''); setSuccess(''); }, 5000);
  };

  const handleDispatch = async (routeId: string) => {
    const driverId = selectedDriver[routeId];
    const vehicleId = selectedVehicle[routeId];
    if (!driverId || !vehicleId) { showMsg('Select a driver and vehicle before dispatching', true); return; }

    const driver = members.find(m => m.id === driverId);
    if (!driver?.optimoroute_driver_id) {
      showMsg(`${driver?.name || 'This driver'} doesn't have an OptimoRoute ID set. Go to the Team tab to add it before dispatching.`, true);
      return;
    }

    setDispatching(routeId);
    try {
      const res = await fetch(`/api/team/my-provider/routes/${routeId}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ driverId, vehicleId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Dispatch failed');
      showMsg('Route dispatched successfully');
      load();
    } catch (err: any) {
      showMsg(err.message, true);
    } finally {
      setDispatching(null);
    }
  };

  const handleRecall = async (routeId: string) => {
    if (!confirm('Recall this dispatch? The driver will be unassigned.')) return;
    try {
      const res = await fetch(`/api/team/my-provider/routes/${routeId}/recall`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error();
      showMsg('Dispatch recalled');
      load();
    } catch {
      showMsg('Failed to recall dispatch', true);
    }
  };

  const handleDecline = async (routeId: string) => {
    const reason = declineReason[routeId]?.trim();
    if (!reason) { showMsg('A reason is required to decline a route', true); return; }
    try {
      const res = await fetch(`/api/team/my-provider/routes/${routeId}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to decline');
      showMsg('Route declined. Admin has been notified.');
      setDecliningId(null);
      load();
    } catch (err: any) {
      showMsg(err.message, true);
    }
  };

  const unassigned = routes.filter(r => !r.provider_dispatch_status || r.provider_dispatch_status === 'unassigned');
  const dispatched = routes.filter(r => r.provider_dispatch_status === 'dispatched');

  const estimatedPay = (r: ProviderRoute) =>
    r.provider_per_stop_rate ? `~$${(r.provider_per_stop_rate * r.stop_count).toFixed(2)}` : 'Rate TBD';

  if (loading) return <div className="py-12 text-center text-gray-400 text-sm">Loading routes...</div>;

  return (
    <div className="space-y-6">
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      {success && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{success}</div>}

      {/* Unassigned */}
      <Card className="p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Unassigned Routes ({unassigned.length})</h3>
        {unassigned.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
            No routes waiting for dispatch
          </div>
        ) : (
          <div className="space-y-4">
            {unassigned.map(r => (
              <div key={r.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-gray-900">{r.name || r.zone_name || 'Route'}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(r.scheduled_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      {' · '}{r.stop_count} stops · {estimatedPay(r)}
                      {r.provider_per_stop_rate && <span> (${r.provider_per_stop_rate}/stop)</span>}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Driver</label>
                    <select
                      value={selectedDriver[r.id] || ''}
                      onChange={e => setSelectedDriver(p => ({ ...p, [r.id]: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">— Select driver —</option>
                      {members.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name}{!m.optimoroute_driver_id ? ' ⚠ No OptimoRoute ID' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Vehicle</label>
                    <select
                      value={selectedVehicle[r.id] || ''}
                      onChange={e => setSelectedVehicle(p => ({ ...p, [r.id]: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">— Select vehicle —</option>
                      {vehicles.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleDispatch(r.id)}
                    disabled={dispatching === r.id}
                  >
                    {dispatching === r.id ? 'Dispatching...' : 'Dispatch'}
                  </Button>

                  {decliningId === r.id ? (
                    <div className="flex-1 flex gap-2">
                      <input
                        type="text"
                        value={declineReason[r.id] || ''}
                        onChange={e => setDeclineReason(p => ({ ...p, [r.id]: e.target.value }))}
                        placeholder="Reason for declining (required)"
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                      />
                      <Button size="sm" variant="secondary" onClick={() => handleDecline(r.id)}>Submit</Button>
                      <Button size="sm" variant="ghost" onClick={() => setDecliningId(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDecliningId(r.id)}
                      className="text-sm text-red-600 hover:text-red-700 font-medium"
                    >
                      Decline
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Dispatched */}
      <Card className="p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Dispatched Routes ({dispatched.length})</h3>
        {dispatched.length === 0 ? (
          <div className="py-6 text-center text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
            No dispatched routes
          </div>
        ) : (
          <div className="space-y-3">
            {dispatched.map(r => (
              <div key={r.id} className="border border-teal-200 bg-teal-50 rounded-xl p-4 flex items-start justify-between gap-4">
                <div>
                  <p className="font-bold text-gray-900">{r.name || r.zone_name || 'Route'}</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {new Date(r.scheduled_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    {' · '}{r.stop_count} stops · {estimatedPay(r)}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-teal-700">
                    {r.assigned_driver_name && <span>Driver: <strong>{r.assigned_driver_name}</strong></span>}
                    {r.assigned_vehicle_label && <span>Vehicle: <strong>{r.assigned_vehicle_label}</strong></span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRecall(r.id)}
                  className="text-xs text-gray-500 hover:text-red-600 flex-shrink-0 underline"
                >
                  Recall
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default ProviderRouteDispatch;
