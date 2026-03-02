import React, { useState, useEffect } from 'react';
import { useLocation } from '../LocationContext.tsx';
import { getPendingSelections, getServices, deleteOrphanedLocation, requestLocationReview } from '../services/apiService.ts';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import { CheckCircleIcon, ClockIcon, XCircleIcon } from './Icons.tsx';

const ServiceReviewStatus: React.FC<{ onBack: () => void; onResumeSetup: () => void; onLocationRemoved: () => void }> = ({ onBack, onResumeSetup, onLocationRemoved }) => {
    const { selectedLocation, locations } = useLocation();
    const [pendingServiceNames, setPendingServiceNames] = useState<string[]>([]);
    const [selectionsLoaded, setSelectionsLoaded] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [requesting, setRequesting] = useState(false);
    const [reviewRequested, setReviewRequested] = useState(false);

    const status = selectedLocation?.serviceStatus;
    const isPending = status === 'pending_review';
    const isWaitlist = status === 'waitlist';
    const isDenied = status === 'denied';
    const hasMultipleLocations = locations.length > 1;

    useEffect(() => {
        if (!selectedLocation || (!isPending && !isWaitlist)) {
            setSelectionsLoaded(true);
            return;
        }
        Promise.all([getPendingSelections(selectedLocation.id), getServices()]).then(([selections, services]) => {
            const names = selections
                .map(sel => {
                    const svc = services.find(s => s.id === sel.serviceId);
                    return svc ? (sel.quantity > 1 ? `${svc.name} x${sel.quantity}` : svc.name) : null;
                })
                .filter(Boolean) as string[];
            setPendingServiceNames(names);
            setSelectionsLoaded(true);
        }).catch(() => setSelectionsLoaded(true));
    }, [selectedLocation, isPending, isWaitlist]);

    if (!selectedLocation) return null;

    const isOrphaned = isPending && selectionsLoaded && pendingServiceNames.length === 0;

    // Stepper state
    const steps = [
        { label: 'Submitted', complete: true },
        { label: 'Under Review', complete: isWaitlist || isDenied, active: isPending },
        {
            label: isDenied ? 'Not Serviceable' : isWaitlist ? 'Waiting List' : 'Decision',
            complete: false,
            active: isWaitlist || isDenied,
        },
    ];

    const handleRemove = async () => {
        setRemoving(true);
        try {
            await deleteOrphanedLocation(selectedLocation.id);
            onLocationRemoved();
        } catch {
            setRemoving(false);
        }
    };

    const handleRequestReview = async () => {
        setRequesting(true);
        try {
            await requestLocationReview(selectedLocation.id);
            setReviewRequested(true);
        } catch {
            setRequesting(false);
        }
    };

    return (
        <div className="animate-in fade-in duration-500 max-w-2xl mx-auto space-y-6">
            {/* Back button */}
            {hasMultipleLocations && (
                <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-primary transition-colors">
                    &larr; All Locations
                </button>
            )}

            {/* Header */}
            <div>
                <h1 className="text-2xl font-black text-gray-900 tracking-tight">{selectedLocation.address}</h1>
                <div className="mt-2">
                    {isPending && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-50 text-yellow-600 rounded-full text-[10px] font-black uppercase tracking-widest">
                            <ClockIcon className="w-4 h-4" /> Under Review
                        </span>
                    )}
                    {isWaitlist && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-widest">
                            <ClockIcon className="w-4 h-4" /> Waiting List
                        </span>
                    )}
                    {isDenied && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-500 rounded-full text-[10px] font-black uppercase tracking-widest">
                            <XCircleIcon className="w-4 h-4" /> Not Serviceable
                        </span>
                    )}
                </div>
            </div>

            {/* Progress stepper */}
            <Card className="!p-6">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Application Status</p>
                <div className="flex items-center justify-between">
                    {steps.map((step, i) => (
                        <React.Fragment key={step.label}>
                            <div className="flex flex-col items-center text-center flex-1">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                    step.complete
                                        ? 'bg-primary text-white'
                                        : step.active
                                        ? isDenied && i === 2
                                            ? 'bg-red-100 text-red-500 ring-2 ring-red-300'
                                            : isWaitlist && i === 2
                                            ? 'bg-blue-100 text-blue-600 ring-2 ring-blue-300'
                                            : 'bg-yellow-100 text-yellow-600 ring-2 ring-yellow-300'
                                        : 'bg-gray-100 text-gray-400'
                                }`}>
                                    {step.complete ? <CheckCircleIcon className="w-5 h-5" /> : i + 1}
                                </div>
                                <p className={`text-xs font-bold mt-2 ${
                                    step.complete ? 'text-primary' : step.active ? 'text-gray-900' : 'text-gray-400'
                                }`}>{step.label}</p>
                            </div>
                            {i < steps.length - 1 && (
                                <div className={`h-0.5 flex-1 mx-2 -mt-5 ${step.complete ? 'bg-primary' : 'bg-gray-200'}`} />
                            )}
                        </React.Fragment>
                    ))}
                </div>
            </Card>

            {/* Status message */}
            {isOrphaned ? (
                <Card className="!p-6 bg-amber-50 border-amber-200">
                    <p className="font-bold text-amber-800 mb-1">Incomplete Setup</p>
                    <p className="text-sm text-amber-700">
                        You started adding this address but didn't finish selecting services. Would you like to continue setup or remove this address?
                    </p>
                    <div className="flex gap-3 mt-4">
                        <Button variant="secondary" size="sm" onClick={handleRemove} disabled={removing}>
                            {removing ? 'Removing...' : 'Remove'}
                        </Button>
                        <Button variant="primary" size="sm" onClick={onResumeSetup}>
                            Continue Setup
                        </Button>
                    </div>
                </Card>
            ) : (
                <Card className="!p-6">
                    <p className="text-sm font-bold text-gray-600 leading-relaxed">
                        {isPending && "We're reviewing your address to confirm it's within our service area. You'll receive an email notification within 24 hours with the outcome."}
                        {isWaitlist && "Your address is not yet in our active service area, but we're expanding! We'll notify you by email as soon as service becomes available. Your service selections have been saved."}
                        {isDenied && "Unfortunately, this address is outside our current service area and we're unable to provide service at this time."}
                    </p>
                </Card>
            )}

            {/* Admin-provided denial notes */}
            {isDenied && selectedLocation.serviceStatusNotes && (
                <Card className="!p-6 bg-gray-50 border-gray-200">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Reviewer Notes</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{selectedLocation.serviceStatusNotes}</p>
                </Card>
            )}

            {/* Pending services */}
            {(isPending || isWaitlist) && !isOrphaned && pendingServiceNames.length > 0 && (
                <Card className={`!p-6 ${isWaitlist ? 'bg-blue-50 border-blue-100' : 'bg-yellow-50 border-yellow-100'}`}>
                    <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isWaitlist ? 'text-blue-600' : 'text-yellow-600'}`}>
                        {isWaitlist ? 'Saved Services' : 'Pending Services'}
                    </p>
                    <ul className="space-y-1">
                        {pendingServiceNames.map(name => (
                            <li key={name} className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                <div className={`w-1.5 h-1.5 rounded-full ${isWaitlist ? 'bg-blue-400' : 'bg-yellow-400'}`} />
                                {name}
                            </li>
                        ))}
                    </ul>
                    <p className="text-[10px] text-gray-400 mt-3">Billing begins only after your address is approved.</p>
                </Card>
            )}

            {/* Denied actions */}
            {isDenied && (
                <Card className="!p-6">
                    {reviewRequested ? (
                        <div className="flex items-center gap-3">
                            <CheckCircleIcon className="w-6 h-6 text-primary flex-shrink-0" />
                            <div>
                                <p className="font-bold text-gray-900">Review Requested</p>
                                <p className="text-sm text-gray-500 mt-0.5">Your address has been moved to the waiting list and a support conversation has been created. We'll review it again and notify you of the outcome.</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            <p className="text-sm text-gray-500 mb-4">You can request a new review, join the waitlist for future expansion, or try a different address.</p>
                            <div className="flex flex-wrap gap-3">
                                <Button variant="primary" size="sm" onClick={handleRequestReview} disabled={requesting}>
                                    {requesting ? 'Requesting...' : 'Request Review'}
                                </Button>
                                <Button variant="secondary" size="sm" onClick={handleRemove} disabled={removing}>
                                    {removing ? 'Removing...' : 'Remove Address'}
                                </Button>
                                <Button variant="secondary" size="sm" onClick={onResumeSetup}>
                                    Try Different Address
                                </Button>
                            </div>
                        </>
                    )}
                </Card>
            )}
        </div>
    );
};

export default ServiceReviewStatus;
