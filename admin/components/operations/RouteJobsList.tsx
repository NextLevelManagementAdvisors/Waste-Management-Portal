import React, { useState, useEffect, useCallback } from 'react';
import { LoadingSpinner, EmptyState, FilterBar } from '../ui/index.ts';
import type { RouteJob } from '../../../shared/types/index.ts';
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

const RouteJobsList: React.FC = () => {
  const [jobs, setJobs] = useState<RouteJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editingJob, setEditingJob] = useState<RouteJob | null>(null);

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

        <button
          onClick={() => setShowCreate(true)}
          className="flex-shrink-0 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-lg transition-colors"
        >
          + Create Job
        </button>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No Route Jobs"
          message={statusFilter === 'all' ? 'Create a job to post it to the driver portal.' : 'No jobs match the selected status.'}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Title</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Area</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Date</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Stops</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Pay</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Status</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Driver</th>
                <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-widest text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.map(job => (
                <tr key={job.id} className="hover:bg-gray-50 transition-colors">
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
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setEditingJob(job)}
                      className="inline-flex items-center px-2.5 py-1 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
