
import React, { useState, useEffect } from 'react';
import { Location } from '../types.ts';
import { useLocation } from '../LocationContext.tsx';
import { getNextPickupInfo, PickupInfo } from '../services/optimoRouteService.ts';
import { getPendingSelections, getServices, deleteOrphanedLocation } from '../services/apiService.ts';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import { ArrowRightIcon, CheckCircleIcon, PauseCircleIcon, XCircleIcon, CalendarDaysIcon, ClockIcon } from './Icons.tsx';
import { LocationWithStatus, UnifiedLocationStatus } from './LocationManagement.tsx';


const statusConfig: Record<UnifiedLocationStatus, { icon: React.ReactNode; text: string; color: string; bg: string }> = {
    active: { icon: <CheckCircleIcon className="w-4 h-4" />, text: 'Active', color: 'text-primary', bg: 'bg-primary/5' },
    paused: { icon: <PauseCircleIcon className="w-4 h-4" />, text: 'On Hold', color: 'text-orange-500', bg: 'bg-orange-50' },
    inactive: { icon: <XCircleIcon className="w-4 h-4" />, text: 'No Services', color: 'text-gray-500', bg: 'bg-gray-100' },
    pending_review: { icon: <ClockIcon className="w-4 h-4" />, text: 'Under Review', color: 'text-yellow-600', bg: 'bg-yellow-50' },
    waitlist: { icon: <ClockIcon className="w-4 h-4" />, text: 'Waiting List', color: 'text-blue-600', bg: 'bg-blue-50' },
    denied: { icon: <XCircleIcon className="w-4 h-4" />, text: 'Not Serviceable', color: 'text-red-500', bg: 'bg-red-50' },
};

const LocationCard: React.FC<{ location: LocationWithStatus; onResumeSetup?: (locationId: string) => void; onLocationRemoved?: () => void }> = ({ location, onResumeSetup, onLocationRemoved }) => {
    const { setSelectedLocationId } = useLocation();
    const [pickupInfo, setPickupInfo] = useState<PickupInfo | null>(null);
    const [loadingPickup, setLoadingPickup] = useState(true);
    const [pendingServiceNames, setPendingServiceNames] = useState<string[]>([]);
    const [selectionsLoaded, setSelectionsLoaded] = useState(false);

    const isPending = location.status === 'pending_review';
    const isDenied = location.status === 'denied';
    const isWaitlist = location.status === 'waitlist';
    const isReviewBlocked = isPending || isDenied || isWaitlist;

    useEffect(() => {
        if (isReviewBlocked) {
            setLoadingPickup(false);
            return;
        }
        setLoadingPickup(true);
        getNextPickupInfo(location.address).then(info => {
            setPickupInfo(info);
            setLoadingPickup(false);
        });
    }, [location.address, isReviewBlocked]);

    // Load pending service selections for pending_review, waitlist, and denied locations
    useEffect(() => {
        if (!isPending && !isWaitlist && !isDenied) return;
        Promise.all([getPendingSelections(location.id), getServices()]).then(([selections, services]) => {
            const names = selections
                .map(sel => {
                    const svc = services.find(s => s.id === sel.serviceId);
                    return svc ? (sel.quantity > 1 ? `${svc.name} x${sel.quantity}` : svc.name) : null;
                })
                .filter(Boolean) as string[];
            setPendingServiceNames(names);
            setSelectionsLoaded(true);
        }).catch(() => { setSelectionsLoaded(true); });
    }, [isPending, isWaitlist, isDenied, location.id]);

    const config = statusConfig[location.status];

    return (
        <Card className="flex flex-col hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border-none ring-1 ring-base-200 group">
            <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                    <h3 className="text-xl font-black text-gray-900 group-hover:text-primary transition-colors pr-4">{location.address}</h3>
                </div>
                <div className={`px-3 py-1 ${config.bg} ${config.color} rounded-full flex items-center gap-2 shrink-0`}>
                    {config.icon}
                    <span className="text-[10px] font-black uppercase tracking-widest">{config.text}</span>
                </div>
            </div>

            {isReviewBlocked ? (
                <>
                    {isPending && selectionsLoaded && pendingServiceNames.length === 0 ? (
                        // Orphaned location: created but wizard was abandoned before selecting services
                        <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 mb-4">
                            <p className="text-sm font-bold text-amber-800 mb-1">Incomplete Setup</p>
                            <p className="text-sm text-amber-700">You started adding this address but didn't finish selecting services. Would you like to continue?</p>
                        </div>
                    ) : (
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 mb-4">
                            <p className="text-sm font-bold text-gray-500">
                                {isPending
                                    ? "We're reviewing your address and will notify you within 24 hours. You'll receive an email once confirmed."
                                    : isWaitlist
                                    ? "This address is not yet in our service area. We'll notify you when service becomes available. Your service selections have been saved."
                                    : "Unfortunately, this address is outside our current service area."}
                            </p>
                        </div>
                    )}
                    {(isPending || isWaitlist || isDenied) && pendingServiceNames.length > 0 && (
                        <div className={`p-3 ${isWaitlist ? 'bg-blue-50 border-blue-100' : isDenied ? 'bg-red-50 border-red-100' : 'bg-yellow-50 border-yellow-100'} rounded-lg border mb-6`}>
                            <p className={`text-[10px] font-black ${isWaitlist ? 'text-blue-600' : isDenied ? 'text-red-500' : 'text-yellow-600'} uppercase tracking-widest mb-1`}>
                                {isDenied ? 'Saved Services' : isWaitlist ? 'Saved Services' : 'Pending Services'}
                            </p>
                            <p className="text-xs text-gray-600 font-medium">{pendingServiceNames.join(', ')}</p>
                            <p className="text-[10px] text-gray-400 mt-1">Billing starts after approval</p>
                        </div>
                    )}
                    {!isPending && !isWaitlist && <div className="mb-6" />}
                    <div className="flex items-center justify-end border-t border-base-100 pt-4 mt-auto gap-2">
                        {isPending && selectionsLoaded && pendingServiceNames.length === 0 ? (
                            <>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    className="rounded-xl px-5 py-2.5 font-black uppercase text-[10px] tracking-widest"
                                    onClick={async () => {
                                        await deleteOrphanedLocation(location.id);
                                        onLocationRemoved?.();
                                    }}
                                >
                                    Remove
                                </Button>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    className="rounded-xl px-5 py-2.5 font-black uppercase text-[10px] tracking-widest"
                                    onClick={() => onResumeSetup?.(location.id)}
                                >
                                    Continue Setup
                                </Button>
                            </>
                        ) : (
                            <Button
                                variant="secondary"
                                size="sm"
                                className="rounded-xl px-5 py-2.5 font-black uppercase text-[10px] tracking-widest opacity-50 cursor-not-allowed"
                                disabled
                            >
                                {isPending ? 'Pending Review' : isWaitlist ? 'On Waiting List' : 'Not Available'}
                            </Button>
                        )}
                    </div>
                </>
            ) : (
                <>
                    <div className="space-y-2 mb-6">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{location.activeServicesCount} Active Service(s)</p>
                    </div>

                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 mb-6">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><CalendarDaysIcon className="w-4 h-4" /> Next Collection</p>
                        {loadingPickup ? (
                            <div className="h-5 bg-gray-200 rounded-full w-3/4 animate-pulse mt-1.5" />
                        ) : (
                            <p className="text-sm font-bold text-gray-600 mt-1">{pickupInfo ? new Date(pickupInfo.date + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'Not Scheduled'}</p>
                        )}
                    </div>

                    <div className="flex items-center justify-between border-t border-base-100 pt-4 mt-auto">
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Monthly Total</p>
                            <p className="text-xl font-black text-gray-900 mt-1">${Number(location.monthlyTotal).toFixed(2)}</p>
                        </div>
                        <Button
                            onClick={() => setSelectedLocationId(location.id)}
                            variant="primary"
                            size="sm"
                            className="rounded-xl px-5 py-2.5 font-black uppercase text-[10px] tracking-widest"
                        >
                            Manage <ArrowRightIcon className="w-4 h-4 ml-2" />
                        </Button>
                    </div>
                </>
            )}
        </Card>
    );
};

export default LocationCard;
