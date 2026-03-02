export interface MissedCollectionReport {
  id: string;
  locationId: string;
  customerName: string;
  customerEmail: string;
  address: string;
  collectionDate: string;
  notes: string;
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

export interface Route {
  id: string;
  title: string;
  description?: string;
  scheduledDate: string;
  startTime?: string;
  endTime?: string;
  estimatedStops?: number;
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
  stopCount?: number;
  completedStopCount?: number;
  // OptimoRoute sync tracking
  optimoSynced?: boolean;
  optimoSyncedAt?: string;
  optimoRouteKey?: string;
}

export interface RouteBid {
  id: string;
  driverId: string;
  driverName: string;
  driverRating: number | null;
  bidAmount: number;
  message: string | null;
  driverRatingAtBid: number | null;
  createdAt: string;
}

export interface RouteStop {
  id: string;
  routeId: string;
  locationId: string | null;
  orderType: 'recurring' | 'on_demand' | 'missed_redo';
  onDemandRequestId?: string;
  optimoOrderNo?: string;
  stopNumber?: number;
  status: string;
  scheduledAt?: string;
  duration?: number;
  notes?: string;
  locationName?: string;
  createdAt: string;
  // Joined fields
  address?: string;
  serviceType?: string;
  customerName?: string;
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
  stops: number;
  maxStops: number;
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
  createdAt: string;
}

export interface LocationDirectoryResponse {
  locations: LocationDirectoryItem[];
  total: number;
  page: number;
  limit: number;
}

// -- Location Claims (Dual Dispatch) --

export type LocationClaimStatus = 'active' | 'revoked' | 'released';

export interface LocationClaim {
  id: string;
  locationId: string;
  driverId: string;
  status: LocationClaimStatus;
  claimedAt: string;
  revokedAt: string | null;
  notes: string | null;
  driverName?: string;
  driverRating?: number;
  address?: string;
  customerName?: string;
}

export interface AvailableLocation {
  id: string;
  address: string;
  serviceType: string;
  collectionDay: string | null;
  collectionFrequency: string | null;
  latitude: number;
  longitude: number;
  customerName: string;
  claimedByDriverId: string | null;
  claimedByDriverName: string | null;
  claimStatus: LocationClaimStatus | null;
  isMine: boolean;
  distanceMiles: number;
  matchingZoneName: string;
}
