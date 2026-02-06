
import React from 'react';
import { Service, User, Property, NotificationPreferences, SpecialPickupService, SpecialPickupRequest, ServiceAlert, Subscription, PaymentMethod, NewPropertyInfo, RegistrationInfo, UpdatePropertyInfo, UpdateProfileInfo, UpdatePasswordInfo } from '../types';
import { TrashIcon, ArrowPathIcon, SunIcon, TruckIcon, ArchiveBoxIcon, SparklesIcon, ShoppingBagIcon, BuildingOffice2Icon, WrenchScrewdriverIcon } from '../components/Icons';
import * as stripeService from './stripeService';

// --- TYPES FOR CONSOLIDATED DATA ---
export interface PropertyState {
    property: Property;
    nextPickup: {
        date: string;
        label: string;
        isToday: boolean;
        status: 'upcoming' | 'in-progress' | 'completed' | 'missed' | 'paused';
        eta?: string;
    } | null;
    monthlyTotal: number;
    activeServices: string[];
}

export interface AccountHealth {
    totalMonthlyCost: number;
    outstandingBalance: number;
    activePropertiesCount: number;
    activeServicesCount: number;
    criticalAlerts: ServiceAlert[];
}

// --- MOCK DATA ---
const MOCK_PROPERTIES: Property[] = [
    { id: 'P1', address: '121 Elsia Dr', serviceType: 'personal', inHOA: false, hasGateCode: false, notificationPreferences: { pickupReminders: { email: true, sms: false }, scheduleChanges: { email: true, sms: true }, driverUpdates: { email: false, sms: true } } },
    { id: 'P2', address: '7258 Baldwin Ridge Rd', serviceType: 'short-term', inHOA: true, communityName: 'Lake View Estates', hasGateCode: true, gateCode: '54321', notificationPreferences: { pickupReminders: { email: true, sms: false }, scheduleChanges: { email: true, sms: false }, driverUpdates: { email: false, sms: false } } },
];

let MOCK_USER: User = {
    firstName: 'Jane',
    lastName: 'Doe',
    phone: '(555) 123-4567',
    email: 'jane.doe@example.com',
    password: 'password123',
    memberSince: '2022-01-15',
    properties: MOCK_PROPERTIES,
};

const MOCK_SERVICE_ALERTS: ServiceAlert[] = [
    { id: 'alert1', message: "Holiday Schedule: All pickups delayed by one day.", type: 'info' }
];

// --- API FACADE ---

const simulateApiCall = <T,>(data: T, delay = 300): Promise<T> => 
  new Promise(resolve => setTimeout(() => resolve(JSON.parse(JSON.stringify(data))), delay));

export const getUser = () => simulateApiCall(MOCK_USER);

export const getInvoices = () => stripeService.listInvoices();
export const getSubscriptions = () => stripeService.listSubscriptions();
export const getPaymentMethods = () => stripeService.listPaymentMethods();
export const getServiceAlerts = () => simulateApiCall(MOCK_SERVICE_ALERTS);

/**
 * The "Better Way": A single call that prepares the entire dashboard state.
 * This prevents UI components from doing heavy lifting or complex hook logic.
 */
export const getDashboardState = async (selectedPropertyId: string | 'all') => {
    const [user, subscriptions, invoices, alerts] = await Promise.all([
        getUser(),
        getSubscriptions(),
        getInvoices(),
        getServiceAlerts()
    ]);

    const targetProperties = selectedPropertyId === 'all' 
        ? user.properties 
        : user.properties.filter(p => p.id === selectedPropertyId);

    const states: PropertyState[] = targetProperties.map(prop => {
        const propSubs = subscriptions.filter(s => s.propertyId === prop.id && s.status === 'active');
        const isPaused = subscriptions.some(s => s.propertyId === prop.id && s.status === 'paused');
        
        // Mocking lifecycle logic
        const todayStr = new Date().toISOString().split('T')[0];
        const isToday = prop.id === 'P1'; // Mock P1 as being today
        
        return {
            property: prop,
            nextPickup: {
                date: isToday ? todayStr : '2025-08-01',
                label: isToday ? 'TODAY' : 'Friday, Aug 1',
                isToday,
                status: isPaused ? 'paused' : (isToday ? 'in-progress' : 'upcoming'),
                eta: isToday ? '11:30 AM' : undefined
            },
            monthlyTotal: propSubs.reduce((acc, s) => acc + s.totalPrice, 0),
            activeServices: propSubs.map(s => s.serviceName)
        };
    });

    const health: AccountHealth = {
        totalMonthlyCost: subscriptions.filter(s => s.status === 'active').reduce((acc, s) => acc + s.totalPrice, 0),
        outstandingBalance: invoices.filter(i => i.status !== 'Paid').reduce((acc, i) => acc + i.amount, 0),
        activePropertiesCount: user.properties.length,
        activeServicesCount: subscriptions.filter(s => s.status === 'active').length,
        criticalAlerts: alerts
    };

    return { states, health };
};

// ... keep existing auth/special-pickup logic below ...
export const login = (email: string, password: string): Promise<User> => {
    return simulateApiCall(MOCK_USER);
};
export const logout = () => simulateApiCall({ success: true });
export const register = (info: any): Promise<User> => simulateApiCall(MOCK_USER);
export const addProperty = (info: any) => {
    const newP: Property = { ...MOCK_PROPERTIES[0], id: `P${Date.now()}`, address: info.street };
    MOCK_USER.properties.push(newP);
    return simulateApiCall(newP);
};
export const updatePropertyDetails = (id: string, details: any) => simulateApiCall(MOCK_PROPERTIES[0]);
export const updateUserProfile = (info: any) => simulateApiCall(MOCK_USER);
export const updateUserPassword = (info: any) => simulateApiCall({ success: true });

// Fix: Corrected getServices to include metadata and proper types
export const getServices = async (): Promise<Service[]> => {
    const prods = await stripeService.listProducts();
    return prods.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.default_price.unit_amount / 100,
        setupFee: p.metadata.setup_fee ? Number(p.metadata.setup_fee) / 100 : undefined,
        stickerFee: p.metadata.sticker_fee ? Number(p.metadata.sticker_fee) / 100 : undefined,
        frequency: 'Monthly' as 'Monthly',
        category: p.metadata.category as Service['category'],
        icon: React.createElement(TrashIcon)
    }));
};

export const payInvoice = stripeService.payInvoice;

// Fix: Exporting missing members requested by components

export const subscribeToNewService = (service: Service, propertyId: string, quantity: number, useSticker: boolean) => {
    return stripeService.createSubscription(service, propertyId, 'pm_1', quantity);
};

export const changeServiceQuantity = async (service: Service, propertyId: string, change: 'increment' | 'decrement') => {
    const subs = await stripeService.listSubscriptions();
    const existing = subs.find(s => s.propertyId === propertyId && s.serviceId === service.id && s.status === 'active');
    if (existing) {
        const newQty = change === 'increment' ? existing.quantity + 1 : existing.quantity - 1;
        return stripeService.changeSubscriptionQuantity(existing.id, newQty);
    } else if (change === 'increment') {
        return stripeService.createSubscription(service, propertyId, 'pm_1', 1);
    }
};

export const updateSubscriptionPaymentMethod = stripeService.updateSubscriptionPaymentMethod;
export const cancelSubscription = stripeService.cancelSubscription;
export const addPaymentMethod = stripeService.attachPaymentMethod;
export const deletePaymentMethod = stripeService.detachPaymentMethod;
export const setPrimaryPaymentMethod = stripeService.updateCustomerDefaultPaymentMethod;

export const updateSubscriptionsForProperty = async (propertyId: string, paymentMethodId: string) => {
    const subs = await stripeService.listSubscriptions();
    const targets = subs.filter(s => s.propertyId === propertyId && s.status === 'active');
    await Promise.all(targets.map(t => stripeService.updateSubscriptionPaymentMethod(t.id, paymentMethodId)));
};

export const updateAllUserSubscriptions = async (paymentMethodId: string) => {
    const subs = await stripeService.listSubscriptions();
    const targets = subs.filter(s => s.status === 'active');
    await Promise.all(targets.map(t => stripeService.updateSubscriptionPaymentMethod(t.id, paymentMethodId)));
};

export const updateNotificationPreferences = (propertyId: string, prefs: NotificationPreferences) => {
    const p = MOCK_PROPERTIES.find(prop => prop.id === propertyId);
    if (p) p.notificationPreferences = prefs;
    return simulateApiCall({ success: true });
};

export const getSpecialPickupServices = (): Promise<SpecialPickupService[]> => simulateApiCall([
    { id: 'sp1', name: 'Bulk Trash Pick-up', description: 'Large items like furniture or mattresses.', price: 75.00, icon: React.createElement(ArchiveBoxIcon, { className: 'w-12 h-12 text-primary'}) },
    { id: 'sp2', name: 'White Goods (Appliance)', description: 'Refrigerators, stoves, washers, dryers.', price: 50.00, icon: React.createElement(BuildingOffice2Icon, { className: 'w-12 h-12 text-primary'}) },
    { id: 'sp3', name: 'E-Waste', description: 'Computers, TVs, and other electronics.', price: 40.00, icon: React.createElement(SparklesIcon, { className: 'w-12 h-12 text-primary'}) },
]);

let MOCK_SPECIAL_REQUESTS: SpecialPickupRequest[] = [];
export const getSpecialPickupRequests = () => simulateApiCall(MOCK_SPECIAL_REQUESTS);
export const requestSpecialPickup = async (serviceId: string, propertyId: string, date: string) => {
    const services = await getSpecialPickupServices();
    const service = services.find(s => s.id === serviceId);
    if (!service) throw new Error("Service not found");
    const newReq: SpecialPickupRequest = {
        id: `sr_${Date.now()}`,
        propertyId,
        serviceId,
        serviceName: service.name,
        date,
        status: 'Scheduled',
        price: service.price
    };
    MOCK_SPECIAL_REQUESTS.push(newReq);
    await stripeService.createInvoice(propertyId, service.price, `Special Pickup: ${service.name}`);
    return simulateApiCall(newReq);
};

export const pauseSubscriptionsForProperty = async (propertyId: string, until: string) => {
    const subs = await stripeService.listSubscriptions();
    subs.filter(s => s.propertyId === propertyId && s.status === 'active').forEach(s => {
        s.status = 'paused';
        s.pausedUntil = until;
    });
    return simulateApiCall({ success: true });
};

export const resumeSubscriptionsForProperty = async (propertyId: string) => {
    const subs = await stripeService.listSubscriptions();
    subs.filter(s => s.propertyId === propertyId && s.status === 'paused').forEach(s => {
        s.status = 'active';
        delete s.pausedUntil;
    });
    return simulateApiCall({ success: true });
};

export const reportMissedPickup = (propertyId: string, date: string, notes: string) => simulateApiCall({ success: true });
