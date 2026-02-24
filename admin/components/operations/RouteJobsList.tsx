import React, { useState, useEffect, useCallback } from 'react';
import { LoadingSpinner, EmptyState, FilterBar } from '../ui/index.ts';
import type { RouteJob, JobBid } from '../../../shared/types/index.ts';
import CreateJobModal from './CreateJobModal.tsx';
import EditJobModal from './EditJobModal.tsx';

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700',
  bidding: 'bg-yellow-100 text-yellow-700',
  assigned: 'bg-purple-100 text-purple-700',
  in_progress: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
};

const StatusChip: React.FC<{ status: string }> = ({ status }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold capitalize ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}>
    {status.replace('_', ' ')}
  </span>
);

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  } catch {
    return dateStr;
  }
};

const formatDateTime = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
  } catch {
    return dateStr;
  }
};

const BidRow: React.FC<{ bid: JobBid; basePay?: number }> = ({ bid, basePay }) => {
  const delta = basePay != null ? bid.bidAmount - basePay : null;

  return (
    <tr className="bg-gray-50/80">
      <td className="px-4 py-2 pl-10" colSpan={2}>
        <div className="text-sm font-medium text-gray-900">{bid.driverName}</div>
        {bid.driverRating != null && (
          <div className="text-xs text-gray-400">Current rating: {bid.driverRating.toFixed(1)}</div>
        )}
      </td>
      <td className="px-4 py-2">
        <div className="text-xs text-gray-500">{formatDateTime(bid.createdAt)}</div>
      </td>
      <td className="px-4 py-2">
        {bid.driverRatingAtBid != null && (
          <div className="text-sm text-gray-600">{bid.driverRatingAtBid.toFixed(1)}</div>
        )}
      </td>
      <td className="px-4 py-2">
        <div className="text-sm font-semibold text-teal-700">${bid.bidAmount.toFixed(2)}</div>
        {delta != null && delta !== 0 && (
          <div className={`text-xs ${delta > 0 ? 'text-red-500' : 'text-green-600'}`}>
            {delta > 0 ? '+' : ''}${delta.toFixed(2)}
          </div>
        )}
      </td>
      <td className="px-4 py-2" colSpan={3}>
        {bid.message && (
          <div className="text-sm text-gray-600 italic max-w-xs truncate" title={bid.message}>
            "{bid.message}"
          </div>
        )}
      </td>
    </tr>
  );
};

const RouteJobsList: React.FC = () => {
  const [jobs, setJobs] = useState<RouteJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editingJob, setEditingJob] = useState<RouteJob | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [bidsMap, setBidsMap] = useState<Record<string, JobBid[]>>({});
  const [loadingBids, setLoadingBids] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/jobs', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs ?? []);
      }
    } catch (e) {
      console.error('Failed to load route jobs:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const toggleBids = async (jobId: string) => {
    if (expandedJobId === jobId) {
      setExpandedJobId(null);
      return;
    }
    setExpandedJobId(jobId);
    if (bidsMap[jobId]) return;
    setLoadingBids(jobId);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/bids`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setBidsMap(prev => ({ ...prev, [jobId]: data.bids ?? [] }));
      }
    } catch (e) {
      console.error('Failed to load bids:', e);
    } finally {
      setLoadingBids(null);
    }
  };

  const filtered = statusFilter === 'all'
    ? jobs
    : jobs.filter(j => j.status === statusFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <FilterBar>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="bidding">Bidding</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </FilterBar>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadJobs}
            className="flex-shrink-0 px-3 py-2 text-sm font-bold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex-shrink-0 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-lg transition-colors"
          >
            + Create Job
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No Route Jobs"
          message={statusFilter === 'all' ? 'Create a job to post it to the driver portal.' : 'No jobs match the selected status.'}
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Title</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Address</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Date</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Stops</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Pay</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Status</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Driver</th>
                <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-widest text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.map(job => {
                const isExpanded = expandedJobId === job.id;
                const bids = bidsMap[job.id];
                const bidCount = job.bid_count ?? 0;

                return (
                  <React.Fragment key={job.id}>
                    <tr className={`hover:bg-gray-50 transition-colors ${isExpanded ? 'bg-gray-50' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="text-sm font-semibold text-gray-900">{job.title}</div>
                        {job.start_time && (
                          <div className="text-xs text-gray-500">{job.start_time}{job.end_time ? ` – ${job.end_time}` : ''}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-700">{job.area ?? '—'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-700">{formatDate(job.scheduled_date)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-700">
                          {job.estimated_stops != null ? job.estimated_stops : '—'}
                          {job.estimated_hours != null && (
                            <span className="text-xs text-gray-400 ml-1">({job.estimated_hours}h)</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-semibold text-gray-900">
                          {job.base_pay != null ? `$${Number(job.base_pay).toFixed(2)}` : '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusChip status={job.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-700">{job.driver_name ?? '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        {bidCount > 0 && (
                          <button
                            type="button"
                            onClick={() => toggleBids(job.id)}
                            className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                              isExpanded
                                ? 'text-white bg-teal-600'
                                : 'text-teal-700 bg-teal-50 hover:bg-teal-100'
                            }`}
                          >
                            {bidCount} Bid{bidCount !== 1 ? 's' : ''} {isExpanded ? '▲' : '▼'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditingJob(job)}
                          className="inline-flex items-center px-2.5 py-1 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>

                    {isExpanded && (
                      loadingBids === job.id ? (
                        <tr className="bg-gray-50/80">
                          <td colSpan={8} className="px-4 py-4 text-center">
                            <div className="text-sm text-gray-400">Loading bids...</div>
                          </td>
                        </tr>
                      ) : bids && bids.length > 0 ? (
                        <>
                          <tr className="bg-gray-100/60">
                            <td colSpan={2} className="px-4 py-2 pl-10 text-xs font-black uppercase tracking-widest text-gray-400">Driver</td>
                            <td className="px-4 py-2 text-xs font-black uppercase tracking-widest text-gray-400">Bid Date</td>
                            <td className="px-4 py-2 text-xs font-black uppercase tracking-widest text-gray-400">Rating</td>
                            <td className="px-4 py-2 text-xs font-black uppercase tracking-widest text-gray-400">Bid Amount</td>
                            <td colSpan={3} className="px-4 py-2 text-xs font-black uppercase tracking-widest text-gray-400">Message</td>
                          </tr>
                          {bids.map(bid => (
                            <BidRow key={bid.id} bid={bid} basePay={job.base_pay != null ? Number(job.base_pay) : undefined} />
                          ))}
                        </>
                      ) : (
                        <tr className="bg-gray-50/80">
                          <td colSpan={8} className="px-4 py-3 text-center text-sm text-gray-400">No bids yet</td>
                        </tr>
                      )
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateJobModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            loadJobs();
          }}
        />
      )}

      {editingJob && (
        <EditJobModal
          job={editingJob}
          onClose={() => setEditingJob(null)}
          onUpdated={() => {
            setEditingJob(null);
            loadJobs();
          }}
        />
      )}
    </div>
  );
};

export default RouteJobsList;
