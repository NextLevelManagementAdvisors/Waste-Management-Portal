import React, { useState, useEffect, useCallback } from 'react';
import { LoadingSpinner, EmptyState, FilterBar } from '../ui/index.ts';
import type { Route, RouteBid, RouteStop } from '../../../shared/types/index.ts';
import RouteTable from '../../../shared/components/RouteTable.tsx';
import CreateRouteModal from './CreateRouteModal.tsx';
import EditRouteModal from './EditRouteModal.tsx';

const RoutesList: React.FC = () => {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);

  const loadRoutes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('route_type', typeFilter);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const res = await fetch(`/api/admin/routes?${params}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setRoutes(data.routes ?? []);
      }
    } catch (e) {
      console.error('Failed to load routes:', e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, dateFrom, dateTo]);

  useEffect(() => { loadRoutes(); }, [loadRoutes]);

  const acceptBid = async (routeId: string, bid: RouteBid) => {
    try {
      const res = await fetch(`/api/admin/routes/${routeId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ driverId: bid.driverId, bidId: bid.id, actualPay: bid.bidAmount }),
      });
      if (res.ok) loadRoutes();
    } catch (e) {
      console.error('Failed to accept bid:', e);
    }
  };

  const publishRoute = async (routeId: string) => {
    try {
      const res = await fetch(`/api/admin/routes/${routeId}/publish`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) loadRoutes();
    } catch (e) {
      console.error('Failed to publish route:', e);
    }
  };

  const fetchBids = useCallback(async (routeId: string): Promise<RouteBid[]> => {
    const res = await fetch(`/api/admin/routes/${routeId}/bids`, { credentials: 'include' });
    if (res.ok) { const data = await res.json(); return data.bids ?? []; }
    return [];
  }, []);

  const fetchStops = useCallback(async (routeId: string): Promise<RouteStop[]> => {
    const res = await fetch(`/api/admin/routes/${routeId}/stops`, { credentials: 'include' });
    if (res.ok) { const data = await res.json(); return data.stops ?? []; }
    return [];
  }, []);

  const filtered = routes.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (typeFilter !== 'all' && r.routeType !== typeFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <FilterBar>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Status</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500">
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
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500">
              <option value="all">All Types</option>
              <option value="daily_route">Route</option>
              <option value="bulk_collection">Bulk</option>
              <option value="on_demand">On-Demand</option>
            </select>
          </div>
          {(dateFrom || dateTo) && (
            <div className="flex items-end">
              <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); }}
                className="px-3 py-2 text-xs font-bold text-gray-500 hover:text-gray-700 transition-colors">
                Clear Dates
              </button>
            </div>
          )}
        </FilterBar>

        <div className="flex items-center gap-2">
          <button type="button" onClick={loadRoutes} className="flex-shrink-0 px-3 py-2 text-sm font-bold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
            Refresh
          </button>
          <button type="button" onClick={() => setShowCreate(true)} className="flex-shrink-0 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-lg transition-colors">
            + Create Route
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No Routes"
          message={statusFilter === 'all' && typeFilter === 'all' ? 'Use the Routes tab to plan routes, or create one manually.' : 'No routes match the selected filters.'}
        />
      ) : (
        <RouteTable
          routes={filtered}
          columns={{ type: true, driver: true, pay: true, stops: true }}
          onExpandBids={fetchBids}
          onExpandStops={fetchStops}
          canAcceptBids
          onAcceptBid={acceptBid}
          renderActions={(route) => (
            <>
              {route.status === 'draft' && (
                <button type="button" onClick={() => publishRoute(route.id)}
                  className="inline-flex items-center px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                  Publish
                </button>
              )}
              <button type="button" onClick={() => setEditingRoute(route)}
                className="inline-flex items-center px-2.5 py-1 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors">
                Edit
              </button>
            </>
          )}
        />
      )}

      {showCreate && (
        <CreateRouteModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); loadRoutes(); }} />
      )}

      {editingRoute && (
        <EditRouteModal route={editingRoute} onClose={() => setEditingRoute(null)} onUpdated={() => { setEditingRoute(null); loadRoutes(); }} />
      )}
    </div>
  );
};

export default RoutesList;
