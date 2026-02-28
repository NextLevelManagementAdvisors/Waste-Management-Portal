import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../../../components/Card.tsx';
import { Button } from '../../../components/Button.tsx';
import { LoadingSpinner, Pagination, StatusBadge, EmptyState, FilterBar } from '../ui/index.ts';
import type { MissedPickupReport, Route } from '../../../shared/types/index.ts';

interface MissedPickupsResponse {
  reports: MissedPickupReport[];
  total: number;
}

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

const formatTime = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

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

interface ResolveModalProps {
  isOpen: boolean;
  report: MissedPickupReport | null;
  onClose: () => void;
  onSaved: () => void;
}

const ResolveModal: React.FC<ResolveModalProps> = ({ isOpen, report, onClose, onSaved }) => {
  const [status, setStatus] = useState<string>('investigating');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (report) {
      setStatus(report.status);
      setResolutionNotes(report.resolutionNotes || '');
      setError('');
    }
  }, [report]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!report) return;

    setIsSaving(true);
    try {
      const res = await fetch(`/api/admin/missed-pickups/${report.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status, resolutionNotes }),
      });

      if (res.ok) {
        onSaved();
        onClose();
      } else {
        const json = await res.json();
        setError(json.error || 'Failed to update missed pickup report');
      }
    } catch {
      setError('Failed to update missed pickup report');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !report) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <Card className="relative w-full max-w-lg p-6 shadow-lg">
        <h2 className="text-lg font-black text-gray-900 mb-1">Resolve Missed Pickup</h2>
        <p className="text-sm text-gray-500 mb-4">{report.customerName} - {report.address}</p>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
              <option value="investigating">Investigating</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Resolution Notes</label>
            <textarea
              value={resolutionNotes}
              onChange={e => setResolutionNotes(e.target.value)}
              rows={4}
              placeholder="Enter resolution notes..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none"
            />
          </div>
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <Button variant="secondary" size="sm" type="button" onClick={onClose} disabled={isSaving} className="flex-1">
              Cancel
            </Button>
            <Button size="sm" type="submit" disabled={isSaving} className="flex-1">
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

interface AddToRouteModalProps {
  isOpen: boolean;
  report: MissedPickupReport | null;
  onClose: () => void;
  onAdded: () => void;
}

const AddToRouteModal: React.FC<AddToRouteModalProps> = ({ isOpen, report, onClose, onAdded }) => {
  const [date, setDate] = useState('');
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (report) {
      setDate(new Date().toISOString().split('T')[0]);
      setRoutes([]);
      setError('');
    }
  }, [report]);

  useEffect(() => {
    if (!date || !isOpen) return;
    setLoadingRoutes(true);
    fetch(`/api/admin/routes?date_from=${date}&date_to=${date}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setRoutes(data.routes || []))
      .catch(() => setRoutes([]))
      .finally(() => setLoadingRoutes(false));
  }, [date, isOpen]);

  const handleAdd = async (routeId: string) => {
    if (!report) return;
    setAdding(true);
    setError('');
    try {
      const addRes = await fetch(`/api/admin/routes/${routeId}/stops`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ missedRedoPropertyIds: [report.propertyId] }),
      });
      if (!addRes.ok) {
        const json = await addRes.json();
        setError(json.error || 'Failed to add stop');
        return;
      }
      await fetch(`/api/admin/missed-pickups/${report.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'resolved', resolutionNotes: 'Added to route as redo pickup' }),
      });
      onAdded();
      onClose();
    } catch {
      setError('Failed to add to route');
    } finally {
      setAdding(false);
    }
  };

  if (!isOpen || !report) return null;

  const actionableRoutes = routes.filter(r => r.status !== 'completed' && r.status !== 'cancelled');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <Card className="relative w-full max-w-lg p-6 shadow-lg">
        <h2 className="text-lg font-black text-gray-900 mb-1">Add to Route</h2>
        <p className="text-sm text-gray-500 mb-4">{report.customerName} &mdash; {report.address}</p>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <div className="mb-4">
          <label className="block text-xs font-bold text-gray-500 mb-1">Route Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          />
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {loadingRoutes ? (
            <p className="text-sm text-gray-400 text-center py-4">Loading routes...</p>
          ) : actionableRoutes.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No routes found for this date.</p>
          ) : (
            actionableRoutes.map(route => (
              <div key={route.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                <div>
                  <div className="text-sm font-semibold text-gray-900">{route.title}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-1">
                    {route.zone_color && (
                      <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: route.zone_color }} />
                    )}
                    {route.zone_name || 'No zone'} &middot; {route.stop_count ?? 0} stops &middot; {route.status}
                  </div>
                </div>
                <Button size="sm" disabled={adding} onClick={() => handleAdd(route.id)}>
                  {adding ? 'Adding...' : 'Add'}
                </Button>
              </div>
            ))
          )}
        </div>

        <div className="flex gap-3 pt-4 border-t border-gray-200 mt-4">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={adding} className="flex-1">Cancel</Button>
        </div>
      </Card>
    </div>
  );
};

const MissedPickupsList: React.FC<{ onActionResolved?: () => void }> = ({ onActionResolved }) => {
  const [reports, setReports] = useState<MissedPickupReport[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit] = useState(50);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<MissedPickupReport | null>(null);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [showAddToRouteModal, setShowAddToRouteModal] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      query.set('status', statusFilter);
      query.set('limit', String(limit));
      query.set('offset', String(offset));
      const res = await fetch(`/api/admin/missed-pickups?${query}`, { credentials: 'include' });
      if (res.ok) {
        const data: MissedPickupsResponse = await res.json();
        setReports(data.reports);
        setTotal(data.total);
      }
    } catch (e) {
      console.error('Failed to load missed pickup reports:', e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, limit, offset]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleResolveClick = (report: MissedPickupReport) => {
    setSelectedReport(report);
    setShowResolveModal(true);
  };

  const handleAddToRouteClick = (report: MissedPickupReport) => {
    setSelectedReport(report);
    setShowAddToRouteModal(true);
  };

  const handleSaved = async () => {
    await loadReports();
    onActionResolved?.();
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <FilterBar>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={e => {
              setStatusFilter(e.target.value);
              setOffset(0);
            }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="investigating">Investigating</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      </FilterBar>

      {reports.length === 0 ? (
        <EmptyState
          title="No Missed Pickups"
          message="There are no missed pickup reports matching your filters."
        />
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Address</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Pickup Date</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Notes</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Resolution</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {reports.map(report => (
                  <tr key={report.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-sm font-semibold text-gray-900">{report.customerName}</div>
                      <div className="text-xs text-gray-500">{report.customerEmail}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-700">{report.address}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-700">{formatDate(report.pickupDate)}</div>
                      <div className="text-xs text-gray-500">{formatTime(report.pickupDate)}</div>
                      <div className={`text-[10px] font-bold ${ageColor(report.createdAt)}`}>Reported {relativeAge(report.createdAt)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-700 max-w-xs truncate">{report.notes || '-'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={report.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-700 max-w-xs truncate">{report.resolutionNotes || '-'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {report.status !== 'resolved' && report.status !== 'dismissed' && (
                          <Button size="sm" onClick={() => handleAddToRouteClick(report)}>
                            Add to Route
                          </Button>
                        )}
                        <Button size="sm" variant="secondary" onClick={() => handleResolveClick(report)}>
                          {report.status === 'pending' ? 'Resolve' : report.status === 'investigating' ? 'Update' : 'View'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>

          <Pagination total={total} limit={limit} offset={offset} onChange={setOffset} />
        </>
      )}

      <ResolveModal
        isOpen={showResolveModal}
        report={selectedReport}
        onClose={() => setShowResolveModal(false)}
        onSaved={handleSaved}
      />
      <AddToRouteModal
        isOpen={showAddToRouteModal}
        report={selectedReport}
        onClose={() => setShowAddToRouteModal(false)}
        onAdded={handleSaved}
      />
    </div>
  );
};

export default MissedPickupsList;
