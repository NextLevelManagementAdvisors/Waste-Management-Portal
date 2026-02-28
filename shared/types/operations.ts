export interface MissedPickupReport {
  id: string;
  propertyId: string;
  customerName: string;
  customerEmail: string;
  address: string;
  pickupDate: string;
  notes: string;
  status: string;
  resolutionNotes: string | null;
  createdAt: string;
}

export interface PickupScheduleRequest {
  id: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  address: string;
  serviceName: string;
  servicePrice: number;
  pickupDate: string;
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
  onboarding_status?: string;
  rating?: number;
}

export type RouteType = 'daily_route' | 'bulk_pickup' | 'special_pickup';
export type RouteStatus = 'draft' | 'open' | 'bidding' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'processing' | 'paid';

export interface Route {
  id: string;
  title: string;
  description?: string;
  scheduled_date: string;
  start_time?: string;
  end_time?: string;
  estimated_stops?: number;
  estimated_hours?: number;
  base_pay?: number;
  status: RouteStatus;
  assigned_driver_id?: string;
  driver_name?: string;
  notes?: string;
  created_at: string;
  bid_count?: number;
  // Route-centric fields
  route_type?: RouteType;
  zone_id?: string;
  zone_name?: string;
  zone_color?: string;
  source?: string;
  special_pickup_id?: string;
  optimo_planning_id?: string;
  accepted_bid_id?: string;
  actual_pay?: number;
  payment_status?: PaymentStatus;
  completed_at?: string;
  stop_count?: number;
  completed_stop_count?: number;
  // OptimoRoute sync tracking
  optimo_synced?: boolean;
  optimo_synced_at?: string;
  optimo_route_key?: string;
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
  route_id: string;
  property_id: string | null;
  order_type: 'recurring' | 'special' | 'missed_redo';
  special_pickup_id?: string;
  optimo_order_no?: string;
  stop_number?: number;
  status: string;
  scheduled_at?: string;
  duration?: number;
  notes?: string;
  location_name?: string;
  created_at: string;
  // Joined fields
  address?: string;
  service_type?: string;
  customer_name?: string;
}

export interface ServiceZone {
  id: string;
  name: string;
  description?: string;
  center_lat?: number;
  center_lng?: number;
  radius_miles?: number;
  color: string;
  active: boolean;
  created_at: string;
}

export interface PlanningDayData {
  date: string;
  pickupsByZone: Array<{
    zone_id: string | null;
    zone_name: string | null;
    zone_color: string | null;
    property_count: number;
  }>;
  specialPickupCount: number;
  routes: Array<{
    status: string;
    route_type: string;
    zone_name: string | null;
    route_count: number;
  }>;
}

// ── Route capacity warnings ──

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

// ── Planner types ──

export interface MissingClient {
  id: string;
  address: string;
  service_type: string;
  zone_id: string | null;
  zone_name: string | null;
  zone_color: string | null;
  pickup_frequency: string | null;
  customer_name: string;
}

export interface CancelledPickup {
  pickup_id: string;
  route_id: string;
  property_id: string;
  address: string;
  service_status: string;
  customer_name: string;
  scheduled_date: string;
  route_title: string;
  zone_name: string | null;
  zone_color: string | null;
}

export interface WeekPlannerData {
  routes: Route[];
  cancelled: CancelledPickup[];
  missingByDay: Record<string, MissingClient[]>;
  zones: ServiceZone[];
}
