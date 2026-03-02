import React, { useState, useEffect } from 'react';
import { Button } from '../../../components/Button.tsx';
import { LoadingSpinner } from '../ui/index.ts';

interface PendingZone {
  id: string;
  name: string;
  zone_type: string;
  center_lat: number | null;
  center_lng: number | null;
  radius_miles: number | null;
  polygon_coords: [number, number][] | null;
  zip_codes: string[] | null;
  color: string;
  driver_name: string;
  driver_rating: number | null;
  driver_email: string;
  created_at: string;
}

const relativeAge = (dateStr: string) => {
  const hours = Math.floor((Date.now() - new Date(dateStr).getTime()) / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const zoneDetail = (zone: PendingZone): string => {
  if (zone.zone_type === 'circle' && zone.radius_miles != null) {
    return `${zone.radius_miles} mi radius`;
  }
  if (zone.zone_type === 'polygon' && zone.polygon_coords) {
    return `${zone.polygon_coords.length} vertices`;
  }
  if (zone.zone_type === 'zip' && zone.zip_codes) {
    return zone.zip_codes.join(', ');
  }
  return '-';
};

const ZoneApprovalPanel: React.FC<{ onActionResolved?: () => void }> = ({ onActionResolved }) => {
  const [zones, setZones] = useState<PendingZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [lastResult, setLastResult] = useState<{ zoneId: string; flaggedLocations: number } | null>(null);

  const fetchZones = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/pending-zones', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setZones(data.zones);
      }
    } catch (e) {
      console.error('Failed to load pending zones:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchZones(); }, []);

  const submitDecision = async (zoneId: string, decision: 'approved' | 'rejected', notes?: string) => {
    setProcessingId(zoneId);
    try {
      const res = await fetch(`/api/admin/zones/${zoneId}/decision`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ decision, notes }),
      });
      if (res.ok) {
        const data = await res.json();
        if (decision === 'approved' && data.flaggedLocations > 0) {
          setLastResult({ zoneId, flaggedLocations: data.flaggedLocations });
          setTimeout(() => setLastResult(null), 8000);
        }
        setZones(prev => prev.filter(z => z.id !== zoneId));
        setRejectingId(null);
        setRejectNotes('');
        onActionResolved?.();
      }
    } catch (e) {
      console.error('Zone decision failed:', e);
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button onClick={fetchZones}>Refresh</Button>
        <p className="text-sm text-gray-500">
          {zones.length} zone{zones.length !== 1 ? 's' : ''} pending approval
        </p>
      </div>

      {lastResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
          <span className="text-sm font-bold text-emerald-700">
            {lastResult.flaggedLocations} waitlisted location{lastResult.flaggedLocations !== 1 ? 's' : ''} flagged as ready to activate
          </span>
        </div>
      )}

      {zones.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
          <p className="text-green-700 font-bold">No zones pending approval</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Zone Name</th>
                <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Driver</th>
                <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Type</th>
                <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Detail</th>
                <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Submitted</th>
                <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {zones.map(zone => {
                const isProcessing = processingId === zone.id;
                const isRejecting = rejectingId === zone.id;
                return (
                  <React.Fragment key={zone.id}>
                    <tr className="border-t border-gray-100">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: zone.color }} />
                          <span className="font-bold text-gray-900">{zone.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-gray-900">{zone.driver_name}</p>
                        <p className="text-xs text-gray-400">{zone.driver_email}</p>
                        {zone.driver_rating != null && (
                          <p className="text-xs text-yellow-600">{Number(zone.driver_rating).toFixed(1)} rating</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {zone.zone_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{zoneDetail(zone)}</td>
                      <td className="px-4 py-3">
                        <div className="text-gray-600">{new Date(zone.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                        <div className="text-[10px] font-bold text-gray-400">{relativeAge(zone.created_at)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => submitDecision(zone.id, 'approved')}
                            disabled={isProcessing}
                            className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                          >
                            {isProcessing ? 'Processing...' : 'Approve'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setRejectingId(isRejecting ? null : zone.id); setRejectNotes(''); }}
                            disabled={isProcessing}
                            className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isRejecting && (
                      <tr className="bg-red-50">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <input
                              type="text"
                              value={rejectNotes}
                              onChange={e => setRejectNotes(e.target.value)}
                              placeholder="Reason for rejection (optional)"
                              className="flex-1 bg-white border border-red-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400"
                            />
                            <button
                              type="button"
                              onClick={() => submitDecision(zone.id, 'rejected', rejectNotes)}
                              disabled={isProcessing}
                              className="px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                            >
                              {isProcessing ? 'Rejecting...' : 'Confirm Reject'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setRejectingId(null); setRejectNotes(''); }}
                              className="px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ZoneApprovalPanel;
