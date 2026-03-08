export interface MissedCollectionReport {
  id: string;
  locationId: string;
  customerName: string;
  customerEmail: string;
  address: string;
  collectionDate: string;
  notes: string;
  photos?: string[];
  status: string;
  resolutionNotes: string | null;
  createdAt: string;
}

export interface OnDemandRequest {
  id: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  address: string;
  serviceName: string;
  servicePrice: number;
  requestedDate: string;
  status: string;
  notes?: string;
  photos?: string[];
  aiEstimate?: number;
  aiReasoning?: string;
  adminNotes?: string;
  assignedDriverId?: string;
  cancellationReason?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Driver {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  onboardingStatus?: string;
  rating?: number;
}

export type RouteType = 'daily_route' | 'bulk_collection' | 'on_demand';
export type RouteStatus = 'draft' | 'open' | 'bidding' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'processing' | 'paid';

export type PayMode = 'dynamic' | 'flat' | 'dynamic_premium';

export interface Route {
  id: string;
  title: string;
  description?: string;
  scheduledDate: string;
  startTime?: string;
  endTime?: string;
  estimatedOrders?: number;
  estimatedHours?: number;
  basePay?: number;
  status: RouteStatus;
  assignedDriverId?: string;
  driverName?: string;
  notes?: string;
  createdAt: string;
  bidCount?: number;
  // Route-centric fields
  routeType?: RouteType;
  source?: string;
  onDemandRequestId?: string;
  optimoPlanningId?: string;
  acceptedBidId?: string;
  actualPay?: number;
  paymentStatus?: PaymentStatus;
  completedAt?: string;
  orderCount?: number;
  completedOrderCount?: number;
  // OptimoRoute sync tracking
  optimoSynced?: boolean;
  optimoSyncedAt?: string;
  optimoRouteKey?: string;
  // Contract & compensation
  contractId?: string;
  computedValue?: number;
  payMode?: PayMode;
  payPremium?: number;
}

export type BidType = 'route' | 'rate_discovery';
export type BidStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'expired';

export interface RouteBid {
  id: string;
  driverId: string;
  driverName: string;
  driverRating: number | null;
  bidAmount: number;
  message: string | null;
  driverRatingAtBid: number | null;
  bidType: BidType;
  perOrderRate: number | null;
  status: BidStatus;
  createdAt: string;
}

export type RouteOrderStatus = 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'failed' | 'skipped' | 'cancelled';

export interface RouteOrder {
  id: string;
  routeId: string;
  locationId: string | null;
  orderType: 'recurring' | 'on_demand' | 'missed_redo';
  onDemandRequestId?: string;
  optimoOrderNo?: string;
  optimo_order_no?: string; // snake_case alias from DB queries
  orderNumber?: number;
  order_number?: number; // snake_case alias from DB queries
  status: RouteOrderStatus | string;
  scheduledAt?: string;
  duration?: number;
  notes?: string;
  locationName?: string;
  createdAt: string;
  // Joined fields
  address?: string;
  serviceType?: string;
  customerName?: string;
  // POD data from OptimoRoute completion
  podData?: string;
  pod_data?: string; // snake_case alias from DB queries
  // Compensation
  compensation?: number;
}

export type ZoneType = 'circle' | 'polygon' | 'zip';

export interface DriverCustomZoneAdmin {
  id: string;
  driverId: string;
  driverName: string;
  driverEmail?: string;
  name: string;
  zoneType: ZoneType;
  centerLat: number | null;
  centerLng: number | null;
  radiusMiles: number | null;
  polygonCoords: [number, number][] | null;
  zipCodes: string[] | null;
  color: string;
  status: 'active' | 'paused';
  createdAt: string;
}

export interface PlanningDayData {
  date: string;
  locationCount: number;
  onDemandCount: number;
  routes: Array<{
    status: string;
    routeType: string;
    routeCount: number;
  }>;
}

// -- Route capacity warnings --

export interface CapacityWarning {
  routeId: string;
  title: string;
  date: string;
  orders: number;
  maxOrders: number;
  estimatedHours: number;
  maxHours: number;
}

export interface AutoPlanResult {
  routesCreated: number;
  daysPlanned: number;
  skippedDays: number;
}

// -- Planner types --

export interface MissingLocation {
  id: string;
  address: string;
  serviceType: string;
  collectionFrequency: string | null;
  customerName: string;
}

export interface CancelledCollection {
  collectionId: string;
  routeId: string;
  locationId: string;
  address: string;
  serviceStatus: string;
  customerName: string;
  scheduledDate: string;
  routeTitle: string;
}

export interface WeekPlannerData {
  routes: Route[];
  cancelled: CancelledCollection[];
  missingByDay: Record<string, MissingLocation[]>;
}

// -- Location Directory --

export interface LocationDirectoryItem {
  id: string;
  address: string;
  ownerName: string;
  ownerEmail: string;
  serviceType: string;
  serviceStatus: string;
  collectionDay: string | null;
  collectionFrequency: string | null;
  latitude: string | null;
  longitude: string | null;
  collectionDaySource: string | null;
  coverageZoneId: string | null;
  createdAt: string;
}

export interface LocationDirectoryResponse {
  locations: LocationDirectoryItem[];
  total: number;
  page: number;
  limit: number;
}

// ============================================================
// Contract & Compensation Types
// ============================================================

export type ContractStatus = 'active' | 'expired' | 'terminated' | 'pending';

export interface RouteContract {
  id: string;
  driverId: string;
  driverName?: string;
  zoneId: string;
  zoneName?: string;
  dayOfWeek: string;
  startDate: string;
  endDate: string;
  status: ContractStatus;
  perOrderRate: number | null;
  termsNotes: string | null;
  awardedBy: string | null;
  createdAt: string;
  updatedAt: string;
  // Computed/joined
  orderCount?: number;
  routeCount?: number;
  computedWeeklyValue?: number;
}

export type CompensationRuleType = 'base_rate' | 'service_type_modifier' | 'difficulty_modifier' | 'zone_modifier';

export interface CompensationRule {
  id: string;
  name: string;
  ruleType: CompensationRuleType;
  conditions: Record<string, any>;
  rateAmount: number | null;
  rateMultiplier: number;
  priority: number;
  active: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompensationBreakdown {
  baseRate: number;
  modifiers: Array<{
    ruleName: string;
    ruleType: CompensationRuleType;
    multiplier: number;
  }>;
  locationCustomRate: number | null;
  contractPerOrderRate: number | null;
  finalRate: number;
  source: 'custom_rate' | 'contract_rate' | 'rules_engine';
}

export interface RouteValuation {
  computedValue: number;
  orderBreakdowns: Array<{
    orderId: string;
    locationId: string;
    address: string;
    compensation: number;
    breakdown: CompensationBreakdown;
  }>;
  payMode: PayMode;
  basePay: number | null;
  payPremium: number;
  finalPay: number;
}

export type OpportunityStatus = 'open' | 'awarded' | 'cancelled';

export interface ContractOpportunity {
  id: string;
  zoneId: string;
  zoneName?: string;
  dayOfWeek: string;
  startDate: string;
  durationMonths: number;
  proposedPerOrderRate: number | null;
  requirements: Record<string, any>;
  status: OpportunityStatus;
  awardedContractId: string | null;
  discoveryRouteId: string | null;
  createdBy: string | null;
  createdAt: string;
  applicationCount?: number;
}

export type ApplicationStatus = 'pending' | 'accepted' | 'rejected';

export interface ContractApplication {
  id: string;
  opportunityId: string;
  driverId: string;
  driverName?: string;
  driverRating?: number | null;
  proposedRate: number | null;
  message: string | null;
  driverRatingAtApplication: number | null;
  status: ApplicationStatus;
  createdAt: string;
}

export type CoverageReason = 'sick' | 'vacation' | 'emergency' | 'other';
export type CoverageStatus = 'pending' | 'approved' | 'filled' | 'denied';

export interface CoverageRequest {
  id: string;
  contractId: string;
  requestingDriverId: string;
  requestingDriverName?: string;
  coverageDate: string;
  reason: CoverageReason;
  reasonNotes: string | null;
  substituteDriverId: string | null;
  substituteDriverName?: string;
  substitutePay: number | null;
  status: CoverageStatus;
  reviewedBy: string | null;
  createdAt: string;
}

export interface ContractPerformance {
  totalRoutes: number;
  completedRoutes: number;
  completionRate: number;
  totalOrders: number;
  completedOrders: number;
  orderCompletionRate: number;
  totalCompensation: number;
  avgRouteValue: number;
  coverageRequestCount: number;
}

// Driver qualification fields (added to driver_profiles)
export interface DriverQualifications {
  equipmentTypes: string[];
  certifications: string[];
  maxOrdersPerDay: number;
  minRatingForAssignment: number;
}

// Location compensation fields (added to locations)
export interface LocationRequirements {
  difficultyScore: number;
  customRate: number | null;
  requiredEquipment: string[];
  requiredCertifications: string[];
  minDriverRating: number;
  dayChangePreference: 'flexible' | 'prefer_current' | 'do_not_change';
}

// ============================================================
// Shared Status Constants (US-20)
// Server and client share these to prevent status value drift.
// ============================================================

export const ROUTE_STATUSES: RouteStatus[] = ['draft', 'open', 'bidding', 'assigned', 'in_progress', 'completed', 'cancelled'];
export const ON_DEMAND_STATUSES = ['pending', 'scheduled', 'completed', 'cancelled'] as const;
export const MISSED_COLLECTION_STATUSES = ['pending', 'investigating', 'escalated', 'resolved', 'dismissed'] as const;
export const CONTRACT_STATUSES: ContractStatus[] = ['active', 'expired', 'terminated', 'pending'];
export const OPPORTUNITY_STATUSES: OpportunityStatus[] = ['open', 'awarded', 'cancelled'];
export const APPLICATION_STATUSES: ApplicationStatus[] = ['pending', 'accepted', 'rejected'];
export const COVERAGE_STATUSES: CoverageStatus[] = ['pending', 'approved', 'filled', 'denied'];
export const BID_STATUSES: BidStatus[] = ['pending', 'accepted', 'rejected', 'withdrawn', 'expired'];
