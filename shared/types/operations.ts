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
