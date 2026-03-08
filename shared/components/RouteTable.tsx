import React, { useState, useCallback } from 'react';
import type { Route, RouteBid, RouteOrder } from '../types/index.ts';

// --- Shared sub-components ---

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  open: 'bg-blue-100 text-blue-700',
  bidding: 'bg-yellow-100 text-yellow-700',
  assigned: 'bg-purple-100 text-purple-700',
  in_progress: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export { STATUS_COLORS };

const ROUTE_TYPE_COLORS: Record<string, string> = {
  daily_route: 'bg-teal-100 text-teal-700',
  bulk_collection: 'bg-orange-100 text-orange-700',
  on_demand: 'bg-purple-100 text-purple-700',
};

const ROUTE_TYPE_LABELS: Record<string, string> = {
  daily_route: 'Route',
  bulk_collection: 'Bulk',
  on_demand: 'On-Demand',
};

export const StatusChip: React.FC<{ status: string }> = ({ status }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold capitalize ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}>
    {status.replace('_', ' ')}
  </span>
);

export const RouteTypeChip: React.FC<{ type: string }> = ({ type }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${ROUTE_TYPE_COLORS[type] ?? 'bg-gray-100 text-gray-600'}`}>
    {ROUTE_TYPE_LABELS[type] ?? type}
  </span>
);

export const formatRouteDate = (dateStr?: string) => {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  } catch { return dateStr; }
};

const formatDateTime = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
  } catch { return dateStr; }
};

// --- Bid expansion row ---

const BidRow: React.FC<{ bid: RouteBid; basePay?: number; onAccept?: () => void; canAccept?: boolean }> = ({ bid, basePay, onAccept, canAccept }) => {
  const delta = basePay != null ? Number(bid.bidAmount) - basePay : null;
  return (
    <tr className="bg-gray-50/80">
      <td className="px-4 py-2 pl-10" colSpan={2}>
        <div className="text-sm font-medium text-gray-900">{bid.driverName || 'Driver'}</div>
        {bid.driverRating != null && <div className="text-xs text-gray-400">Rating: {Number(bid.driverRating).toFixed(1)}</div>}
      </td>
      <td className="px-4 py-2"><div className="text-xs text-gray-500">{formatDateTime(bid.createdAt)}</div></td>
      <td className="px-4 py-2">
        {bid.driverRatingAtBid != null && <div className="text-sm text-gray-600">{Number(bid.driverRatingAtBid).toFixed(1)}</div>}
      </td>
      <td className="px-4 py-2">
        <div className="text-sm font-semibold text-teal-700">${Number(bid.bidAmount || 0).toFixed(2)}</div>
        {delta != null && delta !== 0 && (
          <div className={`text-xs ${delta > 0 ? 'text-red-500' : 'text-green-600'}`}>{delta > 0 ? '+' : ''}${Number(delta).toFixed(2)}</div>
        )}
      </td>
      <td className="px-4 py-2" colSpan={2}>
        {bid.message && <div className="text-sm text-gray-600 italic max-w-xs truncate" title={bid.message}>"{bid.message}"</div>}
      </td>
      <td className="px-4 py-2 text-right" colSpan={2}>
        {canAccept && onAccept && (
          <button type="button" onClick={onAccept} className="px-3 py-1 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors">Accept</button>
        )}
      </td>
    </tr>
  );
};

// --- Orders expansion ---

const OrdersExpansion: React.FC<{ orders: RouteOrder[] }> = ({ orders }) => (
  <>
    <tr className="bg-blue-50/40">
      <td colSpan={9} className="px-4 py-2 pl-10 text-xs font-black uppercase tracking-widest text-gray-400">Orders ({orders.length})</td>
    </tr>
    {orders.map(p => (
      <tr key={p.id} className="bg-blue-50/20">
        <td className="px-4 py-1.5 pl-10" colSpan={3}>
          <div className="text-sm text-gray-700">{p.address}</div>
          <div className="text-xs text-gray-400">{p.customerName}</div>
        </td>
        <td className="px-4 py-1.5">
          <span className={`text-xs font-bold ${p.orderType === 'special' ? 'text-purple-600' : p.orderType === 'missed_redo' ? 'text-red-600' : 'text-gray-500'}`}>
            {p.orderType}
          </span>
        </td>
        <td className="px-4 py-1.5" colSpan={2}>
          {p.orderNumber != null && <span className="text-xs text-gray-500">Order #{p.orderNumber}</span>}
        </td>
        <td className="px-4 py-1.5" colSpan={3}>
          <span className={`text-xs font-bold ${p.status === 'completed' ? 'text-green-600' : p.status === 'failed' ? 'text-red-600' : 'text-gray-400'}`}>
            {p.status}
          </span>
        </td>
      </tr>
    ))}
  </>
);

// --- Main RouteTable component ---

export interface RouteTableProps {
  routes: Route[];
  columns?: {
    type?: boolean;
    driver?: boolean;
    pay?: boolean;
    orders?: boolean;
  };
  renderActions?: (route: Route) => React.ReactNode;
  // Expand callbacks
  onExpandOrders?: (routeId: string) => Promise<RouteOrder[]>;
  onExpandBids?: (routeId: string) => Promise<RouteBid[]>;
  canAcceptBids?: boolean;
  onAcceptBid?: (routeId: string, bid: RouteBid) => void;
  // Bulk selection
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  // Per-row extra content (e.g. inline bid form)
  renderRowExtra?: (route: Route) => React.ReactNode | null;
  // Empty state
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
}

const RouteTable: React.FC<RouteTableProps> = ({
  routes,
  columns = {},
  renderActions,
  onExpandOrders,
  onExpandBids,
  canAcceptBids,
  onAcceptBid,
  selectable,
  selectedIds,
  onSelectionChange,
  renderRowExtra,
  emptyMessage = 'No routes.',
  emptyIcon,
}) => {
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);
  const [expandMode, setExpandMode] = useState<'bids' | 'orders'>('bids');
  const [bidsCache, setBidsCache] = useState<Record<string, RouteBid[]>>({});
  const [ordersCache, setOrdersCache] = useState<Record<string, RouteOrder[]>>({});
  const [loadingExpand, setLoadingExpand] = useState<string | null>(null);

  const toggleExpand = useCallback(async (routeId: string, mode: 'bids' | 'orders') => {
    if (expandedRouteId === routeId && expandMode === mode) {
      setExpandedRouteId(null);
      return;
    }
    setExpandedRouteId(routeId);
    setExpandMode(mode);

    const cache = mode === 'bids' ? bidsCache : ordersCache;
    if (cache[routeId]) return;

    const fetcher = mode === 'bids' ? onExpandBids : onExpandOrders;
    if (!fetcher) return;

    setLoadingExpand(routeId);
    try {
      const data = await fetcher(routeId);
      if (mode === 'bids') {
        setBidsCache(prev => ({ ...prev, [routeId]: data as RouteBid[] }));
      } else {
        setOrdersCache(prev => ({ ...prev, [routeId]: data as RouteOrder[] }));
      }
    } catch {}
    setLoadingExpand(null);
  }, [expandedRouteId, expandMode, bidsCache, ordersCache, onExpandBids, onExpandOrders]);

  const toggleSelection = (routeId: string) => {
    if (!onSelectionChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(routeId)) next.delete(routeId); else next.add(routeId);
    onSelectionChange(next);
  };

  const toggleSelectAll = () => {
    if (!onSelectionChange || !selectedIds) return;
    if (selectedIds.size === routes.length) onSelectionChange(new Set());
    else onSelectionChange(new Set(routes.map(r => r.id)));
  };

  // Determine visible column count for colSpan
  let colCount = 3; // Route, Date, Status are always shown
  if (columns.type) colCount++;
  if (columns.orders) colCount++;
  if (columns.pay) colCount++;
  if (columns.driver) colCount++;
  if (renderActions) colCount++; // Actions column
  if (selectable) colCount++; // Checkbox column

  if (routes.length === 0) {
    return (
      <div className="text-center py-8">
        {emptyIcon}
        <p className="text-gray-500 mt-2">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {selectable && (
                <th className="px-3 py-3 w-10">
                  <input type="checkbox" title="Select all"
                    checked={routes.length > 0 && selectedIds?.size === routes.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 text-teal-600 rounded border-gray-300 focus:ring-teal-500" />
                </th>
              )}
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Route</th>
              {columns.type && <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Type</th>}
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Date</th>
              {columns.orders && <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Orders</th>}
              {columns.pay && <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Pay</th>}
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Status</th>
              {columns.driver && <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-400">Driver</th>}
              {renderActions && <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-widest text-gray-400">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {routes.map(route => {
              const isExpanded = expandedRouteId === route.id;
              const bids = bidsCache[route.id];
              const orders = ordersCache[route.id];
              const bidCount = route.bidCount ?? 0;
              const orderCount = route.orderCount ?? route.estimatedOrders ?? 0;

              return (
                <React.Fragment key={route.id}>
                  <tr className={`hover:bg-gray-50 transition-colors ${isExpanded ? 'bg-gray-50' : ''}`}>
                    {selectable && (
                      <td className="px-3 py-3 w-10">
                        <input type="checkbox" title={`Select ${route.title}`}
                          checked={selectedIds?.has(route.id) ?? false}
                          onChange={() => toggleSelection(route.id)}
                          className="w-4 h-4 text-teal-600 rounded border-gray-300 focus:ring-teal-500" />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="text-sm font-semibold text-gray-900">{route.title}</div>
                      {route.startTime && (
                        <div className="text-xs text-gray-500">{route.startTime}{route.endTime ? ` – ${route.endTime}` : ''}</div>
                      )}
                    </td>
                    {columns.type && (
                      <td className="px-4 py-3"><RouteTypeChip type={route.routeType || 'daily_route'} /></td>
                    )}
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-700">{formatRouteDate(route.scheduledDate)}</div>
                    </td>
                    {columns.orders && (
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-700">
                          {orderCount > 0 ? orderCount : '—'}
                          {route.estimatedHours != null && <span className="text-xs text-gray-400 ml-1">({route.estimatedHours}h)</span>}
                        </div>
                      </td>
                    )}
                    {columns.pay && (
                      <td className="px-4 py-3">
                        <div className="text-sm font-semibold text-gray-900">
                          {route.actualPay != null ? `$${Number(route.actualPay).toFixed(2)}`
                            : route.payMode === 'dynamic' && route.computedValue != null ? `$${Number(route.computedValue).toFixed(2)}`
                            : route.payMode === 'dynamic_premium' && route.computedValue != null
                              ? `$${(Number(route.computedValue) + (Number(route.payPremium) || 0)).toFixed(2)}`
                            : route.basePay != null ? `$${Number(route.basePay).toFixed(2)}` : '—'}
                        </div>
                        {route.payMode === 'dynamic' && route.computedValue != null && !route.actualPay && (
                          <div className="text-xs text-teal-600">dynamic</div>
                        )}
                        {route.payMode === 'dynamic_premium' && route.computedValue != null && !route.actualPay && (
                          <div className="text-xs text-teal-600">+${Number(route.payPremium || 0).toFixed(2)} premium</div>
                        )}
                        {route.payMode === 'flat' && !route.actualPay && route.basePay != null && (
                          <div className="text-xs text-gray-400">flat</div>
                        )}
                        {route.actualPay != null && route.basePay != null && Number(route.actualPay) !== Number(route.basePay) && (
                          <div className="text-xs text-gray-400 line-through">${Number(route.basePay).toFixed(2)}</div>
                        )}
                        {route.contractId && (
                          <div className="text-xs text-teal-700 font-semibold">contract</div>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3"><StatusChip status={route.status} /></td>
                    {columns.driver && (
                      <td className="px-4 py-3"><div className="text-sm text-gray-700">{route.driverName ?? '—'}</div></td>
                    )}
                    {renderActions && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          {onExpandOrders && orderCount > 0 && (
                            <button type="button" onClick={() => toggleExpand(route.id, 'orders')}
                              className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                                isExpanded && expandMode === 'orders' ? 'text-white bg-blue-600' : 'text-blue-700 bg-blue-50 hover:bg-blue-100'
                              }`}>
                              {orderCount} Order{orderCount !== 1 ? 's' : ''} {isExpanded && expandMode === 'orders' ? '\u25B2' : '\u25BC'}
                            </button>
                          )}
                          {onExpandBids && bidCount > 0 && (
                            <button type="button" onClick={() => toggleExpand(route.id, 'bids')}
                              className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                                isExpanded && expandMode === 'bids' ? 'text-white bg-teal-600' : 'text-teal-700 bg-teal-50 hover:bg-teal-100'
                              }`}>
                              {bidCount} Bid{bidCount !== 1 ? 's' : ''} {isExpanded && expandMode === 'bids' ? '\u25B2' : '\u25BC'}
                            </button>
                          )}
                          {renderActions(route)}
                        </div>
                      </td>
                    )}
                  </tr>

                  {/* Bids expansion */}
                  {isExpanded && expandMode === 'bids' && (
                    loadingExpand === route.id ? (
                      <tr className="bg-gray-50/80"><td colSpan={colCount} className="px-4 py-4 text-center"><div className="text-sm text-gray-400">Loading bids...</div></td></tr>
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
                          <BidRow key={bid.id} bid={bid}
                            basePay={route.basePay != null ? Number(route.basePay) : undefined}
                            onAccept={onAcceptBid ? () => onAcceptBid(route.id, bid) : undefined}
                            canAccept={canAcceptBids && (route.status === 'open' || route.status === 'bidding')} />
                        ))}
                      </>
                    ) : (
                      <tr className="bg-gray-50/80"><td colSpan={colCount} className="px-4 py-3 text-center text-sm text-gray-400">No bids yet</td></tr>
                    )
                  )}

                  {/* Orders expansion */}
                  {isExpanded && expandMode === 'orders' && (
                    loadingExpand === route.id ? (
                      <tr className="bg-gray-50/80"><td colSpan={colCount} className="px-4 py-4 text-center"><div className="text-sm text-gray-400">Loading orders...</div></td></tr>
                    ) : orders && orders.length > 0 ? (
                      <OrdersExpansion orders={orders} />
                    ) : (
                      <tr className="bg-gray-50/80"><td colSpan={colCount} className="px-4 py-3 text-center text-sm text-gray-400">No orders assigned</td></tr>
                    )
                  )}

                  {/* Per-row extra content */}
                  {renderRowExtra && (() => {
                    const extra = renderRowExtra(route);
                    if (!extra) return null;
                    return (
                      <tr className="bg-gray-50/40">
                        <td colSpan={colCount} className="px-4 py-3">{extra}</td>
                      </tr>
                    );
                  })()}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RouteTable;
