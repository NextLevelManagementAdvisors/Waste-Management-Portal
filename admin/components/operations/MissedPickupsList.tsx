import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../../../components/Card.tsx';
import { Button } from '../../../components/Button.tsx';
import { LoadingSpinner, Pagination, StatusBadge, EmptyState, FilterBar } from '../ui/index.ts';
import type { MissedPickupReport } from '../../../shared/types/index.ts';

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

const MissedPickupsList: React.FC = () => {
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
                      <Button size="sm" variant="secondary" onClick={() => handleResolveClick(report)}>
                        Resolve
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination total={total} limit={limit} offset={offset} onChange={setOffset} />
        </>
      )}

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

export default MissedPickupsList;
