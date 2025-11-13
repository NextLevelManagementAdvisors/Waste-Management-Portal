

import React from 'react';
import { Service, User, Property, NotificationPreferences, SpecialPickupService, SpecialPickupRequest, ServiceAlert, Subscription, PaymentMethod, NewPropertyInfo, RegistrationInfo, UpdatePropertyInfo, UpdateProfileInfo, UpdatePasswordInfo } from '../types';
import { TrashIcon, ArrowPathIcon, SunIcon, TruckIcon, ArchiveBoxIcon, SparklesIcon, ShoppingBagIcon } from '../components/Icons';
import * as stripeService from './stripeService';

// --- NON-STRIPE MOCK DATA ---

const MOCK_PROPERTIES: Property[] = [
    { id: 'P1', address: '121 Elsia Dr', serviceType: 'personal', inHOA: false, hasGateCode: false, notificationPreferences: { pickupReminders: { email: true, sms: false }, scheduleChanges: { email: true, sms: true }, driverUpdates: { email: false, sms: true } } },
    { id: 'P2', address: '7258 Baldwin Ridge Rd', serviceType: 'short-term', inHOA: true, communityName: 'Lake View Estates', hasGateCode: true, gateCode: '54321', notificationPreferences: { pickupReminders: { email: true, sms: false }, scheduleChanges: { email: true, sms: false }, driverUpdates: { email: false, sms: false } } },
    { id: 'P3', address: '804 W 13th St', serviceType: 'rental', inHOA: false, hasGateCode: false, notificationPreferences: { pickupReminders: { email: false, sms: false }, scheduleChanges: { email: true, sms: false }, driverUpdates: { email: false, sms: false } } },
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

let MOCK_SPECIAL_PICKUPS: SpecialPickupRequest[] = [
    { id: 'SPR1', propertyId: 'P1', serviceId: 'sp-bulk', serviceName: 'Bulk Item Pickup', date: '2024-07-20', status: 'Completed', price: 75.00 },
];

const MOCK_SERVICE_ALERTS: ServiceAlert[] = [
    { id: 'alert1', message: "Holiday Schedule: All pickups will be delayed by one day next week due to the public holiday.", type: 'info' }
];

const MOCK_SPECIAL_SERVICES: SpecialPickupService[] = [
    { id: 'sp-bulk', name: 'Bulk Item Pickup', description: 'For furniture, appliances, or mattresses. Up to 3 items.', price: 75.00, icon: React.createElement(ArchiveBoxIcon, { className: "w-8 h-8 text-primary" }) },
    { id: 'sp-yard', name: 'Yard Waste Collection', description: 'Up to 10 bags of leaves, branches, or other landscaping debris.', price: 50.00, icon: React.createElement(SparklesIcon, { className: "w-8 h-8 text-green-600" }) },
    { id: 'sp-bags', name: 'Extra Bag Collection', description: 'Need more space this week? We can take up to 5 extra trash bags.', price: 25.00, icon: React.createElement(ShoppingBagIcon, { className: "w-8 h-8 text-yellow-600" }) },
];


// --- API FACADE ---
// This service acts as a single interface for the frontend.
// It fetches data from various sources (user data, Stripe, etc.) and exposes them to the components.

const simulateApiCall = <T,>(data: T, delay = 500): Promise<T> => 
  new Promise(resolve => setTimeout(() => resolve(deepClone(data)), delay));

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

const getIconFromName = (iconName: string): React.ReactNode => {
    switch (iconName) {
        case 'TrashIcon':
            return React.createElement(TrashIcon, { className: "w-8 h-8 text-primary" });
        case 'ArrowPathIcon':
            return React.createElement(ArrowPathIcon, { className: "w-8 h-8 text-accent" });
        case 'TruckIcon':
            return React.createElement(TruckIcon, { className: "w-8 h-8 text-yellow-500" });
        case 'SunIcon':
            return React.createElement(SunIcon, { className: "w-8 h-8 text-yellow-500" });
        default:
            return React.createElement(TrashIcon, { className: "w-8 h-8 text-gray-400" });
    }
};

// --- Authentication ---
export const login = (email: string, password: string): Promise<Omit<User, 'password'>> => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            if (email.toLowerCase() === MOCK_USER.email.toLowerCase() && password === MOCK_USER.password) {
                const { password, ...userWithoutPassword } = MOCK_USER;
                resolve(userWithoutPassword);
            } else {
                reject(new Error("Invalid email or password."));
            }
        }, 500);
    });
};

export const register = (registrationInfo: RegistrationInfo): Promise<Omit<User, 'password'>> => {
    return new Promise((resolve) => {
        setTimeout(() => {
            // In a real app, this would create a new user. Here we just update the mock user.
            const newProperty: Property = {
                id: `P${Date.now()}`,
                address: `${registrationInfo.street}, ${registrationInfo.city}`,
                serviceType: registrationInfo.serviceType,
                inHOA: registrationInfo.inHOA === 'yes',
                communityName: registrationInfo.inHOA === 'yes' ? registrationInfo.communityName : undefined,
                hasGateCode: registrationInfo.hasGateCode === 'yes',
                gateCode: registrationInfo.hasGateCode === 'yes' ? registrationInfo.gateCode : undefined,
                notificationPreferences: {
                     pickupReminders: { email: true, sms: false },
                     scheduleChanges: { email: true, sms: false },
                     driverUpdates: { email: false, sms: false }
                }
            };
            
            MOCK_USER = {
                firstName: registrationInfo.firstName,
                lastName: registrationInfo.lastName,
                phone: registrationInfo.phone,
                email: registrationInfo.email,
                password: registrationInfo.password,
                memberSince: new Date().toISOString().split('T')[0],
                properties: [newProperty],
            };
            const { password, ...userWithoutPassword } = MOCK_USER;
            resolve(userWithoutPassword);
        }, 500);
    });
};


export const logout = () => simulateApiCall({ success: true }, 100);

// --- User & Service Data ---
export const getUser = () => {
    const { password, ...userWithoutPassword } = MOCK_USER;
    return simulateApiCall(userWithoutPassword);
};

export const updateUserProfile = (profileInfo: UpdateProfileInfo) => {
    MOCK_USER.firstName = profileInfo.firstName;
    MOCK_USER.lastName = profileInfo.lastName;
    MOCK_USER.email = profileInfo.email;
    MOCK_USER.phone = profileInfo.phone;
    const { password, ...userWithoutPassword } = MOCK_USER;
    return simulateApiCall(userWithoutPassword);
};

export const updateUserPassword = (passwordInfo: UpdatePasswordInfo) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            if (passwordInfo.currentPassword !== MOCK_USER.password) {
                reject(new Error("Current password does not match."));
            } else {
                MOCK_USER.password = passwordInfo.newPassword;
                resolve({ success: true });
            }
        }, 500);
    });
};


export const addProperty = (info: NewPropertyInfo) => {
    const newProperty: Property = {
        id: `P${Date.now()}`,
        address: `${info.street}, ${info.city}`,
        serviceType: info.serviceType,
        inHOA: info.inHOA === 'yes',
        communityName: info.inHOA === 'yes' ? info.communityName : undefined,
        hasGateCode: info.hasGateCode === 'yes',
        gateCode: info.hasGateCode === 'yes' ? info.gateCode : undefined,
        notificationPreferences: {
             pickupReminders: { email: true, sms: false },
             scheduleChanges: { email: true, sms: false },
             driverUpdates: { email: false, sms: false }
        }
    };
    MOCK_USER.properties.push(newProperty);
    return simulateApiCall(newProperty);
};

export const updatePropertyDetails = (propertyId: string, details: UpdatePropertyInfo) => {
    const propertyToUpdate = MOCK_USER.properties.find(p => p.id === propertyId);
    if (propertyToUpdate) {
        propertyToUpdate.serviceType = details.serviceType;
        propertyToUpdate.inHOA = details.inHOA === 'yes';
        propertyToUpdate.communityName = details.inHOA === 'yes' ? details.communityName : undefined;
        propertyToUpdate.hasGateCode = details.hasGateCode === 'yes';
        propertyToUpdate.gateCode = details.hasGateCode === 'yes' ? details.gateCode : undefined;
        return simulateApiCall(propertyToUpdate);
    }
    return Promise.reject(new Error("Property not found"));
};


export const getServices = async (): Promise<Service[]> => {
    const stripeProducts = await stripeService.listProducts();

    return stripeProducts.map(p => {
        const frequency: Service['frequency'] = p.default_price.recurring.interval === 'month' ? 'Monthly' : 'Weekly';
        
        return {
            id: p.id,
            name: p.name,
            description: p.description,
            price: p.default_price.unit_amount / 100,
            frequency: frequency,
            icon: getIconFromName(p.metadata.icon_name),
            category: p.metadata.category as Service['category'],
        };
    });
};


// --- Subscriptions (with Business Logic) ---
export const getSubscriptions = () => stripeService.listSubscriptions();

export const subscribeToNewService = async (service: Service, propertyId: string, quantity: number = 1) => {
    const methods = await stripeService.listPaymentMethods();
    const primaryMethod = methods.find(p => p.isPrimary) || methods[0];
    if (!primaryMethod) {
        throw new Error("Cannot subscribe without a payment method on file.");
    }
    
    // If adding a base service can (trash or recycling), ensure the base fee is also active.
    if (service.category === 'base_service') {
        const allSubs = await stripeService.listSubscriptions();
        const hasBaseFee = allSubs.some(s => s.propertyId === propertyId && s.status === 'active' && s.serviceId === 'prod_BASE_FEE');

        if (!hasBaseFee) {
            const allServices = await getServices();
            const baseFeeService = allServices.find(s => s.id === 'prod_BASE_FEE');
            if (baseFeeService) {
                // Subscribe to base fee first
                await stripeService.createSubscription(baseFeeService, propertyId, primaryMethod.id, 1);
            }
        }
    }

    return stripeService.createSubscription(service, propertyId, primaryMethod.id, quantity);
};

export const changeServiceQuantity = async (service: Service, propertyId: string, change: 'increment' | 'decrement') => {
    const allSubs = await stripeService.listSubscriptions();
    const existingSub = allSubs.find(s => s.propertyId === propertyId && s.serviceId === service.id && s.status === 'active');

    if (change === 'increment') {
        if (existingSub) {
            return stripeService.changeSubscriptionQuantity(existingSub.id, existingSub.quantity + 1);
        } else {
            // If it's a new subscription, create it with quantity 1
            return subscribeToNewService(service, propertyId, 1);
        }
    } else { // decrement
        if (existingSub && existingSub.quantity > 0) {
            const newQuantity = existingSub.quantity - 1;
            if (newQuantity === 0) {
                // If quantity becomes zero, trigger the full cancellation logic in this service.
                return cancelSubscription(existingSub.id);
            } else {
                 return stripeService.changeSubscriptionQuantity(existingSub.id, newQuantity);
            }
        }
        // If sub doesn't exist or quantity is 0, do nothing.
        return Promise.resolve(null);
    }
};

export const cancelSubscription = async (subscriptionId: string) => {
    const allSubs = await stripeService.listSubscriptions();
    const subToCancel = allSubs.find(s => s.id === subscriptionId);

    if (!subToCancel) {
        throw new Error("Subscription not found.");
    }

    const allServices = await getServices();
    const service = allServices.find(s => s.id === subToCancel.serviceId);
    
    // Business Logic: If canceling the base fee, cancel everything else for that property.
    if (subToCancel.serviceId === 'prod_BASE_FEE') {
        const otherPropertySubscriptions = allSubs.filter(sub => 
            sub.propertyId === subToCancel.propertyId &&
            sub.id !== subToCancel.id &&
            sub.status === 'active'
        );
        
        const cancellationPromises = otherPropertySubscriptions.map(sub => stripeService.cancelSubscription(sub.id));
        await Promise.all(cancellationPromises);
    }
    // Business Logic: If canceling the last base service can (trash or recycling), also cancel all upgrades and the base fee.
    else if (service?.category === 'base_service') {
        const otherBaseServices = allSubs.filter(sub => {
            const otherService = allServices.find(s => s.id === sub.serviceId);
            return sub.propertyId === subToCancel.propertyId &&
                sub.id !== subToCancel.id &&
                sub.status === 'active' &&
                otherService?.category === 'base_service';
        });

        if (otherBaseServices.length === 0) {
            // It's the last base can. Cancel related services.
            const relatedCancellations = allSubs
                .filter(sub => sub.propertyId === subToCancel.propertyId && sub.status === 'active' && (
                    allServices.find(s => s.id === sub.serviceId)?.category === 'upgrade' ||
                    sub.serviceId === 'prod_BASE_FEE'
                ))
                .map(sub => stripeService.cancelSubscription(sub.id));
            
            await Promise.all(relatedCancellations);
        }
    }

    return stripeService.cancelSubscription(subToCancel.id);
};

// --- Payment & Billing (delegated to Stripe Service) ---
export const getInvoices = () => stripeService.listInvoices();
export const payInvoice = (invoiceId: string, paymentMethodId: string) => stripeService.payInvoice(invoiceId, paymentMethodId);
export const getPaymentMethods = () => stripeService.listPaymentMethods();
export const addPaymentMethod = (method: Omit<PaymentMethod, 'id' | 'isPrimary'>) => stripeService.attachPaymentMethod(method);
export const deletePaymentMethod = (id: string) => stripeService.detachPaymentMethod(id);
export const setPrimaryPaymentMethod = (id: string) => stripeService.updateCustomerDefaultPaymentMethod(id);

export const updateSubscriptionPaymentMethod = (subscriptionId: string, paymentMethodId: string) => {
    return stripeService.updateSubscriptionPaymentMethod(subscriptionId, paymentMethodId);
};

export const updateSubscriptionsForProperty = async (propertyId: string, paymentMethodId: string) => {
    const subs = await stripeService.listSubscriptions();
    const propertySubs = subs.filter(sub => sub.propertyId === propertyId && sub.status === 'active');
    const updatePromises = propertySubs.map(sub => stripeService.updateSubscriptionPaymentMethod(sub.id, paymentMethodId));
    return Promise.all(updatePromises);
};

export const updateAllUserSubscriptions = async (paymentMethodId: string) => {
    const subs = await stripeService.listSubscriptions();
    const activeSubs = subs.filter(sub => sub.status === 'active');
    const updatePromises = activeSubs.map(sub => stripeService.updateSubscriptionPaymentMethod(sub.id, paymentMethodId));
    return Promise.all(updatePromises);
};


// --- Other Features ---
export const updateNotificationPreferences = (propertyId: string, preferences: NotificationPreferences) => {
    const propertyToUpdate = MOCK_USER.properties.find(p => p.id === propertyId);
    if (propertyToUpdate) {
        propertyToUpdate.notificationPreferences = preferences;
        return simulateApiCall(propertyToUpdate);
    }
    return Promise.reject(new Error("Property not found"));
};

export const getSpecialPickupServices = () => simulateApiCall(MOCK_SPECIAL_SERVICES);
export const getSpecialPickupRequests = () => simulateApiCall(MOCK_SPECIAL_PICKUPS);

export const requestSpecialPickup = async (serviceId: string, propertyId: string, date: string) => {
    const service = MOCK_SPECIAL_SERVICES.find(s => s.id === serviceId);
    if (!service) {
        throw new Error("Special service not found.");
    }

    const newRequest: SpecialPickupRequest = {
        id: `SPR${Date.now()}`,
        propertyId,
        serviceId,
        serviceName: service.name,
        date,
        status: 'Scheduled',
        price: service.price
    };
    MOCK_SPECIAL_PICKUPS.push(newRequest);

    // Create a corresponding invoice in Stripe
    await stripeService.createInvoice(propertyId, service.price, service.name);

    return simulateApiCall(newRequest);
};

export const pauseSubscriptionsForProperty = async (propertyId: string, resumeDate: string) => {
    const subs = await stripeService.listSubscriptions();
    // In a real Stripe integration, you would iterate through and pause each subscription.
    // For this mock, we simply update the status in our mock database.
    const propertySubs = subs.filter(sub => sub.propertyId === propertyId && sub.status === 'active');
    propertySubs.forEach(sub => {
        sub.status = 'paused';
        sub.pausedUntil = resumeDate;
    });
    return simulateApiCall(propertySubs);
};

export const resumeSubscriptionsForProperty = async (propertyId: string) => {
    const subs = await stripeService.listSubscriptions();
    // In a real Stripe integration, you would resume each subscription.
    const propertySubs = subs.filter(sub => sub.propertyId === propertyId && sub.status === 'paused');
    propertySubs.forEach(sub => {
        sub.status = 'active';
        delete sub.pausedUntil;
    });
    return simulateApiCall(propertySubs);
};

export const reportMissedPickup = (propertyId: string, date: string, notes: string) => {
    console.log(`Missed pickup reported for property ${propertyId} on ${date}. Notes: ${notes}`);
    return simulateApiCall({ success: true, message: 'Your report has been submitted.' });
};

export const getServiceAlerts = () => simulateApiCall(MOCK_SERVICE_ALERTS, 300);