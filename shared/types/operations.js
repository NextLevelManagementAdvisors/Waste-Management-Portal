// ============================================================
// Shared Status Constants (US-20)
// Server and client share these to prevent status value drift.
// ============================================================
export const ROUTE_STATUSES = ['draft', 'open', 'bidding', 'assigned', 'in_progress', 'completed', 'cancelled'];
export const ON_DEMAND_STATUSES = ['pending', 'scheduled', 'completed', 'cancelled'];
export const MISSED_COLLECTION_STATUSES = ['pending', 'investigating', 'escalated', 'resolved', 'dismissed'];
export const CONTRACT_STATUSES = ['active', 'expired', 'terminated', 'pending'];
export const OPPORTUNITY_STATUSES = ['open', 'awarded', 'cancelled'];
export const APPLICATION_STATUSES = ['pending', 'accepted', 'rejected'];
export const COVERAGE_STATUSES = ['pending', 'approved', 'filled', 'denied'];
export const BID_STATUSES = ['pending', 'accepted', 'rejected', 'withdrawn', 'expired'];
