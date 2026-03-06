import React from 'react';

export type View = 'home' | 'myservice' | 'requests' | 'help' | 'profile-settings' | 'referrals' | 'billing';

export interface PostNavAction {
  targetView: View;
  targetTab?: string;
  action: 'openTipModal' | 'openTab' | 'openSetupWizard';
  targetDate?: string;
}

export interface NotificationPreferences {
  collectionReminders: { email: boolean; sms: boolean };
  scheduleChanges: { email: boolean; sms: boolean };
  driverUpdates: { email: boolean; sms: boolean };
  invoiceDue?: boolean;
  paymentConfirmation?: boolean;
  autopayReminder?: boolean;
  serviceUpdates?: boolean;
  promotions?: boolean;
  referralUpdates?: boolean;
}

export type ServiceType = 'personal' | 'commercial' | 'short-term' | 'rental' | 'other';

export interface Location {
  id: string;
  address: string;
  serviceType: ServiceType;
  serviceStatus?: 'pending_review' | 'approved' | 'denied' | 'waitlist';
  inHOA: boolean;
  communityName?: string;
  hasGateCode: boolean;
  gateCode?: string;
  notes?: string;
  serviceStatusNotes?: string;
  notificationPreferences: NotificationPreferences;
  transferStatus?: 'pending' | 'completed' | null;
  pendingOwner?: {
    firstName: string;
    lastName: string;
    email: string;
  };
}

export interface User {
  id?: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  password?: string;
  memberSince: string;
  locations: Location[];
  autopayEnabled: boolean;
  stripeCustomerId?: string;
  isAdmin?: boolean;
  impersonating?: boolean;
  authProvider?: string;
  emailVerified?: boolean;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  setupFee?: number;
  stickerFee?: number;
  frequency: 'Weekly' | 'Bi-Weekly' | 'Monthly' | 'One-Time';
  icon: React.ReactNode;
  category: 'base_service' | 'upgrade' | 'standalone' | 'base_fee';
}

export interface OnDemandService {
    id: string;
    name: string;
    description: string;
    price: number;
    icon: React.ReactNode;
}

export interface OnDemandRequest {
    id: string;
    locationId: string;
    serviceId: string;
    serviceName: string;
    date: string;
    status: 'pending' | 'scheduled' | 'completed' | 'cancelled';
    price: number;
    notes?: string;
    photos?: string[];
    aiEstimate?: number;
    aiReasoning?: string;
    cancellationReason?: string;
}

export interface Subscription {
  id:string;
  locationId: string;
  serviceId: string;
  serviceName: string;
  startDate: string;
  status: 'active' | 'paused' | 'canceled' | 'past_due';
  nextBillingDate: string;
  price: number;
  totalPrice: number;
  paymentMethodId: string;
  quantity: number;
  pausedUntil?: string; // YYYY-MM-DD
  equipmentType?: 'rental' | 'own_can';
  equipmentStatus?: 'at_property' | 'retrieved';
}

export interface Invoice {
  id: string;
  locationId: string;
  amount: number;
  date: string;
  status: 'Paid' | 'Due' | 'Overdue';
  paymentDate?: string;
  description?: string;
  pdfUrl?: string;
  hostedUrl?: string;
  invoiceNumber?: string;
}

export interface SupportMessage {
    sender: 'user' | 'gemini';
    text: string;
}

export interface PaymentMethod {
  id: string;
  type: 'Card' | 'Bank Account';
  last4: string;
  brand?: 'Visa' | 'Mastercard' | 'Amex';
  expiryMonth?: number;
  expiryYear?: number;
  isPrimary: boolean;
}

export interface ServiceAlert {
    id: string;
    message: string;
    type: 'info' | 'warning' | 'error';
}

export interface NewLocationInfo {
  street: string;
  city: string;
  state: string;
  zip: string;
  serviceType: ServiceType;
  inHOA: 'yes' | 'no';
  communityName?: string;
  hasGateCode: 'yes' | 'no';
  gateCode?: string;
  notes?: string;
}

export interface UpdateLocationInfo {
  serviceType: ServiceType;
  inHOA: 'yes' | 'no';
  communityName?: string;
  hasGateCode: 'yes' | 'no';
  gateCode?: string;
  notes?: string;
}

export interface RegistrationInfo extends Omit<User, 'memberSince' | 'locations' | 'autopayEnabled'> {
  referralCode?: string;
}

export interface UpdateProfileInfo {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

export interface UpdatePasswordInfo {
    currentPassword?: string;
    newPassword: string;
}

export interface Referral {
    id: string;
    name: string;
    status: 'pending' | 'completed';
    date: string;
}

export interface Redemption {
    id: string;
    amount: number;
    status: 'pending' | 'completed' | 'failed';
    created_at: string;
    method: string;
}

export interface ReferralInfo {
    referralCode: string;
    shareLink: string;
    referrals: Referral[];
    totalRewards: number; // in dollars
    redemptions: Redemption[];
}
