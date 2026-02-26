import React, { useState, useEffect, useCallback } from 'react';
import { useProperty } from '../PropertyContext.tsx';
import {
    getSpecialPickupServices, getSpecialPickupRequests, requestSpecialPickup,
    uploadSpecialPickupPhotos, estimateSpecialPickup, cancelSpecialPickup, rescheduleSpecialPickup,
} from '../services/apiService.ts';
import { SpecialPickupService, SpecialPickupRequest, Property } from '../types.ts';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import Modal from './Modal.tsx';
import { CalendarDaysIcon, CheckCircleIcon, XMarkIcon, SparklesIcon } from './Icons.tsx';

const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    scheduled: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-gray-100 text-gray-500',
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-500'}`}>
        {status}
    </span>
);

const PortfolioPickupCard: React.FC<{
    property: Property;
    requests: SpecialPickupRequest[];
    onSelect: (id: string) => void;
}> = ({ property, requests, onSelect }) => {
    const upcomingCount = requests.filter(r => r.propertyId === property.id && (r.status === 'pending' || r.status === 'scheduled')).length;

    return (
        <Card className="flex flex-col p-6">
            <div className="flex justify-between items-center mb-2">
                <p className="text-[10px] font-black text-primary uppercase tracking-widest">{property.serviceType}</p>
                <div className="px-3 py-1 bg-gray-100 text-gray-500 rounded-full">
                    <span className="text-[10px] font-black uppercase tracking-widest">
                        {upcomingCount > 0 ? `${upcomingCount} Active` : 'No Active Requests'}
                    </span>
                </div>
            </div>
            <h3 className="text-2xl font-black text-gray-900 leading-tight mb-auto">{property.address}</h3>
            <div className="flex items-end justify-between mt-4">
                <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">History</p>
                    <p className="text-sm font-bold text-gray-600 mt-1">{requests.filter(r => r.propertyId === property.id).length} Total Pickups</p>
                </div>
                <Button onClick={() => onSelect(property.id)} variant="primary" className="rounded-lg px-4 py-3 font-black uppercase text-[10px] tracking-widest">
                    Manage Requests
                </Button>
            </div>
        </Card>
    );
};

const SpecialPickup: React.FC = () => {
    const { selectedProperty, properties, setSelectedPropertyId } = useProperty();
    const [services, setServices] = useState<SpecialPickupService[]>([]);
    const [allRequests, setAllRequests] = useState<SpecialPickupRequest[]>([]);
    const [loading, setLoading] = useState(true);

    // Schedule modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedService, setSelectedService] = useState<SpecialPickupService | null>(null);
    const [pickupDate, setPickupDate] = useState('');
    const [notes, setNotes] = useState('');
    const [photoFiles, setPhotoFiles] = useState<File[]>([]);
    const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
    const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);
    const [aiEstimate, setAiEstimate] = useState<{ estimate: number; reasoning: string } | null>(null);
    const [isEstimating, setIsEstimating] = useState(false);
    const [isScheduling, setIsScheduling] = useState(false);
    const [modalError, setModalError] = useState('');

    // Cancel/reschedule modal state
    const [actionTarget, setActionTarget] = useState<SpecialPickupRequest | null>(null);
    const [actionType, setActionType] = useState<'cancel' | 'reschedule' | null>(null);
    const [rescheduleDate, setRescheduleDate] = useState('');
    const [cancelReason, setCancelReason] = useState('');
    const [isActioning, setIsActioning] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [servicesData, requestsData] = await Promise.all([
                getSpecialPickupServices(),
                getSpecialPickupRequests()
            ]);
            setServices(servicesData);
            setAllRequests(requestsData);
        } catch (error) {
            console.error("Failed to fetch special pickup data:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const resetModal = () => {
        setNotes('');
        setPhotoFiles([]);
        setPhotoPreviews([]);
        setUploadedUrls([]);
        setAiEstimate(null);
        setIsEstimating(false);
        setIsScheduling(false);
        setModalError('');
    };

    const handleScheduleClick = (service: SpecialPickupService) => {
        resetModal();
        setSelectedService(service);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setPickupDate(tomorrow.toISOString().split('T')[0]);
        setIsModalOpen(true);
    };

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []).slice(0, 5 - photoFiles.length);
        const newFiles = [...photoFiles, ...files].slice(0, 5);
        setPhotoFiles(newFiles);
        setPhotoPreviews(newFiles.map(f => URL.createObjectURL(f)));
        // Reset AI estimate when photos change
        setAiEstimate(null);
    };

    const removePhoto = (index: number) => {
        const newFiles = photoFiles.filter((_, i) => i !== index);
        setPhotoFiles(newFiles);
        setPhotoPreviews(newFiles.map(f => URL.createObjectURL(f)));
        setAiEstimate(null);
    };

    const handleGetEstimate = async () => {
        if (!notes && photoFiles.length === 0) {
            setModalError('Add a description or photos to get an estimate');
            return;
        }
        setIsEstimating(true);
        setModalError('');
        try {
            // Upload photos first if not already uploaded
            let urls = uploadedUrls;
            if (photoFiles.length > 0 && uploadedUrls.length === 0) {
                urls = await uploadSpecialPickupPhotos(photoFiles);
                setUploadedUrls(urls);
            }
            const result = await estimateSpecialPickup(notes, urls);
            setAiEstimate(result);
        } catch (error: any) {
            setModalError(error.message || 'Failed to get estimate');
        } finally {
            setIsEstimating(false);
        }
    };

    const handleConfirmSchedule = async () => {
        if (!selectedService || !selectedProperty || !pickupDate) return;
        setIsScheduling(true);
        setModalError('');
        try {
            // Upload photos if we haven't already (user may have skipped estimate)
            let urls = uploadedUrls;
            if (photoFiles.length > 0 && uploadedUrls.length === 0) {
                urls = await uploadSpecialPickupPhotos(photoFiles);
                setUploadedUrls(urls);
            }
            await requestSpecialPickup(selectedService.id, selectedProperty.id, pickupDate, {
                notes: notes || undefined,
                photos: urls.length > 0 ? urls : undefined,
                aiEstimate: aiEstimate?.estimate,
                aiReasoning: aiEstimate?.reasoning,
            });
            await fetchData();
            setIsModalOpen(false);
            resetModal();
        } catch (error: any) {
            setModalError(error.message || 'Scheduling failed. Please try again.');
        } finally {
            setIsScheduling(false);
        }
    };

    const handleCancelPickup = async () => {
        if (!actionTarget) return;
        setIsActioning(true);
        try {
            await cancelSpecialPickup(actionTarget.id, cancelReason || undefined);
            await fetchData();
            setActionTarget(null);
            setActionType(null);
            setCancelReason('');
        } catch (error: any) {
            alert(error.message || 'Failed to cancel pickup');
        } finally {
            setIsActioning(false);
        }
    };

    const handleReschedulePickup = async () => {
        if (!actionTarget || !rescheduleDate) return;
        setIsActioning(true);
        try {
            await rescheduleSpecialPickup(actionTarget.id, rescheduleDate);
            await fetchData();
            setActionTarget(null);
            setActionType(null);
            setRescheduleDate('');
        } catch (error: any) {
            alert(error.message || 'Failed to reschedule pickup');
        } finally {
            setIsActioning(false);
        }
    };

    if (loading) {
        return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-primary"></div></div>;
    }

    // --- PORTFOLIO VIEW ---
    if (!selectedProperty) {
        const globalUpcoming = allRequests.filter(r => r.status === 'pending' || r.status === 'scheduled').length;
        return (
            <div className="space-y-8 animate-in fade-in duration-500">
                <div className="flex flex-col md:flex-row justify-between items-end gap-4">
                    <div>
                        <h1 className="text-4xl font-black text-gray-900 tracking-tight">Special Requests Hub</h1>
                        <p className="text-gray-500 font-medium mt-1 text-lg">Portfolio-wide management for bulk and specialized collections.</p>
                    </div>
                    <div className="bg-primary/5 px-6 py-4 rounded-2xl border border-primary/10">
                        <p className="text-[10px] font-black text-primary uppercase tracking-widest leading-none">Global Scheduled</p>
                        <p className="text-2xl font-black text-gray-900 mt-1">{globalUpcoming} Pickups</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                    {properties.map(prop => (
                        <PortfolioPickupCard key={prop.id} property={prop} requests={allRequests} onSelect={(id) => setSelectedPropertyId(id)} />
                    ))}
                </div>
            </div>
        );
    }

    // --- PROPERTY FOCUS VIEW ---
    const requests = allRequests.filter(r => r.propertyId === selectedProperty.id);
    const upcomingRequests = requests.filter(r => r.status === 'pending' || r.status === 'scheduled').sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const pastRequests = requests.filter(r => r.status === 'completed' || r.status === 'cancelled').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const minDate = new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split('T')[0];

    return (
        <div className="space-y-8 max-w-6xl mx-auto">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Special Pickups</h1>
                    <p className="text-gray-500 font-medium mt-1 text-lg">
                        Scheduling for: <span className="font-bold text-gray-900">{selectedProperty.address}</span>
                    </p>
                </div>
                <Button variant="ghost" onClick={() => setSelectedPropertyId('all')} className="text-xs font-black uppercase tracking-widest">
                    Back to Hub
                </Button>
            </div>

            {/* Available Services */}
            <Card className="border-none ring-1 ring-base-200">
                <h2 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-8">Available Specialty Services</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8">
                    {services.map(service => (
                        <div key={service.id} className="group relative flex flex-col p-6 rounded-3xl bg-gray-50 border border-transparent hover:border-primary/20 hover:bg-white hover:shadow-xl transition-all duration-300">
                            <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                {service.icon}
                            </div>
                            <h3 className="text-xl font-black text-gray-900">{service.name}</h3>
                            <p className="text-sm text-gray-500 mt-2 font-medium leading-relaxed">{service.description}</p>
                            <div className="mt-8 flex items-baseline gap-1">
                                <span className="text-3xl font-black text-gray-900">${Number(service.price).toFixed(0)}</span>
                                <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Starting</span>
                            </div>
                            <Button onClick={() => handleScheduleClick(service)} className="w-full mt-6 rounded-2xl font-black uppercase tracking-widest text-xs py-4">
                                Schedule Pickup
                            </Button>
                        </div>
                    ))}
                </div>
            </Card>

            {/* Upcoming & History */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-8">
                <Card className="border-none ring-1 ring-base-200">
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Upcoming Schedule</h3>
                        <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                            <CalendarDaysIcon className="w-4 h-4" />
                        </div>
                    </div>
                    {upcomingRequests.length > 0 ? (
                        <div className="space-y-3">
                            {upcomingRequests.map(req => (
                                <div key={req.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <p className="font-black text-gray-900 uppercase text-xs tracking-tight">{req.serviceName}</p>
                                                <StatusBadge status={req.status} />
                                            </div>
                                            <p className="text-sm font-bold text-primary">{new Date(req.date + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })}</p>
                                            {req.notes && <p className="text-xs text-gray-500 mt-1 line-clamp-1">{req.notes}</p>}
                                            {req.photos && req.photos.length > 0 && (
                                                <div className="flex gap-1 mt-2">
                                                    {req.photos.slice(0, 3).map((url, i) => (
                                                        <img key={i} src={url} alt="" className="w-8 h-8 rounded object-cover" />
                                                    ))}
                                                    {req.photos.length > 3 && <span className="text-xs text-gray-400 self-center">+{req.photos.length - 3}</span>}
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-right ml-4 flex-shrink-0">
                                            <p className="font-black text-lg text-gray-900">${Number(req.price).toFixed(2)}</p>
                                            <div className="flex gap-1 mt-2">
                                                <button
                                                    type="button"
                                                    onClick={() => { setActionTarget(req); setActionType('reschedule'); setRescheduleDate(req.date); }}
                                                    className="text-[9px] font-bold text-primary hover:underline uppercase tracking-widest"
                                                >
                                                    Reschedule
                                                </button>
                                                <span className="text-gray-300">|</span>
                                                <button
                                                    type="button"
                                                    onClick={() => { setActionTarget(req); setActionType('cancel'); }}
                                                    className="text-[9px] font-bold text-red-500 hover:underline uppercase tracking-widest"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-12 text-center">
                            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No scheduled collections</p>
                        </div>
                    )}
                </Card>
                <Card className="border-none ring-1 ring-base-200 bg-gray-50/30">
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Service History</h3>
                        <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center text-green-600">
                            <CheckCircleIcon className="w-4 h-4" />
                        </div>
                    </div>
                    {pastRequests.length > 0 ? (
                        <div className="space-y-3">
                            {pastRequests.map(req => (
                                <div key={req.id} className="flex justify-between items-center p-4 bg-white/50 rounded-2xl border border-white opacity-70">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="font-bold text-gray-700 uppercase text-xs tracking-tight">{req.serviceName}</p>
                                            <StatusBadge status={req.status} />
                                        </div>
                                        <p className="text-sm font-medium text-gray-400 mt-1">{new Date(req.date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</p>
                                    </div>
                                    <p className="font-bold text-gray-600">${Number(req.price).toFixed(2)}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-12 text-center">
                            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No past records found</p>
                        </div>
                    )}
                </Card>
            </div>

            {/* ── Schedule Modal (enhanced with notes, photos, AI estimate) ── */}
            {selectedService && (
                <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); resetModal(); }} title={`Schedule ${selectedService.name}`}>
                    <div className="space-y-5">
                        {modalError && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{modalError}</p>}

                        {/* Description */}
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Describe Your Items</label>
                            <textarea
                                value={notes}
                                onChange={e => { setNotes(e.target.value); setAiEstimate(null); }}
                                placeholder="e.g., 2 couches, 1 mattress, several bags of yard waste..."
                                rows={3}
                                className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-medium text-gray-900 text-sm focus:outline-none focus:border-primary transition-colors resize-none"
                            />
                        </div>

                        {/* Photo Upload */}
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                                Photos <span className="text-gray-300 normal-case font-medium">(up to 5)</span>
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {photoPreviews.map((src, i) => (
                                    <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border-2 border-base-200">
                                        <img src={src} alt="" className="w-full h-full object-cover" />
                                        <button type="button" title="Remove photo" onClick={() => removePhoto(i)} className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center">
                                            <XMarkIcon className="w-3 h-3 text-white" />
                                        </button>
                                    </div>
                                ))}
                                {photoFiles.length < 5 && (
                                    <label className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors">
                                        <span className="text-2xl text-gray-400">+</span>
                                        <input type="file" accept="image/*" multiple onChange={handlePhotoChange} className="hidden" />
                                    </label>
                                )}
                            </div>
                        </div>

                        {/* AI Estimate */}
                        <div className="bg-gradient-to-r from-primary/5 to-blue-50 rounded-xl p-4 border border-primary/10">
                            {aiEstimate ? (
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <SparklesIcon className="w-4 h-4 text-primary" />
                                        <span className="text-[10px] font-black text-primary uppercase tracking-widest">AI Estimate</span>
                                    </div>
                                    <p className="text-3xl font-black text-gray-900">${aiEstimate.estimate.toFixed(2)}</p>
                                    <p className="text-xs text-gray-500 mt-1">{aiEstimate.reasoning}</p>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleGetEstimate}
                                    disabled={isEstimating || (!notes && photoFiles.length === 0)}
                                    className="w-full flex items-center justify-center gap-2 py-2 text-sm font-bold text-primary disabled:text-gray-400 disabled:cursor-not-allowed hover:underline"
                                >
                                    <SparklesIcon className="w-4 h-4" />
                                    {isEstimating ? 'Analyzing...' : 'Get AI Price Estimate'}
                                </button>
                            )}
                        </div>

                        {/* Date */}
                        <div>
                            <label htmlFor="pickupDate" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Target Date</label>
                            <input
                                type="date"
                                id="pickupDate"
                                value={pickupDate}
                                onChange={e => setPickupDate(e.target.value)}
                                min={minDate}
                                className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-colors"
                                required
                            />
                        </div>

                        {/* Price Summary */}
                        <div className="border-t border-base-200 pt-4 flex justify-between items-baseline">
                            <span className="text-sm font-bold text-gray-500">Estimated Total</span>
                            <span className="text-2xl font-black text-gray-900">
                                ${(aiEstimate?.estimate ?? selectedService.price).toFixed(2)}
                            </span>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <Button variant="secondary" onClick={() => { setIsModalOpen(false); resetModal(); }} disabled={isScheduling} className="flex-1 rounded-xl uppercase tracking-widest text-xs font-black h-14">
                                Cancel
                            </Button>
                            <Button onClick={handleConfirmSchedule} disabled={isScheduling || !pickupDate} className="flex-1 rounded-xl uppercase tracking-widest text-xs font-black h-14 shadow-lg shadow-primary/20">
                                {isScheduling ? 'Processing...' : 'Confirm Schedule'}
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* ── Cancel Confirmation Modal ── */}
            {actionType === 'cancel' && actionTarget && (
                <Modal isOpen={true} onClose={() => { setActionType(null); setActionTarget(null); setCancelReason(''); }} title="Cancel Pickup">
                    <div className="space-y-4">
                        <p className="text-sm text-gray-600">
                            Cancel your <span className="font-bold text-gray-900">{actionTarget.serviceName}</span> pickup
                            on <span className="font-bold text-gray-900">{new Date(actionTarget.date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</span>?
                        </p>
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Reason (optional)</label>
                            <input
                                type="text"
                                value={cancelReason}
                                onChange={e => setCancelReason(e.target.value)}
                                placeholder="Why are you cancelling?"
                                className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-medium text-gray-900 text-sm focus:outline-none focus:border-primary transition-colors"
                            />
                        </div>
                        <div className="flex gap-3 pt-4">
                            <Button variant="secondary" onClick={() => { setActionType(null); setActionTarget(null); setCancelReason(''); }} disabled={isActioning} className="flex-1 rounded-xl uppercase tracking-widest text-xs font-black h-14">
                                Keep It
                            </Button>
                            <Button onClick={handleCancelPickup} disabled={isActioning} className="flex-1 rounded-xl uppercase tracking-widest text-xs font-black h-14 bg-red-600 hover:bg-red-700 shadow-lg shadow-red-500/20">
                                {isActioning ? 'Cancelling...' : 'Confirm Cancel'}
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* ── Reschedule Modal ── */}
            {actionType === 'reschedule' && actionTarget && (
                <Modal isOpen={true} onClose={() => { setActionType(null); setActionTarget(null); setRescheduleDate(''); }} title="Reschedule Pickup">
                    <div className="space-y-4">
                        <p className="text-sm text-gray-600">
                            Choose a new date for your <span className="font-bold text-gray-900">{actionTarget.serviceName}</span> pickup.
                        </p>
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">New Date</label>
                            <input
                                type="date"
                                value={rescheduleDate}
                                onChange={e => setRescheduleDate(e.target.value)}
                                min={minDate}
                                className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-colors"
                                required
                            />
                        </div>
                        <div className="flex gap-3 pt-4">
                            <Button variant="secondary" onClick={() => { setActionType(null); setActionTarget(null); setRescheduleDate(''); }} disabled={isActioning} className="flex-1 rounded-xl uppercase tracking-widest text-xs font-black h-14">
                                Cancel
                            </Button>
                            <Button onClick={handleReschedulePickup} disabled={isActioning || !rescheduleDate || rescheduleDate === actionTarget.date} className="flex-1 rounded-xl uppercase tracking-widest text-xs font-black h-14 shadow-lg shadow-primary/20">
                                {isActioning ? 'Updating...' : 'Confirm Reschedule'}
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default SpecialPickup;
