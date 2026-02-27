import React, { useState } from 'react';
import type { RouteJob, MissingClient } from '../../../shared/types/index.ts';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  open: 'bg-blue-100 text-blue-700',
  bidding: 'bg-yellow-100 text-yellow-700',
  assigned: 'bg-purple-100 text-purple-700',
  in_progress: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

const FREQ_LABELS: Record<string, string> = {
  weekly: 'W',
  'bi-weekly': 'BW',
  monthly: 'M',
};

interface RoutePlannerDayColumnProps {
  date: string;
  jobs: RouteJob[];
  missingClients: MissingClient[];
  onRefresh: () => void;
}

const RoutePlannerDayColumn: React.FC<RoutePlannerDayColumnProps> = ({ date, jobs, missingClients, onRefresh }) => {
  const [showMissing, setShowMissing] = useState(false);
  const [addingTo, setAddingTo] = useState<{ propertyId: string; jobId: string } | null>(null);
  const [publishingJob, setPublishingJob] = useState<string | null>(null);

  const dt = new Date(date + 'T12:00:00');
  const dayName = dt.toLocaleDateString('en-US', { weekday: 'short' });
  const dayNum = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const isToday = date === new Date().toISOString().split('T')[0];

  const draftJobs = jobs.filter(j => j.status === 'draft' || j.status === 'open' || j.status === 'bidding');

  const handleAddToJob = async (propertyId: string, jobId: string) => {
    setAddingTo({ propertyId, jobId });
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/pickups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ propertyIds: [propertyId] }),
      });
      if (res.ok) onRefresh();
    } catch (e) {
      console.error('Failed to add pickup:', e);
    } finally {
      setAddingTo(null);
    }
  };

  const handlePublishJob = async (jobId: string) => {
    setPublishingJob(jobId);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/publish`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) onRefresh();
    } catch (e) {
      console.error('Failed to publish job:', e);
    } finally {
      setPublishingJob(null);
    }
  };

  return (
    <div className={`bg-white rounded-xl border ${isToday ? 'border-teal-400 ring-2 ring-teal-500/20' : 'border-gray-200'} min-h-[300px] flex flex-col`}>
      {/* Day Header */}
      <div className={`px-3 py-2 border-b border-gray-200 text-center ${isToday ? 'bg-teal-50' : 'bg-gray-50'}`}>
        <div className={`text-xs font-black uppercase tracking-widest ${isToday ? 'text-teal-600' : 'text-gray-400'}`}>
          {dayName}
        </div>
        <div className={`text-sm font-bold ${isToday ? 'text-teal-700' : 'text-gray-700'}`}>{dayNum}</div>
      </div>

      {/* Job Cards */}
      <div className="p-2 space-y-2 flex-1">
        {jobs.length === 0 && missingClients.length === 0 && (
          <div className="text-xs text-gray-300 text-center py-4">No routes</div>
        )}

        {jobs.map(job => (
          <div key={job.id} className="bg-gray-50 rounded-lg p-2.5 border border-gray-100 hover:border-gray-200 transition-colors">
            <div className="flex items-center gap-1.5 mb-1">
              {job.zone_color && (
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: job.zone_color }} />
              )}
              <span className="text-xs font-bold text-gray-900 truncate flex-1">{job.zone_name || job.title}</span>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${STATUS_COLORS[job.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {job.status.replace('_', ' ')}
              </span>
              <span className="text-[10px] text-gray-500">{job.pickup_count || 0} stops</span>
            </div>
            {job.driver_name && (
              <div className="text-[10px] text-gray-400 mt-1 truncate">{job.driver_name}</div>
            )}
            {job.base_pay != null && (
              <div className="text-[10px] text-gray-400">${Number(job.base_pay).toFixed(0)}</div>
            )}
            {job.status === 'draft' && (
              <button
                type="button"
                onClick={() => handlePublishJob(job.id)}
                disabled={publishingJob === job.id}
                className="mt-1.5 w-full px-2 py-1 text-[10px] font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded transition-colors"
              >
                {publishingJob === job.id ? 'Publishing...' : 'Publish'}
              </button>
            )}
          </div>
        ))}

        {/* Missing clients */}
        {missingClients.length > 0 && (
          <div className="border border-dashed border-amber-300 rounded-lg bg-amber-50/50">
            <button
              onClick={() => setShowMissing(!showMissing)}
              className="w-full px-2 py-1.5 flex items-center justify-between text-left"
            >
              <span className="text-[10px] font-bold text-amber-700 uppercase">
                {missingClients.length} Missing
              </span>
              <span className="text-amber-500 text-xs">{showMissing ? '▲' : '▼'}</span>
            </button>

            {showMissing && (
              <div className="px-2 pb-2 space-y-1 max-h-[200px] overflow-y-auto">
                {missingClients.map(client => (
                  <div key={client.id} className="bg-white rounded px-2 py-1.5 border border-amber-100">
                    <div className="flex items-center gap-1 mb-0.5">
                      {client.zone_color && (
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: client.zone_color }} />
                      )}
                      <span className="text-[10px] font-medium text-gray-900 truncate">{client.customer_name}</span>
                      {client.pickup_frequency && (
                        <span className="text-[9px] font-bold text-amber-600 bg-amber-100 px-1 rounded">
                          {FREQ_LABELS[client.pickup_frequency] || client.pickup_frequency}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-400 truncate mb-1">{client.address}</div>
                    {draftJobs.length > 0 ? (
                      <div className="flex gap-1 flex-wrap">
                        {draftJobs.map(job => (
                          <button
                            key={job.id}
                            onClick={() => handleAddToJob(client.id, job.id)}
                            disabled={addingTo?.propertyId === client.id}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded transition-colors disabled:opacity-50"
                          >
                            {job.zone_color && (
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: job.zone_color }} />
                            )}
                            + {job.zone_name || 'Job'}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[9px] text-gray-400 italic">No draft jobs to add to</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Day summary footer */}
      {jobs.length > 0 && (
        <div className="px-2 py-1.5 border-t border-gray-100 text-center">
          <span className="text-[10px] text-gray-400">
            {jobs.length} job{jobs.length !== 1 ? 's' : ''} &middot;{' '}
            {jobs.reduce((sum, j) => sum + (j.pickup_count || 0), 0)} stops
          </span>
        </div>
      )}
    </div>
  );
};

export default RoutePlannerDayColumn;
