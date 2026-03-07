import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { LoadingSpinner, EmptyState } from '../ui/index.ts';
import type { Route, RouteStop } from '../../../shared/types/index.ts';
import { getWeatherIcon, CalendarDaysIcon } from '../../../components/Icons.tsx';
import { Card } from '../../../components/Card.tsx';
import { STATUS_COLORS } from '../../../shared/components/RouteTable.tsx';
import EditRouteModal from './EditRouteModal.tsx';
import CreateRouteModal from './CreateRouteModal.tsx';
import OptimoStatusBanner from './OptimoStatusBanner.tsx';
import CompletionDetailModal from './CompletionDetailModal.tsx';
import RouteOptimizerModal from './RouteOptimizerModal.tsx';
import RouteMapModal from './RouteMapModal.tsx';
import BidSection from './BidSection.tsx';
import { useToast } from '../../../components/Toast.tsx';

// ── Local icon components (matching team portal style) ──

const ChevronLeftIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
  </svg>
);

const ChevronRightIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
  </svg>
);

const ListIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
  </svg>
);

// ── Interfaces ──

interface PlanningLocation {
  id: string;
  address: string;
  serviceType: string;
  customerName: string;
  customerEmail: string;
  collectionDay: string;
  collectionFrequency: string;
}

interface OnDemandPickup {
  id: string;
  address: string;
  customerName: string;
  serviceName: string;
  servicePrice: number;
  locationId: string;
}

interface CalendarDay {
  date: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  locationCount: number;
  onDemandCount: number;
  routesByStatus: Record<string, number>;
}

interface WeatherDay {
  date: string;
  tempHigh: number;
  tempLow: number;
  conditionMain: string;
  conditionDesc: string;
  precipChance: number;
  icon: string;
}

// ── Constants ──

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAME_MAP: Record<number, string> = {
  0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday',
  4: 'thursday', 5: 'friday', 6: 'saturday',
};

const STATUS_TOOLTIPS: Record<string, string> = {
  draft: 'Draft \u2014 Route is being planned. Only visible to admins.',
  open: 'Open \u2014 Published and available for drivers to bid on.',
  bidding: 'Bidding \u2014 Drivers have submitted bids. Awaiting selection.',
  assigned: 'Assigned \u2014 A driver has been assigned to this route.',
  in_progress: 'In Progress \u2014 Driver is actively running this route.',
  completed: 'Completed \u2014 All stops have been finished.',
  cancelled: 'Cancelled \u2014 This route has been cancelled.',
};

const ROUTE_MAX_STOPS = 50;

// ── Helpers ──

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
    days.push({ date: formatDateISO(d), isCurrentMonth: false, isToday: formatDateISO(d) === today, locationCount: 0, onDemandCount: 0, routesByStatus: {} });
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dt = new Date(year, month, d);
    days.push({ date: formatDateISO(dt), isCurrentMonth: true, isToday: formatDateISO(dt) === today, locationCount: 0, onDemandCount: 0, routesByStatus: {} });
  }

  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      days.push({ date: formatDateISO(d), isCurrentMonth: false, isToday: formatDateISO(d) === today, locationCount: 0, onDemandCount: 0, routesByStatus: {} });
    }
  }

  return days;
}

/** Group flat calendar days into week arrays of 7 */
function groupIntoWeeks(days: CalendarDay[]): CalendarDay[][] {
  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}

/** Get the sync state label for a route */
function getSyncIndicator(route: Route): { label: string; className: string } | null {
  if (route.status === 'in_progress') return null; // live dot handles this
  if (route.source === 'optimo_import' && route.optimoSynced) return { label: 'Imported', className: 'bg-amber-100 text-amber-700' };
  if (route.optimoSynced) return { label: 'Synced', className: 'bg-green-100 text-green-700' };
  if (!route.optimoSynced && route.optimoSyncedAt) return { label: 'Out of Sync', className: 'bg-amber-100 text-amber-700' };
  if (route.status === 'draft') return null; // drafts are inherently portal-only
  if (!route.optimoSynced && !route.optimoSyncedAt) return { label: 'Portal Only', className: 'bg-gray-100 text-gray-500' };
  return null;
}

// ── Component ──

const PlanningCalendar: React.FC = () => {
  const { showToast } = useToast();
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');

  // Day detail state
  const [dayLocations, setDayLocations] = useState<PlanningLocation[]>([]);
  const [dayOnDemand, setDayOnDemand] = useState<OnDemandPickup[]>([]);
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
  const [showRouteMap, setShowRouteMap] = useState(false);
  const [expandedBidRouteId, setExpandedBidRouteId] = useState<string | null>(null);
  const [deletingRoute, setDeletingRoute] = useState<string | null>(null);
  const [importingFromOptimo, setImportingFromOptimo] = useState(false);
  const [publishingAll, setPublishingAll] = useState(false);
  const [importResult, setImportResult] = useState<{ routesImported: number; routesSkipped: number; stopsImported: number; stopsMatched: number; stopsUnmatched: number; errors: string[] } | null>(null);

  // Weather state
  const [weatherByDate, setWeatherByDate] = useState<Map<string, WeatherDay>>(new Map());
  const [weatherError, setWeatherError] = useState<'not_configured' | 'api_error' | null>(null);

  const handleLiveStatusUpdate = useCallback((_driverStatuses: Record<string, string>, stopStatuses: Record<string, string>) => {
    setLiveStopStatuses(stopStatuses);
    // Persist live statuses to the database
    if (Object.keys(stopStatuses).length > 0) {
      fetch('/api/admin/routes/sync-live-statuses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ stopStatuses }),
      }).catch(() => {});
    }
  }, []);

  const handleRemoveStop = async (routeId: string, stopId: string) => {
    if (!confirm('Remove this stop?')) return;
    try {
      const res = await fetch(`/api/admin/routes/${routeId}/stops/${stopId}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        setRouteStops(prev => ({ ...prev, [routeId]: (prev[routeId] ?? []).filter(s => s.id !== stopId) }));
        setDayRoutes(prev => prev.map(r => r.id === routeId ? { ...r, stopCount: Math.max(0, (r.stopCount ?? 0) - 1) } : r));
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

    const calRes = await fetch(`/api/admin/planning/calendar?from=${from}&to=${to}`, { credentials: 'include' });

    if (calRes.ok) {
      const data = await calRes.json();

      const onDemandByDate = new Map<string, number>();
      for (const s of data.onDemand ?? []) {
        onDemandByDate.set(s.requested_date, s.on_demand_count);
      }

      // Per-date location counts (respects bi-weekly/monthly frequency)
      const countsByDate = new Map<string, number>();
      if (data.locationCountsByDate) {
        for (const [date, count] of Object.entries(data.locationCountsByDate)) {
          countsByDate.set(date, count as number);
        }
      } else {
        // Fallback for old API response format (day-of-week based)
        for (const pc of data.locationCounts ?? []) {
          countsByDate.set(pc.collection_day, (countsByDate.get(pc.collection_day) || 0) + Number(pc.location_count));
        }
      }

      const routesByDate = new Map<string, Record<string, number>>();
      for (const j of data.routes ?? []) {
        const key = j.scheduled_date.split('T')[0];
        if (!routesByDate.has(key)) routesByDate.set(key, {});
        const m = routesByDate.get(key)!;
        m[j.status] = (m[j.status] || 0) + j.route_count;
      }

      for (const day of days) {
        day.locationCount = countsByDate.get(day.date) ?? 0;
        day.onDemandCount = onDemandByDate.get(day.date) ?? 0;
        day.routesByStatus = routesByDate.get(day.date) ?? {};
      }
    }

    setCalendarDays(days);
  }, [currentYear, currentMonth]);

  const fetchWeather = useCallback(async (from: string, to: string) => {
    try {
      const res = await fetch(`/api/admin/weather?from=${from}&to=${to}`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.error === 'not_configured' || data.error === 'no_location') {
        setWeatherError('not_configured');
        return;
      }
      if (data.error) {
        setWeatherError('api_error');
        return;
      }
      setWeatherError(null);
      const map = new Map<string, WeatherDay>();
      for (const day of data.days ?? []) {
        map.set(day.date, day);
      }
      setWeatherByDate(map);
    } catch {
      // silent — weather is non-critical
    }
  }, []);

  const fetchCalendarData = useCallback(async () => {
    setLoading(true);
    try {
      const days = getMonthDays(currentYear, currentMonth);
      const from = days[0].date;
      const to = days[days.length - 1].date;

      await loadCalendarDays(from, to);
      fetchWeather(from, to);

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
        setDayLocations(data.locations ?? []);
        setDayOnDemand(data.onDemandRequests ?? []);
        setDayRoutes(data.existingRoutes ?? []);
      }
    } catch (e) {
      console.error('Failed to fetch day detail:', e);
    } finally {
      setDayLoading(false);
    }
  }, []);

  const selectDate = async (date: string) => {
    if (selectedDate === date) {
      setSelectedDate(null);
      return;
    }
    setSelectedDate(date);
    setLiveStopStatuses({});
    try {
      await fetch('/api/admin/optimoroute/import-routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ date }),
      });
    } catch {}
    // Pull completion statuses from OptimoRoute (non-blocking)
    fetch('/api/admin/routes/pull-completion-for-date', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ date }),
    }).catch(() => {});
    fetchDayDetail(date);
  };

  const [refreshingRoute, setRefreshingRoute] = useState<string | null>(null);

  const handleRefreshRouteStatus = async (routeId: string) => {
    setRefreshingRoute(routeId);
    try {
      await fetch(`/api/admin/routes/${routeId}/pull-completion`, {
        method: 'POST',
        credentials: 'include',
      });
      // Refresh stops for this route
      const res = await fetch(`/api/admin/routes/${routeId}/stops`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setRouteStops(prev => ({ ...prev, [routeId]: data.stops ?? [] }));
      }
      await refreshDay();
    } catch (e) {
      console.error('Failed to refresh route status:', e);
    } finally {
      setRefreshingRoute(null);
    }
  };

  const refreshDay = async () => {
    if (selectedDate) {
      await Promise.all([fetchCalendarData(), fetchDayDetail(selectedDate)]);
    }
  };

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

  const handlePublishRoute = async (routeId: string) => {
    try {
      const res = await fetch(`/api/admin/routes/${routeId}/publish`, { method: 'POST', credentials: 'include' });
      if (res.ok) await refreshDay();
    } catch (e) {
      console.error('Failed to publish route:', e);
    }
  };

  const handlePublishAllDrafts = async () => {
    if (publishingAll) return;
    setPublishingAll(true);
    try {
      const drafts = dayRoutes.filter(r => r.status === 'draft');
      for (const draft of drafts) {
        await fetch(`/api/admin/routes/${draft.id}/publish`, { method: 'POST', credentials: 'include' });
      }
      await refreshDay();
    } finally {
      setPublishingAll(false);
    }
  };

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

  const handleSyncRoute = async (routeId: string) => {
    setSyncing(routeId);
    try {
      const res = await fetch(`/api/admin/routes/${routeId}/sync-to-optimo`, { method: 'POST', credentials: 'include' });
      if (res.ok) {
        const result = await res.json();
        showToast(result.errors.length > 0 ? 'warning' : 'success', `Synced ${result.ordersSynced} orders to OptimoRoute.${result.errors.length > 0 ? ` ${result.errors.length} error(s).` : ''}`);
        await refreshDay();
      } else {
        const err = await res.json().catch(() => null);
        showToast('error', `Failed to sync route: ${err?.error || res.statusText}`);
      }
    } catch (e) {
      console.error('Failed to sync route:', e);
      showToast('error', 'Failed to sync route to OptimoRoute.');
    } finally {
      setSyncing(null);
    }
  };

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
        showToast(result.errors.length > 0 ? 'warning' : 'success', `Synced ${result.routesSynced} routes (${result.ordersSynced} orders) to OptimoRoute.${result.errors.length > 0 ? ` ${result.errors.length} error(s).` : ''}`);
        await refreshDay();
      } else {
        const err = await res.json().catch(() => null);
        showToast('error', `Failed to sync day: ${err?.error || res.statusText}`);
      }
    } catch (e) {
      console.error('Failed to sync day:', e);
      showToast('error', 'Failed to sync day to OptimoRoute.');
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
        showToast('error', `Import failed: ${err.error || 'Unknown error'}`);
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
  const publishedUnsyncedCount = dayRoutes.filter(r => r.status !== 'draft' && r.status !== 'cancelled' && !r.optimoSynced).length;
  const isBusy = autoPlanning || syncingDay || importingFromOptimo || publishingAll;

  const weeks = useMemo(() => groupIntoWeeks(calendarDays), [calendarDays]);
  const selectedWeekIdx = useMemo(() => {
    if (!selectedDate) return -1;
    return weeks.findIndex(week => week.some(d => d.date === selectedDate));
  }, [weeks, selectedDate]);

  if (loading) return <LoadingSpinner />;

  // ── Day Detail Inline Section ──
  const renderDayDetail = () => {
    if (!selectedDate) return null;

    return (
      <div className="col-span-7 bg-white border-t border-b border-gray-200 p-4">
        {dayLoading ? (
          <LoadingSpinner />
        ) : (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </h3>
              <button type="button" onClick={() => setSelectedDate(null)} className="text-gray-400 hover:text-gray-600 text-lg font-bold">&times;</button>
            </div>

            {/* Weather */}
            {(() => {
              const wx = weatherByDate.get(selectedDate!);
              if (!wx) return null;
              const WxIcon = getWeatherIcon(wx.conditionMain);
              return (
                <div className="bg-sky-50 border border-sky-200 rounded-lg px-3 py-2 flex items-center gap-3">
                  <WxIcon className="w-8 h-8 text-sky-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-bold text-gray-900">{Math.round(wx.tempHigh)}°F</span>
                      <span className="text-sm text-gray-500">/ {Math.round(wx.tempLow)}°F</span>
                    </div>
                    <div className="text-xs text-gray-600 capitalize">{wx.conditionDesc}</div>
                    {wx.precipChance > 0 && (
                      <div className="text-xs text-blue-600">{wx.precipChance}% chance of precipitation</div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Summary */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-gray-50 rounded-lg p-2">
                <div className="text-lg font-bold text-gray-900">{dayRoutes.length}</div>
                <div className="text-[10px] font-bold text-gray-400 uppercase">Routes</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <div className="text-lg font-bold text-gray-900">{dayRoutes.reduce((sum, r) => sum + (r.stopCount ?? r.estimatedStops ?? 0), 0)}</div>
                <div className="text-[10px] font-bold text-gray-400 uppercase">Stops</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <div className="text-lg font-bold text-gray-900">{dayOnDemand.length}</div>
                <div className="text-[10px] font-bold text-gray-400 uppercase">On-Demand</div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              {dayLocations.length > 0 && dayRoutes.filter(j => j.status === 'draft').length === 0 && (
                <button type="button" onClick={handlePlanRoutes} disabled={isBusy}
                  className="flex-1 px-3 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white text-xs font-bold rounded-lg transition-colors">
                  {autoPlanning ? 'Planning...' : 'Plan Routes'}
                </button>
              )}

              {draftCount > 0 && (
                <button type="button" onClick={handlePublishAllDrafts} disabled={isBusy}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs font-bold rounded-lg transition-colors">
                  {publishingAll ? 'Publishing...' : `Publish All (${draftCount})`}
                </button>
              )}

              {publishedUnsyncedCount > 0 && (
                <button type="button" onClick={handleSyncDay} disabled={isBusy}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-bold rounded-lg transition-colors">
                  {syncingDay ? 'Syncing...' : `Sync to Optimo (${publishedUnsyncedCount})`}
                </button>
              )}

              <button type="button" onClick={() => setShowCreateRoute(true)}
                className="px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg transition-colors">
                + Create Route
              </button>

              {selectedDate && (
                <button type="button" onClick={() => setShowOptimizer(true)} disabled={isBusy}
                  className="px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white text-xs font-bold rounded-lg transition-colors">
                  Optimize
                </button>
              )}

              {selectedDate && dayRoutes.length > 0 && (
                <button type="button" onClick={() => setShowRouteMap(true)}
                  className="px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-lg transition-colors">
                  View Map
                </button>
              )}

              <button type="button" onClick={handleImportFromOptimo} disabled={isBusy}
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
                  <div className="text-amber-700 mt-1">{importResult.stopsMatched} matched to local locations, {importResult.stopsUnmatched} address-only</div>
                )}
                {importResult.errors.length > 0 && (
                  <div className="text-red-600 mt-1">{importResult.errors.join(', ')}</div>
                )}
              </div>
            )}

            {/* Route Cards */}
            {dayRoutes.length > 0 && (
              <div>
                <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Routes</h4>
                <div className="space-y-3">
                  {dayRoutes.map(route => {
                    const stopCount = route.stopCount ?? route.estimatedStops ?? 0;
                    const minutesPerStop = 8;
                    const estimatedHours = (stopCount * minutesPerStop / 60);
                    const overCapacity = stopCount > ROUTE_MAX_STOPS;
                    const isExpanded = expandedRouteId === route.id;
                    const stops = routeStops[route.id];
                    const isLive = route.status === 'in_progress';
                    const syncIndicator = getSyncIndicator(route);
                    const isLate = route.status === 'assigned' && route.scheduledDate && new Date(route.scheduledDate + 'T23:59:59') < new Date();

                    let completedStops = route.completedStopCount ?? 0;
                    if (stops && stops.length > 0) {
                      const DONE = new Set(['completed', 'success', 'failed', 'rejected']);
                      completedStops = stops.filter(s => {
                        const live = (s.optimoOrderNo || s.optimo_order_no) ? liveStopStatuses[(s.optimoOrderNo || s.optimo_order_no)!] : null;
                        return DONE.has(live || '') || DONE.has(s.status);
                      }).length;
                    }
                    const progressPct = stopCount > 0 ? Math.round((completedStops / stopCount) * 100) : 0;
                    const showProgress = ['assigned', 'in_progress', 'completed'].includes(route.status) && stopCount > 0;

                    return (
                      <div key={route.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        {/* Collapsed card header */}
                        <button
                          type="button"
                          onClick={() => toggleExpandRoute(route.id)}
                          className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors text-left"
                        >
                          {/* Live pulsing dot */}
                          {isLive && (
                            <span className="relative flex h-3 w-3 flex-shrink-0">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                            </span>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                              <span className="font-black text-gray-900 text-sm truncate">{route.title}</span>
                              <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded-full ${STATUS_COLORS[route.status]}`}
                                title={STATUS_TOOLTIPS[route.status]}>
                                {route.status.replace('_', ' ')}
                              </span>
                              {syncIndicator && (
                                <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded-full ${syncIndicator.className}`}>
                                  {syncIndicator.label}
                                </span>
                              )}
                              {isLate && (
                                <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded-full bg-red-100 text-red-700"
                                  title="This route is past its scheduled date and has not been started">
                                  Late
                                </span>
                              )}
                              {route.status === 'completed' && (route.completedStopCount ?? 0) < (route.stopCount ?? 0) && (route.stopCount ?? 0) > 0 && (
                                <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700"
                                  title={`Completed with ${(route.stopCount ?? 0) - (route.completedStopCount ?? 0)} incomplete stops`}>
                                  &#9888; Incomplete
                                </span>
                              )}
                              {(route.bidCount ?? 0) > 0 && (
                                <button type="button" onClick={(e) => { e.stopPropagation(); setExpandedBidRouteId(expandedBidRouteId === route.id ? null : route.id); }}
                                  className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                                  {route.bidCount} bid{(route.bidCount ?? 0) !== 1 ? 's' : ''}
                                </button>
                              )}
                              {route.contractId && (
                                <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700"
                                  title="Linked to a route contract">
                                  Contract
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                              <span>{stopCount} stops</span>
                              <span>~{estimatedHours.toFixed(1)}h</span>
                              {route.basePay != null && <span>${Number(route.basePay).toFixed(0)}</span>}
                              {route.computedValue != null && <span className="text-teal-600">${Number(route.computedValue).toFixed(0)} comp</span>}
                              {route.payMode && <span className="text-purple-500">{route.payMode}</span>}
                              {route.driverName && <span>{route.driverName}</span>}
                            </div>
                            {route.notes?.includes('Declined by') && (
                              <div className="mt-1 text-xs text-red-500 italic truncate">
                                {route.notes.split('\n').filter((l: string) => l.includes('Declined by')).pop()}
                              </div>
                            )}
                            {overCapacity && (
                              <div className="mt-1 flex items-center gap-2">
                                <span className="text-xs font-bold text-amber-600">
                                  {stopCount} stops (max {ROUTE_MAX_STOPS}) — over capacity
                                </span>
                                {route.status === 'draft' && (
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        const res = await fetch(`/api/admin/routes/${route.id}/split`, {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          credentials: 'include',
                                          body: JSON.stringify({ maxStops: ROUTE_MAX_STOPS }),
                                        });
                                        if (res.ok) {
                                          const result = await res.json();
                                          showToast('success', `Split into ${result.totalRoutes} routes`);
                                          await refreshDay();
                                        } else {
                                          const err = await res.json().catch(() => ({}));
                                          showToast('error', err.error || 'Failed to split route');
                                        }
                                      } catch {
                                        showToast('error', 'Failed to split route');
                                      }
                                    }}
                                    className="text-[10px] font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded transition-colors"
                                  >
                                    Split Route
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                          </svg>
                        </button>

                        {/* Completion progress bar */}
                        {showProgress && (
                          <div className="px-3 pb-2 -mt-1">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${route.status === 'completed' ? 'bg-green-500' : 'bg-teal-500'}`}
                                  style={{ width: `${progressPct}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-bold text-gray-500 whitespace-nowrap">
                                {completedStops}/{stopCount} stops
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
                              {route.status !== 'draft' && route.status !== 'cancelled' && !route.optimoSynced && (
                                <button type="button" onClick={(e) => { e.stopPropagation(); handleSyncRoute(route.id); }}
                                  disabled={syncing === route.id}
                                  className="px-2.5 py-1 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 rounded-lg transition-colors">
                                  {syncing === route.id ? 'Syncing...' : 'Sync to Optimo'}
                                </button>
                              )}
                              {(route.optimoSynced || route.source === 'optimo_import') && route.status !== 'draft' && (
                                <button type="button" onClick={(e) => { e.stopPropagation(); handleRefreshRouteStatus(route.id); }}
                                  disabled={refreshingRoute === route.id}
                                  className="px-2.5 py-1 text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 disabled:bg-sky-50 disabled:text-sky-400 rounded-lg transition-colors">
                                  {refreshingRoute === route.id ? 'Refreshing...' : 'Refresh Status'}
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
                                      const orderNo = p.optimoOrderNo || p.optimo_order_no;
                                      const liveStatus = orderNo ? liveStopStatuses[orderNo] : null;
                                      const displayStatus = liveStatus || p.status;
                                      return (
                                      <tr key={p.id} className="border-t border-gray-50">
                                        <td className="px-3 py-1.5 text-gray-400 font-bold">{p.stopNumber ?? idx + 1}</td>
                                        <td className="px-3 py-1.5">
                                          <div className="text-gray-900 truncate max-w-[180px]">{p.address}</div>
                                          <div className="text-xs text-gray-400 truncate">{p.customerName}</div>
                                        </td>
                                        <td className="px-3 py-1.5">
                                          <span className={`text-xs font-bold ${
                                            p.orderType === 'on_demand' ? 'text-purple-600' : p.orderType === 'missed_redo' ? 'text-red-600' : 'text-gray-500'
                                          }`}>{p.orderType}</span>
                                        </td>
                                        <td className="px-3 py-1.5">
                                          <span className={`text-xs font-bold ${
                                            displayStatus === 'completed' || displayStatus === 'success' ? 'text-green-600' : displayStatus === 'failed' || displayStatus === 'rejected' ? 'text-red-600' : displayStatus === 'in_progress' || displayStatus === 'on_route' || displayStatus === 'servicing' ? 'text-blue-600' : displayStatus === 'skipped' ? 'text-amber-600' : displayStatus === 'cancelled' ? 'text-red-400' : 'text-gray-400'
                                          }`}>{displayStatus}</span>
                                        </td>
                                        <td className="px-3 py-1.5 flex items-center gap-1">
                                          {orderNo && (
                                            <button type="button" onClick={(e) => { e.stopPropagation(); setCompletionStop({ orderNo }); }}
                                              className="text-xs font-bold text-teal-600 hover:text-teal-800">
                                              POD
                                            </button>
                                          )}
                                          {(() => {
                                            const rawPod = p.podData || p.pod_data;
                                            if (!rawPod) return null;
                                            try {
                                              const pod = typeof rawPod === 'string' ? JSON.parse(rawPod) : rawPod;
                                              const hasImages = pod.images && pod.images.length > 0;
                                              const hasSignature = !!pod.signature;
                                              const hasNotes = !!pod.note;
                                              if (!hasImages && !hasSignature && !hasNotes) return null;
                                              return (
                                                <span className="flex items-center gap-0.5 text-[10px] text-green-600" title={`POD: ${[hasImages ? 'photos' : '', hasSignature ? 'signature' : '', hasNotes ? 'notes' : ''].filter(Boolean).join(', ')}`}>
                                                  {hasImages && <span title="Has photos">&#128247;</span>}
                                                  {hasSignature && <span title="Has signature">&#9997;</span>}
                                                  {hasNotes && <span title="Has notes">&#128221;</span>}
                                                </span>
                                              );
                                            } catch { return null; }
                                          })()}
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
                                basePay={route.basePay != null ? Number(route.basePay) : undefined}
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

            {/* Unassigned Locations */}
            {dayLocations.length > 0 && (
              <div>
                <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">
                  Unassigned Locations ({dayLocations.length})
                </h4>
                <div className="max-h-[200px] overflow-y-auto space-y-1">
                  {dayLocations.map(prop => {
                    const draftRoutes = dayRoutes.filter(r => r.status === 'draft');
                    return (
                      <div key={prop.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 text-xs">
                        <div className="min-w-0 flex-1">
                          <div className="text-gray-900 font-medium truncate">{prop.address}</div>
                          <div className="text-gray-400 truncate">{prop.customerName}</div>
                        </div>
                        {draftRoutes.length > 0 ? (
                          <button
                            type="button"
                            title={`Add to ${draftRoutes[0].title}`}
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/admin/routes/${draftRoutes[0].id}/stops`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  credentials: 'include',
                                  body: JSON.stringify({ locationIds: [prop.id] }),
                                });
                                if (res.ok) {
                                  showToast('success', `Added to ${draftRoutes[0].title}`);
                                  await refreshDay();
                                } else {
                                  showToast('error', 'Failed to add stop to route.');
                                }
                              } catch {
                                showToast('error', 'Failed to add stop to route.');
                              }
                            }}
                            className="flex-shrink-0 px-2 py-1 text-[10px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded transition-colors"
                          >
                            + Route
                          </button>
                        ) : (
                          <button
                            type="button"
                            title="Create a new route with this location"
                            onClick={() => setShowCreateRoute(true)}
                            className="flex-shrink-0 px-2 py-1 text-[10px] font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                          >
                            + New
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* On-demand pickups */}
            {dayOnDemand.length > 0 && (
              <div>
                <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">
                  On-Demand Pickups ({dayOnDemand.length})
                </h4>
                <div className="space-y-1">
                  {dayOnDemand.map(sp => (
                    <div key={sp.id} className="px-2 py-1.5 rounded bg-purple-50 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-900 font-medium truncate">{sp.serviceName}</span>
                        <span className="font-bold text-purple-700">${Number(sp.servicePrice).toFixed(0)}</span>
                      </div>
                      <div className="text-gray-500 truncate">{sp.address}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {dayLocations.length === 0 && dayOnDemand.length === 0 && dayRoutes.length === 0 && (
              <EmptyState title="Nothing Scheduled" message="No collections or routes for this date." />
            )}
          </div>
        )}
      </div>
    );
  };

  // ── List View ──
  const renderListView = () => {
    // Group calendar days that have routes
    const daysWithRoutes = calendarDays.filter(d => d.isCurrentMonth && (Object.values(d.routesByStatus) as number[]).reduce((a, b) => a + b, 0) > 0);

    return (
      <Card className="p-6">
        {daysWithRoutes.length === 0 ? (
          <div className="text-center py-8">
            <CalendarDaysIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No routes scheduled this month.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {daysWithRoutes.map(day => {
              const wx = weatherByDate.get(day.date);
              const WxIcon = wx ? getWeatherIcon(wx.conditionMain) : null;
              const routeStatusEntries = Object.entries(day.routesByStatus);
              const totalRoutes = (Object.values(day.routesByStatus) as number[]).reduce((a, b) => a + b, 0);

              return (
                <div key={day.date}>
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-bold text-gray-900 text-sm">
                      {new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </h3>
                    {day.isToday && <span className="text-[10px] font-bold text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">Today</span>}
                    {wx && WxIcon && (
                      <div className="flex items-center gap-1">
                        <WxIcon className="w-4 h-4 text-sky-400" />
                        <span className="text-xs text-sky-600">{Math.round(wx.tempHigh)}°</span>
                      </div>
                    )}
                    <div className="flex gap-1 ml-auto">
                      {routeStatusEntries.map(([status, count]) => (
                        <span key={status} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}
                          title={STATUS_TOOLTIPS[status]}>
                          {count} {status.replace('_', ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => selectDate(day.date)}
                    className="w-full text-left p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-xs text-gray-600"
                  >
                    {totalRoutes} route{totalRoutes !== 1 ? 's' : ''} · {day.locationCount} collections
                    {day.onDemandCount > 0 && ` · ${day.onDemandCount} on-demand`}
                    <span className="text-teal-600 ml-2 font-bold">View details →</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    );
  };

  // ── Main Render ──
  return (
    <div className="space-y-6">
      {/* OptimoRoute Connection Status */}
      <OptimoStatusBanner onStatusUpdate={handleLiveStatusUpdate} />

      {/* Subtitle + View Toggle */}
      <div className="flex items-center justify-between">
        <p className="text-gray-500">View your upcoming routes and schedule.</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            title="Calendar view"
            onClick={() => setViewMode('calendar')}
            className={`p-2 rounded-lg transition-colors ${viewMode === 'calendar' ? 'bg-teal-100 text-teal-700' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <CalendarDaysIcon className="w-5 h-5" />
          </button>
          <button
            type="button"
            title="List view"
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-teal-100 text-teal-700' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <ListIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {viewMode === 'calendar' ? (
        <>
          <Card className="p-6">
            {/* Calendar Header */}
            <div className="flex items-center justify-between mb-6">
              <button type="button" title="Previous month" onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg">
                <ChevronLeftIcon className="w-5 h-5 text-gray-600" />
              </button>
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-gray-900">{monthLabel}</h3>
                <button type="button" onClick={goToday} className="text-xs font-bold text-teal-600 hover:underline px-2 py-1 bg-teal-50 rounded">Today</button>
              </div>
              <button type="button" title="Next month" onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg">
                <ChevronRightIcon className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            {weatherError === 'not_configured' && (
              <div className="text-[11px] text-gray-400 italic mb-4">Weather unavailable — configure OpenWeatherMap in Settings</div>
            )}

            {/* Calendar Grid — week-by-week with inline expand */}
            <div className="rounded-lg overflow-hidden border border-gray-200">
              {/* Day headers */}
              <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
                {DAYS_OF_WEEK.map(day => (
                  <div key={day} className="px-2 py-2 text-center text-xs font-bold text-gray-500">{day}</div>
                ))}
              </div>

              {/* Week rows + inline detail */}
              {weeks.map((week, weekIdx) => (
                <React.Fragment key={weekIdx}>
                  <div className="grid grid-cols-7 gap-px bg-gray-200">
                    {week.map((day) => {
                      const totalRoutes = (Object.values(day.routesByStatus) as number[]).reduce((a, b) => a + b, 0);
                      const isSelected = selectedDate === day.date;

                      return (
                        <button
                          key={day.date}
                          type="button"
                          onClick={() => selectDate(day.date)}
                          className={`bg-white min-h-[80px] p-2 text-left transition-colors hover:bg-gray-50 ${
                            !day.isCurrentMonth ? 'bg-gray-50/50' : ''
                          } ${isSelected ? 'ring-2 ring-teal-500 ring-inset' : ''}`}
                        >
                          <span className={`text-sm font-bold mb-1 inline-flex ${
                            !day.isCurrentMonth ? 'text-gray-300' :
                            day.isToday ? 'bg-teal-600 text-white w-7 h-7 rounded-full items-center justify-center' :
                            'text-gray-700'
                          }`}>
                            {new Date(day.date + 'T12:00:00').getDate()}
                          </span>

                          {day.isCurrentMonth && (() => {
                            const wx = weatherByDate.get(day.date);
                            if (!wx) return null;
                            const WxIcon = getWeatherIcon(wx.conditionMain);
                            return (
                              <div className="flex items-center gap-0.5 mt-0.5" title={`${wx.conditionDesc} | High: ${Math.round(wx.tempHigh)}°F`}>
                                <WxIcon className="w-3 h-3 text-sky-400" />
                                <span className="text-[9px] text-sky-600 font-semibold">{Math.round(wx.tempHigh)}°</span>
                              </div>
                            );
                          })()}

                          {day.isCurrentMonth && (
                            <div className="space-y-0.5 mt-0.5">
                              {day.locationCount > 0 && (
                                <div className="text-[10px] text-gray-500 font-medium">{day.locationCount} collections</div>
                              )}

                              {day.onDemandCount > 0 && (
                                <div className="text-[10px] text-purple-600 font-semibold">{day.onDemandCount} on-demand</div>
                              )}

                              {totalRoutes > 0 && (
                                <div className="mt-0.5 flex flex-wrap gap-0.5">
                                  {Object.entries(day.routesByStatus).map(([status, count]) => (
                                    <span key={status} className={`inline-flex items-center px-1 py-0 rounded text-[9px] font-bold ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}
                                      title={STATUS_TOOLTIPS[status]}>
                                      {count} {status.replace('_', ' ')}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {day.locationCount > 0 && totalRoutes === 0 && (
                                <div className="text-[10px] text-amber-600 font-bold mt-0.5">{day.locationCount} unplanned</div>
                              )}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Inline detail section after the selected week */}
                  {weekIdx === selectedWeekIdx && renderDayDetail()}
                </React.Fragment>
              ))}
            </div>
          </Card>
        </>
      ) : (
        renderListView()
      )}

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

      {/* Route Map Modal */}
      {showRouteMap && selectedDate && (
        <RouteMapModal date={selectedDate} onClose={() => setShowRouteMap(false)} />
      )}

      {/* Completion Detail Modal */}
      {completionStop && (
        <CompletionDetailModal stopIdentifier={completionStop} onClose={() => setCompletionStop(null)} />
      )}
    </div>
  );
};

export default PlanningCalendar;
