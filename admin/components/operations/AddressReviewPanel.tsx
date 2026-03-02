import React, { useState, useEffect } from 'react';
import { Button } from '../../../components/Button.tsx';
import { LoadingSpinner } from '../ui/index.ts';

interface PendingProperty {
  id: string;
  address: string;
  serviceType: string;
  serviceStatus: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  submittedAt: string;
  notes: string | null;
  inHoa: boolean;
  communityName: string | null;
  hasGateCode: boolean;
  coverageFlaggedAt: string | null;
  coverageZoneName: string | null;
}

interface FeasibilityResult {
  feasible: boolean;
  reason: string;
}

interface RouteSuggestion {
  zone_name: string;
  driver_name?: string;
  collection_day: string;
  confidence: number;
  distance_miles: number;
}

const relativeAge = (dateStr: string) => {
  const hours = Math.floor((Date.now() - new Date(dateStr).getTime()) / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const ageColor = (dateStr: string) => {
  const hours = (Date.now() - new Date(dateStr).getTime()) / 3600000;
  if (hours >= 72) return 'text-red-500';
  if (hours >= 24) return 'text-orange-500';
  return 'text-gray-400';
};

const reasonLabels: Record<string, { text: string; color: string; bg: string }> = {
  scheduled: { text: 'Feasible', color: 'text-green-700', bg: 'bg-green-100' },
  not_schedulable: { text: 'Infeasible', color: 'text-red-700', bg: 'bg-red-100' },
  invalid_address: { text: 'Invalid Address', color: 'text-yellow-700', bg: 'bg-yellow-100' },
  planning_timeout: { text: 'Timeout', color: 'text-gray-700', bg: 'bg-gray-100' },
  unknown: { text: 'Unknown', color: 'text-gray-700', bg: 'bg-gray-100' },
};

const AddressReviewPanel: React.FC<{ onActionResolved?: () => void }> = ({ onActionResolved }) => {
  const [locations, setLocations] = useState<PendingProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [feasibilityResults, setFeasibilityResults] = useState<Record<string, FeasibilityResult>>({});
  const [denyingId, setDenyingId] = useState<string | null>(null);
  const [denyNotes, setDenyNotes] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [routeSuggestions, setRouteSuggestions] = useState<Record<string, RouteSuggestion | null>>({});
  const [suggestingIds, setSuggestingIds] = useState<Set<string>>(new Set());
  const [filterCoverage, setFilterCoverage] = useState(false);

  const fetchRouteSuggestion = async (locationId: string) => {
    setSuggestingIds(prev => new Set(prev).add(locationId));
    try {
      const res = await fetch(`/api/admin/address-reviews/${locationId}/route-suggestion`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setRouteSuggestions(prev => ({ ...prev, [locationId]: data.suggestion }));
      }
    } catch (e) {
      console.error('Route suggestion failed:', e);
    } finally {
      setSuggestingIds(prev => { const next = new Set(prev); next.delete(locationId); return next; });
    }
  };

  const fetchLocations = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/address-reviews', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setLocations(data.locations);
        setSelected(new Set());
      }
    } catch (e) {
      console.error('Failed to load pending reviews:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLocations(); }, []);

  // Auto-fetch route suggestions for all pending locations
  useEffect(() => {
    for (const prop of locations) {
      if (!(prop.id in routeSuggestions) && !suggestingIds.has(prop.id)) {
        fetchRouteSuggestion(prop.id);
      }
    }
  }, [locations]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === locations.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(locations.map(p => p.id)));
    }
  };

  const bulkDecision = async (decision: 'approved' | 'denied' | 'waitlist') => {
    if (selected.size === 0) return;
    setBulkProcessing(true);
    try {
      const res = await fetch('/api/admin/address-reviews/bulk-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ locationIds: Array.from(selected), decision }),
      });
      if (res.ok) {
        const data = await res.json();
        // Remove successfully processed locations
        const succeededIds = new Set(data.results.filter((r: any) => r.success).map((r: any) => r.id));
        setLocations(prev => prev.filter(p => !succeededIds.has(p.id)));
        setSelected(new Set());
        setFeasibilityResults(prev => {
          const next = { ...prev };
          succeededIds.forEach((id: string) => delete next[id]);
          return next;
        });
        onActionResolved?.();
      }
    } catch (e) {
      console.error('Bulk decision failed:', e);
    } finally {
      setBulkProcessing(false);
    }
  };

  const checkFeasibility = async (locationId: string) => {
    setCheckingId(locationId);
    try {
      const res = await fetch(`/api/admin/address-reviews/${locationId}/check-feasibility`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const result: FeasibilityResult = await res.json();
        setFeasibilityResults(prev => ({ ...prev, [locationId]: result }));
      }
    } catch (e) {
      console.error('Feasibility check failed:', e);
    } finally {
      setCheckingId(null);
    }
  };

  const submitDecision = async (locationId: string, decision: 'approved' | 'denied' | 'waitlist', notes?: string) => {
    setSavingId(locationId);
    try {
      const res = await fetch(`/api/admin/address-reviews/${locationId}/decision`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ decision, notes }),
      });
      if (res.ok) {
        setLocations(prev => prev.filter(p => p.id !== locationId));
        setFeasibilityResults(prev => {
          const next = { ...prev };
          delete next[locationId];
          return next;
        });
        setSelected(prev => {
          const next = new Set(prev);
          next.delete(locationId);
          return next;
        });
        setDenyingId(null);
        setDenyNotes('');
        onActionResolved?.();
      }
    } catch (e) {
      console.error('Decision failed:', e);
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <LoadingSpinner />;

  if (locations.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button onClick={fetchLocations}>Refresh</Button>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
          <p className="text-green-700 font-bold">No addresses pending review</p>
        </div>
      </div>
    );
  }

  const flaggedCount = locations.filter(p => p.coverageFlaggedAt).length;
  const displayed = filterCoverage ? locations.filter(p => p.coverageFlaggedAt) : locations;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={fetchLocations}>Refresh</Button>
        <p className="text-sm text-gray-500">
          {locations.length} address{locations.length !== 1 ? 'es' : ''} pending review
        </p>
        {flaggedCount > 0 && (
          <button
            onClick={() => setFilterCoverage(!filterCoverage)}
            className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg border transition-colors ${
              filterCoverage
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'
            }`}
          >
            Coverage Available ({flaggedCount})
          </button>
        )}
        {selected.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm font-bold text-teal-700">{selected.size} selected</span>
            <button
              onClick={() => bulkDecision('approved')}
              disabled={bulkProcessing}
              className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {bulkProcessing ? 'Processing...' : 'Approve All'}
            </button>
            <button
              onClick={() => bulkDecision('waitlist')}
              disabled={bulkProcessing}
              className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              Waitlist All
            </button>
            <button
              onClick={() => bulkDecision('denied')}
              disabled={bulkProcessing}
              className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              Deny All
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-3 py-2 text-left">
                <input
                  type="checkbox"
                  checked={selected.size === locations.length && locations.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300"
                />
              </th>
              <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Address</th>
              <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Status</th>
              <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Customer</th>
              <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Type</th>
              <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Submitted</th>
              <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Feasibility</th>
              <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Route</th>
              <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map(prop => {
              const result = feasibilityResults[prop.id];
              const isChecking = checkingId === prop.id;
              const isDenying = denyingId === prop.id;
              const isSaving = savingId === prop.id;
              const reasonInfo = result ? (reasonLabels[result.reason] || reasonLabels.unknown) : null;

              return (
                <React.Fragment key={prop.id}>
                  <tr className="border-t border-gray-100">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(prop.id)}
                        onChange={() => toggleSelect(prop.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-gray-900 max-w-[250px] truncate">{prop.address}</p>
                      {prop.notes && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[250px]">{prop.notes}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {prop.serviceStatus === 'waitlist' ? (
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 w-fit">Waitlisted</span>
                        ) : (
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 w-fit">Pending</span>
                        )}
                        {prop.coverageFlaggedAt && (
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 w-fit" title={`Zone: ${prop.coverageZoneName || 'Unknown'}`}>
                            Coverage Available
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-gray-900">{prop.customerName}</p>
                      <p className="text-xs text-gray-400">{prop.customerEmail}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {prop.serviceType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-600">{new Date(prop.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                      <div className={`text-[10px] font-bold ${ageColor(prop.submittedAt)}`}>{relativeAge(prop.submittedAt)}</div>
                    </td>
                    <td className="px-4 py-3">
                      {isChecking ? (
                        <span className="text-[10px] font-black uppercase text-gray-400 animate-pulse">Checking...</span>
                      ) : reasonInfo ? (
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${reasonInfo.bg} ${reasonInfo.color}`}>
                          {reasonInfo.text}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-300">&mdash;</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {suggestingIds.has(prop.id) ? (
                        <span className="text-[10px] font-black uppercase text-gray-400 animate-pulse">Loading...</span>
                      ) : routeSuggestions[prop.id] ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">
                            {routeSuggestions[prop.id]!.zone_name}
                          </span>
                          {routeSuggestions[prop.id]!.collection_day && routeSuggestions[prop.id]!.collection_day !== 'unknown' && (
                            <span className="text-[10px] font-bold text-teal-700 bg-teal-100 px-1.5 py-0.5 rounded capitalize">
                              {routeSuggestions[prop.id]!.collection_day.slice(0, 3)}
                            </span>
                          )}
                        </div>
                      ) : routeSuggestions[prop.id] === null ? (
                        <span className="text-[10px] text-gray-300">&mdash;</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => checkFeasibility(prop.id)}
                          disabled={isChecking || checkingId !== null || savingId !== null}
                          className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                        >
                          Check Route
                        </button>
                        <button
                          onClick={() => submitDecision(prop.id, 'approved')}
                          disabled={savingId !== null}
                          className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                          {isSaving && savingId === prop.id ? 'Approving...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => submitDecision(prop.id, 'waitlist')}
                          disabled={savingId !== null}
                          className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          Waitlist
                        </button>
                        <button
                          onClick={() => { setDenyingId(isDenying ? null : prop.id); setDenyNotes(''); }}
                          disabled={savingId !== null}
                          className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                        >
                          Deny
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isDenying && (
                    <tr className="bg-red-50">
                      <td colSpan={9} className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <input
                            type="text"
                            value={denyNotes}
                            onChange={e => setDenyNotes(e.target.value)}
                            placeholder="Reason for denial (optional)"
                            className="flex-1 bg-white border border-red-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400"
                          />
                          <button
                            onClick={() => submitDecision(prop.id, 'denied', denyNotes)}
                            disabled={savingId !== null}
                            className="px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                          >
                            {isSaving ? 'Denying...' : 'Confirm Deny'}
                          </button>
                          <button
                            onClick={() => { setDenyingId(null); setDenyNotes(''); }}
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
    </div>
  );
};

export default AddressReviewPanel;
