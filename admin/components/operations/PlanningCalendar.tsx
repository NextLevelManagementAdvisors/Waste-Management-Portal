import React, { useState, useEffect, useCallback } from 'react';
import { LoadingSpinner, EmptyState } from '../ui/index.ts';
import type { RouteJob, ServiceZone } from '../../../shared/types/index.ts';

interface PlanningProperty {
  id: string;
  address: string;
  service_type: string;
  customer_name: string;
  customer_email: string;
  zone_id: string | null;
  zone_name: string | null;
  zone_color: string | null;
  pickup_day: string;
  pickup_frequency: string;
}

interface SpecialPickup {
  id: string;
  address: string;
  customer_name: string;
  service_name: string;
  service_price: number;
  zone_id: string | null;
  zone_name: string | null;
  property_id: string;
}

interface CalendarDay {
  date: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  pickupCount: number;
  specialCount: number;
  jobsByStatus: Record<string, number>;
  zoneBreakdown: Array<{ zone_name: string | null; zone_color: string | null; count: number }>;
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAME_MAP: Record<number, string> = {
  0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday',
  4: 'thursday', 5: 'friday', 6: 'saturday',
};

const JOB_TYPE_LABELS: Record<string, string> = {
  daily_route: 'Route',
  bulk_pickup: 'Bulk',
  special_pickup: 'Special',
};

const JOB_TYPE_COLORS: Record<string, string> = {
  daily_route: 'bg-teal-100 text-teal-700',
  bulk_pickup: 'bg-orange-100 text-orange-700',
  special_pickup: 'bg-purple-100 text-purple-700',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  open: 'bg-blue-100 text-blue-700',
  bidding: 'bg-yellow-100 text-yellow-700',
  assigned: 'bg-purple-100 text-purple-700',
  in_progress: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

function formatDateISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

function getMonthDays(year: number, month: number): CalendarDay[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const today = formatDateISO(new Date());
  const days: CalendarDay[] = [];

  // Fill in leading days from previous month
  for (let i = 0; i < firstDay.getDay(); i++) {
    const d = new Date(year, month, -firstDay.getDay() + i + 1);
    days.push({
      date: formatDateISO(d),
      isCurrentMonth: false,
      isToday: formatDateISO(d) === today,
      pickupCount: 0, specialCount: 0, jobsByStatus: {}, zoneBreakdown: [],
    });
  }

  // Days of current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dt = new Date(year, month, d);
    days.push({
      date: formatDateISO(dt),
      isCurrentMonth: true,
      isToday: formatDateISO(dt) === today,
      pickupCount: 0, specialCount: 0, jobsByStatus: {}, zoneBreakdown: [],
    });
  }

  // Fill remaining to complete last week
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      days.push({
        date: formatDateISO(d),
        isCurrentMonth: false,
        isToday: formatDateISO(d) === today,
        pickupCount: 0, specialCount: 0, jobsByStatus: {}, zoneBreakdown: [],
      });
    }
  }

  return days;
}

const PlanningCalendar: React.FC = () => {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [zones, setZones] = useState<ServiceZone[]>([]);

  // Day detail state
  const [dayProperties, setDayProperties] = useState<PlanningProperty[]>([]);
  const [daySpecials, setDaySpecials] = useState<SpecialPickup[]>([]);
  const [dayJobs, setDayJobs] = useState<RouteJob[]>([]);
  const [dayLoading, setDayLoading] = useState(false);
  const [autoGrouping, setAutoGrouping] = useState(false);

  const fetchCalendarData = useCallback(async () => {
    setLoading(true);
    try {
      const days = getMonthDays(currentYear, currentMonth);
      const from = days[0].date;
      const to = days[days.length - 1].date;

      const [calRes, zonesRes] = await Promise.all([
        fetch(`/api/admin/planning/calendar?from=${from}&to=${to}`, { credentials: 'include' }),
        fetch('/api/admin/zones', { credentials: 'include' }),
      ]);

      if (zonesRes.ok) {
        const zData = await zonesRes.json();
        setZones(zData.zones ?? []);
      }

      if (calRes.ok) {
        const data = await calRes.json();

        // Enrich days with data
        const specialsByDate = new Map<string, number>();
        for (const s of data.specials ?? []) {
          specialsByDate.set(s.pickup_date, s.special_count);
        }

        // Build property counts per day-of-week per zone
        const countsByDay = new Map<string, Array<{ zone_name: string | null; zone_color: string | null; count: number }>>();
        for (const pc of data.propertyCounts ?? []) {
          if (!countsByDay.has(pc.pickup_day)) countsByDay.set(pc.pickup_day, []);
          countsByDay.get(pc.pickup_day)!.push({
            zone_name: pc.zone_name,
            zone_color: pc.zone_color,
            count: pc.property_count,
          });
        }

        // Jobs by date + status
        const jobsByDate = new Map<string, Record<string, number>>();
        for (const j of data.jobs ?? []) {
          const key = j.scheduled_date.split('T')[0];
          if (!jobsByDate.has(key)) jobsByDate.set(key, {});
          const m = jobsByDate.get(key)!;
          m[j.status] = (m[j.status] || 0) + j.job_count;
        }

        for (const day of days) {
          const dt = new Date(day.date + 'T12:00:00');
          const dayName = DAY_NAME_MAP[dt.getDay()];
          const zb = countsByDay.get(dayName) ?? [];
          day.pickupCount = zb.reduce((sum, z) => sum + z.count, 0);
          day.zoneBreakdown = zb;
          day.specialCount = specialsByDate.get(day.date) ?? 0;
          day.jobsByStatus = jobsByDate.get(day.date) ?? {};
        }
      }

      setCalendarDays(days);
    } catch (e) {
      console.error('Failed to fetch calendar:', e);
    } finally {
      setLoading(false);
    }
  }, [currentYear, currentMonth]);

  useEffect(() => { fetchCalendarData(); }, [fetchCalendarData]);

  const fetchDayDetail = useCallback(async (date: string) => {
    setDayLoading(true);
    try {
      const res = await fetch(`/api/admin/planning/date/${date}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setDayProperties(data.properties ?? []);
        setDaySpecials(data.specials ?? []);
        setDayJobs(data.existingJobs ?? []);
      }
    } catch (e) {
      console.error('Failed to fetch day detail:', e);
    } finally {
      setDayLoading(false);
    }
  }, []);

  const selectDate = (date: string) => {
    setSelectedDate(date);
    fetchDayDetail(date);
  };

  const handleAutoGroup = async () => {
    if (!selectedDate) return;
    setAutoGrouping(true);
    try {
      const res = await fetch('/api/admin/planning/auto-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ date: selectedDate }),
      });
      if (res.ok) {
        // Refresh both calendar and day detail
        await Promise.all([fetchCalendarData(), fetchDayDetail(selectedDate)]);
      }
    } catch (e) {
      console.error('Failed to auto-group:', e);
    } finally {
      setAutoGrouping(false);
    }
  };

  const handlePublishJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/publish`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok && selectedDate) {
        await Promise.all([fetchCalendarData(), fetchDayDetail(selectedDate)]);
      }
    } catch (e) {
      console.error('Failed to publish job:', e);
    }
  };

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentYear(y => y - 1); setCurrentMonth(11); }
    else setCurrentMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentYear(y => y + 1); setCurrentMonth(0); }
    else setCurrentMonth(m => m + 1);
  };

  const goToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
  };

  const monthLabel = new Date(currentYear, currentMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {/* Calendar Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 font-bold">&lt;</button>
          <h2 className="text-lg font-bold text-gray-900 min-w-[180px] text-center">{monthLabel}</h2>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 font-bold">&gt;</button>
          <button onClick={goToday} className="px-3 py-1.5 text-sm font-bold text-teal-700 hover:bg-teal-50 rounded-lg">Today</button>
        </div>

        {zones.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-400 font-bold">Zones:</span>
            {zones.filter(z => z.active).map(z => (
              <span key={z.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: z.color }} />
                {z.name}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-6">
        {/* Calendar Grid */}
        <div className={`${selectedDate ? 'w-2/3' : 'w-full'} transition-all`}>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
              {DAYS_OF_WEEK.map(day => (
                <div key={day} className="px-2 py-2 text-center text-xs font-black uppercase tracking-widest text-gray-400">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar cells */}
            <div className="grid grid-cols-7">
              {calendarDays.map((day) => {
                const totalJobs = (Object.values(day.jobsByStatus) as number[]).reduce((a, b) => a + b, 0);
                const hasDrafts = (day.jobsByStatus['draft'] || 0) > 0;

                return (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => selectDate(day.date)}
                    className={`min-h-[100px] p-2 border-b border-r border-gray-100 text-left transition-colors hover:bg-gray-50 ${
                      !day.isCurrentMonth ? 'bg-gray-50/50' : ''
                    } ${day.isToday ? 'ring-2 ring-inset ring-teal-500' : ''} ${
                      selectedDate === day.date ? 'bg-teal-50' : ''
                    }`}
                  >
                    <div className={`text-sm font-bold mb-1 ${
                      !day.isCurrentMonth ? 'text-gray-300' : day.isToday ? 'text-teal-700' : 'text-gray-700'
                    }`}>
                      {new Date(day.date + 'T12:00:00').getDate()}
                    </div>

                    {day.isCurrentMonth && (
                      <div className="space-y-0.5">
                        {/* Pickup counts by zone */}
                        {day.zoneBreakdown.map((zb, i) => (
                          <div key={i} className="flex items-center gap-1 text-[10px]">
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: zb.zone_color || '#9CA3AF' }} />
                            <span className="text-gray-500 truncate">{zb.count}</span>
                          </div>
                        ))}

                        {/* Special pickups */}
                        {day.specialCount > 0 && (
                          <div className="text-[10px] text-purple-600 font-semibold">
                            {day.specialCount} special
                          </div>
                        )}

                        {/* Existing jobs */}
                        {totalJobs > 0 && (
                          <div className="mt-1 flex flex-wrap gap-0.5">
                            {Object.entries(day.jobsByStatus).map(([status, count]) => (
                              <span
                                key={status}
                                className={`inline-flex items-center px-1 py-0 rounded text-[9px] font-bold ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}
                              >
                                {count} {status.replace('_', ' ')}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Indicator: needs planning */}
                        {day.pickupCount > 0 && totalJobs === 0 && (
                          <div className="text-[10px] text-amber-600 font-bold mt-1">
                            {day.pickupCount} unplanned
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Day Detail Panel */}
        {selectedDate && (
          <div className="w-1/3 space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-900">
                  {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </h3>
                <button
                  type="button"
                  onClick={() => setSelectedDate(null)}
                  className="text-gray-400 hover:text-gray-600 text-lg font-bold"
                >
                  &times;
                </button>
              </div>

              {dayLoading ? (
                <LoadingSpinner />
              ) : (
                <div className="space-y-4">
                  {/* Summary */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-gray-50 rounded-lg p-2">
                      <div className="text-lg font-bold text-gray-900">{dayProperties.length}</div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase">Pickups</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <div className="text-lg font-bold text-gray-900">{daySpecials.length}</div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase">Special</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <div className="text-lg font-bold text-gray-900">{dayJobs.length}</div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase">Jobs</div>
                    </div>
                  </div>

                  {/* Auto-group button */}
                  {dayProperties.length > 0 && dayJobs.filter(j => j.status === 'draft').length === 0 && (
                    <button
                      type="button"
                      onClick={handleAutoGroup}
                      disabled={autoGrouping}
                      className="w-full px-4 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white text-sm font-bold rounded-lg transition-colors"
                    >
                      {autoGrouping ? 'Grouping...' : 'Auto-Group by Zone'}
                    </button>
                  )}

                  {/* Existing Jobs */}
                  {dayJobs.length > 0 && (
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Jobs</h4>
                      <div className="space-y-2">
                        {dayJobs.map(job => (
                          <div key={job.id} className="bg-gray-50 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-semibold text-gray-900 truncate">{job.title}</span>
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${JOB_TYPE_COLORS[job.job_type || 'daily_route']}`}>
                                {JOB_TYPE_LABELS[job.job_type || 'daily_route']}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded font-bold ${STATUS_COLORS[job.status]}`}>
                                {job.status.replace('_', ' ')}
                              </span>
                              {job.pickup_count != null && <span>{job.pickup_count} stops</span>}
                              {job.base_pay != null && <span>${Number(job.base_pay).toFixed(0)}</span>}
                              {job.driver_name && <span>{job.driver_name}</span>}
                            </div>
                            {job.status === 'draft' && (
                              <button
                                type="button"
                                onClick={() => handlePublishJob(job.id)}
                                className="mt-2 w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors"
                              >
                                Publish Job
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Properties due */}
                  {dayProperties.length > 0 && (
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">
                        Properties Due ({dayProperties.length})
                      </h4>
                      <div className="max-h-[300px] overflow-y-auto space-y-1">
                        {dayProperties.map(prop => (
                          <div key={prop.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 text-xs">
                            {prop.zone_color && (
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: prop.zone_color }} />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="text-gray-900 font-medium truncate">{prop.address}</div>
                              <div className="text-gray-400 truncate">{prop.customer_name}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Special pickups */}
                  {daySpecials.length > 0 && (
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">
                        Special Pickups ({daySpecials.length})
                      </h4>
                      <div className="space-y-1">
                        {daySpecials.map(sp => (
                          <div key={sp.id} className="px-2 py-1.5 rounded bg-purple-50 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-gray-900 font-medium truncate">{sp.service_name}</span>
                              <span className="font-bold text-purple-700">${Number(sp.service_price).toFixed(0)}</span>
                            </div>
                            <div className="text-gray-500 truncate">{sp.address}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {dayProperties.length === 0 && daySpecials.length === 0 && dayJobs.length === 0 && (
                    <EmptyState title="Nothing Scheduled" message="No pickups or jobs for this date." />
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlanningCalendar;
