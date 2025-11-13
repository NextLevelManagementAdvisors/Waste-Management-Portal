
import React from 'react';

export type View = 'dashboard' | 'services' | 'subscriptions' | 'billing' | 'payment' | 'support' | 'notifications';

export interface NotificationPreferences {
  pickupReminders: { email: boolean; sms: boolean };
  scheduleChanges: { email: boolean; sms: boolean };
  driverUpdates: { email: boolean; sms: boolean };
}

export interface Property {
  id: string;
  address: string;
  notificationPreferences: NotificationPreferences;
}

export interface User {
  name: string;
  email: string;
  memberSince: string;
  properties: Property[];
}

export interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  frequency: 'Weekly' | 'Bi-Weekly' | 'Monthly' | 'One-Time';
  icon: React.ReactNode;
}

export interface Subscription {
  id: string;
  propertyId: string;
  serviceId: string;
  serviceName: string;
  startDate: string;
  status: 'active' | 'paused' | 'canceled';
  nextBillingDate: string;
  price: number;
  source: 'In-App' | 'Stripe';
  paymentMethodId: string;
}

export interface Invoice {
  id: string;
  propertyId: string;
  amount: number;
  date: string;
  status: 'Paid' | 'Due' | 'Overdue';
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
