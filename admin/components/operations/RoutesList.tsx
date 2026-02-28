import React, { useState, useEffect, useCallback } from 'react';
import { LoadingSpinner, EmptyState, FilterBar } from '../ui/index.ts';
import type { Route, RouteBid, RouteStop } from '../../../shared/types/index.ts';
import CreateRouteModal from './CreateRouteModal.tsx';
import EditRouteModal from './EditRouteModal.tsx';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  open: 'bg-blue-100 text-blue-700',
  bidding: 'bg-yellow-100 text-yellow-700',
  assigned: 'bg-purple-100 text-purple-700',
  in_progress: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

const ROUTE_TYPE_COLORS: Record<string, string> = {
  daily_route: 'bg-teal-100 text-teal-700',
  bulk_pickup: 'bg-orange-100 text-orange-700',
  special_pickup: 'bg-purple-100 text-purple-700',
};

const ROUTE_TYPE_LABELS: Record<string, string> = {
  daily_route: 'Route',
  bulk_pickup: 'Bulk',
  special_pickup: 'Special',
};

const StatusChip: React.FC<{ status: string }> = ({ status }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold capitalize ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}>
    {status.replace('_', ' ')}
  </span>
);

const RouteTypeChip: React.FC<{ type: string }> = ({ type }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${ROUTE_TYPE_COLORS[type] ?? 'bg-gray-100 text-gray-600'}`}>
    {ROUTE_TYPE_LABELS[type] ?? type}
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

const BidRow: React.FC<{ bid: RouteBid; basePay?: number; onAccept: () => void; canAccept: boolean }> = ({ bid, basePay, onAccept, canAccept }) => {
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

const StopsExpansion: React.FC<{ stops: RouteStop[] }> = ({ stops }) => (
  <>
    <tr className="bg-blue-50/40">
      <td colSpan={9} className="px-4 py-2 pl-10 text-xs font-black uppercase tracking-widest text-gray-400">
        Stops ({stops.length})
      </td>
    </tr>
    {stops.map(p => (
      <tr key={p.id} className="bg-blue-50/20">
        <td className="px-4 py-1.5 pl-10" colSpan={3}>
          <div className="text-sm text-gray-700">{p.address}</div>
          <div className="text-xs text-gray-400">{p.customer_name}</div>
        </td>
        <td className="px-4 py-1.5">
          <span className={`text-xs font-bold ${
            p.order_type === 'special' ? 'text-purple-600' : p.order_type === 'missed_redo' ? 'text-red-600' : 'text-gray-500'
          }`}>
            {p.order_type}
          </span>
        </td>
        <td className="px-4 py-1.5" colSpan={2}>
          {p.stop_number != null && <span className="text-xs text-gray-500">Stop #{p.stop_number}</span>}
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

const RoutesList: React.FC = () => {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);
  const [expandMode, setExpandMode] = useState<'bids' | 'stops'>('bids');
  const [bidsMap, setBidsMap] = useState<Record<string, RouteBid[]>>({});
  const [stopsMap, setStopsMap] = useState<Record<string, RouteStop[]>>({});
  const [loadingExpand, setLoadingExpand] = useState<string | null>(null);

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

  const toggleExpand = async (routeId: string, mode: 'bids' | 'stops') => {
    if (expandedRouteId === routeId && expandMode === mode) {
      setExpandedRouteId(null);
      return;
    }
    setExpandedRouteId(routeId);
    setExpandMode(mode);

    const cache = mode === 'bids' ? bidsMap : stopsMap;
    if (cache[routeId]) return;

    setLoadingExpand(routeId);
    try {
      const endpoint = mode === 'bids' ? `/api/admin/routes/${routeId}/bids` : `/api/admin/routes/${routeId}/stops`;
      const res = await fetch(endpoint, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (mode === 'bids') {
          setBidsMap(prev => ({ ...prev, [routeId]: data.bids ?? [] }));
        } else {
          setStopsMap(prev => ({ ...prev, [routeId]: data.stops ?? [] }));
        }
      }
    } catch (e) {
      console.error(`Failed to load ${mode}:`, e);
    } finally {
      setLoadingExpand(null);
    }
  };

  const acceptBid = async (routeId: string, bid: RouteBid) => {
    try {
      const res = await fetch(`/api/admin/routes/${routeId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ driverId: bid.driverId, bidId: bid.id, actualPay: bid.bidAmount }),
      });
      if (res.ok) {
        setExpandedRouteId(null);
        loadRoutes();
      }
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

  const filtered = routes.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (typeFilter !== 'all' && r.route_type !== typeFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <FilterBar>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>
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
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Route</th>
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
              {filtered.map(route => {
                const isExpanded = expandedRouteId === route.id;
                const bids = bidsMap[route.id];
                const stops = stopsMap[route.id];
                const bidCount = route.bid_count ?? 0;
                const stopCount = route.stop_count ?? 0;
                const canAcceptBids = route.status === 'open' || route.status === 'bidding';

                return (
                  <React.Fragment key={route.id}>
                    <tr className={`hover:bg-gray-50 transition-colors ${isExpanded ? 'bg-gray-50' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="text-sm font-semibold text-gray-900">{route.title}</div>
                        {route.start_time && (
                          <div className="text-xs text-gray-500">{route.start_time}{route.end_time ? ` – ${route.end_time}` : ''}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <RouteTypeChip type={route.route_type || 'daily_route'} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-700">{formatDate(route.scheduled_date)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-700">
                          {stopCount > 0 ? stopCount : (route.estimated_stops ?? '—')}
                          {route.estimated_hours != null && (
                            <span className="text-xs text-gray-400 ml-1">({route.estimated_hours}h)</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-semibold text-gray-900">
                          {route.actual_pay != null
                            ? `$${Number(route.actual_pay).toFixed(2)}`
                            : route.base_pay != null
                            ? `$${Number(route.base_pay).toFixed(2)}`
                            : '—'}
                        </div>
                        {route.actual_pay != null && route.base_pay != null && Number(route.actual_pay) !== Number(route.base_pay) && (
                          <div className="text-xs text-gray-400 line-through">${Number(route.base_pay).toFixed(2)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusChip status={route.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-700">{route.driver_name ?? '—'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-500">{route.zone_name ?? '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-right space-x-1">
                        {route.status === 'draft' && (
                          <button type="button" onClick={() => publishRoute(route.id)}
                            className="inline-flex items-center px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                            Publish
                          </button>
                        )}
                        {stopCount > 0 && (
                          <button type="button" onClick={() => toggleExpand(route.id, 'stops')}
                            className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                              isExpanded && expandMode === 'stops' ? 'text-white bg-blue-600' : 'text-blue-700 bg-blue-50 hover:bg-blue-100'
                            }`}>
                            {stopCount} Stop{stopCount !== 1 ? 's' : ''} {isExpanded && expandMode === 'stops' ? '▲' : '▼'}
                          </button>
                        )}
                        {bidCount > 0 && (
                          <button type="button" onClick={() => toggleExpand(route.id, 'bids')}
                            className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                              isExpanded && expandMode === 'bids' ? 'text-white bg-teal-600' : 'text-teal-700 bg-teal-50 hover:bg-teal-100'
                            }`}>
                            {bidCount} Bid{bidCount !== 1 ? 's' : ''} {isExpanded && expandMode === 'bids' ? '▲' : '▼'}
                          </button>
                        )}
                        <button type="button" onClick={() => setEditingRoute(route)}
                          className="inline-flex items-center px-2.5 py-1 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors">
                          Edit
                        </button>
                      </td>
                    </tr>

                    {isExpanded && expandMode === 'bids' && (
                      loadingExpand === route.id ? (
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
                            <BidRow key={bid.id} bid={bid} basePay={route.base_pay != null ? Number(route.base_pay) : undefined}
                              onAccept={() => acceptBid(route.id, bid)} canAccept={canAcceptBids} />
                          ))}
                        </>
                      ) : (
                        <tr className="bg-gray-50/80"><td colSpan={9} className="px-4 py-3 text-center text-sm text-gray-400">No bids yet</td></tr>
                      )
                    )}

                    {isExpanded && expandMode === 'stops' && (
                      loadingExpand === route.id ? (
                        <tr className="bg-gray-50/80"><td colSpan={9} className="px-4 py-4 text-center"><div className="text-sm text-gray-400">Loading stops...</div></td></tr>
                      ) : stops && stops.length > 0 ? (
                        <StopsExpansion stops={stops} />
                      ) : (
                        <tr className="bg-gray-50/80"><td colSpan={9} className="px-4 py-3 text-center text-sm text-gray-400">No stops assigned</td></tr>
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
        <CreateRouteModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); loadRoutes(); }} />
      )}

      {editingRoute && (
        <EditRouteModal route={editingRoute} onClose={() => setEditingRoute(null)} onUpdated={() => { setEditingRoute(null); loadRoutes(); }} />
      )}
    </div>
  );
};

export default RoutesList;
