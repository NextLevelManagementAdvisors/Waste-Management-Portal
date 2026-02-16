import React from 'react';
import { Service, User, Property, NotificationPreferences, SpecialPickupService, SpecialPickupRequest, ServiceAlert, Subscription, PaymentMethod, NewPropertyInfo, RegistrationInfo, UpdatePropertyInfo, UpdateProfileInfo, UpdatePasswordInfo, ReferralInfo } from '../types.ts';
import { TrashIcon, ArrowPathIcon, SunIcon, TruckIcon, ArchiveBoxIcon, SparklesIcon, BuildingOffice2Icon, WrenchScrewdriverIcon, HomeModernIcon } from '../components/Icons.tsx';
import * as stripeService from './stripeService.ts';
import * as optimoRouteService from './optimoRouteService.ts';

const safeJson = async (res: Response, fallbackError = 'Request failed') => {
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch {
        throw new Error(res.ok ? fallbackError : `Server error (${res.status})`);
    }
};

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
        showTipPrompt?: boolean;
        driverName?: string;
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

export interface CollectionHistoryLogWithFeedback extends optimoRouteService.CollectionHistoryLog {
    feedbackSubmitted: boolean;
}

let cachedUser: User | null = null;

export const getUser = async (): Promise<User> => {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    const text = await res.text();
    let json;
    try {
        json = JSON.parse(text);
    } catch {
        throw new Error('Not authenticated');
    }
    if (!res.ok) throw new Error(json.error || 'Not authenticated');
    cachedUser = json.data;
    if (json.data.stripeCustomerId) {
        stripeService.setCustomerId(json.data.stripeCustomerId);
    }
    return json.data;
};

export const getInvoices = () => stripeService.listInvoices();
export const getSubscriptions = () => stripeService.listSubscriptions();
export const getPaymentMethods = () => stripeService.listPaymentMethods();
export const getServiceAlerts = async () => {
    try {
        const res = await fetch('/api/service-alerts', { credentials: 'include' });
        const json = await safeJson(res);
        if (res.ok && json.data) return json.data;
    } catch {}
    return [];
};

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

    const states: PropertyState[] = await Promise.all(targetProperties.map(async (prop) => {
        const propSubs = subscriptions.filter(s => s.propertyId === prop.id && s.status === 'active');
        const isPaused = subscriptions.some(s => s.propertyId === prop.id && s.status === 'paused');
        
        let state: Omit<PropertyState, 'property' | 'monthlyTotal' | 'activeServices'>;
        
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];

        const [nextPickupInfo, pastPickups, dismissedDates] = await Promise.all([
            optimoRouteService.getNextPickupInfo(prop.address),
            optimoRouteService.getPastPickups(prop.address),
            fetchTipDismissals(prop.id),
        ]);

        const lastCompletedPickup = pastPickups.find(h => h.status === 'completed');

        if (nextPickupInfo) {
            const pickupDate = nextPickupInfo.date;
            const isToday = pickupDate === todayStr;
            const pickupDateObj = new Date(pickupDate + 'T00:00:00');
            const diffDays = Math.round((pickupDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            let label = isToday ? 'TODAY' : diffDays === 1 ? 'Tomorrow' : pickupDate;
            let pickupStatus: string = isPaused ? 'paused' : isToday ? 'in-progress' : 'upcoming';

            let intent: string | null = null;
            if (!isToday) {
                try {
                    const ciRes = await fetch(`/api/collection-intent/${prop.id}/${pickupDate}`, { credentials: 'include' });
                    if (ciRes.ok) { const ciJson = await ciRes.json(); intent = ciJson.data?.intent || null; }
                } catch {}
            }

            let lastPickup = null;
            if (lastCompletedPickup) {
                let feedback: any = null;
                try {
                    const fbRes = await fetch(`/api/driver-feedback/${prop.id}/${lastCompletedPickup.date}`, { credentials: 'include' });
                    if (fbRes.ok) { const fbJson = await fbRes.json(); feedback = fbJson.data; }
                } catch {}
                const hasBeenDismissed = dismissedDates.includes(lastCompletedPickup.date);
                lastPickup = {
                    date: lastCompletedPickup.date,
                    label: 'Last Pickup',
                    status: 'completed' as const,
                    feedbackSubmitted: !!feedback,
                    showTipPrompt: !feedback && !hasBeenDismissed,
                    driverName: lastCompletedPickup.driver,
                };
            }

            state = {
                nextPickup: { date: pickupDate, label, isToday, status: pickupStatus, eta: nextPickupInfo.eta },
                lastPickup,
                collectionIntent: intent
            };
        } else if (lastCompletedPickup) {
            let feedback: any = null;
            try {
                const fbRes = await fetch(`/api/driver-feedback/${prop.id}/${lastCompletedPickup.date}`, { credentials: 'include' });
                if (fbRes.ok) { const fbJson = await fbRes.json(); feedback = fbJson.data; }
            } catch {}
            const hasBeenDismissed = dismissedDates.includes(lastCompletedPickup.date);
            state = {
                nextPickup: null,
                lastPickup: {
                    date: lastCompletedPickup.date,
                    label: 'Last Pickup',
                    status: 'completed',
                    feedbackSubmitted: !!feedback,
                    showTipPrompt: !feedback && !hasBeenDismissed,
                    driverName: lastCompletedPickup.driver,
                },
                collectionIntent: null
            };
        } else {
            state = { nextPickup: null, lastPickup: null, collectionIntent: null };
        }

        return {
            ...state,
            property: prop,
            monthlyTotal: propSubs.reduce((acc, s) => acc + s.totalPrice, 0),
            activeServices: propSubs.map(s => s.serviceName)
        };
    }));

    const health: AccountHealth = {
        totalMonthlyCost: subscriptions.filter(s => s.status === 'active').reduce((acc, s) => acc + s.totalPrice, 0),
        outstandingBalance: invoices.filter(i => i.status !== 'Paid').reduce((acc, i) => acc + i.amount, 0),
        activePropertiesCount: user.properties.length,
        activeServicesCount: subscriptions.filter(s => s.status === 'active').length,
        criticalAlerts: alerts
    };

    return { states, health };
};

const fetchTipDismissals = async (propertyId: string): Promise<string[]> => {
    try {
        const res = await fetch(`/api/tip-dismissals/${propertyId}`, { credentials: 'include' });
        if (res.ok) { const json = await res.json(); return json.data || []; }
    } catch {}
    return [];
};

export const getCollectionHistory = async (propertyId: string): Promise<CollectionHistoryLogWithFeedback[]> => {
    const property = cachedUser?.properties.find(p => p.id === propertyId);
    if (!property) return [];

    const history = await optimoRouteService.getPastPickups(property.address);

    let feedbackList: any[] = [];
    try {
        const res = await fetch(`/api/driver-feedback/${propertyId}/list`, { credentials: 'include' });
        if (res.ok) { const json = await safeJson(res); feedbackList = json.data || []; }
    } catch {}

    return history.map(log => {
        const hasFeedback = feedbackList.some((f: any) => f.pickup_date === log.date);
        return {
            ...log,
            feedbackSubmitted: hasFeedback
        };
    });
};

export const login = async (email: string, password: string): Promise<User> => {
    const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
    });
    const json = await safeJson(res, 'Login failed');
    if (!res.ok) throw new Error(json.error || 'Login failed');
    cachedUser = json.data;
    if (json.data.stripeCustomerId) {
        stripeService.setCustomerId(json.data.stripeCustomerId);
    }
    return json.data;
};
export const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    return { success: true };
};
export const register = async (info: RegistrationInfo): Promise<User> => {
    const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(info),
    });
    const json = await safeJson(res, 'Registration failed');
    if (!res.ok) throw new Error(json.error || 'Registration failed');
    cachedUser = json.data;
    if (json.data.stripeCustomerId) {
        stripeService.setCustomerId(json.data.stripeCustomerId);
    }
    return json.data;
};
export const addProperty = async (info: NewPropertyInfo): Promise<Property> => {
    if (info.referralCode) {
        console.log(`Referral code '${info.referralCode}' applied successfully!`);
    }

    const res = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
            address: `${info.street}, ${info.city}, ${info.state} ${info.zip}`,
            serviceType: info.serviceType,
            inHOA: info.inHOA === 'yes',
            communityName: info.communityName,
            hasGateCode: info.hasGateCode === 'yes',
            gateCode: info.gateCode,
            notes: info.notes,
        }),
    });
    const json = await safeJson(res, 'Failed to add property');
    if (!res.ok) throw new Error(json.error || 'Failed to add property');
    const newP = json.data;
    if (cachedUser) cachedUser.properties.push(newP);
    return newP;
};
export const updatePropertyDetails = async (id: string, details: UpdatePropertyInfo): Promise<Property> => {
    const res = await fetch(`/api/properties/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
            serviceType: details.serviceType,
            inHOA: details.inHOA === 'yes',
            communityName: details.communityName,
            hasGateCode: details.hasGateCode === 'yes',
            gateCode: details.gateCode,
            notes: details.notes,
        }),
    });
    const json = await safeJson(res, 'Failed to update property');
    if (!res.ok) throw new Error(json.error || 'Failed to update property');
    return json.data;
};
export const updateUserProfile = async (info: UpdateProfileInfo): Promise<User> => {
    const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(info),
    });
    const json = await safeJson(res, 'Failed to update profile');
    if (!res.ok) throw new Error(json.error || 'Failed to update profile');
    cachedUser = json.data;
    return json.data;
};
export const updateUserPassword = async (info: UpdatePasswordInfo): Promise<any> => {
    const res = await fetch('/api/auth/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(info),
    });
    const json = await safeJson(res, 'Failed to update password');
    if (!res.ok) throw new Error(json.error || 'Failed to update password');
    return json;
};
export const updateAutopayStatus = async (enabled: boolean) => {
    const res = await fetch('/api/auth/autopay', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled }),
    });
    const json = await safeJson(res, 'Failed to update autopay');
    if (!res.ok) throw new Error(json.error || 'Failed to update autopay');
    if (cachedUser) cachedUser.autopayEnabled = enabled;
    return { success: true };
};

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
export const payOutstandingBalance = (paymentMethodId: string, propertyId?: string) => stripeService.payOutstandingBalance(paymentMethodId, propertyId);

export const subscribeToNewService = async (service: Service, propertyId: string, quantity: number, useSticker: boolean) => {
    const property = cachedUser?.properties.find(p => p.id === propertyId);
    if (!property) throw new Error("Property not found for creating subscription.");

    const paymentMethods = await stripeService.listPaymentMethods();
    const paymentMethodId = paymentMethods.length > 0 ? paymentMethods[0].id : undefined;

    const newSub = await stripeService.createSubscription(service, propertyId, paymentMethodId, quantity, useSticker);

    // If a new physical can is being rented, create a delivery task.
    if (service.category === 'base_service' && !useSticker) {
        await optimoRouteService.createDeliveryTask(property.address, service.name, quantity);
    }
    
    return newSub;
};

export const changeServiceQuantity = async (service: Service, propertyId: string, change: 'increment' | 'decrement', useSticker?: boolean) => {
    const property = cachedUser?.properties.find(p => p.id === propertyId);
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
        const pms = await stripeService.listPaymentMethods();
        const pmId = pms.length > 0 ? pms[0].id : undefined;
        const newSub = await stripeService.createSubscription(service, propertyId, pmId, 1, useSticker ?? false);
        // If a new physical can is being rented, create a delivery task.
        if (service.category === 'base_service' && !(useSticker ?? false)) {
            await optimoRouteService.createDeliveryTask(property.address, service.name, 1);
        }
        return newSub;
    }
};

export const setServiceQuantity = stripeService.setSubscriptionQuantity;

export const updateSubscriptionPaymentMethod = stripeService.updateSubscriptionPaymentMethod;

export const cancelSubscription = async (subscriptionId: string) => {
    const allSubs = await stripeService.listSubscriptions();
    const subToCancel = allSubs.find(s => s.id === subscriptionId);
    
    if (!subToCancel) throw new Error("Subscription to cancel not found.");

    const service = (await getServices()).find(s => s.id === subToCancel.serviceId);
    const property = cachedUser?.properties.find(p => p.id === subToCancel.propertyId);

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

export const updateNotificationPreferences = async (propertyId: string, prefs: NotificationPreferences) => {
    const res = await fetch(`/api/properties/${propertyId}/notifications`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(prefs),
    });
    const json = await safeJson(res, 'Failed to update notification preferences');
    if (!res.ok) throw new Error(json.error || 'Failed to update notification preferences');
    const p = cachedUser?.properties.find(prop => prop.id === propertyId);
    if (p) p.notificationPreferences = prefs;
    return { success: true };
};

const iconMap: Record<string, React.FC<any>> = {
    ArchiveBoxIcon, HomeModernIcon, SparklesIcon, TruckIcon, WrenchScrewdriverIcon, BuildingOffice2Icon, TrashIcon,
};

export const getSpecialPickupServices = async (): Promise<SpecialPickupService[]> => {
    try {
        const res = await fetch('/api/special-pickup-services', { credentials: 'include' });
        const json = await safeJson(res);
        if (res.ok && json.data) {
            return json.data.map((s: any) => {
                const IconComponent = iconMap[s.iconName] || ArchiveBoxIcon;
                return {
                    id: s.id,
                    name: s.name,
                    description: s.description,
                    price: s.price,
                    icon: React.createElement(IconComponent, { className: 'w-12 h-12 text-primary' }),
                };
            });
        }
    } catch {}
    return [];
};

export const getSpecialPickupRequests = async (): Promise<SpecialPickupRequest[]> => {
    try {
        const res = await fetch('/api/special-pickups', { credentials: 'include' });
        const json = await safeJson(res);
        if (res.ok && json.data) {
            return json.data.map((r: any) => ({
                id: r.id,
                propertyId: r.property_id,
                serviceId: r.id,
                serviceName: r.service_name,
                date: r.pickup_date,
                status: r.status,
                price: Number(r.service_price),
            }));
        }
    } catch {}
    return [];
};
export const requestSpecialPickup = async (serviceId: string, propertyId: string, date: string) => {
    const services = await getSpecialPickupServices();
    const service = services.find(s => s.id === serviceId);
    if (!service) throw new Error("Service not found");
    const res = await fetch('/api/special-pickup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ propertyId, serviceName: service.name, servicePrice: service.price, date }),
    });
    const json = await safeJson(res, 'Failed to create special pickup request');
    if (!res.ok) throw new Error(json.error || 'Failed to create special pickup request');
    return {
        id: json.data.id,
        propertyId,
        serviceId,
        serviceName: service.name,
        date,
        status: 'Scheduled',
        price: service.price,
    };
};

export const pauseSubscriptionsForProperty = async (propertyId: string, until: string) => {
    return stripeService.pauseSubscriptionsForProperty(propertyId, until);
};

export const resumeSubscriptionsForProperty = async (propertyId: string) => {
    return stripeService.resumeSubscriptionsForProperty(propertyId);
};

export const reportMissedPickup = async (propertyId: string, date: string, notes: string) => {
    const res = await fetch('/api/missed-pickup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ propertyId, date, notes }),
    });
    const json = await safeJson(res, 'Failed to report missed pickup');
    if (!res.ok) throw new Error(json.error || 'Failed to report missed pickup');
    return json;
};

export const transferPropertyOwnership = async (propertyId: string, newOwner: { firstName: string, lastName: string, email: string }) => {
    const res = await fetch('/api/account-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ propertyId, firstName: newOwner.firstName, lastName: newOwner.lastName, email: newOwner.email }),
    });
    const json = await safeJson(res, 'Failed to initiate transfer');
    if (!res.ok) throw new Error(json.error || 'Failed to initiate transfer');
    return json.data;
};

export const sendTransferReminder = async (propertyId: string) => {
    const res = await fetch('/api/account-transfer/remind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ propertyId }),
    });
    const json = await safeJson(res, 'Failed to send reminder');
    if (!res.ok) throw new Error(json.error || 'Failed to send reminder');
    return json.data;
};

export const cancelAllSubscriptionsForProperty = async (propertyId: string) => {
    const property = cachedUser?.properties.find(p => p.id === propertyId);
    if (!property) throw new Error("Property not found for cancellation.");

    const allSubs = await stripeService.listSubscriptions();
    const services = await getServices();
    
    const subsToCancel = allSubs.filter(s => s.propertyId === propertyId && (s.status === 'active' || s.status === 'paused'));
    
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

export const getReferralInfo = async (): Promise<ReferralInfo> => {
    try {
        const res = await fetch('/api/referrals', { credentials: 'include' });
        const json = await safeJson(res);
        if (res.ok && json.data) {
            return json.data as ReferralInfo;
        }
    } catch {}
    return { referralCode: '', shareLink: '', totalRewards: 0, referrals: [] };
};

// --- DRIVER COMMUNICATION FUNCTIONS (DB-BACKED) ---

export const setCollectionIntent = async (propertyId: string, intent: 'out' | 'skip', date: string) => {
    const res = await fetch('/api/collection-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ propertyId, intent, date }),
    });
    const json = await safeJson(res, 'Failed to save collection intent');
    if (!res.ok) throw new Error(json.error || 'Failed to save collection intent');
    return { success: true };
};

export const leaveDriverTip = async (propertyId: string, amount: number, pickupDate: string) => {
    const res = await fetch('/api/driver-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ propertyId, pickupDate, tipAmount: amount, rating: null, note: null }),
    });
    const json = await safeJson(res, 'Failed to save tip');
    if (!res.ok) throw new Error(json.error || 'Failed to save tip');
    return { success: true };
};

export const leaveDriverNote = async (propertyId: string, note: string, pickupDate: string) => {
    const res = await fetch('/api/driver-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ propertyId, pickupDate, tipAmount: null, rating: null, note }),
    });
    const json = await safeJson(res, 'Failed to save note');
    if (!res.ok) throw new Error(json.error || 'Failed to save note');
    return { success: true };
};

export const dismissTipPrompt = async (propertyId: string, pickupDate: string) => {
    try {
        await fetch('/api/tip-dismissal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ propertyId, pickupDate }),
        });
    } catch {}
    return { success: true };
};