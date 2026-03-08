import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../../../components/Card.tsx';
import { LoadingSpinner, EmptyState } from '../ui/index.ts';
import type { RouteContract, ContractStatus, ContractPerformance } from '../../../shared/types/operations.ts';

interface DashboardData {
  activeCount: number;
  pendingCount: number;
  expiredCount: number;
  expiringCount: number;
  pendingCoverageCount: number;
  expiringContracts: Array<{ id: string; driverName: string; zoneName: string; dayOfWeek: string; endDate: string; perOrderRate: number | null }>;
}

interface CoverageRequestAdmin {
  id: string;
  contractId: string;
  requestingDriverId: string;
  requestingDriverName: string;
  coverageDate: string;
  reason: string;
  reasonNotes: string | null;
  substituteDriverId: string | null;
  substituteDriverName: string | null;
  substitutePay: number | null;
  status: string;
  dayOfWeek: string;
  zoneName: string;
}

interface CreateRoutesModalProps {
  contract: RouteContract;
  onClose: () => void;
  onCreated: () => void;
}

const CreateRoutesModal: React.FC<CreateRoutesModalProps> = ({ contract, onClose, onCreated }) => {
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [singleDate, setSingleDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    setResult(null);
    try {
      if (mode === 'single') {
        const res = await fetch(`/api/admin/contracts/${contract.id}/create-route`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ scheduledDate: singleDate }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to create route');
        }
        const data = await res.json();
        setResult(`Route created: ${data.route.title} with ${data.route.orderCount} orders ($${(data.route.computedValue ?? 0).toFixed(2)} value)`);
      } else {
        const res = await fetch(`/api/admin/contracts/${contract.id}/create-routes-bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ startDate, endDate }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to create routes');
        }
        const data = await res.json();
        setResult(`${data.routesCreated} route(s) created, ${data.skippedDates} date(s) skipped (already exist)`);
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creating routes');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-lg font-bold text-gray-900">Create Routes for Contract</h3>
        <p className="text-sm text-gray-500">
          {contract.driverName} | {contract.zoneName} | {contract.dayOfWeek}
        </p>

        <div className="flex gap-2">
          <button onClick={() => setMode('single')}
            className={`px-3 py-1.5 text-xs font-medium rounded-full ${mode === 'single' ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-600'}`}>
            Single Date
          </button>
          <button onClick={() => setMode('bulk')}
            className={`px-3 py-1.5 text-xs font-medium rounded-full ${mode === 'bulk' ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-600'}`}>
            Date Range
          </button>
        </div>

        {mode === 'single' ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date (must be a {contract.dayOfWeek})</label>
            <input type="date" value={singleDate} onChange={e => setSingleDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        )}

        {error && <div className="p-2 bg-red-50 text-red-700 rounded-lg text-xs">{error}</div>}
        {result && <div className="p-2 bg-green-50 text-green-700 rounded-lg text-xs">{result}</div>}

        <div className="flex gap-2 pt-2">
          <button onClick={handleCreate}
            disabled={creating || (mode === 'single' ? !singleDate : !startDate || !endDate)}
            className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50">
            {creating ? 'Creating...' : mode === 'single' ? 'Create Route' : 'Create Routes'}
          </button>
          <button onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const STATUS_COLORS: Record<ContractStatus, string> = {
  active: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  expired: 'bg-gray-100 text-gray-600',
  terminated: 'bg-red-100 text-red-700',
};

const DAY_OPTIONS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

interface FormState {
  driverId: string;
  zoneId: string;
  dayOfWeek: string;
  startDate: string;
  endDate: string;
  perOrderRate: string;
  termsNotes: string;
  status: ContractStatus;
}

const emptyForm: FormState = {
  driverId: '',
  zoneId: '',
  dayOfWeek: 'monday',
  startDate: '',
  endDate: '',
  perOrderRate: '',
  termsNotes: '',
  status: 'active',
};

const ContractsPanel: React.FC = () => {
  const [contracts, setContracts] = useState<RouteContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [drivers, setDrivers] = useState<Array<{ id: string; name: string }>>([]);
  const [zones, setZones] = useState<Array<{ id: string; name: string }>>([]);
  const [createRoutesContract, setCreateRoutesContract] = useState<RouteContract | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [coverageRequests, setCoverageRequests] = useState<CoverageRequestAdmin[]>([]);
  const [showCoverage, setShowCoverage] = useState(false);
  const [performanceData, setPerformanceData] = useState<Record<string, ContractPerformance>>({});
  const [expandedPerf, setExpandedPerf] = useState<string | null>(null);
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [renewForm, setRenewForm] = useState({ newEndDate: '', perOrderRate: '' });
  const [coverageFillForm, setCoverageFillForm] = useState<{ id: string; substituteDriverId: string; substitutePay: string } | null>(null);
  const [showAssignLog, setShowAssignLog] = useState(false);
  const [assignLog, setAssignLog] = useState<Array<{ id: number; locationAddress: string | null; assigned: boolean; reason: string | null; details: string | null; compensation: number | null; capacityWarning: boolean; driverName: string | null; zoneName: string | null; createdAt: string }>>([]);
  const [assignLogSummary, setAssignLogSummary] = useState({ total: 0, assignedCount: 0 });

  const fetchContracts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/admin/contracts?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch contracts');
      const data = await res.json();
      setContracts(data.contracts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading contracts');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const fetchDriversAndZones = useCallback(async () => {
    try {
      const [dRes, zRes] = await Promise.all([
        fetch('/api/admin/drivers', { credentials: 'include' }),
        fetch('/api/admin/service-zones', { credentials: 'include' }),
      ]);
      if (dRes.ok) {
        const dData = await dRes.json();
        setDrivers((dData || []).map((d: any) => ({ id: d.id, name: d.name })));
      }
      if (zRes.ok) {
        const zData = await zRes.json();
        setZones((zData.zones || []).map((z: any) => ({ id: z.id, name: z.name })));
      }
    } catch { /* ignore */ }
  }, []);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/contracts/dashboard', { credentials: 'include' });
      if (res.ok) setDashboard((await res.json()).data);
    } catch { /* ignore */ }
  }, []);

  const fetchCoverageRequests = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/coverage-requests?status=pending', { credentials: 'include' });
      if (res.ok) setCoverageRequests((await res.json()).data || []);
    } catch { /* ignore */ }
  }, []);

  const fetchAssignLog = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/auto-assignment-log?days=7&limit=20', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAssignLog(data.data || []);
        setAssignLogSummary({ total: data.total || 0, assignedCount: data.assignedCount || 0 });
      }
    } catch { /* ignore */ }
  }, []);

  const fetchPerformance = async (contractId: string) => {
    if (performanceData[contractId]) { setExpandedPerf(expandedPerf === contractId ? null : contractId); return; }
    try {
      const res = await fetch(`/api/admin/contracts/${contractId}/performance`, { credentials: 'include' });
      if (res.ok) {
        const d = (await res.json()).data;
        setPerformanceData(prev => ({ ...prev, [contractId]: d }));
        setExpandedPerf(contractId);
      }
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchContracts(); }, [fetchContracts]);
  useEffect(() => { fetchDriversAndZones(); }, [fetchDriversAndZones]);
  useEffect(() => { fetchDashboard(); fetchCoverageRequests(); }, [fetchDashboard, fetchCoverageRequests]);
  useEffect(() => { if (showAssignLog) fetchAssignLog(); }, [showAssignLog, fetchAssignLog]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: any = {
        driverId: form.driverId,
        zoneId: form.zoneId,
        dayOfWeek: form.dayOfWeek,
        startDate: form.startDate,
        endDate: form.endDate,
        perOrderRate: form.perOrderRate ? parseFloat(form.perOrderRate) : null,
        termsNotes: form.termsNotes || null,
        status: form.status,
      };

      const url = editingId ? `/api/admin/contracts/${editingId}` : '/api/admin/contracts';
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save contract');
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      fetchContracts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving contract');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (c: RouteContract) => {
    setEditingId(c.id);
    setForm({
      driverId: c.driverId,
      zoneId: c.zoneId,
      dayOfWeek: c.dayOfWeek,
      startDate: c.startDate ? c.startDate.split('T')[0] : '',
      endDate: c.endDate ? c.endDate.split('T')[0] : '',
      perOrderRate: c.perOrderRate != null ? c.perOrderRate.toString() : '',
      termsNotes: c.termsNotes || '',
      status: c.status,
    });
    setShowForm(true);
  };

  const handleTerminate = async (id: string) => {
    if (!confirm('Terminate this contract? The driver will lose assignment to this zone+day.')) return;
    try {
      const res = await fetch(`/api/admin/contracts/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to terminate');
      fetchContracts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error terminating contract');
    }
  };

  const handleRenew = async (id: string) => {
    if (!renewForm.newEndDate) return;
    try {
      const body: any = { newEndDate: renewForm.newEndDate };
      if (renewForm.perOrderRate) body.perOrderRate = parseFloat(renewForm.perOrderRate);
      const res = await fetch(`/api/admin/contracts/${id}/renew`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to renew');
      setRenewingId(null);
      setRenewForm({ newEndDate: '', perOrderRate: '' });
      fetchContracts();
      fetchDashboard();
    } catch (err) { setError(err instanceof Error ? err.message : 'Error renewing contract'); }
  };

  const handleCoverageAction = async (id: string, status: 'approved' | 'denied') => {
    try {
      const res = await fetch(`/api/admin/coverage-requests/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed');
      fetchCoverageRequests();
      fetchDashboard();
    } catch (err) { setError(err instanceof Error ? err.message : 'Error updating coverage request'); }
  };

  const handleCoverageFill = async () => {
    if (!coverageFillForm) return;
    try {
      const res = await fetch(`/api/admin/coverage-requests/${coverageFillForm.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          status: 'filled',
          substituteDriverId: coverageFillForm.substituteDriverId,
          substitutePay: coverageFillForm.substitutePay ? parseFloat(coverageFillForm.substitutePay) : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to fill coverage');
      setCoverageFillForm(null);
      fetchCoverageRequests();
      fetchDashboard();
    } catch (err) { setError(err instanceof Error ? err.message : 'Error filling coverage'); }
  };

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return d; }
  };

  const daysUntilExpiry = (endDate: string) => {
    const end = new Date(endDate);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  if (loading && contracts.length === 0) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Route Contracts</h3>
          <p className="text-sm text-gray-500">Assign drivers to zone+day combos for set durations. New locations in contracted zones auto-assign to the contract driver.</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm); }}
          className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700"
        >
          New Contract
        </button>
      </div>

      {/* Dashboard summary */}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <p className="text-xs text-green-600">Active</p>
            <p className="text-xl font-bold text-green-700">{dashboard.activeCount}</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-3 text-center">
            <p className="text-xs text-amber-600">Expiring Soon</p>
            <p className="text-xl font-bold text-amber-700">{dashboard.expiringCount}</p>
          </div>
          <div className="bg-yellow-50 rounded-lg p-3 text-center">
            <p className="text-xs text-yellow-600">Pending</p>
            <p className="text-xl font-bold text-yellow-700">{dashboard.pendingCount}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">Expired</p>
            <p className="text-xl font-bold text-gray-600">{dashboard.expiredCount}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 text-center cursor-pointer hover:bg-blue-100" onClick={() => setShowCoverage(!showCoverage)}>
            <p className="text-xs text-blue-600">Pending Coverage</p>
            <p className="text-xl font-bold text-blue-700">{dashboard.pendingCoverageCount}</p>
          </div>
        </div>
      )}

      {/* Expiring contracts alert */}
      {dashboard && dashboard.expiringContracts && dashboard.expiringContracts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1.5">
          <h4 className="text-xs font-bold text-amber-700 uppercase tracking-wide">Expiring Soon</h4>
          {dashboard.expiringContracts.map((ec: any) => (
            <div key={ec.id} className="flex items-center justify-between text-xs">
              <span className="text-gray-700">
                <strong>{ec.driverName}</strong> — {ec.zoneName} {ec.dayOfWeek} — expires {formatDate(ec.endDate)}
              </span>
              <button type="button" onClick={() => { setRenewingId(ec.id); setRenewForm({ newEndDate: '', perOrderRate: ec.perOrderRate ? String(ec.perOrderRate) : '' }); }}
                className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 font-medium">
                Renew
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Coverage requests */}
      {showCoverage && coverageRequests.length > 0 && (
        <Card>
          <div className="p-4 space-y-3">
            <h4 className="font-bold text-gray-900">Pending Coverage Requests</h4>
            {coverageRequests.map(cr => (
              <div key={cr.id} className="flex items-center justify-between bg-amber-50 rounded-lg p-3">
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">{cr.requestingDriverName}</div>
                  <div className="text-xs text-gray-500">
                    {cr.zoneName} | {cr.dayOfWeek} | {formatDate(cr.coverageDate)} | {cr.reason}
                    {cr.reasonNotes && ` — ${cr.reasonNotes}`}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-3">
                  {coverageFillForm?.id === cr.id ? (
                    <div className="flex items-center gap-2">
                      <select value={coverageFillForm.substituteDriverId}
                        onChange={e => setCoverageFillForm({ ...coverageFillForm, substituteDriverId: e.target.value })}
                        className="border border-gray-300 rounded px-2 py-1 text-xs">
                        <option value="">Select substitute...</option>
                        {drivers.filter(d => d.id !== cr.requestingDriverId).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                      <input type="number" step="0.01" placeholder="Pay $"
                        value={coverageFillForm.substitutePay}
                        onChange={e => setCoverageFillForm({ ...coverageFillForm, substitutePay: e.target.value })}
                        className="border border-gray-300 rounded px-2 py-1 text-xs w-20" />
                      <button type="button" onClick={handleCoverageFill} disabled={!coverageFillForm.substituteDriverId}
                        className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">Fill</button>
                      <button type="button" onClick={() => setCoverageFillForm(null)}
                        className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                    </div>
                  ) : (
                    <>
                      <button type="button" onClick={() => setCoverageFillForm({ id: cr.id, substituteDriverId: '', substitutePay: '' })}
                        className="px-2 py-1 text-xs bg-teal-50 text-teal-700 rounded hover:bg-teal-100">Fill</button>
                      <button type="button" onClick={() => handleCoverageAction(cr.id, 'approved')}
                        className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100">Approve</button>
                      <button type="button" onClick={() => handleCoverageAction(cr.id, 'denied')}
                        className="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100">Deny</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Assignment log toggle */}
      <div className="flex justify-end">
        <button type="button" onClick={() => setShowAssignLog(!showAssignLog)}
          className={`px-3 py-1.5 text-xs font-medium rounded-full ${showAssignLog ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          Assignment Log
        </button>
      </div>

      {showAssignLog && (
        <Card>
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-gray-900">Auto-Assignment Log (Last 7 Days)</h4>
              <span className="text-xs text-gray-500">
                {assignLogSummary.assignedCount} of {assignLogSummary.total} assigned
              </span>
            </div>
            {assignLog.length === 0 ? (
              <p className="text-sm text-gray-500">No assignment activity in the last 7 days.</p>
            ) : (
              <div className="space-y-1.5">
                {assignLog.map(entry => (
                  <div key={entry.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs ${entry.assigned ? 'bg-green-50' : 'bg-red-50'}`}>
                    <span className={`font-bold ${entry.assigned ? 'text-green-600' : 'text-red-600'}`}>
                      {entry.assigned ? '\u2713' : '\u2717'}
                    </span>
                    <span className="flex-1 text-gray-700 truncate" title={entry.locationAddress || ''}>
                      {entry.locationAddress || `Location #${entry.id}`}
                    </span>
                    {entry.assigned ? (
                      <span className="text-gray-500">
                        {entry.driverName && `${entry.driverName} | `}{entry.zoneName || ''}
                        {entry.compensation != null && ` | $${entry.compensation.toFixed(2)}`}
                      </span>
                    ) : (
                      <span className="text-red-500">{entry.reason}{entry.details ? `: ${entry.details}` : ''}</span>
                    )}
                    {entry.capacityWarning && (
                      <span className="text-amber-600 font-medium">capacity!</span>
                    )}
                    <span className="text-gray-400">{formatDate(entry.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      {/* Status filter */}
      <div className="flex gap-2">
        {['', 'active', 'pending', 'expired', 'terminated'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full ${
              statusFilter === s ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {showForm && (
        <Card>
          <div className="p-4 space-y-4">
            <h4 className="font-bold text-gray-900">{editingId ? 'Edit Contract' : 'New Route Contract'}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Driver</label>
                <select value={form.driverId} onChange={e => setForm({ ...form, driverId: e.target.value })} disabled={!!editingId}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100">
                  <option value="">Select driver...</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Service Zone</label>
                <select value={form.zoneId} onChange={e => setForm({ ...form, zoneId: e.target.value })} disabled={!!editingId}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100">
                  <option value="">Select zone...</option>
                  {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Day of Week</label>
                <select value={form.dayOfWeek} onChange={e => setForm({ ...form, dayOfWeek: e.target.value })} disabled={!!editingId}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm capitalize disabled:bg-gray-100">
                  {DAY_OPTIONS.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Per-Order Rate ($)</label>
                <input type="number" step="0.01" min="0" value={form.perOrderRate}
                  onChange={e => setForm({ ...form, perOrderRate: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="e.g. 3.50" />
                <p className="text-xs text-gray-400 mt-1">Overrides the global base rate for this contract</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input type="date" value={form.startDate}
                  onChange={e => setForm({ ...form, startDate: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input type="date" value={form.endDate}
                  onChange={e => setForm({ ...form, endDate: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              {editingId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as ContractStatus })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                    <option value="expired">Expired</option>
                    <option value="terminated">Terminated</option>
                  </select>
                </div>
              )}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Terms / Notes</label>
                <textarea value={form.termsNotes} onChange={e => setForm({ ...form, termsNotes: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" rows={2}
                  placeholder="Special terms, conditions, or notes..." />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={handleSave}
                disabled={saving || !form.driverId || !form.zoneId || !form.startDate || !form.endDate}
                className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50">
                {saving ? 'Saving...' : editingId ? 'Update' : 'Create Contract'}
              </button>
              <button onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm); }}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200">
                Cancel
              </button>
            </div>
          </div>
        </Card>
      )}

      {contracts.length === 0 ? (
        <EmptyState message="No route contracts yet. Create one to assign a driver to a zone and day." />
      ) : (
        <div className="space-y-2">
          {contracts.map(c => {
            const expDays = c.status === 'active' ? daysUntilExpiry(c.endDate) : null;
            return (
              <Card key={c.id}>
                <div className="p-4 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900">{c.driverName}</span>
                      <span className="text-gray-400">|</span>
                      <span className="text-sm text-gray-700">{c.zoneName}</span>
                      <span className="text-gray-400">|</span>
                      <span className="text-sm text-gray-700 capitalize">{c.dayOfWeek}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status]}`}>
                        {c.status}
                      </span>
                      {expDays != null && expDays <= 30 && expDays > 0 && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                          Expires in {expDays}d
                        </span>
                      )}
                      {expDays != null && expDays <= 0 && c.status === 'active' && (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                          Past due
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex gap-3 flex-wrap">
                      <span>{formatDate(c.startDate)} - {formatDate(c.endDate)}</span>
                      {c.perOrderRate != null && <span>${c.perOrderRate.toFixed(2)}/order</span>}
                      {c.computedWeeklyValue != null && (
                        <span className="text-teal-600 font-medium">~${Number(c.computedWeeklyValue).toFixed(2)}/wk</span>
                      )}
                      {c.routeCount != null && <span>{c.routeCount} routes</span>}
                      {c.orderCount != null && <span>{c.orderCount} orders</span>}
                    </div>
                    {c.termsNotes && (
                      <p className="text-xs text-gray-400 italic mt-0.5 truncate max-w-md" title={c.termsNotes}>{c.termsNotes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-3">
                    {c.status === 'active' && (
                      <button type="button" onClick={() => setCreateRoutesContract(c)}
                        className="px-2.5 py-1 text-xs font-medium bg-teal-50 text-teal-700 rounded-lg hover:bg-teal-100" title="Create routes for this contract">
                        Create Routes
                      </button>
                    )}
                    {(c.status === 'active' || c.status === 'expired') && (
                      <button type="button" onClick={() => { setRenewingId(renewingId === c.id ? null : c.id); setRenewForm({ newEndDate: '', perOrderRate: '' }); }}
                        className="px-2.5 py-1 text-xs font-medium bg-green-50 text-green-700 rounded-lg hover:bg-green-100" title="Renew contract">
                        Renew
                      </button>
                    )}
                    <button type="button" onClick={() => fetchPerformance(c.id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-lg ${expandedPerf === c.id ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`} title="View performance">
                      Stats
                    </button>
                    <button type="button" onClick={() => handleEdit(c)} className="p-1.5 text-gray-400 hover:text-teal-600" title="Edit">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    {c.status === 'active' && (
                      <button type="button" onClick={() => handleTerminate(c.id)} className="p-1.5 text-gray-400 hover:text-red-600" title="Terminate">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* Renew inline form */}
                {renewingId === c.id && (
                  <div className="px-4 pb-3 pt-1 border-t border-gray-100 flex items-center gap-3 flex-wrap">
                    <label className="text-xs text-gray-600">New End Date:</label>
                    <input type="date" value={renewForm.newEndDate}
                      onChange={e => setRenewForm({ ...renewForm, newEndDate: e.target.value })}
                      className="border border-gray-300 rounded px-2 py-1 text-xs" />
                    <label className="text-xs text-gray-600">New Rate (opt):</label>
                    <input type="number" step="0.01" placeholder="$/order"
                      value={renewForm.perOrderRate}
                      onChange={e => setRenewForm({ ...renewForm, perOrderRate: e.target.value })}
                      className="border border-gray-300 rounded px-2 py-1 text-xs w-20" />
                    <button type="button" onClick={() => handleRenew(c.id)}
                      disabled={!renewForm.newEndDate}
                      className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
                      Confirm Renewal
                    </button>
                    <button type="button" onClick={() => setRenewingId(null)}
                      className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                  </div>
                )}

                {/* Performance metrics */}
                {expandedPerf === c.id && performanceData[c.id] && (
                  <div className="px-4 pb-3 pt-1 border-t border-gray-100">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {(() => {
                        const p = performanceData[c.id];
                        return (
                          <>
                            <div className="text-center">
                              <p className="text-xs text-gray-500">Completion</p>
                              <p className={`text-lg font-bold ${p.completionRate >= 0.9 ? 'text-green-600' : p.completionRate >= 0.7 ? 'text-amber-600' : 'text-red-600'}`}>
                                {(p.completionRate * 100).toFixed(0)}%
                              </p>
                              <p className="text-xs text-gray-400">{p.completedRoutes}/{p.totalRoutes} routes</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xs text-gray-500">Order Rate</p>
                              <p className={`text-lg font-bold ${p.orderCompletionRate >= 0.9 ? 'text-green-600' : p.orderCompletionRate >= 0.7 ? 'text-amber-600' : 'text-red-600'}`}>
                                {(p.orderCompletionRate * 100).toFixed(0)}%
                              </p>
                              <p className="text-xs text-gray-400">{p.completedOrders}/{p.totalOrders} orders</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xs text-gray-500">Total Compensation</p>
                              <p className="text-lg font-bold text-teal-600">${p.totalCompensation.toFixed(2)}</p>
                              <p className="text-xs text-gray-400">avg ${p.avgRouteValue.toFixed(2)}/route</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xs text-gray-500">Coverage Requests</p>
                              <p className="text-lg font-bold text-gray-700">{p.coverageRequestCount}</p>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      {createRoutesContract && (
        <CreateRoutesModal
          contract={createRoutesContract}
          onClose={() => setCreateRoutesContract(null)}
          onCreated={() => fetchContracts()}
        />
      )}
    </div>
  );
};

export default ContractsPanel;
