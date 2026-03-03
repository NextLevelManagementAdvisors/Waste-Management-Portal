import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../../../components/Card.tsx';
import { LoadingSpinner, EmptyState } from '../ui/index.ts';
import type { ContractOpportunity, ContractApplication } from '../../../shared/types/operations.ts';

const OPP_STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700',
  awarded: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-600',
};

const APP_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

const DAY_OPTIONS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

interface OppFormState {
  zoneId: string;
  dayOfWeek: string;
  startDate: string;
  durationMonths: string;
  proposedPerStopRate: string;
  requirementsMinRating: string;
  requirementsEquipment: string[];
  requirementsCertifications: string[];
}

const emptyOppForm: OppFormState = {
  zoneId: '',
  dayOfWeek: 'monday',
  startDate: '',
  durationMonths: '3',
  proposedPerStopRate: '',
  requirementsMinRating: '',
  requirementsEquipment: [],
  requirementsCertifications: [],
};

const EQUIPMENT_OPTIONS = ['residential_truck', 'commercial_dumpster', 'bulk_trailer', 'roll_off'];
const CERT_OPTIONS = ['hazmat', 'cdl_b', 'gated_community', 'medical_waste'];

const OpportunitiesPanel: React.FC = () => {
  const [opportunities, setOpportunities] = useState<ContractOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<OppFormState>(emptyOppForm);
  const [saving, setSaving] = useState(false);
  const [zones, setZones] = useState<Array<{ id: string; name: string }>>([]);
  const [expandedOpp, setExpandedOpp] = useState<string | null>(null);
  const [applications, setApplications] = useState<ContractApplication[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [awarding, setAwarding] = useState(false);
  const [awardForm, setAwardForm] = useState<{ perStopRate: string; termsNotes: string }>({ perStopRate: '', termsNotes: '' });

  const fetchOpportunities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/contract-opportunities', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch opportunities');
      const data = await res.json();
      setOpportunities(data.opportunities || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading opportunities');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchZones = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/service-zones', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setZones((data.zones || []).map((z: any) => ({ id: z.id, name: z.name })));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchOpportunities(); }, [fetchOpportunities]);
  useEffect(() => { fetchZones(); }, [fetchZones]);

  const fetchApplications = async (oppId: string) => {
    setLoadingApps(true);
    try {
      const res = await fetch(`/api/admin/contract-opportunities/${oppId}/applications`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch applications');
      const data = await res.json();
      setApplications(data.applications || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading applications');
    } finally {
      setLoadingApps(false);
    }
  };

  const handleExpand = (oppId: string) => {
    if (expandedOpp === oppId) {
      setExpandedOpp(null);
      setApplications([]);
    } else {
      setExpandedOpp(oppId);
      fetchApplications(oppId);
    }
  };

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = {
        zoneId: form.zoneId,
        dayOfWeek: form.dayOfWeek,
        startDate: form.startDate,
        durationMonths: parseInt(form.durationMonths),
        proposedPerStopRate: form.proposedPerStopRate ? parseFloat(form.proposedPerStopRate) : null,
        requirements: {
          minRating: form.requirementsMinRating ? parseFloat(form.requirementsMinRating) : undefined,
          equipmentTypes: form.requirementsEquipment.length > 0 ? form.requirementsEquipment : undefined,
          certifications: form.requirementsCertifications.length > 0 ? form.requirementsCertifications : undefined,
        },
      };
      const res = await fetch('/api/admin/contract-opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create opportunity');
      }
      setShowForm(false);
      setForm(emptyOppForm);
      fetchOpportunities();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creating opportunity');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this opportunity? Pending applications will not be processed.')) return;
    try {
      const res = await fetch(`/api/admin/contract-opportunities/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'cancelled' }),
      });
      if (!res.ok) throw new Error('Failed to cancel');
      fetchOpportunities();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cancelling opportunity');
    }
  };

  const handleAward = async (oppId: string, applicationId: string) => {
    setAwarding(true);
    setError(null);
    try {
      const body: any = { applicationId };
      if (awardForm.perStopRate) body.perStopRate = parseFloat(awardForm.perStopRate);
      if (awardForm.termsNotes) body.termsNotes = awardForm.termsNotes;

      const res = await fetch(`/api/admin/contract-opportunities/${oppId}/award`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to award');
      }
      setExpandedOpp(null);
      setApplications([]);
      setAwardForm({ perStopRate: '', termsNotes: '' });
      fetchOpportunities();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error awarding contract');
    } finally {
      setAwarding(false);
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return d; }
  };

  const toggleArrayItem = (arr: string[], item: string) =>
    arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];

  if (loading && opportunities.length === 0) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Contract Opportunities</h3>
          <p className="text-sm text-gray-500">Post zone+day openings for drivers to apply. Review applications and award contracts.</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setForm(emptyOppForm); }}
          className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700"
        >
          Post Opportunity
        </button>
      </div>

      {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      {showForm && (
        <Card>
          <div className="p-4 space-y-4">
            <h4 className="font-bold text-gray-900">New Contract Opportunity</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Service Zone</label>
                <select value={form.zoneId} onChange={e => setForm({ ...form, zoneId: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Select zone...</option>
                  {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Day of Week</label>
                <select value={form.dayOfWeek} onChange={e => setForm({ ...form, dayOfWeek: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm capitalize">
                  {DAY_OPTIONS.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input type="date" value={form.startDate}
                  onChange={e => setForm({ ...form, startDate: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Duration (months)</label>
                <select value={form.durationMonths} onChange={e => setForm({ ...form, durationMonths: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {[1, 2, 3, 6, 9, 12].map(m => <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Proposed Per-Stop Rate ($)</label>
                <input type="number" step="0.01" min="0" value={form.proposedPerStopRate}
                  onChange={e => setForm({ ...form, proposedPerStopRate: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Leave blank if open to negotiation" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min. Driver Rating</label>
                <input type="number" step="0.1" min="0" max="5" value={form.requirementsMinRating}
                  onChange={e => setForm({ ...form, requirementsMinRating: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="e.g. 3.5" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Required Equipment</label>
                <div className="flex flex-wrap gap-1.5">
                  {EQUIPMENT_OPTIONS.map(eq => (
                    <button key={eq} type="button"
                      onClick={() => setForm({ ...form, requirementsEquipment: toggleArrayItem(form.requirementsEquipment, eq) })}
                      className={`px-2 py-1 text-xs rounded-full border ${form.requirementsEquipment.includes(eq) ? 'bg-teal-100 text-teal-700 border-teal-300' : 'bg-white text-gray-600 border-gray-300'}`}>
                      {eq.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Required Certifications</label>
                <div className="flex flex-wrap gap-1.5">
                  {CERT_OPTIONS.map(c => (
                    <button key={c} type="button"
                      onClick={() => setForm({ ...form, requirementsCertifications: toggleArrayItem(form.requirementsCertifications, c) })}
                      className={`px-2 py-1 text-xs rounded-full border ${form.requirementsCertifications.includes(c) ? 'bg-teal-100 text-teal-700 border-teal-300' : 'bg-white text-gray-600 border-gray-300'}`}>
                      {c.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={handleCreate}
                disabled={saving || !form.zoneId || !form.startDate}
                className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50">
                {saving ? 'Posting...' : 'Post Opportunity'}
              </button>
              <button onClick={() => { setShowForm(false); setForm(emptyOppForm); }}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200">
                Cancel
              </button>
            </div>
          </div>
        </Card>
      )}

      {opportunities.length === 0 ? (
        <EmptyState message="No contract opportunities posted yet. Post one to let drivers apply for zone+day assignments." />
      ) : (
        <div className="space-y-2">
          {opportunities.map(opp => (
            <Card key={opp.id}>
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900">{opp.zoneName}</span>
                      <span className="text-gray-400">|</span>
                      <span className="text-sm text-gray-700 capitalize">{opp.dayOfWeek}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${OPP_STATUS_COLORS[opp.status]}`}>
                        {opp.status}
                      </span>
                      {opp.applicationCount != null && opp.applicationCount > 0 && (
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                          {opp.applicationCount} application{opp.applicationCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex gap-3 flex-wrap">
                      <span>Starts {formatDate(opp.startDate)}</span>
                      <span>{opp.durationMonths} month{opp.durationMonths !== 1 ? 's' : ''}</span>
                      {opp.proposedPerStopRate != null && <span>${opp.proposedPerStopRate.toFixed(2)}/stop proposed</span>}
                      {opp.requirements?.minRating && <span>Min rating: {opp.requirements.minRating}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-3">
                    {opp.status === 'open' && (
                      <>
                        <button onClick={() => handleExpand(opp.id)}
                          className="px-3 py-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100">
                          {expandedOpp === opp.id ? 'Hide' : 'Review'} Applications
                        </button>
                        <button onClick={() => handleCancel(opp.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600" title="Cancel Opportunity">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Applications review */}
                {expandedOpp === opp.id && (
                  <div className="mt-4 border-t pt-4 space-y-3">
                    <h5 className="text-sm font-bold text-gray-700">Applications</h5>
                    {loadingApps ? (
                      <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-teal-600" /></div>
                    ) : applications.length === 0 ? (
                      <p className="text-sm text-gray-500">No applications yet.</p>
                    ) : (
                      <>
                        <div className="space-y-2">
                          {applications.map(app => (
                            <div key={app.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-gray-900 text-sm">{app.driverName}</span>
                                  {app.driverRating != null && (
                                    <span className="text-xs text-gray-500">{app.driverRating.toFixed(1)} rating</span>
                                  )}
                                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${APP_STATUS_COLORS[app.status]}`}>
                                    {app.status}
                                  </span>
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5 flex gap-3">
                                  {app.proposedRate != null && <span>Proposed: ${app.proposedRate.toFixed(2)}/stop</span>}
                                  {app.message && <span>"{app.message}"</span>}
                                  <span>Applied {formatDate(app.createdAt)}</span>
                                </div>
                              </div>
                              {app.status === 'pending' && (
                                <button
                                  onClick={() => handleAward(opp.id, app.id)}
                                  disabled={awarding}
                                  className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                                >
                                  {awarding ? 'Awarding...' : 'Award Contract'}
                                </button>
                              )}
                            </div>
                          ))}
                        </div>

                        {applications.some(a => a.status === 'pending') && (
                          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                            <p className="text-xs font-medium text-gray-600">Award options (optional overrides):</p>
                            <div className="flex gap-3">
                              <input type="number" step="0.01" min="0" placeholder="Per-stop rate override"
                                value={awardForm.perStopRate}
                                onChange={e => setAwardForm({ ...awardForm, perStopRate: e.target.value })}
                                className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
                              <input type="text" placeholder="Contract terms/notes"
                                value={awardForm.termsNotes}
                                onChange={e => setAwardForm({ ...awardForm, termsNotes: e.target.value })}
                                className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default OpportunitiesPanel;
