import React from 'react';

export type View = 'home' | 'myservice' | 'requests' | 'help' | 'profile-settings' | 'referrals' | 'billing';

export interface PostNavAction {
  targetView: View;
  targetTab?: string;
  action: 'openTipModal' | 'openTab' | 'openSetupWizard';
  targetDate?: string;
}

export interface NotificationPreferences {
  pickupReminders: { email: boolean; sms: boolean };
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

export interface Property {
  id: string;
  address: string;
  serviceType: ServiceType;
  serviceStatus?: 'pending_review' | 'approved' | 'denied';
  inHOA: boolean;
  communityName?: string;
  hasGateCode: boolean;
  gateCode?: string;
  notes?: string;
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
  properties: Property[];
  autopayEnabled: boolean;
  stripeCustomerId?: string;
  isAdmin?: boolean;
  impersonating?: boolean;
  authProvider?: string;
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

export interface SpecialPickupService {
    id: string;
    name: string;
    description: string;
    price: number;
    icon: React.ReactNode;
}

export interface SpecialPickupRequest {
    id: string;
    propertyId: string;
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
  propertyId: string;
  serviceId: string;
  serviceName: string;
  startDate: string;
  status: 'active' | 'paused' | 'canceled';
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
  propertyId: string;
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

export interface NewPropertyInfo {
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

export interface UpdatePropertyInfo {
  serviceType: ServiceType;
  inHOA: 'yes' | 'no';
  communityName?: string;
  hasGateCode: 'yes' | 'no';
  gateCode?: string;
  notes?: string;
}

export interface RegistrationInfo extends Omit<User, 'memberSince' | 'properties' | 'autopayEnabled'> {
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

export interface ReferralInfo {
    referralCode: string;
    shareLink: string;
    referrals: Referral[];
    totalRewards: number; // in dollars
}
