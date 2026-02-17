import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../../components/Card.tsx';
import { Button } from '../../components/Button.tsx';
import { LoadingSpinner, Pagination, StatusBadge, EmptyState, FilterBar, ConfirmDialog } from './shared.tsx';

type TabType = 'missed-pickups' | 'pickup-schedule';

interface MissedPickupReport {
  id: string;
  customerName: string;
  customerEmail: string;
  address: string;
  pickupDate: string;
  notes: string;
  status: string;
  resolutionNotes: string | null;
  createdAt: string;
}

interface PickupScheduleRequest {
  id: string;
  customerName: string;
  customerEmail: string;
  address: string;
  serviceName: string;
  servicePrice: number;
  pickupDate: string;
  status: string;
  createdAt: string;
}

interface MissedPickupsResponse {
  reports: MissedPickupReport[];
  total: number;
}

interface PickupScheduleResponse {
  requests: PickupScheduleRequest[];
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

interface ResolveModalProps {
  isOpen: boolean;
  report: MissedPickupReport | null;
  onClose: () => void;
  onSaved: () => void;
  isSaving: boolean;
}

const ResolveModal: React.FC<ResolveModalProps> = ({ isOpen, report, onClose, onSaved, isSaving }) => {
  const [status, setStatus] = useState<string>('investigating');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [error, setError] = useState('');

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

const MissedPickupsTab: React.FC = () => {
  const [reports, setReports] = useState<MissedPickupReport[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit] = useState(50);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<MissedPickupReport | null>(null);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const handleSaved = async () => {
    setSaving(false);
    await loadReports();
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
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

      {/* Table */}
      {reports.length === 0 ? (
        <EmptyState
          title="No Missed Pickups"
          message="There are no missed pickup reports matching your filters."
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
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
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleResolveClick(report)}
                      >
                        Resolve
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <Pagination
            total={total}
            limit={limit}
            offset={offset}
            onChange={setOffset}
          />
        </>
      )}

      {/* Resolve Modal */}
      <ResolveModal
        isOpen={showResolveModal}
        report={selectedReport}
        onClose={() => setShowResolveModal(false)}
        onSaved={handleSaved}
        isSaving={saving}
      />
    </div>
  );
};

const PickupScheduleTab: React.FC = () => {
  const [requests, setRequests] = useState<PickupScheduleRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit] = useState(50);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      query.set('status', statusFilter);
      query.set('limit', String(limit));
      query.set('offset', String(offset));
      const res = await fetch(`/api/admin/pickup-schedule?${query}`, { credentials: 'include' });
      if (res.ok) {
        const data: PickupScheduleResponse = await res.json();
        setRequests(data.requests);
        setTotal(data.total);
      }
    } catch (e) {
      console.error('Failed to load pickup schedule:', e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, limit, offset]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
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
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </FilterBar>

      {/* Table */}
      {requests.length === 0 ? (
        <EmptyState
          title="No Pickup Requests"
          message="There are no pickup requests matching your filters."
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Address</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Service</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Price</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Pickup Date</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {requests.map(request => (
                  <tr key={request.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-sm font-semibold text-gray-900">{request.customerName}</div>
                      <div className="text-xs text-gray-500">{request.customerEmail}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-700">{request.address}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-700">{request.serviceName}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-semibold text-gray-900">${request.servicePrice.toFixed(2)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-700">{formatDate(request.pickupDate)}</div>
                      <div className="text-xs text-gray-500">{formatTime(request.pickupDate)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={request.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-700">{formatDate(request.createdAt)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <Pagination
            total={total}
            limit={limit}
            offset={offset}
            onChange={setOffset}
          />
        </>
      )}
    </div>
  );
};

const OperationsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('missed-pickups');

  return (
    <div className="space-y-6">
      {/* Tab navigation */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('missed-pickups')}
          className={`px-6 py-3 font-semibold border-b-2 transition-colors ${
            activeTab === 'missed-pickups'
              ? 'text-teal-700 border-teal-600'
              : 'text-gray-600 border-transparent hover:text-gray-900'
          }`}
        >
          Missed Pickups
        </button>
        <button
          onClick={() => setActiveTab('pickup-schedule')}
          className={`px-6 py-3 font-semibold border-b-2 transition-colors ${
            activeTab === 'pickup-schedule'
              ? 'text-teal-700 border-teal-600'
              : 'text-gray-600 border-transparent hover:text-gray-900'
          }`}
        >
          Pickup Schedule
        </button>
      </div>

      {/* Tab content */}
      <div className="pt-4">
        {activeTab === 'missed-pickups' && <MissedPickupsTab />}
        {activeTab === 'pickup-schedule' && <PickupScheduleTab />}
      </div>
    </div>
  );
};

export default OperationsView;
