import React, { useState, useEffect } from 'react';
import { Button } from '../../../components/Button.tsx';
import { LoadingSpinner } from '../ui/index.ts';

interface PendingProperty {
  id: string;
  address: string;
  serviceType: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  submittedAt: string;
  notes: string | null;
  inHoa: boolean;
  communityName: string | null;
  hasGateCode: boolean;
}

interface FeasibilityResult {
  feasible: boolean;
  reason: string;
}

interface RouteSuggestion {
  zone_id: string;
  zone_name: string;
  pickup_day: string;
  confidence: number;
  distance_miles: number;
}

const reasonLabels: Record<string, { text: string; color: string; bg: string }> = {
  scheduled: { text: 'Feasible', color: 'text-green-700', bg: 'bg-green-100' },
  not_schedulable: { text: 'Infeasible', color: 'text-red-700', bg: 'bg-red-100' },
  invalid_address: { text: 'Invalid Address', color: 'text-yellow-700', bg: 'bg-yellow-100' },
  planning_timeout: { text: 'Timeout', color: 'text-gray-700', bg: 'bg-gray-100' },
  unknown: { text: 'Unknown', color: 'text-gray-700', bg: 'bg-gray-100' },
};

const AddressReviewPanel: React.FC = () => {
  const [properties, setProperties] = useState<PendingProperty[]>([]);
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

  const fetchRouteSuggestion = async (propertyId: string) => {
    setSuggestingIds(prev => new Set(prev).add(propertyId));
    try {
      const res = await fetch(`/api/admin/address-reviews/${propertyId}/route-suggestion`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setRouteSuggestions(prev => ({ ...prev, [propertyId]: data.suggestion }));
      }
    } catch (e) {
      console.error('Route suggestion failed:', e);
    } finally {
      setSuggestingIds(prev => { const next = new Set(prev); next.delete(propertyId); return next; });
    }
  };

  const fetchProperties = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/address-reviews', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setProperties(data.properties);
        setSelected(new Set());
      }
    } catch (e) {
      console.error('Failed to load pending reviews:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProperties(); }, []);

  // Auto-fetch route suggestions for all pending properties
  useEffect(() => {
    for (const prop of properties) {
      if (!(prop.id in routeSuggestions) && !suggestingIds.has(prop.id)) {
        fetchRouteSuggestion(prop.id);
      }
    }
  }, [properties]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === properties.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(properties.map(p => p.id)));
    }
  };

  const bulkDecision = async (decision: 'approved' | 'denied') => {
    if (selected.size === 0) return;
    setBulkProcessing(true);
    try {
      const res = await fetch('/api/admin/address-reviews/bulk-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ propertyIds: Array.from(selected), decision }),
      });
      if (res.ok) {
        const data = await res.json();
        // Remove successfully processed properties
        const succeededIds = new Set(data.results.filter((r: any) => r.success).map((r: any) => r.id));
        setProperties(prev => prev.filter(p => !succeededIds.has(p.id)));
        setSelected(new Set());
        setFeasibilityResults(prev => {
          const next = { ...prev };
          succeededIds.forEach((id: string) => delete next[id]);
          return next;
        });
      }
    } catch (e) {
      console.error('Bulk decision failed:', e);
    } finally {
      setBulkProcessing(false);
    }
  };

  const checkFeasibility = async (propertyId: string) => {
    setCheckingId(propertyId);
    try {
      const res = await fetch(`/api/admin/address-reviews/${propertyId}/check-feasibility`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const result: FeasibilityResult = await res.json();
        setFeasibilityResults(prev => ({ ...prev, [propertyId]: result }));
      }
    } catch (e) {
      console.error('Feasibility check failed:', e);
    } finally {
      setCheckingId(null);
    }
  };

  const submitDecision = async (propertyId: string, decision: 'approved' | 'denied', notes?: string) => {
    setSavingId(propertyId);
    try {
      const res = await fetch(`/api/admin/address-reviews/${propertyId}/decision`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ decision, notes }),
      });
      if (res.ok) {
        setProperties(prev => prev.filter(p => p.id !== propertyId));
        setFeasibilityResults(prev => {
          const next = { ...prev };
          delete next[propertyId];
          return next;
        });
        setSelected(prev => {
          const next = new Set(prev);
          next.delete(propertyId);
          return next;
        });
        setDenyingId(null);
        setDenyNotes('');
      }
    } catch (e) {
      console.error('Decision failed:', e);
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <LoadingSpinner />;

  if (properties.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button onClick={fetchProperties}>Refresh</Button>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
          <p className="text-green-700 font-bold">No addresses pending review</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={fetchProperties}>Refresh</Button>
        <p className="text-sm text-gray-500">
          {properties.length} address{properties.length !== 1 ? 'es' : ''} pending review
        </p>
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
                  checked={selected.size === properties.length && properties.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300"
                />
              </th>
              <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Address</th>
              <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Customer</th>
              <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Type</th>
              <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Submitted</th>
              <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Feasibility</th>
              <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-left">Route</th>
              <th className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {properties.map(prop => {
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
                      <p className="font-bold text-gray-900">{prop.customerName}</p>
                      <p className="text-xs text-gray-400">{prop.customerEmail}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {prop.serviceType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(prop.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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
                          {routeSuggestions[prop.id]!.pickup_day !== 'unknown' && (
                            <span className="text-[10px] font-bold text-teal-700 bg-teal-100 px-1.5 py-0.5 rounded capitalize">
                              {routeSuggestions[prop.id]!.pickup_day.slice(0, 3)}
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
                      <td colSpan={8} className="px-4 py-3">
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
