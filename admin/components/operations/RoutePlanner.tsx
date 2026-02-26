import React, { useState, useEffect, useCallback } from 'react';
import { LoadingSpinner, EmptyState } from '../ui/index.ts';
import RoutePlannerDayColumn from './RoutePlannerDayColumn.tsx';
import type { RouteJob, ServiceZone, MissingClient, CancelledPickup } from '../../../shared/types/index.ts';

interface WeekData {
  jobs: RouteJob[];
  cancelled: CancelledPickup[];
  missingByDay: Record<string, MissingClient[]>;
  zones: ServiceZone[];
}

function getMondayOfWeek(d: Date): Date {
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return dt;
}

function formatDateISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const RoutePlanner: React.FC = () => {
  const [weekStart, setWeekStart] = useState(() => getMondayOfWeek(new Date()));
  const [data, setData] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [removingPickup, setRemovingPickup] = useState<string | null>(null);

  const mondayStr = formatDateISO(weekStart);

  // Compute the 6 day dates (Mon-Sat)
  const dayDates: string[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    dayDates.push(formatDateISO(d));
  }

  const saturdayStr = dayDates[5];
  const weekLabel = `${formatShortDate(mondayStr)} – ${formatShortDate(saturdayStr)}, ${weekStart.getFullYear()}`;

  const fetchWeekData = useCallback(async () => {
    setLoading(true);
    setCopyError(null);
    try {
      const res = await fetch(`/api/admin/planning/week?monday=${mondayStr}`, { credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        setData(d);
      }
    } catch (e) {
      console.error('Failed to fetch week data:', e);
    } finally {
      setLoading(false);
    }
  }, [mondayStr]);

  useEffect(() => { fetchWeekData(); }, [fetchWeekData]);

  const prevWeek = () => {
    setWeekStart(prev => { const d = new Date(prev); d.setDate(d.getDate() - 7); return d; });
  };

  const nextWeek = () => {
    setWeekStart(prev => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d; });
  };

  const goThisWeek = () => setWeekStart(getMondayOfWeek(new Date()));

  const handleCopyWeek = async () => {
    setCopying(true);
    setCopyError(null);
    try {
      const res = await fetch('/api/admin/planning/copy-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sourceMondayDate: mondayStr }),
      });
      if (res.ok) {
        // Navigate to next week to show the new drafts
        setWeekStart(prev => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d; });
      } else {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        setCopyError(err.error || 'Failed to copy week');
      }
    } catch (e) {
      setCopyError('Network error');
    } finally {
      setCopying(false);
    }
  };

  const handlePublishAll = async () => {
    setPublishing(true);
    try {
      const res = await fetch('/api/admin/planning/publish-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mondayDate: mondayStr }),
      });
      if (res.ok) {
        await fetchWeekData();
      }
    } catch (e) {
      console.error('Failed to publish week:', e);
    } finally {
      setPublishing(false);
    }
  };

  const handleRemovePickup = async (jobId: string, pickupId: string) => {
    setRemovingPickup(pickupId);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/pickups/${pickupId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) await fetchWeekData();
    } catch (e) {
      console.error('Failed to remove pickup:', e);
    } finally {
      setRemovingPickup(null);
    }
  };

  // Group jobs by date
  const jobsByDate: Record<string, RouteJob[]> = {};
  for (const date of dayDates) {
    jobsByDate[date] = [];
  }
  if (data) {
    for (const job of data.jobs) {
      const jDate = job.scheduled_date.split('T')[0];
      if (jobsByDate[jDate]) {
        jobsByDate[jDate].push(job);
      }
    }
  }

  const draftCount = data?.jobs.filter(j => j.status === 'draft').length ?? 0;

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {/* Week Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={prevWeek} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 font-bold">&lt;</button>
          <h2 className="text-lg font-bold text-gray-900 min-w-[220px] text-center">{weekLabel}</h2>
          <button onClick={nextWeek} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 font-bold">&gt;</button>
          <button onClick={goThisWeek} className="px-3 py-1.5 text-sm font-bold text-teal-700 hover:bg-teal-50 rounded-lg">This Week</button>
        </div>

        <div className="flex items-center gap-2">
          {draftCount > 0 && (
            <button
              onClick={handlePublishAll}
              disabled={publishing}
              className="px-4 py-2 text-sm font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 rounded-lg transition-colors"
            >
              {publishing ? 'Publishing...' : `Publish All Drafts (${draftCount})`}
            </button>
          )}
          <button
            onClick={handleCopyWeek}
            disabled={copying || (data?.jobs.length ?? 0) === 0}
            className="px-4 py-2 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 rounded-lg transition-colors"
          >
            {copying ? 'Copying...' : 'Copy to Next Week'}
          </button>
        </div>
      </div>

      {/* Copy error */}
      {copyError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {copyError}
        </div>
      )}

      {/* Cancelled clients alert */}
      {data && data.cancelled.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-red-600 mb-2">
            Cancelled Clients in Routes ({data.cancelled.length})
          </h3>
          <div className="space-y-1">
            {data.cancelled.map(cp => (
              <div key={cp.pickup_id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-red-100">
                <div className="text-xs min-w-0 flex-1">
                  <span className="font-medium text-gray-900">{cp.customer_name}</span>
                  <span className="text-gray-400 ml-2 truncate">{cp.address}</span>
                  <span className="text-red-500 ml-2">({cp.service_status})</span>
                  <span className="text-gray-400 ml-2">in {cp.job_title}</span>
                </div>
                <button
                  onClick={() => handleRemovePickup(cp.job_id, cp.pickup_id)}
                  disabled={removingPickup === cp.pickup_id}
                  className="flex-shrink-0 ml-2 text-xs font-bold text-red-600 hover:text-red-800 px-2 py-1 rounded hover:bg-red-100 disabled:opacity-50"
                >
                  {removingPickup === cp.pickup_id ? 'Removing...' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Zone legend */}
      {data && data.zones.length > 0 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-400 font-bold">Zones:</span>
          {data.zones.filter(z => z.active).map(z => (
            <span key={z.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: z.color }} />
              {z.name}
            </span>
          ))}
        </div>
      )}

      {/* Board: 6 columns */}
      <div className="grid grid-cols-6 gap-3">
        {dayDates.map(date => (
          <RoutePlannerDayColumn
            key={date}
            date={date}
            jobs={jobsByDate[date] || []}
            missingClients={data?.missingByDay[date] || []}
            onRefresh={fetchWeekData}
          />
        ))}
      </div>

      {/* Empty state */}
      {data && data.jobs.length === 0 && Object.values(data.missingByDay).every(m => m.length === 0) && (
        <EmptyState
          title="No Routes This Week"
          message="Use 'Copy to Next Week' from a previous week, or go to the Planning tab to create jobs."
        />
      )}
    </div>
  );
};

export default RoutePlanner;
