
import React from 'react';
import { Service, Subscription, Invoice, User, Property, PaymentMethod, NotificationPreferences } from '../types';
import { TrashIcon, ArrowPathIcon, SunIcon, TruckIcon } from '../components/Icons';

const MOCK_PROPERTIES: Property[] = [
    { id: 'P1', address: '121 Elsia Dr', notificationPreferences: { pickupReminders: { email: true, sms: false }, scheduleChanges: { email: true, sms: true }, driverUpdates: { email: false, sms: true } } },
    { id: 'P2', address: '7258 Baldwin Ridge Rd', notificationPreferences: { pickupReminders: { email: true, sms: false }, scheduleChanges: { email: true, sms: false }, driverUpdates: { email: false, sms: false } } },
    { id: 'P3', address: '804 W 13th St', notificationPreferences: { pickupReminders: { email: false, sms: false }, scheduleChanges: { email: true, sms: false }, driverUpdates: { email: false, sms: false } } },
];

const MOCK_USER: User = {
    name: 'Jane Doe',
    email: 'jane.doe@example.com',
    memberSince: '2022-01-15',
    properties: MOCK_PROPERTIES,
};

const MOCK_SERVICES: Service[] = [
  { id: 'prod_TOww4pJkfauHUV', name: 'Small Trash Can (32G)', description: 'Weekly curbside trash pickup with a small 32-gallon can.', price: 22.00, frequency: 'Weekly', icon: React.createElement(TrashIcon, { className: "w-8 h-8 text-primary" }) },
  { id: 'prod_TOwxmi5PUD5seZ', name: 'Medium Trash Can (64G)', description: 'Weekly curbside trash pickup with a medium 64-gallon can.', price: 28.00, frequency: 'Weekly', icon: React.createElement(TrashIcon, { className: "w-8 h-8 text-primary" }) },
  { id: 'prod_TOwy8go7cLjLpV', name: 'Large Trash Can (96G)', description: 'Weekly curbside trash pickup with a large 96-gallon can.', price: 35.00, frequency: 'Weekly', icon: React.createElement(TrashIcon, { className: "w-8 h-8 text-primary" }) },
  { id: 'prod_TOwzfWmoiIn8Ij', name: 'Recycling Service', description: 'Bi-weekly curbside recycling service. Includes bin.', price: 15.00, frequency: 'Bi-Weekly', icon: React.createElement(ArrowPathIcon, { className: "w-8 h-8 text-accent" }) },
  { id: 'prod_TOvyKnOx4KLBc2', name: 'At House Collection', description: 'Convenient weekly collection right from your house, not the curb.', price: 45.00, frequency: 'Weekly', icon: React.createElement(TruckIcon, { className: "w-8 h-8 text-yellow-500" }) },
  { id: 'prod_TOx5lSdv97AAGb', name: 'White-Glove Liner Service', description: 'Our crew installs a fresh, heavy-duty liner in your can after every weekly collection.', price: 10.00, frequency: 'Monthly', icon: React.createElement(SunIcon, { className: "w-8 h-8 text-yellow-500" }) },
];

let MOCK_SUBSCRIPTIONS: Subscription[] = [
  { id: 'SUB1', propertyId: 'P1', serviceId: 'prod_TOwxmi5PUD5seZ', serviceName: 'Medium Trash Can (64G)', startDate: '2023-01-15', status: 'active', nextBillingDate: '2024-08-01', price: 28.00, source: 'In-App', paymentMethodId: 'pm_1' },
  { id: 'SUB2', propertyId: 'P1', serviceId: 'prod_TOwzfWmoiIn8Ij', serviceName: 'Recycling Service', startDate: '2023-03-20', status: 'active', nextBillingDate: '2024-08-01', price: 15.00, source: 'In-App', paymentMethodId: 'pm_1' },
  { id: 'SUB3', propertyId: 'P2', serviceId: 'prod_TOwy8go7cLjLpV', serviceName: 'Large Trash Can (96G)', startDate: '2022-11-10', status: 'active', nextBillingDate: '2024-08-10', price: 35.00, source: 'In-App', paymentMethodId: 'pm_2' },
];

const MOCK_INVOICES: Invoice[] = [
  { id: 'INV-P1-003', propertyId: 'P1', amount: 43.00, date: '2024-07-01', status: 'Paid' },
  { id: 'INV-P1-002', propertyId: 'P1', amount: 43.00, date: '2024-06-01', status: 'Paid' },
  { id: 'INV-P1-001', propertyId: 'P1', amount: 28.00, date: '2024-05-01', status: 'Paid' },
  { id: 'INV-P2-003', propertyId: 'P2', amount: 35.00, date: '2024-07-10', status: 'Paid' },
  { id: 'INV-P2-002', propertyId: 'P2', amount: 35.00, date: '2024-06-10', status: 'Paid' },
  { id: 'INV-P3-001', propertyId: 'P3', amount: 0.00, date: '2024-07-15', status: 'Paid' },
];

let MOCK_PAYMENT_METHODS: PaymentMethod[] = [
    { id: 'pm_1', type: 'Card', brand: 'Visa', last4: '4242', expiryMonth: 12, expiryYear: 2026, isPrimary: true },
    { id: 'pm_2', type: 'Card', brand: 'Mastercard', last4: '5555', expiryMonth: 8, expiryYear: 2025, isPrimary: false },
    { id: 'pm_3', type: 'Bank Account', last4: '6789', isPrimary: false },
];

// Custom deep clone that doesn't destroy React elements
const deepClone = <T,>(obj: T): T => {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    if (React.isValidElement(obj)) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => deepClone(item)) as any;
    }

    const newObj = {} as T;
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            newObj[key] = deepClone(obj[key]);
        }
    }
    return newObj;
};

const simulateApiCall = <T,>(data: T): Promise<T> => 
  new Promise(resolve => setTimeout(() => resolve(deepClone(data)), 500));

export const getUser = () => simulateApiCall(MOCK_USER);
export const getServices = () => simulateApiCall(MOCK_SERVICES);
export const getSubscriptions = () => simulateApiCall(MOCK_SUBSCRIPTIONS);
export const getInvoices = () => simulateApiCall(MOCK_INVOICES);

export const addSubscription = (service: Service, propertyId: string) => {
    const primaryMethod = MOCK_PAYMENT_METHODS.find(p => p.isPrimary) || MOCK_PAYMENT_METHODS[0];
    if (!primaryMethod) {
        return Promise.reject(new Error("Cannot subscribe without a payment method on file."));
    }

    const newSub: Subscription = {
        id: `SUB${Date.now()}`,
        propertyId: propertyId,
        serviceId: service.id,
        serviceName: service.name,
        startDate: new Date().toISOString().split('T')[0],
        status: 'active',
        nextBillingDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
        price: service.price,
        source: 'In-App',
        paymentMethodId: primaryMethod.id,
    };
    MOCK_SUBSCRIPTIONS.push(newSub);
    return simulateApiCall(newSub);
}

// Payment Methods API
export const getPaymentMethods = () => simulateApiCall(MOCK_PAYMENT_METHODS);

export const addPaymentMethod = (method: Omit<PaymentMethod, 'id' | 'isPrimary'>) => {
    const wasEmpty = MOCK_PAYMENT_METHODS.length === 0;
    const isPrimary = wasEmpty ? true : !MOCK_PAYMENT_METHODS.some(p => p.isPrimary);
    
    const newMethod: PaymentMethod = {
        ...method,
        id: `pm_${Date.now()}`,
        isPrimary: isPrimary,
    };
    
    MOCK_PAYMENT_METHODS.push(newMethod);
    return simulateApiCall(newMethod);
};

export const deletePaymentMethod = (id: string) => {
    const isInUse = MOCK_SUBSCRIPTIONS.some(sub => sub.paymentMethodId === id && sub.status === 'active');
    if (isInUse) {
        return Promise.reject(new Error("Cannot delete a payment method that is in use by an active subscription."));
    }

    const methodToDelete = MOCK_PAYMENT_METHODS.find(p => p.id === id);
    if (!methodToDelete) {
        return Promise.reject(new Error("Payment method not found."));
    }

    MOCK_PAYMENT_METHODS = MOCK_PAYMENT_METHODS.filter(p => p.id !== id);
    
    if (methodToDelete.isPrimary && MOCK_PAYMENT_METHODS.length > 0) {
        MOCK_PAYMENT_METHODS[0].isPrimary = true;
    }
    
    return simulateApiCall(id);
};

export const setPrimaryPaymentMethod = (id: string) => {
    MOCK_PAYMENT_METHODS.forEach(p => {
        p.isPrimary = p.id === id;
    });
    return simulateApiCall(MOCK_PAYMENT_METHODS.find(p => p.id === id) || null);
};

export const updateSubscriptionPaymentMethod = (subscriptionId: string, paymentMethodId: string) => {
    const subToUpdate = MOCK_SUBSCRIPTIONS.find(s => s.id === subscriptionId);
    if (subToUpdate) {
        subToUpdate.paymentMethodId = paymentMethodId;
        return simulateApiCall(subToUpdate);
    }
    return Promise.reject(new Error("Subscription not found"));
};

export const updateSubscriptionsForProperty = (propertyId: string, paymentMethodId: string) => {
    MOCK_SUBSCRIPTIONS.forEach(sub => {
        if (sub.propertyId === propertyId && sub.status === 'active') {
            sub.paymentMethodId = paymentMethodId;
        }
    });
    return simulateApiCall(MOCK_SUBSCRIPTIONS.filter(sub => sub.propertyId === propertyId));
};

export const updateAllUserSubscriptions = (paymentMethodId: string) => {
    MOCK_SUBSCRIPTIONS.forEach(sub => {
         if (sub.status === 'active') {
            sub.paymentMethodId = paymentMethodId;
        }
    });
    return simulateApiCall(MOCK_SUBSCRIPTIONS);
};

export const updateNotificationPreferences = (propertyId: string, preferences: NotificationPreferences) => {
    const propertyToUpdate = MOCK_PROPERTIES.find(p => p.id === propertyId);
    if (propertyToUpdate) {
        propertyToUpdate.notificationPreferences = preferences;
        return simulateApiCall(propertyToUpdate);
    }
    return Promise.reject(new Error("Property not found"));
};
