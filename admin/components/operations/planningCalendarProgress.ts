import type { Route, RouteOrder } from '../../../shared/types/index.ts';

const TERMINAL_PROGRESS_STATUSES = new Set([
  'completed',
  'success',
  'failed',
  'rejected',
  'deleted_in_optimo',
  'rescheduled_in_optimo',
]);

function normalizeStatus(status?: string | null): string {
  return typeof status === 'string' ? status.trim().toLowerCase() : '';
}

export function countCompletedRouteOrders(
  orders?: RouteOrder[],
  liveOrderStatuses: Record<string, string> = {},
): number {
  if (!orders?.length) return 0;

  return orders.filter(order => {
    const orderNo = order.optimoOrderNo || order.optimo_order_no;
    const liveStatus = orderNo ? liveOrderStatuses[orderNo] : '';

    return (
      TERMINAL_PROGRESS_STATUSES.has(normalizeStatus(liveStatus)) ||
      TERMINAL_PROGRESS_STATUSES.has(normalizeStatus(order.status))
    );
  }).length;
}

export function getRouteProgressCounts(
  route: Pick<Route, 'orderCount' | 'estimatedOrders' | 'completedOrderCount'>,
  orders?: RouteOrder[],
  liveOrderStatuses: Record<string, string> = {},
) {
  const orderCount = route.orderCount ?? route.estimatedOrders ?? orders?.length ?? 0;
  const derivedCompletedOrders = countCompletedRouteOrders(orders, liveOrderStatuses);

  const summaryCompletedOrders = Number.isFinite(route.completedOrderCount)
    ? Number(route.completedOrderCount)
    : null;

  const completedOrders = summaryCompletedOrders ?? derivedCompletedOrders;

  return {
    orderCount,
    completedOrders: Math.max(0, Math.min(completedOrders, orderCount)),
    derivedCompletedOrders,
  };
}
