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
  customerName: string;
  customerEmail: string;
  address: string;
  serviceName: string;
  servicePrice: number;
  pickupDate: string;
  status: string;
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
  status: 'open' | 'bidding' | 'assigned' | 'in_progress' | 'completed';
  assigned_driver_id?: string;
  driver_name?: string;
  notes?: string;
  created_at: string;
  bid_count?: number;
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
