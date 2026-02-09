
import React from 'react';
import { Service, User, Property, NotificationPreferences, SpecialPickupService, SpecialPickupRequest, ServiceAlert, Subscription, PaymentMethod, NewPropertyInfo, RegistrationInfo, UpdatePropertyInfo, UpdateProfileInfo, UpdatePasswordInfo, ReferralInfo } from '../types.ts';
import { TrashIcon, ArrowPathIcon, SunIcon, TruckIcon, ArchiveBoxIcon, SparklesIcon, BuildingOffice2Icon, WrenchScrewdriverIcon } from '../components/Icons.tsx';
import * as stripeService from './stripeService.ts';
import * as optimoRouteService from './optimoRouteService.ts';

// --- TYPES FOR CONSOLIDATED DATA ---
export interface PropertyState {
    property: Property;
    nextPickup: {
        date: string;
        label: string;
        isToday: boolean;
        status: 'upcoming' | 'in-progress' | 'paused';
        eta?: string;
    } | null;
    lastPickup: {
        date: string;
        label: string;
        status: 'completed';
        feedbackSubmitted: boolean;
    } | null;
    collectionIntent: 'out' | 'skip' | null;
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

// --- MOCK DATA STORE ---
let MOCK_COLLECTION_INTENTS: Record<string, { intent: 'out' | 'skip', date: string }> = {};
let MOCK_DRIVER_FEEDBACK: { propertyId: string; pickupDate: string; tip?: number; note?: string }[] = [];

// --- MOCK DATA ---
const MOCK_PROPERTIES: Property[] = [
    { id: 'P1', address: '121 Elsia Dr', serviceType: 'personal', inHOA: false, hasGateCode: false, notes: 'Beware of dog in the backyard. Cans are located on the left side of the garage.', notificationPreferences: { pickupReminders: { email: true, sms: false }, scheduleChanges: { email: true, sms: true }, driverUpdates: { email: false, sms: true } } },
    { id: 'P2', address: '7258 Baldwin Ridge Rd', serviceType: 'short-term', inHOA: true, communityName: 'Lake View Estates', hasGateCode: true, gateCode: '54321', notes: 'Short-term rental. Please ensure lids are fully closed.', notificationPreferences: { pickupReminders: { email: true, sms: false }, scheduleChanges: { email: true, sms: false }, driverUpdates: { email: false, sms: false } } },
    { id: 'P3', address: '804 W 13th St', serviceType: 'personal', inHOA: false, hasGateCode: false, notes: 'Cans on curb.', notificationPreferences: { pickupReminders: { email: true, sms: true }, scheduleChanges: { email: true, sms: false }, driverUpdates: { email: false, sms: false } } },
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

const MOCK_REFERRAL_INFO: ReferralInfo = {
    referralCode: 'JANE-D-8432',
    shareLink: 'https://zipadee.com/join?ref=JANE-D-8432',
    totalRewards: 20,
    referrals: [
        { id: 'ref1', name: 'John Smith', status: 'completed', date: '2025-06-20' },
        { id: 'ref2', name: 'Emily White', status: 'completed', date: '2025-05-15' },
        { id: 'ref3', name: 'Michael Brown', status: 'pending', date: '2025-07-02' },
        { id: 'ref4', name: 'Sarah Wilson', status: 'pending', date: '2025-07-10' },
    ]
};

// --- API FACADE ---

/**
 * Safer API simulation that avoids serialization issues.
 */
function simulateApiCall<T>(data: T, delay: number = 300): Promise<T> {
  return new Promise(resolve => setTimeout(() => resolve(data), delay));
}

export const getUser = () => simulateApiCall(JSON.parse(JSON.stringify(MOCK_USER)));

export const getInvoices = () => stripeService.listInvoices();
export const getSubscriptions = () => stripeService.listSubscriptions();
export const getPaymentMethods = () => stripeService.listPaymentMethods();
export const getServiceAlerts = () => simulateApiCall(MOCK_SERVICE_ALERTS);

/**
 * The "Better Way": A single call that prepares the entire dashboard state.
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
        
        let state: Omit<PropertyState, 'property' | 'monthlyTotal' | 'activeServices'>;
        
        const today = new Date();
        const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);

        // Define pickup dates for simulation
        const p1PickupDate = today.toISOString().split('T')[0];
        const p2PickupDate = new Date(new Date().setDate(today.getDate() - 1)).toISOString().split('T')[0]; // Yesterday
        const p3PickupDate = tomorrow.toISOString().split('T')[0];
        
        const feedback = MOCK_DRIVER_FEEDBACK.find(f => f.propertyId === prop.id && f.pickupDate === p2PickupDate);

        switch (prop.id) {
            case 'P1': // In-progress pickup
                state = {
                    nextPickup: { date: p1PickupDate, label: 'TODAY', isToday: true, status: isPaused ? 'paused' : 'in-progress', eta: '11:30 AM' },
                    lastPickup: null,
                    collectionIntent: null
                };
                break;
            case 'P2': // Completed pickup
                state = {
                    nextPickup: null,
                    lastPickup: { date: p2PickupDate, label: 'Yesterday', status: 'completed', feedbackSubmitted: !!feedback },
                    collectionIntent: null
                };
                break;
            case 'P3': // Upcoming pickup
            default:
                const intent = MOCK_COLLECTION_INTENTS[prop.id]?.date === p3PickupDate ? MOCK_COLLECTION_INTENTS[prop.id].intent : null;
                state = {
                    nextPickup: { date: p3PickupDate, label: 'Tomorrow', isToday: false, status: isPaused ? 'paused' : 'upcoming' },
                    lastPickup: null,
                    collectionIntent: intent
                };
                break;
        }

        return {
            ...state,
            property: prop,
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

export const login = (email: string, password: string): Promise<User> => {
    return simulateApiCall(MOCK_USER);
};
export const logout = () => simulateApiCall({ success: true });
export const register = (info: RegistrationInfo): Promise<User> => simulateApiCall(MOCK_USER);
export const addProperty = (info: NewPropertyInfo) => {
    const newP: Property = { 
        id: `P${Date.now()}`, 
        address: info.street,
        serviceType: info.serviceType,
        inHOA: info.inHOA === 'yes',
        communityName: info.communityName,
        hasGateCode: info.hasGateCode === 'yes',
        gateCode: info.gateCode,
        notes: info.notes,
        notificationPreferences: {
            pickupReminders: { email: true, sms: true },
            scheduleChanges: { email: true, sms: true },
            driverUpdates: { email: true, sms: true }
        }
    };
    MOCK_USER.properties.push(newP);
    return simulateApiCall(newP);
};
export const updatePropertyDetails = (id: string, details: UpdatePropertyInfo) => {
    const p = MOCK_USER.properties.find(prop => prop.id === id);
    if (p) {
        p.serviceType = details.serviceType;
        p.inHOA = details.inHOA === 'yes';
        p.communityName = details.communityName;
        p.hasGateCode = details.hasGateCode === 'yes';
        p.gateCode = details.gateCode;
        p.notes = details.notes;
        return simulateApiCall(p);
    }
    throw new Error("Property not found");
};
export const updateUserProfile = (info: UpdateProfileInfo) => simulateApiCall(MOCK_USER);
export const updateUserPassword = (info: UpdatePasswordInfo) => simulateApiCall({ success: true });

export const getServices = async (): Promise<Service[]> => {
    const prods = await stripeService.listProducts();
    return prods.map(p => {
        let icon: React.ReactNode = React.createElement(TrashIcon);
        if (p.metadata.icon_name === 'ArrowPathIcon') icon = React.createElement(ArrowPathIcon);
        if (p.metadata.icon_name === 'SunIcon') icon = React.createElement(SunIcon);
        if (p.metadata.icon_name === 'BuildingOffice2Icon') icon = React.createElement(BuildingOffice2Icon);
        
        return {
            id: p.id,
            name: p.name,
            description: p.description,
            price: p.default_price.unit_amount / 100,
            setupFee: p.metadata.setup_fee ? Number(p.metadata.setup_fee) / 100 : undefined,
            stickerFee: p.metadata.sticker_fee ? Number(p.metadata.sticker_fee) / 100 : undefined,
            frequency: 'Monthly' as 'Monthly',
            category: p.metadata.category as Service['category'],
            icon
        };
    });
};

export const payInvoice = stripeService.payInvoice;

export const subscribeToNewService = async (service: Service, propertyId: string, quantity: number, useSticker: boolean) => {
    const property = MOCK_USER.properties.find(p => p.id === propertyId);
    if (!property) throw new Error("Property not found for creating subscription.");

    const newSub = await stripeService.createSubscription(service, propertyId, 'pm_1', quantity, useSticker);

    // If a new physical can is being rented, create a delivery task.
    if (service.category === 'base_service' && !useSticker) {
        await optimoRouteService.createDeliveryTask(property.address, service.name, quantity);
    }
    
    return newSub;
};

export const changeServiceQuantity = async (service: Service, propertyId: string, change: 'increment' | 'decrement', useSticker?: boolean) => {
    const property = MOCK_USER.properties.find(p => p.id === propertyId);
    if (!property) throw new Error("Property not found for changing quantity.");

    const subs = await stripeService.listSubscriptions();
    const existing = subs.find(s => s.propertyId === propertyId && s.serviceId === service.id && s.status === 'active');
    
    if (existing) {
        const newQty = change === 'increment' ? existing.quantity + 1 : existing.quantity - 1;
        const changeAmount = newQty - existing.quantity;

        const updatedSub = await stripeService.changeSubscriptionQuantity(existing.id, newQty);

        // If it's a rental can and quantity changed, create a task.
        if (service.category === 'base_service' && existing.equipmentType === 'rental') {
            if (changeAmount > 0) {
                await optimoRouteService.createDeliveryTask(property.address, service.name, changeAmount);
            } else if (changeAmount < 0) {
                await optimoRouteService.createPickupTask(property.address, service.name, Math.abs(changeAmount));
            }
        }
        return updatedSub;

    } else if (change === 'increment') {
        // This is creating a new subscription
        const newSub = await stripeService.createSubscription(service, propertyId, 'pm_1', 1, useSticker ?? false);
        // If a new physical can is being rented, create a delivery task.
        if (service.category === 'base_service' && !(useSticker ?? false)) {
            await optimoRouteService.createDeliveryTask(property.address, service.name, 1);
        }
        return newSub;
    }
};

export const updateSubscriptionPaymentMethod = stripeService.updateSubscriptionPaymentMethod;

export const cancelSubscription = async (subscriptionId: string) => {
    const allSubs = await stripeService.listSubscriptions();
    const subToCancel = allSubs.find(s => s.id === subscriptionId);
    
    if (!subToCancel) throw new Error("Subscription to cancel not found.");

    const service = (await getServices()).find(s => s.id === subToCancel.serviceId);
    const property = MOCK_USER.properties.find(p => p.id === subToCancel.propertyId);

    const result = await stripeService.cancelSubscription(subscriptionId);

    if (property && service?.category === 'base_service' && subToCancel.equipmentType === 'rental' && subToCancel.quantity > 0) {
        await optimoRouteService.createPickupTask(property.address, subToCancel.serviceName, subToCancel.quantity);
    }
    
    return result;
};

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
    const p = MOCK_USER.properties.find(prop => prop.id === propertyId);
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

export const transferPropertyOwnership = (propertyId: string, newOwner: { firstName: string, lastName: string, email: string }) => {
    console.log(`[API MOCK] Initiating transfer for property ${propertyId}`);
    
    const property = MOCK_USER.properties.find(p => p.id === propertyId);
    if (property) {
        property.transferStatus = 'pending';
        property.pendingOwner = newOwner;
    }
    
    return simulateApiCall({ success: true, message: 'Transfer invitation sent.' }, 1000);
};

export const sendTransferReminder = (propertyId: string) => {
    const property = MOCK_USER.properties.find(p => p.id === propertyId);
    if (property && property.transferStatus === 'pending' && property.pendingOwner) {
        console.log(`[API MOCK] Reminder sent to ${property.pendingOwner.email} for property ${property.address}.`);
        return simulateApiCall({ success: true });
    }
    return simulateApiCall({ success: false }, 400);
};

export const cancelAllSubscriptionsForProperty = async (propertyId: string) => {
    const property = MOCK_USER.properties.find(p => p.id === propertyId);
    if (!property) throw new Error("Property not found for cancellation.");

    const allSubs = await stripeService.listSubscriptions();
    const services = await getServices();
    
    const subsToCancel = allSubs.filter(s => s.propertyId === propertyId && (s.status === 'active' || s.status === 'paused'));
    
    // Perform the cancellation in the mock DB
    const result = await stripeService.cancelAllSubscriptionsForProperty(propertyId);

    // After cancellation, create pickup tasks for each rental can
    for (const sub of subsToCancel) {
        const service = services.find(s => s.id === sub.serviceId);
        if (service?.category === 'base_service' && sub.equipmentType === 'rental' && sub.quantity > 0) {
            await optimoRouteService.createPickupTask(property.address, sub.serviceName, sub.quantity);
        }
    }

    return result;
};

export const restartAllSubscriptionsForProperty = (propertyId: string) => {
    return stripeService.restartAllSubscriptionsForProperty(propertyId);
};

export const getReferralInfo = (): Promise<ReferralInfo> => {
    return simulateApiCall(JSON.parse(JSON.stringify(MOCK_REFERRAL_INFO)), 500);
};

// --- NEW DRIVER COMMUNICATION FUNCTIONS ---

export const setCollectionIntent = (propertyId: string, intent: 'out' | 'skip', date: string) => {
    MOCK_COLLECTION_INTENTS[propertyId] = { intent, date };
    console.log(`[API MOCK] Intent for ${propertyId} on ${date} set to: ${intent}`);
    return simulateApiCall({ success: true });
};

export const leaveDriverTip = (propertyId: string, amount: number, pickupDate: string) => {
    const existing = MOCK_DRIVER_FEEDBACK.find(f => f.propertyId === propertyId && f.pickupDate === pickupDate);
    if (existing) {
        existing.tip = (existing.tip || 0) + amount;
    } else {
        MOCK_DRIVER_FEEDBACK.push({ propertyId, pickupDate, tip: amount });
    }
    console.log(`[API MOCK] Tip of $${amount} left for ${propertyId} for pickup on ${pickupDate}.`);
    return simulateApiCall({ success: true });
};

export const leaveDriverNote = (propertyId: string, note: string, pickupDate: string) => {
    const existing = MOCK_DRIVER_FEEDBACK.find(f => f.propertyId === propertyId && f.pickupDate === pickupDate);
    if (existing) {
        existing.note = note;
    } else {
        MOCK_DRIVER_FEEDBACK.push({ propertyId, pickupDate, note });
    }
    console.log(`[API MOCK] Note left for ${propertyId} for pickup on ${pickupDate}: "${note}"`);
    return simulateApiCall({ success: true });
};