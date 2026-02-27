import React, { useState, useEffect, useCallback } from 'react';
import { LoadingSpinner, EmptyState, FilterBar } from '../ui/index.ts';
import type { Job, JobBid, JobPickup } from '../../../shared/types/index.ts';
import CreateJobModal from './CreateJobModal.tsx';
import EditJobModal from './EditJobModal.tsx';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  open: 'bg-blue-100 text-blue-700',
  bidding: 'bg-yellow-100 text-yellow-700',
  assigned: 'bg-purple-100 text-purple-700',
  in_progress: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

const JOB_TYPE_COLORS: Record<string, string> = {
  daily_route: 'bg-teal-100 text-teal-700',
  bulk_pickup: 'bg-orange-100 text-orange-700',
  special_pickup: 'bg-purple-100 text-purple-700',
};

const JOB_TYPE_LABELS: Record<string, string> = {
  daily_route: 'Route',
  bulk_pickup: 'Bulk',
  special_pickup: 'Special',
};

const StatusChip: React.FC<{ status: string }> = ({ status }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold capitalize ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}>
    {status.replace('_', ' ')}
  </span>
);

const JobTypeChip: React.FC<{ type: string }> = ({ type }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${JOB_TYPE_COLORS[type] ?? 'bg-gray-100 text-gray-600'}`}>
    {JOB_TYPE_LABELS[type] ?? type}
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

const BidRow: React.FC<{ bid: JobBid; basePay?: number; onAccept: () => void; canAccept: boolean }> = ({ bid, basePay, onAccept, canAccept }) => {
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
      <td className="px-4 py-2" colSpan={2}>
        {bid.message && (
          <div className="text-sm text-gray-600 italic max-w-xs truncate" title={bid.message}>
            "{bid.message}"
          </div>
        )}
      </td>
      <td className="px-4 py-2 text-right" colSpan={2}>
        {canAccept && (
          <button
            type="button"
            onClick={onAccept}
            className="px-3 py-1 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
          >
            Accept
          </button>
        )}
      </td>
    </tr>
  );
};

const PickupsExpansion: React.FC<{ pickups: JobPickup[] }> = ({ pickups }) => (
  <>
    <tr className="bg-blue-50/40">
      <td colSpan={9} className="px-4 py-2 pl-10 text-xs font-black uppercase tracking-widest text-gray-400">
        Pickups ({pickups.length})
      </td>
    </tr>
    {pickups.map(p => (
      <tr key={p.id} className="bg-blue-50/20">
        <td className="px-4 py-1.5 pl-10" colSpan={3}>
          <div className="text-sm text-gray-700">{p.address}</div>
          <div className="text-xs text-gray-400">{p.customer_name}</div>
        </td>
        <td className="px-4 py-1.5">
          <span className={`text-xs font-bold ${
            p.pickup_type === 'special' ? 'text-purple-600' : p.pickup_type === 'missed_redo' ? 'text-red-600' : 'text-gray-500'
          }`}>
            {p.pickup_type}
          </span>
        </td>
        <td className="px-4 py-1.5" colSpan={2}>
          {p.sequence_number != null && <span className="text-xs text-gray-500">Stop #{p.sequence_number}</span>}
        </td>
        <td className="px-4 py-1.5" colSpan={3}>
          <span className={`text-xs font-bold ${
            p.status === 'completed' ? 'text-green-600' : p.status === 'failed' ? 'text-red-600' : 'text-gray-400'
          }`}>
            {p.status}
          </span>
        </td>
      </tr>
    ))}
  </>
);

const JobsList: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [expandMode, setExpandMode] = useState<'bids' | 'pickups'>('bids');
  const [bidsMap, setBidsMap] = useState<Record<string, JobBid[]>>({});
  const [pickupsMap, setPickupsMap] = useState<Record<string, JobPickup[]>>({});
  const [loadingExpand, setLoadingExpand] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('job_type', typeFilter);
      const res = await fetch(`/api/admin/jobs?${params}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs ?? []);
      }
    } catch (e) {
      console.error('Failed to load jobs:', e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const toggleExpand = async (jobId: string, mode: 'bids' | 'pickups') => {
    if (expandedJobId === jobId && expandMode === mode) {
      setExpandedJobId(null);
      return;
    }
    setExpandedJobId(jobId);
    setExpandMode(mode);

    const cache = mode === 'bids' ? bidsMap : pickupsMap;
    if (cache[jobId]) return;

    setLoadingExpand(jobId);
    try {
      const endpoint = mode === 'bids' ? `/api/admin/jobs/${jobId}/bids` : `/api/admin/jobs/${jobId}/pickups`;
      const res = await fetch(endpoint, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (mode === 'bids') {
          setBidsMap(prev => ({ ...prev, [jobId]: data.bids ?? [] }));
        } else {
          setPickupsMap(prev => ({ ...prev, [jobId]: data.pickups ?? [] }));
        }
      }
    } catch (e) {
      console.error(`Failed to load ${mode}:`, e);
    } finally {
      setLoadingExpand(null);
    }
  };

  const acceptBid = async (jobId: string, bid: JobBid) => {
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ driverId: bid.driverId, bidId: bid.id, actualPay: bid.bidAmount }),
      });
      if (res.ok) {
        setExpandedJobId(null);
        loadJobs();
      }
    } catch (e) {
      console.error('Failed to accept bid:', e);
    }
  };

  const publishJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/publish`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) loadJobs();
    } catch (e) {
      console.error('Failed to publish job:', e);
    }
  };

  const filtered = jobs.filter(j => {
    if (statusFilter !== 'all' && j.status !== statusFilter) return false;
    if (typeFilter !== 'all' && j.job_type !== typeFilter) return false;
    return true;
  });

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
              <option value="draft">Draft</option>
              <option value="open">Open</option>
              <option value="bidding">Bidding</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Type</label>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
              <option value="all">All Types</option>
              <option value="daily_route">Route</option>
              <option value="bulk_pickup">Bulk</option>
              <option value="special_pickup">Special</option>
            </select>
          </div>
        </FilterBar>

        <div className="flex items-center gap-2">
          <button type="button" onClick={loadJobs} className="flex-shrink-0 px-3 py-2 text-sm font-bold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
            Refresh
          </button>
          <button type="button" onClick={() => setShowCreate(true)} className="flex-shrink-0 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-lg transition-colors">
            + Create Job
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No Jobs"
          message={statusFilter === 'all' && typeFilter === 'all' ? 'Use the Planning tab to create jobs, or create one manually.' : 'No jobs match the selected filters.'}
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Job</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Type</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Date</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Stops</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Pay</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Status</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Driver</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Zone</th>
                <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-widest text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.map(job => {
                const isExpanded = expandedJobId === job.id;
                const bids = bidsMap[job.id];
                const pickups = pickupsMap[job.id];
                const bidCount = job.bid_count ?? 0;
                const pickupCount = job.pickup_count ?? 0;
                const canAcceptBids = job.status === 'open' || job.status === 'bidding';

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
                        <JobTypeChip type={job.job_type || 'daily_route'} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-700">{formatDate(job.scheduled_date)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-700">
                          {pickupCount > 0 ? pickupCount : (job.estimated_stops ?? '—')}
                          {job.estimated_hours != null && (
                            <span className="text-xs text-gray-400 ml-1">({job.estimated_hours}h)</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-semibold text-gray-900">
                          {job.actual_pay != null
                            ? `$${Number(job.actual_pay).toFixed(2)}`
                            : job.base_pay != null
                            ? `$${Number(job.base_pay).toFixed(2)}`
                            : '—'}
                        </div>
                        {job.actual_pay != null && job.base_pay != null && Number(job.actual_pay) !== Number(job.base_pay) && (
                          <div className="text-xs text-gray-400 line-through">${Number(job.base_pay).toFixed(2)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusChip status={job.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-700">{job.driver_name ?? '—'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-500">{job.zone_name ?? '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-right space-x-1">
                        {job.status === 'draft' && (
                          <button type="button" onClick={() => publishJob(job.id)}
                            className="inline-flex items-center px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                            Publish
                          </button>
                        )}
                        {pickupCount > 0 && (
                          <button type="button" onClick={() => toggleExpand(job.id, 'pickups')}
                            className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                              isExpanded && expandMode === 'pickups' ? 'text-white bg-blue-600' : 'text-blue-700 bg-blue-50 hover:bg-blue-100'
                            }`}>
                            {pickupCount} Stop{pickupCount !== 1 ? 's' : ''} {isExpanded && expandMode === 'pickups' ? '▲' : '▼'}
                          </button>
                        )}
                        {bidCount > 0 && (
                          <button type="button" onClick={() => toggleExpand(job.id, 'bids')}
                            className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                              isExpanded && expandMode === 'bids' ? 'text-white bg-teal-600' : 'text-teal-700 bg-teal-50 hover:bg-teal-100'
                            }`}>
                            {bidCount} Bid{bidCount !== 1 ? 's' : ''} {isExpanded && expandMode === 'bids' ? '▲' : '▼'}
                          </button>
                        )}
                        <button type="button" onClick={() => setEditingJob(job)}
                          className="inline-flex items-center px-2.5 py-1 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors">
                          Edit
                        </button>
                      </td>
                    </tr>

                    {isExpanded && expandMode === 'bids' && (
                      loadingExpand === job.id ? (
                        <tr className="bg-gray-50/80"><td colSpan={9} className="px-4 py-4 text-center"><div className="text-sm text-gray-400">Loading bids...</div></td></tr>
                      ) : bids && bids.length > 0 ? (
                        <>
                          <tr className="bg-gray-100/60">
                            <td colSpan={2} className="px-4 py-2 pl-10 text-xs font-black uppercase tracking-widest text-gray-400">Driver</td>
                            <td className="px-4 py-2 text-xs font-black uppercase tracking-widest text-gray-400">Bid Date</td>
                            <td className="px-4 py-2 text-xs font-black uppercase tracking-widest text-gray-400">Rating</td>
                            <td className="px-4 py-2 text-xs font-black uppercase tracking-widest text-gray-400">Bid Amount</td>
                            <td colSpan={2} className="px-4 py-2 text-xs font-black uppercase tracking-widest text-gray-400">Message</td>
                            <td colSpan={2} className="px-4 py-2 text-right text-xs font-black uppercase tracking-widest text-gray-400">Action</td>
                          </tr>
                          {bids.map(bid => (
                            <BidRow key={bid.id} bid={bid} basePay={job.base_pay != null ? Number(job.base_pay) : undefined}
                              onAccept={() => acceptBid(job.id, bid)} canAccept={canAcceptBids} />
                          ))}
                        </>
                      ) : (
                        <tr className="bg-gray-50/80"><td colSpan={9} className="px-4 py-3 text-center text-sm text-gray-400">No bids yet</td></tr>
                      )
                    )}

                    {isExpanded && expandMode === 'pickups' && (
                      loadingExpand === job.id ? (
                        <tr className="bg-gray-50/80"><td colSpan={9} className="px-4 py-4 text-center"><div className="text-sm text-gray-400">Loading pickups...</div></td></tr>
                      ) : pickups && pickups.length > 0 ? (
                        <PickupsExpansion pickups={pickups} />
                      ) : (
                        <tr className="bg-gray-50/80"><td colSpan={9} className="px-4 py-3 text-center text-sm text-gray-400">No pickups assigned</td></tr>
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
        <CreateJobModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); loadJobs(); }} />
      )}

      {editingJob && (
        <EditJobModal job={editingJob} onClose={() => setEditingJob(null)} onUpdated={() => { setEditingJob(null); loadJobs(); }} />
      )}
    </div>
  );
};

export default JobsList;
