import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from '../LocationContext.tsx';
import { reportMissedCollection, uploadMissedCollectionPhotos, getMissedCollections } from '../services/apiService.ts';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import { ExclamationTriangleIcon, CheckCircleIcon, XMarkIcon, ClockIcon } from './Icons.tsx';
import { Location } from '../types.ts';

const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    investigating: 'bg-orange-100 text-orange-800',
    resolved_customer_issue: 'bg-green-100 text-green-800',
    resolved_system_issue: 'bg-green-100 text-green-800',
    false_positive: 'bg-gray-100 text-gray-500',
};

const STATUS_LABELS: Record<string, string> = {
    pending: 'Pending',
    investigating: 'Investigating',
    resolved_customer_issue: 'Resolved',
    resolved_system_issue: 'Resolved',
    false_positive: 'Closed',
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-500'}`}>
        {STATUS_LABELS[status] || status}
    </span>
);

const PortfolioMissedCard: React.FC<{
    location: Location;
    onSelect: (id: string) => void;
}> = ({ location, onSelect }) => {
    return (
        <Card className="flex flex-col p-6">
            <div className="flex justify-between items-center mb-2">
                <p className="text-[10px] font-black text-primary uppercase tracking-widest">{location.serviceType}</p>
                <div className="px-3 py-1 bg-gray-100 text-gray-500 rounded-full">
                    <span className="text-[10px] font-black uppercase tracking-widest">Ready to Report</span>
                </div>
            </div>

            <h3 className="text-2xl font-black text-gray-900 leading-tight mb-auto">
                {location.address}
            </h3>

            <div className="flex items-end justify-end mt-4">
                <Button
                    onClick={() => onSelect(location.id)}
                    variant="primary"
                    className="rounded-lg px-4 py-3 font-black uppercase text-[10px] tracking-widest bg-red-600 hover:bg-red-700"
                >
                    Report Issue
                </Button>
            </div>
        </Card>
    );
};

type MissedReport = {
    id: string;
    location_id: string;
    collection_date: string;
    notes: string;
    photos: string[];
    status: string;
    resolution_notes: string | null;
    created_at: string;
    address?: string;
};

const MissedCollection: React.FC = () => {
    const { selectedLocation, locations, setSelectedLocationId } = useLocation();
    const [pickupDate, setPickupDate] = useState(new Date().toISOString().split('T')[0]);
    const [notes, setNotes] = useState('');
    const [photoFiles, setPhotoFiles] = useState<File[]>([]);
    const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    // Report history
    const [reports, setReports] = useState<MissedReport[]>([]);
    const [loadingReports, setLoadingReports] = useState(true);

    const fetchReports = useCallback(async () => {
        try {
            const data = await getMissedCollections();
            setReports(data);
        } catch {
            // silent fail for history
        } finally {
            setLoadingReports(false);
        }
    }, []);

    useEffect(() => { fetchReports(); }, [fetchReports]);

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []).slice(0, 3 - photoFiles.length);
        const newFiles = [...photoFiles, ...files].slice(0, 3);
        setPhotoFiles(newFiles);
        setPhotoPreviews(newFiles.map(f => URL.createObjectURL(f)));
    };

    const removePhoto = (index: number) => {
        const newFiles = photoFiles.filter((_, i) => i !== index);
        setPhotoFiles(newFiles);
        setPhotoPreviews(newFiles.map(f => URL.createObjectURL(f)));
    };

    const resetForm = () => {
        setNotes('');
        setPhotoFiles([]);
        setPhotoPreviews([]);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedLocation) return;

        setIsSubmitting(true);
        setSubmitted(false);
        try {
            let photoUrls: string[] = [];
            if (photoFiles.length > 0) {
                photoUrls = await uploadMissedCollectionPhotos(photoFiles);
            }
            await reportMissedCollection(selectedLocation.id, pickupDate, notes, photoUrls.length > 0 ? photoUrls : undefined);
            setSubmitted(true);
            resetForm();
            fetchReports();
        } catch (error) {
            console.error("Failed to report missed collection:", error);
            alert("Report failed. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- PORTFOLIO VIEW ---
    if (!selectedLocation) {
        return (
            <div className="space-y-8 animate-in fade-in duration-500">
                <div className="flex flex-col md:flex-row justify-between items-end gap-4">
                    <div>
                        <h1 className="text-4xl font-black text-gray-900 tracking-tight">Missed Collection Hub</h1>
                        <p className="text-gray-500 font-medium mt-1 text-lg">Report service failures across your location portfolio.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {locations.map(loc => (
                        <PortfolioMissedCard
                            key={loc.id}
                            location={loc}
                            onSelect={(id) => setSelectedLocationId(id)}
                        />
                    ))}
                </div>
            </div>
        );
    }

    // --- SUCCESS VIEW ---
    if (submitted) {
        return (
            <div className="max-w-2xl mx-auto space-y-8 animate-in zoom-in duration-300">
                <div className="text-center">
                    <div className="w-20 h-20 bg-green-100 text-green-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
                        <CheckCircleIcon className="w-12 h-12" />
                    </div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Report Received</h1>
                    <p className="text-gray-500 font-medium mt-2">
                        Incident report submitted for <span className="font-bold text-gray-900">{selectedLocation.address}</span>
                    </p>
                </div>
                <Card className="border-none ring-1 ring-base-200">
                    <div className="text-center py-6">
                         <h2 className="text-xl font-black text-gray-900 uppercase tracking-widest">We're on it!</h2>
                         <p className="mt-4 text-gray-500 font-medium leading-relaxed">Our dispatch team has been notified. We will review the route history for <span className="font-bold text-gray-900">{pickupDate}</span> and schedule a recovery collection if verified. You'll receive an SMS update shortly.</p>
                         <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
                            <Button onClick={() => setSubmitted(false)} variant="secondary" className="rounded-xl px-8 font-black uppercase tracking-widest text-xs h-14">Submit Another</Button>
                            <Button onClick={() => setSelectedLocationId('all')} className="rounded-xl px-8 font-black uppercase tracking-widest text-xs h-14">Back to Hub</Button>
                         </div>
                    </div>
                </Card>
            </div>
        )
    }

    // Filter reports for this location
    const locationReports = reports.filter(r => r.location_id === selectedLocation.id);

    // --- FORM VIEW ---
    return (
        <div className="max-w-2xl mx-auto space-y-8">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Report Incident</h1>
                    <p className="text-gray-500 font-medium mt-1 text-lg">
                        Filing for: <span className="font-bold text-gray-900">{selectedLocation.address}</span>
                    </p>
                </div>
                <Button variant="ghost" onClick={() => setSelectedLocationId('all')} className="text-xs font-black uppercase tracking-widest">
                    Back to Hub
                </Button>
            </div>

            <Card className="border-none ring-1 ring-base-200 shadow-2xl">
                <form onSubmit={handleSubmit} className="space-y-8">
                     <div>
                        <label htmlFor="pickupDate" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">
                            Missed Collection Date
                        </label>
                        <input
                            type="date"
                            id="pickupDate"
                            value={pickupDate}
                            onChange={e => setPickupDate(e.target.value)}
                            max={new Date().toISOString().split('T')[0]}
                            className="w-full bg-gray-50 border-2 border-base-200 rounded-2xl px-6 py-4 font-bold text-gray-900 focus:outline-none focus:border-red-500 transition-colors"
                            required
                        />
                    </div>
                     <div>
                        <label htmlFor="notes" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">
                            Details & Observations
                        </label>
                        <textarea
                            id="notes"
                            rows={4}
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="e.g., Cans were at the curb by 6:00 AM, but the truck bypassed the street."
                            className="w-full bg-gray-50 border-2 border-base-200 rounded-2xl px-6 py-4 font-bold text-gray-900 focus:outline-none focus:border-red-500 transition-colors resize-none"
                        />
                    </div>

                    {/* Photo Evidence */}
                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">
                            Photo Evidence <span className="text-gray-300 normal-case font-medium">(optional, up to 3)</span>
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
                            {photoFiles.length < 3 && (
                                <label className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-red-400 hover:bg-red-50/50 transition-colors">
                                    <span className="text-2xl text-gray-400">+</span>
                                    <input type="file" accept="image/*" multiple onChange={handlePhotoChange} className="hidden" />
                                </label>
                            )}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-2">Upload photos showing bins were out, damage, or other evidence.</p>
                    </div>

                    <div className="bg-red-50 p-6 rounded-2xl border border-red-100 flex gap-4">
                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center flex-shrink-0 text-red-500">
                            <ExclamationTriangleIcon className="w-5 h-5" />
                        </div>
                        <p className="text-xs font-bold text-red-700 leading-relaxed italic">
                            Fraudulent reports (e.g., cans not out on time) may result in a $15.00 recovery dispatch fee. Please ensure your waste was at the curb by 7:00 AM.
                        </p>
                    </div>
                    <div className="flex justify-end pt-4">
                         <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto h-16 px-12 rounded-2xl font-black uppercase tracking-widest text-sm bg-red-600 hover:bg-red-700 border-none shadow-xl shadow-red-900/20">
                            {isSubmitting ? 'Submitting...' : 'Submit Incident Report'}
                        </Button>
                    </div>
                </form>
            </Card>

            {/* Report History (C-44) */}
            {!loadingReports && locationReports.length > 0 && (
                <Card className="border-none ring-1 ring-base-200">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">My Reports</h3>
                        <div className="w-8 h-8 rounded-full bg-yellow-50 flex items-center justify-center text-yellow-600">
                            <ClockIcon className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="space-y-3">
                        {locationReports.map(report => (
                            <div key={report.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className="font-black text-gray-900 uppercase text-xs tracking-tight">
                                                {new Date(report.collection_date + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}
                                            </p>
                                            <StatusBadge status={report.status} />
                                        </div>
                                        {report.notes && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{report.notes}</p>}
                                        {report.photos && report.photos.length > 0 && (
                                            <div className="flex gap-1 mt-2">
                                                {report.photos.slice(0, 3).map((url, i) => (
                                                    <img key={i} src={url} alt="" className="w-8 h-8 rounded object-cover" />
                                                ))}
                                            </div>
                                        )}
                                        {report.resolution_notes && (
                                            <p className="text-xs text-green-700 mt-2 bg-green-50 rounded-lg px-3 py-1.5 inline-block">
                                                {report.resolution_notes}
                                            </p>
                                        )}
                                    </div>
                                    <p className="text-[10px] font-bold text-gray-400 ml-4 flex-shrink-0">
                                        {new Date(report.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}
        </div>
    );
};

export default MissedCollection;
