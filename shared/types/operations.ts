export interface MissedPickupReport {
  id: string;
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

export type JobType = 'daily_route' | 'bulk_pickup' | 'special_pickup';
export type JobStatus = 'draft' | 'open' | 'bidding' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'processing' | 'paid';

export interface RouteJob {
  id: string;
  title: string;
  description?: string;
  area?: string;
  scheduled_date: string;
  start_time?: string;
  end_time?: string;
  estimated_stops?: number;
  estimated_hours?: number;
  base_pay?: number;
  status: JobStatus;
  assigned_driver_id?: string;
  driver_name?: string;
  notes?: string;
  created_at: string;
  bid_count?: number;
  // Job-centric fields
  job_type?: JobType;
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
  pickup_count?: number;
}

export interface JobBid {
  id: string;
  driverId: string;
  driverName: string;
  driverRating: number | null;
  bidAmount: number;
  message: string | null;
  driverRatingAtBid: number | null;
  createdAt: string;
}

export interface JobPickup {
  id: string;
  job_id: string;
  property_id: string;
  pickup_type: 'recurring' | 'special' | 'missed_redo';
  special_pickup_id?: string;
  optimo_order_no?: string;
  sequence_number?: number;
  status: string;
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
  jobs: Array<{
    status: string;
    job_type: string;
    zone_name: string | null;
    job_count: number;
  }>;
}

// ── Route Planner types ──

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
  job_id: string;
  property_id: string;
  address: string;
  service_status: string;
  customer_name: string;
  scheduled_date: string;
  job_title: string;
  zone_name: string | null;
  zone_color: string | null;
}

export interface WeekPlannerData {
  jobs: RouteJob[];
  cancelled: CancelledPickup[];
  missingByDay: Record<string, MissingClient[]>;
  zones: ServiceZone[];
}
