import React from 'react';
import { Service, User, Location, NotificationPreferences, OnDemandService, OnDemandRequest, ServiceAlert, Subscription, PaymentMethod, NewLocationInfo, RegistrationInfo, UpdateLocationInfo, UpdateProfileInfo, UpdatePasswordInfo, ReferralInfo } from '../types.ts';
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

export interface LocationState {
    location: Location;
    nextCollection: {
        date: string;
        label: string;
        isToday: boolean;
        status: 'upcoming' | 'in-progress' | 'paused';
        eta?: string;
    } | null;
    lastCollection: {
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
    activeLocationsCount: number;
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
export const getDashboardState = async (selectedLocationId: string | 'all') => {
    const [user, subscriptions, invoices, alerts] = await Promise.all([
        getUser(),
        getSubscriptions(),
        getInvoices(),
        getServiceAlerts()
    ]);

    const targetLocations = selectedLocationId === 'all'
        ? user.locations
        : user.locations.filter(p => p.id === selectedLocationId);

    const states: LocationState[] = await Promise.all(targetLocations.map(async (loc) => {
        const locSubs = subscriptions.filter(s => s.locationId === loc.id && s.status === 'active');
        const isPaused = subscriptions.some(s => s.locationId === loc.id && s.status === 'paused');

        let state: Omit<LocationState, 'location' | 'monthlyTotal' | 'activeServices'>;

        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];

        const [nextCollectionInfo, pastCollections, dismissedDates] = await Promise.all([
            optimoRouteService.getNextPickupInfo(loc.address),
            optimoRouteService.getPastPickups(loc.address),
            fetchTipDismissals(loc.id),
        ]);

        const lastCompletedCollection = pastCollections.find(h => h.status === 'completed');

        if (nextCollectionInfo) {
            const collectionDate = nextCollectionInfo.date;
            const isToday = collectionDate === todayStr;
            const collectionDateObj = new Date(collectionDate + 'T00:00:00');
            const diffDays = Math.round((collectionDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            const dayName = collectionDateObj.toLocaleDateString('en-US', { weekday: 'long' });
            let label = isToday ? 'TODAY' : diffDays === 1 ? 'Tomorrow' : diffDays <= 6 ? dayName : collectionDate;
            let collectionStatus: string = isPaused ? 'paused' : isToday ? 'in-progress' : 'upcoming';

            let intent: string | null = null;
            if (!isToday && collectionDate) {
                try {
                    const ciRes = await fetch(`/api/collection-intent/${loc.id}/${collectionDate}`, { credentials: 'include' });
                    if (ciRes.ok) { const ciJson = await ciRes.json(); intent = ciJson.data?.intent || null; }
                } catch {}
            }

            let lastCollection = null;
            if (lastCompletedCollection) {
                let feedback: any = null;
                try {
                    const fbRes = await fetch(`/api/driver-feedback/${loc.id}/${lastCompletedCollection.date}`, { credentials: 'include' });
                    if (fbRes.ok) { const fbJson = await fbRes.json(); feedback = fbJson.data; }
                } catch {}
                const hasBeenDismissed = dismissedDates.includes(lastCompletedCollection.date);
                lastCollection = {
                    date: lastCompletedCollection.date,
                    label: 'Last Collection',
                    status: 'completed' as const,
                    feedbackSubmitted: !!feedback,
                    showTipPrompt: !feedback && !hasBeenDismissed,
                    driverName: lastCompletedCollection.driver,
                };
            }

            state = {
                nextCollection: { date: collectionDate, label, isToday, status: collectionStatus as any, eta: nextCollectionInfo.eta },
                lastCollection,
                collectionIntent: intent as any
            };
        } else if (lastCompletedCollection) {
            let feedback: any = null;
            try {
                const fbRes = await fetch(`/api/driver-feedback/${loc.id}/${lastCompletedCollection.date}`, { credentials: 'include' });
                if (fbRes.ok) { const fbJson = await fbRes.json(); feedback = fbJson.data; }
            } catch {}
            const hasBeenDismissed = dismissedDates.includes(lastCompletedCollection.date);
            state = {
                nextCollection: null,
                lastCollection: {
                    date: lastCompletedCollection.date,
                    label: 'Last Collection',
                    status: 'completed',
                    feedbackSubmitted: !!feedback,
                    showTipPrompt: !feedback && !hasBeenDismissed,
                    driverName: lastCompletedCollection.driver,
                },
                collectionIntent: null
            };
        } else {
            state = { nextCollection: null, lastCollection: null, collectionIntent: null };
        }

        return {
            ...state,
            location: loc,
            monthlyTotal: locSubs.reduce((acc, s) => acc + s.totalPrice, 0),
            activeServices: locSubs.map(s => s.serviceName)
        };
    }));

    const health: AccountHealth = {
        totalMonthlyCost: subscriptions.filter(s => s.status === 'active').reduce((acc, s) => acc + s.totalPrice, 0),
        outstandingBalance: invoices.filter(i => i.status !== 'Paid').reduce((acc, i) => acc + i.amount, 0),
        activeLocationsCount: user.locations.length,
        activeServicesCount: subscriptions.filter(s => s.status === 'active').length,
        criticalAlerts: alerts
    };

    return { states, health };
};

const fetchTipDismissals = async (locationId: string): Promise<string[]> => {
    try {
        const res = await fetch(`/api/tip-dismissals/${locationId}`, { credentials: 'include' });
        if (res.ok) { const json = await res.json(); return json.data || []; }
    } catch {}
    return [];
};

export const getCollectionHistory = async (locationId: string): Promise<CollectionHistoryLogWithFeedback[]> => {
    const location = cachedUser?.locations.find(p => p.id === locationId);
    if (!location) return [];

    const history = await optimoRouteService.getPastPickups(location.address);

    let feedbackList: any[] = [];
    try {
        const res = await fetch(`/api/driver-feedback/${locationId}/list`, { credentials: 'include' });
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
export const addLocation = async (info: NewLocationInfo): Promise<Location> => {
    const res = await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
            address: info.street,
            serviceType: info.serviceType,
            inHOA: info.inHOA === 'yes',
            communityName: info.communityName,
            hasGateCode: info.hasGateCode === 'yes',
            gateCode: info.gateCode,
            notes: info.notes,
        }),
    });
    const json = await safeJson(res, 'Failed to add location');
    if (!res.ok) throw new Error(json.error || 'Failed to add location');
    const newL = json.data;
    return newL;
};
export const addProperty = addLocation;
export const savePendingSelections = async (locationId: string, selections: { serviceId: string; quantity: number; useSticker: boolean }[]): Promise<void> => {
    const res = await fetch(`/api/locations/${locationId}/pending-selections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ selections }),
    });
    const json = await safeJson(res, 'Failed to save service selections');
    if (!res.ok) throw new Error(json.error || 'Failed to save service selections');
};

export const deleteOrphanedLocation = async (locationId: string): Promise<void> => {
    const res = await fetch(`/api/locations/${locationId}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    const json = await safeJson(res, 'Failed to delete location');
    if (!res.ok) throw new Error(json.error || 'Failed to delete location');
};
export const deleteOrphanedProperty = deleteOrphanedLocation;

export const requestLocationReview = async (locationId: string): Promise<void> => {
    const res = await fetch(`/api/locations/${locationId}/request-review`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
    });
    const json = await safeJson(res, 'Failed to request review');
    if (!res.ok) throw new Error(json.error || 'Failed to request review');
};

export const getPendingSelections = async (locationId: string): Promise<{ serviceId: string; quantity: number; useSticker: boolean }[]> => {
    const res = await fetch(`/api/locations/${locationId}/pending-selections`, {
        credentials: 'include',
    });
    const json = await safeJson(res, 'Failed to get pending selections');
    if (!res.ok) throw new Error(json.error || 'Failed to get pending selections');
    return json.data;
};

export const updateLocationDetails = async (id: string, details: UpdateLocationInfo): Promise<Location> => {
    const res = await fetch(`/api/locations/${id}`, {
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
    const json = await safeJson(res, 'Failed to update location');
    if (!res.ok) throw new Error(json.error || 'Failed to update location');
    return json.data;
};
export const updatePropertyDetails = updateLocationDetails;
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
export const payOutstandingBalance = (paymentMethodId: string, locationId?: string) => stripeService.payOutstandingBalance(paymentMethodId, locationId);

export const submitBillingDispute = async (data: { invoiceId: string; invoiceNumber?: string; amount: number; reason: string; details?: string }): Promise<void> => {
    const res = await fetch('/api/billing/disputes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
    });
    const json = await safeJson(res, 'Failed to submit dispute');
    if (!res.ok) throw new Error(json.error || 'Failed to submit dispute');
};

export const getBillingDisputes = async (): Promise<{ id: string; invoice_id: string; reason: string; status: string; created_at: string }[]> => {
    const res = await fetch('/api/billing/disputes', { credentials: 'include' });
    const json = await safeJson(res, 'Failed to fetch disputes');
    if (!res.ok) throw new Error(json.error || 'Failed to fetch disputes');
    return json;
};

export const subscribeToNewService = async (service: Service, locationId: string, quantity: number, useSticker: boolean) => {
    const location = cachedUser?.locations.find(p => p.id === locationId);
    if (!location) throw new Error("Location not found for creating subscription.");

    const paymentMethods = await stripeService.listPaymentMethods();
    const paymentMethodId = paymentMethods.length > 0 ? paymentMethods[0].id : undefined;

    const newSub = await stripeService.createSubscription(service, locationId, paymentMethodId, quantity, useSticker);

    // If a new physical can is being rented, create a delivery task.
    if (service.category === 'base_service' && !useSticker) {
        await optimoRouteService.createDeliveryTask(location.address, service.name, quantity);
    }

    return newSub;
};

export const changeServiceQuantity = async (service: Service, locationId: string, change: 'increment' | 'decrement', useSticker?: boolean) => {
    const location = cachedUser?.locations.find(p => p.id === locationId);
    if (!location) throw new Error("Location not found for changing quantity.");

    const subs = await stripeService.listSubscriptions();
    const existing = subs.find(s => s.locationId === locationId && s.serviceId === service.id && s.status === 'active');

    if (existing) {
        const newQty = change === 'increment' ? existing.quantity + 1 : existing.quantity - 1;
        const changeAmount = newQty - existing.quantity;

        const updatedSub = await stripeService.changeSubscriptionQuantity(existing.id, newQty);

        // If it's a rental can and quantity changed, create a task.
        if (service.category === 'base_service' && existing.equipmentType === 'rental') {
            if (changeAmount > 0) {
                await optimoRouteService.createDeliveryTask(location.address, service.name, changeAmount);
            } else if (changeAmount < 0) {
                await optimoRouteService.createPickupTask(location.address, service.name, Math.abs(changeAmount));
            }
        }
        return updatedSub;

    } else if (change === 'increment') {
        // This is creating a new subscription
        const pms = await stripeService.listPaymentMethods();
        const pmId = pms.length > 0 ? pms[0].id : undefined;
        const newSub = await stripeService.createSubscription(service, locationId, pmId, 1, useSticker ?? false);
        // If a new physical can is being rented, create a delivery task.
        if (service.category === 'base_service' && !(useSticker ?? false)) {
            await optimoRouteService.createDeliveryTask(location.address, service.name, 1);
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
    const location = cachedUser?.locations.find(p => p.id === subToCancel.locationId);

    const result = await stripeService.cancelSubscription(subscriptionId);

    if (location && service?.category === 'base_service' && subToCancel.equipmentType === 'rental' && subToCancel.quantity > 0) {
        await optimoRouteService.createPickupTask(location.address, subToCancel.serviceName, subToCancel.quantity);
    }
    
    return result;
};

export const pauseSubscription = stripeService.pauseSubscription;
export const resumeSubscription = stripeService.resumeSubscription;

export const addPaymentMethod = stripeService.attachPaymentMethod;
export const deletePaymentMethod = stripeService.detachPaymentMethod;
export const setPrimaryPaymentMethod = stripeService.updateCustomerDefaultPaymentMethod;

export const updateSubscriptionsForLocation = async (locationId: string, paymentMethodId: string) => {
    const subs = await stripeService.listSubscriptions();
    const targets = subs.filter(s => s.locationId === locationId && s.status === 'active');
    await Promise.all(targets.map(t => stripeService.updateSubscriptionPaymentMethod(t.id, paymentMethodId)));
};

export const updateAllUserSubscriptions = async (paymentMethodId: string) => {
    const subs = await stripeService.listSubscriptions();
    const targets = subs.filter(s => s.status === 'active');
    await Promise.all(targets.map(t => stripeService.updateSubscriptionPaymentMethod(t.id, paymentMethodId)));
};

export const updateNotificationPreferences = async (locationId: string, prefs: NotificationPreferences) => {
    const res = await fetch(`/api/locations/${locationId}/notifications`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(prefs),
    });
    const json = await safeJson(res, 'Failed to update notification preferences');
    if (!res.ok) throw new Error(json.error || 'Failed to update notification preferences');
    return { success: true };
};

const iconMap: Record<string, React.FC<any>> = {
    ArchiveBoxIcon, HomeModernIcon, SparklesIcon, TruckIcon, WrenchScrewdriverIcon, BuildingOffice2Icon, TrashIcon,
};

export const getOnDemandServices = async (): Promise<OnDemandService[]> => {
    const res = await fetch('/api/on-demand-services', { credentials: 'include' });
    const json = await safeJson(res, 'Failed to fetch on-demand services');
    if (!res.ok) throw new Error(json.error || 'Failed to fetch on-demand services');
    if (!json.data) return [];
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
};
export const getSpecialPickupServices = getOnDemandServices;

export const getOnDemandRequests = async (): Promise<OnDemandRequest[]> => {
    const res = await fetch('/api/on-demand-requests', { credentials: 'include' });
    const json = await safeJson(res, 'Failed to fetch on-demand pickup requests');
    if (!res.ok) throw new Error(json.error || 'Failed to fetch on-demand pickup requests');
    if (!json.data) return [];
    return json.data.map((r: any) => ({
        id: r.id,
        locationId: r.location_id ?? r.property_id,
        serviceId: r.id,
        serviceName: r.service_name,
        date: r.requested_date ?? r.pickup_date,
        status: r.status,
        price: Number(r.service_price),
        notes: r.notes || undefined,
        photos: r.photos || [],
        aiEstimate: r.ai_estimate ? Number(r.ai_estimate) : undefined,
        aiReasoning: r.ai_reasoning || undefined,
        cancellationReason: r.cancellation_reason || undefined,
    }));
};
export const getSpecialPickupRequests = getOnDemandRequests;

export const requestOnDemandPickup = async (
    serviceId: string, locationId: string, date: string,
    opts?: { notes?: string; photos?: string[]; aiEstimate?: number; aiReasoning?: string }
) => {
    const services = await getOnDemandServices();
    const service = services.find(s => s.id === serviceId);
    if (!service) throw new Error("Service not found");
    const res = await fetch('/api/on-demand-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
            locationId, serviceId, serviceName: service.name, servicePrice: service.price, date,
            notes: opts?.notes, photos: opts?.photos,
            aiEstimate: opts?.aiEstimate, aiReasoning: opts?.aiReasoning,
        }),
    });
    const json = await safeJson(res, 'Failed to create on-demand pickup request');
    if (!res.ok) throw new Error(json.error || 'Failed to create on-demand pickup request');
    return {
        id: json.data.id,
        locationId,
        serviceId,
        serviceName: service.name,
        date,
        status: 'pending' as const,
        price: opts?.aiEstimate || service.price,
    };
};
export const requestSpecialPickup = requestOnDemandPickup;

export const uploadOnDemandPhotos = async (files: File[]): Promise<string[]> => {
    const formData = new FormData();
    files.forEach(f => formData.append('photos', f));
    const res = await fetch('/api/upload/on-demand', {
        method: 'POST',
        credentials: 'include',
        body: formData,
    });
    const json = await safeJson(res, 'Failed to upload photos');
    if (!res.ok) throw new Error(json.error || 'Failed to upload photos');
    return json.urls;
};
export const uploadSpecialPickupPhotos = uploadOnDemandPhotos;

export const estimateOnDemandPickup = async (description: string, photoUrls: string[]): Promise<{ estimate: number; reasoning: string }> => {
    const res = await fetch('/api/on-demand/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ description, photoUrls }),
    });
    const json = await safeJson(res, 'Failed to get AI estimate');
    if (!res.ok) throw new Error(json.error || 'Failed to get AI estimate');
    return { estimate: json.estimate, reasoning: json.reasoning };
};
export const estimateSpecialPickup = estimateOnDemandPickup;

export const cancelOnDemandPickup = async (requestId: string, reason?: string) => {
    const res = await fetch(`/api/on-demand-request/${requestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'cancelled', cancellationReason: reason }),
    });
    const json = await safeJson(res, 'Failed to cancel pickup');
    if (!res.ok) throw new Error(json.error || 'Failed to cancel pickup');
    return json.data;
};
export const cancelSpecialPickup = cancelOnDemandPickup;

export const rescheduleOnDemandPickup = async (requestId: string, newDate: string) => {
    const res = await fetch(`/api/on-demand-request/${requestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ date: newDate }),
    });
    const json = await safeJson(res, 'Failed to reschedule pickup');
    if (!res.ok) throw new Error(json.error || 'Failed to reschedule pickup');
    return json.data;
};
export const rescheduleSpecialPickup = rescheduleOnDemandPickup;

export const pauseSubscriptionsForLocation = async (locationId: string, until: string) => {
    return stripeService.pauseSubscriptionsForLocation(locationId, until);
};
export const pauseSubscriptionsForProperty = pauseSubscriptionsForLocation;

export const modifyHoldForLocation = async (locationId: string, newUntil: string) => {
    return stripeService.modifyHoldForLocation(locationId, newUntil);
};

export const resumeSubscriptionsForLocation = async (locationId: string) => {
    return stripeService.resumeSubscriptionsForLocation(locationId);
};
export const resumeSubscriptionsForProperty = resumeSubscriptionsForLocation;

export const uploadMissedCollectionPhotos = async (files: File[]): Promise<string[]> => {
    const formData = new FormData();
    files.forEach(f => formData.append('photos', f));
    const res = await fetch('/api/upload/missed-collection', {
        method: 'POST',
        credentials: 'include',
        body: formData,
    });
    const json = await safeJson(res, 'Failed to upload photos');
    if (!res.ok) throw new Error(json.error || 'Upload failed');
    return json.urls;
};

export const reportMissedCollection = async (locationId: string, date: string, notes: string, photos?: string[]) => {
    const res = await fetch('/api/missed-collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ locationId, date, notes, photos }),
    });
    const json = await safeJson(res, 'Failed to report missed collection');
    if (!res.ok) throw new Error(json.error || 'Failed to report missed collection');
    return json;
};
export const reportMissedPickup = reportMissedCollection;

export const getMissedCollections = async () => {
    const res = await fetch('/api/missed-collections', { credentials: 'include' });
    const json = await safeJson(res, 'Failed to fetch reports');
    if (!res.ok) throw new Error(json.error || 'Failed to fetch reports');
    return json.data as Array<{
        id: string;
        location_id: string;
        collection_date: string;
        notes: string;
        photos: string[];
        status: string;
        resolution_notes: string | null;
        created_at: string;
        address?: string;
    }>;
};

export const transferLocationOwnership = async (locationId: string, newOwner: { firstName: string, lastName: string, email: string }) => {
    const res = await fetch('/api/account-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ locationId, firstName: newOwner.firstName, lastName: newOwner.lastName, email: newOwner.email }),
    });
    const json = await safeJson(res, 'Failed to initiate transfer');
    if (!res.ok) throw new Error(json.error || 'Failed to initiate transfer');
    return json.data;
};
export const transferPropertyOwnership = transferLocationOwnership;

export const sendTransferReminder = async (locationId: string) => {
    const res = await fetch('/api/account-transfer/remind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ locationId }),
    });
    const json = await safeJson(res, 'Failed to send reminder');
    if (!res.ok) throw new Error(json.error || 'Failed to send reminder');
    return json.data;
};

export const cancelAllSubscriptionsForLocation = async (locationId: string) => {
    const location = cachedUser?.locations.find(p => p.id === locationId);
    if (!location) throw new Error("Location not found for cancellation.");

    const allSubs = await stripeService.listSubscriptions();
    const services = await getServices();

    const subsToCancel = allSubs.filter(s => s.locationId === locationId && (s.status === 'active' || s.status === 'paused'));

    const result = await stripeService.cancelAllSubscriptionsForLocation(locationId);

    // After cancellation, create pickup tasks for each rental can
    for (const sub of subsToCancel) {
        const service = services.find(s => s.id === sub.serviceId);
        if (service?.category === 'base_service' && sub.equipmentType === 'rental' && sub.quantity > 0) {
            await optimoRouteService.createPickupTask(location.address, sub.serviceName, sub.quantity);
        }
    }

    return result;
};
export const cancelAllSubscriptionsForProperty = cancelAllSubscriptionsForLocation;

export const restartAllSubscriptionsForLocation = (locationId: string) => {
    return stripeService.restartAllSubscriptionsForLocation(locationId);
};
export const restartAllSubscriptionsForProperty = restartAllSubscriptionsForLocation;

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

export const setCollectionIntent = async (locationId: string, intent: 'out' | 'skip', date: string) => {
    const res = await fetch('/api/collection-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ locationId, intent, date }),
    });
    const json = await safeJson(res, 'Failed to save collection intent');
    if (!res.ok) throw new Error(json.error || 'Failed to save collection intent');
    return { success: true };
};

export const leaveDriverTip = async (locationId: string, amount: number, collectionDate: string) => {
    const res = await fetch('/api/driver-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ locationId, pickupDate: collectionDate, tipAmount: amount, rating: null, note: null }),
    });
    const json = await safeJson(res, 'Failed to save tip');
    if (!res.ok) throw new Error(json.error || 'Failed to save tip');
    return { success: true };
};

export const leaveDriverNote = async (locationId: string, note: string, collectionDate: string) => {
    const res = await fetch('/api/driver-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ locationId, pickupDate: collectionDate, tipAmount: null, rating: null, note }),
    });
    const json = await safeJson(res, 'Failed to save note');
    if (!res.ok) throw new Error(json.error || 'Failed to save note');
    return { success: true };
};

export const dismissTipPrompt = async (locationId: string, collectionDate: string) => {
    try {
        await fetch('/api/tip-dismissal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ locationId, pickupDate: collectionDate }),
        });
    } catch {}
    return { success: true };
};

// ── In-portal Notifications ───────────────────────────────────

export interface InPortalNotification {
    id: string;
    type: string;
    title: string;
    body: string;
    metadata: Record<string, any>;
    read: boolean;
    createdAt: string;
}

export const getNotifications = async (): Promise<{ data: InPortalNotification[]; unreadCount: number }> => {
    const res = await fetch('/api/notifications', { credentials: 'include' });
    const json = await safeJson(res, 'Failed to fetch notifications');
    if (!res.ok) throw new Error(json.error || 'Failed to fetch notifications');
    return json;
};

export const getUnreadNotificationCount = async (): Promise<number> => {
    const res = await fetch('/api/notifications/unread-count', { credentials: 'include' });
    const json = await safeJson(res, 'Failed to get count');
    if (!res.ok) return 0;
    return json.count;
};

export const markNotificationsRead = async (notificationId?: string): Promise<void> => {
    await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notificationId }),
    });
};

// ── AI Service Recommendation ─────────────────────────────────

export const getServiceRecommendation = async (
    photoUrls: string[],
    householdDescription?: string
): Promise<{ recommendedSize: string; reasoning: string; suggestRecycling: boolean; recyclingReason: string }> => {
    const res = await fetch('/api/service-recommendation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ photoUrls, householdDescription }),
    });
    const json = await safeJson(res, 'Failed to get AI recommendation');
    if (!res.ok) throw new Error(json.error || 'Failed to get AI recommendation');
    return json;
};
