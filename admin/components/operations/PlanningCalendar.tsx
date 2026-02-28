import React, { useState, useEffect, useCallback } from 'react';
import { LoadingSpinner, EmptyState } from '../ui/index.ts';
import type { Route, RouteStop, ServiceZone } from '../../../shared/types/index.ts';
import EditRouteModal from './EditRouteModal.tsx';
import CreateRouteModal from './CreateRouteModal.tsx';
import OptimoStatusBanner from './OptimoStatusBanner.tsx';
import CompletionDetailModal from './CompletionDetailModal.tsx';
import RouteOptimizerModal from './RouteOptimizerModal.tsx';
import BidSection from './BidSection.tsx';

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
  routesByStatus: Record<string, number>;
  zoneBreakdown: Array<{ zone_name: string | null; zone_color: string | null; count: number }>;
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAME_MAP: Record<number, string> = {
  0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday',
  4: 'thursday', 5: 'friday', 6: 'saturday',
};

const ROUTE_TYPE_LABELS: Record<string, string> = {
  daily_route: 'Route',
  bulk_pickup: 'Bulk',
  special_pickup: 'Special',
};

const ROUTE_TYPE_COLORS: Record<string, string> = {
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

const ROUTE_MAX_STOPS = 50;

function formatDateISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

function getMonthDays(year: number, month: number): CalendarDay[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const today = formatDateISO(new Date());
  const days: CalendarDay[] = [];

  for (let i = 0; i < firstDay.getDay(); i++) {
    const d = new Date(year, month, -firstDay.getDay() + i + 1);
    days.push({ date: formatDateISO(d), isCurrentMonth: false, isToday: formatDateISO(d) === today, pickupCount: 0, specialCount: 0, routesByStatus: {}, zoneBreakdown: [] });
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dt = new Date(year, month, d);
    days.push({ date: formatDateISO(dt), isCurrentMonth: true, isToday: formatDateISO(dt) === today, pickupCount: 0, specialCount: 0, routesByStatus: {}, zoneBreakdown: [] });
  }

  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      days.push({ date: formatDateISO(d), isCurrentMonth: false, isToday: formatDateISO(d) === today, pickupCount: 0, specialCount: 0, routesByStatus: {}, zoneBreakdown: [] });
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
  const [dayRoutes, setDayRoutes] = useState<Route[]>([]);
  const [dayLoading, setDayLoading] = useState(false);
  const [autoPlanning, setAutoPlanning] = useState(false);

  // Expandable route card state
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);
  const [routeStops, setRouteStops] = useState<Record<string, RouteStop[]>>({});
  const [loadingStops, setLoadingStops] = useState<string | null>(null);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);

  // Sync state
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncingDay, setSyncingDay] = useState(false);

  // Unified view state
  const [liveStopStatuses, setLiveStopStatuses] = useState<Record<string, string>>({});
  const [completionStop, setCompletionStop] = useState<{ id?: string; orderNo?: string } | null>(null);
  const [showCreateRoute, setShowCreateRoute] = useState(false);
  const [showOptimizer, setShowOptimizer] = useState(false);
  const [expandedBidRouteId, setExpandedBidRouteId] = useState<string | null>(null);
  const [deletingRoute, setDeletingRoute] = useState<string | null>(null);
  const [importingFromOptimo, setImportingFromOptimo] = useState(false);
  const [importResult, setImportResult] = useState<{ routesImported: number; routesSkipped: number; stopsImported: number; stopsMatched: number; stopsUnmatched: number; errors: string[] } | null>(null);

  const handleLiveStatusUpdate = useCallback((_driverStatuses: Record<string, string>, stopStatuses: Record<string, string>) => {
    setLiveStopStatuses(stopStatuses);
  }, []);

  const handleRemoveStop = async (routeId: string, stopId: string) => {
    if (!confirm('Remove this stop?')) return;
    try {
      const res = await fetch(`/api/admin/routes/${routeId}/stops/${stopId}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        setRouteStops(prev => ({ ...prev, [routeId]: (prev[routeId] ?? []).filter(s => s.id !== stopId) }));
        setDayRoutes(prev => prev.map(r => r.id === routeId ? { ...r, stop_count: Math.max(0, (r.stop_count ?? 0) - 1) } : r));
        fetchCalendarData();
      }
    } catch (e) {
      console.error('Failed to remove stop:', e);
    }
  };

  const handleDeleteRoute = async (routeId: string) => {
    if (!confirm('Cancel this route?')) return;
    setDeletingRoute(routeId);
    try {
      await fetch(`/api/admin/routes/${routeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'cancelled' }),
      });
      await refreshDay();
    } catch (e) {
      console.error('Failed to cancel route:', e);
    } finally {
      setDeletingRoute(null);
    }
  };

  const loadCalendarDays = useCallback(async (from: string, to: string) => {
    const days = getMonthDays(currentYear, currentMonth);

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

      const specialsByDate = new Map<string, number>();
      for (const s of data.specials ?? []) {
        specialsByDate.set(s.pickup_date, s.special_count);
      }

      const countsByDay = new Map<string, Array<{ zone_name: string | null; zone_color: string | null; count: number }>>();
      for (const pc of data.propertyCounts ?? []) {
        if (!countsByDay.has(pc.pickup_day)) countsByDay.set(pc.pickup_day, []);
        countsByDay.get(pc.pickup_day)!.push({ zone_name: pc.zone_name, zone_color: pc.zone_color, count: pc.property_count });
      }

      const routesByDate = new Map<string, Record<string, number>>();
      for (const j of data.routes ?? []) {
        const key = j.scheduled_date.split('T')[0];
        if (!routesByDate.has(key)) routesByDate.set(key, {});
        const m = routesByDate.get(key)!;
        m[j.status] = (m[j.status] || 0) + j.route_count;
      }

      for (const day of days) {
        const dt = new Date(day.date + 'T12:00:00');
        const dayName = DAY_NAME_MAP[dt.getDay()];
        const zb = countsByDay.get(dayName) ?? [];
        day.pickupCount = zb.reduce((sum, z) => sum + z.count, 0);
        day.zoneBreakdown = zb;
        day.specialCount = specialsByDate.get(day.date) ?? 0;
        day.routesByStatus = routesByDate.get(day.date) ?? {};
      }
    }

    setCalendarDays(days);
  }, [currentYear, currentMonth]);

  const fetchCalendarData = useCallback(async () => {
    setLoading(true);
    try {
      const days = getMonthDays(currentYear, currentMonth);
      const from = days[0].date;
      const to = days[days.length - 1].date;

      // Load local data first so calendar renders fast
      await loadCalendarDays(from, to);

      // Then sync from OptimoRoute in background and refresh
      fetch('/api/admin/optimoroute/import-routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ from, to }),
      })
        .then(r => r.ok ? r.json() : null)
        .then(result => {
          if (result && result.totalRoutesImported > 0) {
            loadCalendarDays(from, to);
          }
        })
        .catch(() => {});
    } catch (e) {
      console.error('Failed to fetch calendar:', e);
    } finally {
      setLoading(false);
    }
  }, [currentYear, currentMonth, loadCalendarDays]);

  useEffect(() => { fetchCalendarData(); }, [fetchCalendarData]);

  const fetchDayDetail = useCallback(async (date: string) => {
    setDayLoading(true);
    setExpandedRouteId(null);
    try {
      const res = await fetch(`/api/admin/planning/date/${date}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setDayProperties(data.properties ?? []);
        setDaySpecials(data.specials ?? []);
        setDayRoutes(data.existingRoutes ?? []);
      }
    } catch (e) {
      console.error('Failed to fetch day detail:', e);
    } finally {
      setDayLoading(false);
    }
  }, []);

  const selectDate = async (date: string) => {
    setSelectedDate(date);
    // Import from OptimoRoute for this date, then show detail
    try {
      await fetch('/api/admin/optimoroute/import-routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ date }),
      });
    } catch {}
    fetchDayDetail(date);
  };

  const refreshDay = async () => {
    if (selectedDate) {
      await Promise.all([fetchCalendarData(), fetchDayDetail(selectedDate)]);
    }
  };

  // Plan routes for this day
  const handlePlanRoutes = async () => {
    if (!selectedDate) return;
    setAutoPlanning(true);
    try {
      const res = await fetch('/api/admin/planning/auto-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ date: selectedDate }),
      });
      if (res.ok) await refreshDay();
    } catch (e) {
      console.error('Failed to plan routes:', e);
    } finally {
      setAutoPlanning(false);
    }
  };

  // Publish a single route
  const handlePublishRoute = async (routeId: string) => {
    try {
      const res = await fetch(`/api/admin/routes/${routeId}/publish`, { method: 'POST', credentials: 'include' });
      if (res.ok) await refreshDay();
    } catch (e) {
      console.error('Failed to publish route:', e);
    }
  };

  // Publish all drafts for this day
  const handlePublishAllDrafts = async () => {
    const drafts = dayRoutes.filter(r => r.status === 'draft');
    for (const draft of drafts) {
      await fetch(`/api/admin/routes/${draft.id}/publish`, { method: 'POST', credentials: 'include' });
    }
    await refreshDay();
  };

  // Expand route to show stops
  const toggleExpandRoute = async (routeId: string) => {
    if (expandedRouteId === routeId) {
      setExpandedRouteId(null);
      return;
    }
    setExpandedRouteId(routeId);
    if (routeStops[routeId]) return;

    setLoadingStops(routeId);
    try {
      const res = await fetch(`/api/admin/routes/${routeId}/stops`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setRouteStops(prev => ({ ...prev, [routeId]: data.stops ?? [] }));
      }
    } catch (e) {
      console.error('Failed to load stops:', e);
    } finally {
      setLoadingStops(null);
    }
  };

  // Sync single route to OptimoRoute
  const handleSyncRoute = async (routeId: string) => {
    setSyncing(routeId);
    try {
      const res = await fetch(`/api/admin/routes/${routeId}/sync-to-optimo`, { method: 'POST', credentials: 'include' });
      if (res.ok) {
        const result = await res.json();
        alert(`Synced ${result.ordersSynced} orders to OptimoRoute.${result.errors.length > 0 ? ` Errors: ${result.errors.length}` : ''}`);
        await refreshDay();
      }
    } catch (e) {
      console.error('Failed to sync route:', e);
    } finally {
      setSyncing(null);
    }
  };

  // Sync all published routes for this day
  const handleSyncDay = async () => {
    if (!selectedDate) return;
    setSyncingDay(true);
    try {
      const res = await fetch('/api/admin/planning/sync-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ date: selectedDate }),
      });
      if (res.ok) {
        const result = await res.json();
        alert(`Synced ${result.routesSynced} routes (${result.ordersSynced} orders) to OptimoRoute.`);
        await refreshDay();
      }
    } catch (e) {
      console.error('Failed to sync day:', e);
    } finally {
      setSyncingDay(false);
    }
  };

  const handleImportFromOptimo = async () => {
    if (!selectedDate) return;
    setImportingFromOptimo(true);
    setImportResult(null);
    try {
      const res = await fetch('/api/admin/optimoroute/import-routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ date: selectedDate }),
      });
      if (res.ok) {
        const result = await res.json();
        setImportResult(result);
        await refreshDay();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Import failed: ${err.error || 'Unknown error'}`);
      }
    } catch (e) {
      console.error('Failed to import from OptimoRoute:', e);
    } finally {
      setImportingFromOptimo(false);
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
  const goToday = () => { setCurrentYear(today.getFullYear()); setCurrentMonth(today.getMonth()); };

  const monthLabel = new Date(currentYear, currentMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const draftCount = dayRoutes.filter(r => r.status === 'draft').length;
  const publishedUnsyncedCount = dayRoutes.filter(r => r.status !== 'draft' && r.status !== 'cancelled' && !r.optimo_synced).length;

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {/* OptimoRoute Connection Status */}
      <OptimoStatusBanner onStatusUpdate={handleLiveStatusUpdate} />

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
            <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
              {DAYS_OF_WEEK.map(day => (
                <div key={day} className="px-2 py-2 text-center text-xs font-black uppercase tracking-widest text-gray-400">{day}</div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {calendarDays.map((day) => {
                const totalRoutes = (Object.values(day.routesByStatus) as number[]).reduce((a, b) => a + b, 0);

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
                        {day.zoneBreakdown.map((zb, i) => (
                          <div key={i} className="flex items-center gap-1 text-[10px]">
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: zb.zone_color || '#9CA3AF' }} />
                            <span className="text-gray-500 truncate">{zb.count}</span>
                          </div>
                        ))}

                        {day.specialCount > 0 && (
                          <div className="text-[10px] text-purple-600 font-semibold">{day.specialCount} special</div>
                        )}

                        {totalRoutes > 0 && (
                          <div className="mt-1 flex flex-wrap gap-0.5">
                            {Object.entries(day.routesByStatus).map(([status, count]) => (
                              <span key={status} className={`inline-flex items-center px-1 py-0 rounded text-[9px] font-bold ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}>
                                {count} {status.replace('_', ' ')}
                              </span>
                            ))}
                          </div>
                        )}

                        {day.pickupCount > 0 && totalRoutes === 0 && (
                          <div className="text-[10px] text-amber-600 font-bold mt-1">{day.pickupCount} unplanned</div>
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
                <button type="button" onClick={() => setSelectedDate(null)} className="text-gray-400 hover:text-gray-600 text-lg font-bold">&times;</button>
              </div>

              {dayLoading ? (
                <LoadingSpinner />
              ) : (
                <div className="space-y-4">
                  {/* Summary */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-gray-50 rounded-lg p-2">
                      <div className="text-lg font-bold text-gray-900">{dayRoutes.length}</div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase">Routes</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <div className="text-lg font-bold text-gray-900">{dayRoutes.reduce((sum, r) => sum + (r.stop_count ?? r.estimated_stops ?? 0), 0)}</div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase">Stops</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <div className="text-lg font-bold text-gray-900">{daySpecials.length}</div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase">Special</div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-2">
                    {dayProperties.length > 0 && dayRoutes.filter(j => j.status === 'draft').length === 0 && (
                      <button type="button" onClick={handlePlanRoutes} disabled={autoPlanning}
                        className="flex-1 px-3 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white text-xs font-bold rounded-lg transition-colors">
                        {autoPlanning ? 'Planning...' : 'Plan Routes'}
                      </button>
                    )}

                    {draftCount > 0 && (
                      <button type="button" onClick={handlePublishAllDrafts}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors">
                        Publish All ({draftCount})
                      </button>
                    )}

                    {publishedUnsyncedCount > 0 && (
                      <button type="button" onClick={handleSyncDay} disabled={syncingDay}
                        className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-bold rounded-lg transition-colors">
                        {syncingDay ? 'Syncing...' : `Sync to Optimo (${publishedUnsyncedCount})`}
                      </button>
                    )}

                    <button type="button" onClick={() => setShowCreateRoute(true)}
                      className="px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg transition-colors">
                      + Create Route
                    </button>

                    {selectedDate && (
                      <button type="button" onClick={() => setShowOptimizer(true)}
                        className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg transition-colors">
                        Optimize
                      </button>
                    )}

                    <button type="button" onClick={handleImportFromOptimo} disabled={importingFromOptimo}
                      className="px-3 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-xs font-bold rounded-lg transition-colors">
                      {importingFromOptimo ? 'Importing...' : 'Import from Optimo'}
                    </button>
                  </div>

                  {/* Import result banner */}
                  {importResult && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-amber-800">
                          Imported {importResult.routesImported} route{importResult.routesImported !== 1 ? 's' : ''}, {importResult.stopsImported} stop{importResult.stopsImported !== 1 ? 's' : ''}
                          {importResult.routesSkipped > 0 && ` (${importResult.routesSkipped} already existed)`}
                        </span>
                        <button type="button" onClick={() => setImportResult(null)} className="text-amber-600 hover:text-amber-800 font-bold">&times;</button>
                      </div>
                      {importResult.stopsUnmatched > 0 && (
                        <div className="text-amber-700 mt-1">{importResult.stopsMatched} matched to local properties, {importResult.stopsUnmatched} address-only</div>
                      )}
                      {importResult.errors.length > 0 && (
                        <div className="text-red-600 mt-1">{importResult.errors.join(', ')}</div>
                      )}
                    </div>
                  )}

                  {/* Route Cards — OptimoRoute style */}
                  {dayRoutes.length > 0 && (
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Routes</h4>
                      <div className="space-y-3">
                        {dayRoutes.map(route => {
                          const stopCount = route.stop_count ?? route.estimated_stops ?? 0;
                          const minutesPerStop = 8;
                          const estimatedHours = (stopCount * minutesPerStop / 60);
                          const overCapacity = stopCount > ROUTE_MAX_STOPS;
                          const isExpanded = expandedRouteId === route.id;
                          const stops = routeStops[route.id];
                          const isLive = route.status === 'in_progress';

                          // Compute completed stops: use loaded stops + live statuses when available, else DB count
                          let completedStops = route.completed_stop_count ?? 0;
                          if (stops && stops.length > 0) {
                            const DONE = new Set(['completed', 'success', 'failed', 'rejected']);
                            completedStops = stops.filter(s => {
                              const live = s.optimo_order_no ? liveStopStatuses[s.optimo_order_no] : null;
                              return DONE.has(live || '') || DONE.has(s.status);
                            }).length;
                          }
                          const progressPct = stopCount > 0 ? Math.round((completedStops / stopCount) * 100) : 0;

                          return (
                            <div key={route.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                              {/* Collapsed card header */}
                              <button
                                type="button"
                                onClick={() => toggleExpandRoute(route.id)}
                                className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors text-left"
                              >
                                {/* Zone color indicator */}
                                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: route.zone_color || '#9CA3AF' }} />

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="font-black text-gray-900 text-sm truncate">{route.title}</span>
                                    <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded-full ${STATUS_COLORS[route.status]}`}>
                                      {route.status.replace('_', ' ')}
                                    </span>
                                    {route.optimo_synced && (
                                      <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Synced</span>
                                    )}
                                    {route.source === 'optimo_import' && (
                                      <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Imported</span>
                                    )}
                                    {(route.bid_count ?? 0) > 0 && (
                                      <button type="button" onClick={(e) => { e.stopPropagation(); setExpandedBidRouteId(expandedBidRouteId === route.id ? null : route.id); }}
                                        className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                                        {route.bid_count} bid{(route.bid_count ?? 0) !== 1 ? 's' : ''}
                                      </button>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                                    <span>{stopCount} stops</span>
                                    <span>~{estimatedHours.toFixed(1)}h</span>
                                    {route.base_pay != null && <span>${Number(route.base_pay).toFixed(0)}</span>}
                                    {route.driver_name && <span>{route.driver_name}</span>}
                                  </div>
                                  {overCapacity && (
                                    <div className="mt-1 text-xs font-bold text-amber-600">
                                      {stopCount} stops (max {ROUTE_MAX_STOPS}) — consider rebalancing
                                    </div>
                                  )}
                                </div>

                                <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                                </svg>
                              </button>

                              {/* Live progress bar */}
                              {isLive && stopCount > 0 && (
                                <div className="px-3 pb-2 -mt-1">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-teal-500 rounded-full transition-all duration-500"
                                        style={{ width: `${progressPct}%` }}
                                      />
                                    </div>
                                    <span className="text-[10px] font-bold text-gray-500 whitespace-nowrap">
                                      {completedStops}/{stopCount}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* Expanded: stops table + actions */}
                              {isExpanded && (
                                <div className="border-t border-gray-100">
                                  {/* Route action buttons */}
                                  <div className="flex gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
                                    {route.status === 'draft' && (
                                      <button type="button" onClick={(e) => { e.stopPropagation(); handlePublishRoute(route.id); }}
                                        className="px-2.5 py-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                                        Publish
                                      </button>
                                    )}
                                    {route.status !== 'draft' && route.status !== 'cancelled' && !route.optimo_synced && (
                                      <button type="button" onClick={(e) => { e.stopPropagation(); handleSyncRoute(route.id); }}
                                        disabled={syncing === route.id}
                                        className="px-2.5 py-1 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 rounded-lg transition-colors">
                                        {syncing === route.id ? 'Syncing...' : 'Sync to Optimo'}
                                      </button>
                                    )}
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setEditingRoute(route); }}
                                      className="px-2.5 py-1 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors">
                                      Edit
                                    </button>
                                    {route.status !== 'completed' && route.status !== 'cancelled' && (
                                      <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteRoute(route.id); }}
                                        disabled={deletingRoute === route.id}
                                        className="px-2.5 py-1 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
                                        {deletingRoute === route.id ? 'Cancelling...' : 'Cancel'}
                                      </button>
                                    )}
                                  </div>

                                  {/* Stops table */}
                                  {loadingStops === route.id ? (
                                    <div className="p-4 text-center"><div className="text-sm text-gray-400">Loading stops...</div></div>
                                  ) : stops && stops.length > 0 ? (
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-sm">
                                        <thead>
                                          <tr className="bg-gray-50 text-left">
                                            <th className="px-3 py-1.5 text-[10px] font-black uppercase text-gray-400">#</th>
                                            <th className="px-3 py-1.5 text-[10px] font-black uppercase text-gray-400">Address</th>
                                            <th className="px-3 py-1.5 text-[10px] font-black uppercase text-gray-400">Type</th>
                                            <th className="px-3 py-1.5 text-[10px] font-black uppercase text-gray-400">Status</th>
                                            <th className="px-3 py-1.5 text-[10px] font-black uppercase text-gray-400"></th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {stops.map((p, idx) => {
                                            const liveStatus = p.optimo_order_no ? liveStopStatuses[p.optimo_order_no] : null;
                                            const displayStatus = liveStatus || p.status;
                                            return (
                                            <tr key={p.id} className="border-t border-gray-50">
                                              <td className="px-3 py-1.5 text-gray-400 font-bold">{p.stop_number ?? idx + 1}</td>
                                              <td className="px-3 py-1.5">
                                                <div className="text-gray-900 truncate max-w-[180px]">{p.address}</div>
                                                <div className="text-xs text-gray-400 truncate">{p.customer_name}</div>
                                              </td>
                                              <td className="px-3 py-1.5">
                                                <span className={`text-xs font-bold ${
                                                  p.order_type === 'special' ? 'text-purple-600' : p.order_type === 'missed_redo' ? 'text-red-600' : 'text-gray-500'
                                                }`}>{p.order_type}</span>
                                              </td>
                                              <td className="px-3 py-1.5">
                                                <span className={`text-xs font-bold ${
                                                  displayStatus === 'completed' || displayStatus === 'success' ? 'text-green-600' : displayStatus === 'failed' || displayStatus === 'rejected' ? 'text-red-600' : displayStatus === 'in_progress' || displayStatus === 'on_route' || displayStatus === 'servicing' ? 'text-blue-600' : 'text-gray-400'
                                                }`}>{displayStatus}</span>
                                              </td>
                                              <td className="px-3 py-1.5 flex items-center gap-1">
                                                {p.optimo_order_no && (
                                                  <button type="button" onClick={(e) => { e.stopPropagation(); setCompletionStop({ orderNo: p.optimo_order_no }); }}
                                                    className="text-xs font-bold text-teal-600 hover:text-teal-800">
                                                    POD
                                                  </button>
                                                )}
                                                {route.status !== 'completed' && route.status !== 'cancelled' && (
                                                  <button type="button" onClick={(e) => { e.stopPropagation(); handleRemoveStop(route.id, p.id); }}
                                                    className="text-xs font-bold text-red-400 hover:text-red-600" title="Remove stop">
                                                    &times;
                                                  </button>
                                                )}
                                              </td>
                                            </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <div className="p-3 text-center text-xs text-gray-400">No stops assigned</div>
                                  )}

                                  {/* Bid Section */}
                                  {expandedBidRouteId === route.id && (
                                    <BidSection
                                      routeId={route.id}
                                      basePay={route.base_pay != null ? Number(route.base_pay) : undefined}
                                      canAcceptBids={route.status === 'open' || route.status === 'bidding'}
                                      onBidAccepted={refreshDay}
                                    />
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Unassigned Properties */}
                  {dayProperties.length > 0 && (
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">
                        Unassigned Properties ({dayProperties.length})
                      </h4>
                      <div className="max-h-[200px] overflow-y-auto space-y-1">
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

                  {dayProperties.length === 0 && daySpecials.length === 0 && dayRoutes.length === 0 && (
                    <EmptyState title="Nothing Scheduled" message="No pickups or routes for this date." />
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Edit Route Modal */}
      {editingRoute && (
        <EditRouteModal route={editingRoute} onClose={() => setEditingRoute(null)} onUpdated={() => { setEditingRoute(null); refreshDay(); }} />
      )}

      {/* Create Route Modal */}
      {showCreateRoute && (
        <CreateRouteModal onClose={() => setShowCreateRoute(false)} onCreated={() => { setShowCreateRoute(false); refreshDay(); }} />
      )}

      {/* Route Optimizer Modal */}
      {showOptimizer && selectedDate && (
        <RouteOptimizerModal date={selectedDate} onClose={() => setShowOptimizer(false)} onComplete={() => { setShowOptimizer(false); refreshDay(); }} />
      )}

      {/* Completion Detail Modal */}
      {completionStop && (
        <CompletionDetailModal stopIdentifier={completionStop} onClose={() => setCompletionStop(null)} />
      )}
    </div>
  );
};

export default PlanningCalendar;
