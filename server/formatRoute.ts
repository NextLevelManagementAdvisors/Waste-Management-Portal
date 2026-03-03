/**
 * Transforms a snake_case route row from PostgreSQL into camelCase
 * matching the shared Route interface (shared/types/operations.ts).
 */
export function formatRouteForClient(row: any) {
  if (!row) return row;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    scheduledDate: row.scheduled_date ?? row.scheduledDate,
    startTime: row.start_time ?? row.startTime,
    endTime: row.end_time ?? row.endTime,
    estimatedStops: row.estimated_stops ?? row.estimatedStops,
    estimatedHours: row.estimated_hours != null ? Number(row.estimated_hours) : (row.estimatedHours != null ? Number(row.estimatedHours) : undefined),
    basePay: row.base_pay != null ? Number(row.base_pay) : (row.basePay != null ? Number(row.basePay) : undefined),
    status: row.status,
    assignedDriverId: row.assigned_driver_id ?? row.assignedDriverId,
    driverName: row.driver_name ?? row.driverName,
    notes: row.notes,
    createdAt: row.created_at ?? row.createdAt,
    routeType: row.route_type ?? row.routeType,
    source: row.source,
    onDemandRequestId: row.on_demand_request_id ?? row.onDemandRequestId,
    optimoPlanningId: row.optimo_planning_id ?? row.optimoPlanningId,
    acceptedBidId: row.accepted_bid_id ?? row.acceptedBidId,
    actualPay: row.actual_pay != null ? Number(row.actual_pay) : (row.actualPay != null ? Number(row.actualPay) : undefined),
    paymentStatus: row.payment_status ?? row.paymentStatus,
    completedAt: row.completed_at ?? row.completedAt,
    stopCount: row.stop_count != null ? Number(row.stop_count) : (row.stopCount != null ? Number(row.stopCount) : undefined),
    completedStopCount: row.completed_stop_count != null ? Number(row.completed_stop_count) : (row.completedStopCount != null ? Number(row.completedStopCount) : undefined),
    bidCount: row.bid_count != null ? Number(row.bid_count) : (row.bidCount != null ? Number(row.bidCount) : undefined),
    optimoSynced: row.optimo_synced ?? row.optimoSynced,
    optimoSyncedAt: row.optimo_synced_at ?? row.optimoSyncedAt,
    optimoRouteKey: row.optimo_route_key ?? row.optimoRouteKey,
    area: row.area,
    zoneId: row.zone_id ?? row.zoneId,
  };
}
