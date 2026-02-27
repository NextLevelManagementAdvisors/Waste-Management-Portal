import React, { useState } from 'react';
import type { Route, MissingClient } from '../../../shared/types/index.ts';

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

interface WeeklyPlannerDayColumnProps {
  date: string;
  routes: Route[];
  missingClients: MissingClient[];
  onRefresh: () => void;
}

const WeeklyPlannerDayColumn: React.FC<WeeklyPlannerDayColumnProps> = ({ date, routes, missingClients, onRefresh }) => {
  const [showMissing, setShowMissing] = useState(false);
  const [addingTo, setAddingTo] = useState<{ propertyId: string; routeId: string } | null>(null);
  const [publishingRoute, setPublishingRoute] = useState<string | null>(null);

  const dt = new Date(date + 'T12:00:00');
  const dayName = dt.toLocaleDateString('en-US', { weekday: 'short' });
  const dayNum = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const isToday = date === new Date().toISOString().split('T')[0];

  const draftRoutes = routes.filter(r => r.status === 'draft' || r.status === 'open' || r.status === 'bidding');

  const handleAddToRoute = async (propertyId: string, routeId: string) => {
    setAddingTo({ propertyId, routeId });
    try {
      const res = await fetch(`/api/admin/routes/${routeId}/stops`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ propertyIds: [propertyId] }),
      });
      if (res.ok) onRefresh();
    } catch (e) {
      console.error('Failed to add stop:', e);
    } finally {
      setAddingTo(null);
    }
  };

  const handlePublishRoute = async (routeId: string) => {
    setPublishingRoute(routeId);
    try {
      const res = await fetch(`/api/admin/routes/${routeId}/publish`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) onRefresh();
    } catch (e) {
      console.error('Failed to publish route:', e);
    } finally {
      setPublishingRoute(null);
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

      {/* Route Cards */}
      <div className="p-2 space-y-2 flex-1">
        {routes.length === 0 && missingClients.length === 0 && (
          <div className="text-xs text-gray-300 text-center py-4">No routes</div>
        )}

        {routes.map(route => (
          <div key={route.id} className="bg-gray-50 rounded-lg p-2.5 border border-gray-100 hover:border-gray-200 transition-colors">
            <div className="flex items-center gap-1.5 mb-1">
              {route.zone_color && (
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: route.zone_color }} />
              )}
              <span className="text-xs font-bold text-gray-900 truncate flex-1">{route.zone_name || route.title}</span>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${STATUS_COLORS[route.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {route.status.replace('_', ' ')}
              </span>
              <span className="text-[10px] text-gray-500">{route.stop_count || 0} stops</span>
            </div>
            {route.driver_name && (
              <div className="text-[10px] text-gray-400 mt-1 truncate">{route.driver_name}</div>
            )}
            {route.base_pay != null && (
              <div className="text-[10px] text-gray-400">${Number(route.base_pay).toFixed(0)}</div>
            )}
            {route.status === 'draft' && (
              <button
                type="button"
                onClick={() => handlePublishRoute(route.id)}
                disabled={publishingRoute === route.id}
                className="mt-1.5 w-full px-2 py-1 text-[10px] font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded transition-colors"
              >
                {publishingRoute === route.id ? 'Publishing...' : 'Publish'}
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
                    {draftRoutes.length > 0 ? (
                      <div className="flex gap-1 flex-wrap">
                        {draftRoutes.map(route => (
                          <button
                            key={route.id}
                            onClick={() => handleAddToRoute(client.id, route.id)}
                            disabled={addingTo?.propertyId === client.id}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded transition-colors disabled:opacity-50"
                          >
                            {route.zone_color && (
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: route.zone_color }} />
                            )}
                            + {route.zone_name || 'Route'}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[9px] text-gray-400 italic">No draft routes to add to</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Day summary footer */}
      {routes.length > 0 && (
        <div className="px-2 py-1.5 border-t border-gray-100 text-center">
          <span className="text-[10px] text-gray-400">
            {routes.length} route{routes.length !== 1 ? 's' : ''} &middot;{' '}
            {routes.reduce((sum, r) => sum + (r.stop_count || 0), 0)} stops
          </span>
        </div>
      )}
    </div>
  );
};

export default WeeklyPlannerDayColumn;
