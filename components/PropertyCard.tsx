
import React, { useState, useEffect } from 'react';
import { Property } from '../types.ts';
import { useProperty } from '../PropertyContext.tsx';
import { getNextPickupInfo, PickupInfo } from '../services/optimoRouteService.ts';
import { getPendingSelections, getServices } from '../services/apiService.ts';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import { ArrowRightIcon, CheckCircleIcon, PauseCircleIcon, XCircleIcon, CalendarDaysIcon, ClockIcon } from './Icons.tsx';
import { PropertyWithStatus } from './PropertyManagement.tsx';


const statusConfig = {
    active: { icon: <CheckCircleIcon className="w-4 h-4" />, text: 'Active', color: 'text-primary', bg: 'bg-primary/5' },
    paused: { icon: <PauseCircleIcon className="w-4 h-4" />, text: 'On Hold', color: 'text-orange-500', bg: 'bg-orange-50' },
    canceled: { icon: <XCircleIcon className="w-4 h-4" />, text: 'Canceled', color: 'text-red-500', bg: 'bg-red-50' },
};

const PropertyCard: React.FC<{ property: PropertyWithStatus }> = ({ property }) => {
    const { setSelectedPropertyId } = useProperty();
    const [pickupInfo, setPickupInfo] = useState<PickupInfo | null>(null);
    const [loadingPickup, setLoadingPickup] = useState(true);
    const [pendingServiceNames, setPendingServiceNames] = useState<string[]>([]);

    const isPending = property.serviceStatus === 'pending_review';
    const isDenied = property.serviceStatus === 'denied';
    const isReviewBlocked = isPending || isDenied;

    useEffect(() => {
        if (isReviewBlocked) {
            setLoadingPickup(false);
            return;
        }
        setLoadingPickup(true);
        getNextPickupInfo(property.address).then(info => {
            setPickupInfo(info);
            setLoadingPickup(false);
        });
    }, [property.address, isReviewBlocked]);

    // Load pending service selections for pending_review properties
    useEffect(() => {
        if (!isPending) return;
        Promise.all([getPendingSelections(property.id), getServices()]).then(([selections, services]) => {
            const names = selections
                .map(sel => {
                    const svc = services.find(s => s.id === sel.serviceId);
                    return svc ? (sel.quantity > 1 ? `${svc.name} x${sel.quantity}` : svc.name) : null;
                })
                .filter(Boolean) as string[];
            setPendingServiceNames(names);
        }).catch(() => {});
    }, [isPending, property.id]);

    const config = statusConfig[property.status];

    return (
        <Card className="flex flex-col hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border-none ring-1 ring-base-200 group">
            <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                    <h3 className="text-xl font-black text-gray-900 group-hover:text-primary transition-colors pr-4">{property.address}</h3>
                </div>
                {isPending ? (
                    <div className="px-3 py-1 bg-yellow-50 text-yellow-600 rounded-full flex items-center gap-2 shrink-0">
                        <ClockIcon className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Under Review</span>
                    </div>
                ) : isDenied ? (
                    <div className="px-3 py-1 bg-red-50 text-red-500 rounded-full flex items-center gap-2 shrink-0">
                        <XCircleIcon className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Not Serviceable</span>
                    </div>
                ) : (
                    <div className={`px-3 py-1 ${config.bg} ${config.color} rounded-full flex items-center gap-2 shrink-0`}>
                        {config.icon}
                        <span className="text-[10px] font-black uppercase tracking-widest">{config.text}</span>
                    </div>
                )}
            </div>

            {isReviewBlocked ? (
                <>
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 mb-4">
                        <p className="text-sm font-bold text-gray-500">
                            {isPending
                                ? "We're checking if we can service this address. You'll be notified when it's confirmed."
                                : "Unfortunately, this address is outside our current service area."}
                        </p>
                    </div>
                    {isPending && pendingServiceNames.length > 0 && (
                        <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-100 mb-6">
                            <p className="text-[10px] font-black text-yellow-600 uppercase tracking-widest mb-1">Pending Services</p>
                            <p className="text-xs text-gray-600 font-medium">{pendingServiceNames.join(', ')}</p>
                            <p className="text-[10px] text-gray-400 mt-1">Billing starts after approval</p>
                        </div>
                    )}
                    {!isPending && <div className="mb-6" />}
                    <div className="flex items-center justify-end border-t border-base-100 pt-4 mt-auto">
                        <Button
                            variant="secondary"
                            size="sm"
                            className="rounded-xl px-5 py-2.5 font-black uppercase text-[10px] tracking-widest opacity-50 cursor-not-allowed"
                            disabled
                        >
                            {isPending ? 'Pending Review' : 'Not Available'}
                        </Button>
                    </div>
                </>
            ) : (
                <>
                    <div className="space-y-2 mb-6">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{property.activeServicesCount} Active Service(s)</p>
                    </div>

                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 mb-6">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><CalendarDaysIcon className="w-4 h-4" /> Next Pickup</p>
                        {loadingPickup ? (
                            <div className="h-5 bg-gray-200 rounded-full w-3/4 animate-pulse mt-1.5" />
                        ) : (
                            <p className="text-sm font-bold text-gray-600 mt-1">{pickupInfo ? new Date(pickupInfo.date + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'Not Scheduled'}</p>
                        )}
                    </div>

                    <div className="flex items-center justify-between border-t border-base-100 pt-4 mt-auto">
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Monthly Total</p>
                            <p className="text-xl font-black text-gray-900 mt-1">${Number(property.monthlyTotal).toFixed(2)}</p>
                        </div>
                        <Button
                            onClick={() => setSelectedPropertyId(property.id)}
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

export default PropertyCard;
