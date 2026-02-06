
import React, { useState } from 'react';
import { useProperty } from '../App';
import { reportMissedPickup } from '../services/mockApiService';
import { Card } from './Card';
import { Button } from './Button';
import { ExclamationTriangleIcon, BuildingOffice2Icon, ArrowRightIcon, CheckCircleIcon } from './Icons';
import { Property } from '../types';

const PortfolioMissedCard: React.FC<{
    property: Property;
    onSelect: (id: string) => void;
}> = ({ property, onSelect }) => {
    return (
        <Card className="hover:shadow-xl transition-all duration-300 border-none ring-1 ring-base-200 group hover:ring-red-200">
            <div className="flex justify-between items-start mb-6">
                <div className="flex-1">
                    <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-1">Service Incident</p>
                    <h3 className="text-xl font-black text-gray-900 group-hover:text-red-600 transition-colors">{property.address}</h3>
                </div>
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-500 group-hover:bg-red-500 group-hover:text-white transition-all">
                    <ExclamationTriangleIcon className="w-6 h-6" />
                </div>
            </div>

            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 mb-6">
                <p className="text-xs font-medium text-gray-500 leading-relaxed">Was your collection missed? File an incident report to dispatch a recovery truck.</p>
            </div>

            <Button 
                onClick={() => onSelect(property.id)} 
                variant="primary" 
                size="sm" 
                className="w-full rounded-xl py-3 font-black uppercase text-[10px] tracking-widest bg-red-600 hover:bg-red-700 border-none shadow-lg shadow-red-900/10"
            >
                Report Missed Pickup <ArrowRightIcon className="w-4 h-4 ml-2" />
            </Button>
        </Card>
    );
};

const MissedPickup: React.FC = () => {
    const { selectedProperty, properties, setSelectedPropertyId } = useProperty();
    const [pickupDate, setPickupDate] = useState(new Date().toISOString().split('T')[0]);
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProperty) return;
        
        setIsSubmitting(true);
        setSubmitted(false);
        try {
            await reportMissedPickup(selectedProperty.id, pickupDate, notes);
            setSubmitted(true);
            setNotes('');
        } catch (error) {
            console.error("Failed to report missed pickup:", error);
            alert("Report failed. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- PORTFOLIO VIEW ---
    if (!selectedProperty) {
        return (
            <div className="space-y-8 animate-in fade-in duration-500">
                <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-base-200 pb-8">
                    <div>
                        <h1 className="text-4xl font-black text-gray-900 tracking-tight">Missed Pickup Hub</h1>
                        <p className="text-gray-500 font-medium mt-1 text-lg">Report service failures across your property portfolio.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {properties.map(prop => (
                        <PortfolioMissedCard 
                            key={prop.id} 
                            property={prop} 
                            onSelect={setSelectedPropertyId} 
                        />
                    ))}
                    <Card className="bg-gray-50 border-dashed border-2 flex flex-col items-center justify-center text-center p-8 min-h-[250px]">
                        <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-gray-400 mb-4 shadow-sm">
                            <CheckCircleIcon className="w-6 h-6" />
                        </div>
                        <h4 className="font-black text-gray-400 uppercase text-[10px] tracking-widest">Help Center</h4>
                        <p className="text-sm font-bold text-gray-500 mt-2">Check your account alerts for planned holiday delays before reporting.</p>
                    </Card>
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
                        Incident report submitted for <span className="font-bold text-gray-900">{selectedProperty.address}</span>
                    </p>
                </div>
                <Card className="border-none ring-1 ring-base-200">
                    <div className="text-center py-6">
                         <h2 className="text-xl font-black text-gray-900 uppercase tracking-widest">We're on it!</h2>
                         <p className="mt-4 text-gray-500 font-medium leading-relaxed">Our dispatch team has been notified. We will review the route history for <span className="font-bold text-gray-900">{pickupDate}</span> and schedule a recovery collection if verified. You'll receive an SMS update shortly.</p>
                         <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
                            <Button onClick={() => setSubmitted(false)} variant="secondary" className="rounded-xl px-8 font-black uppercase tracking-widest text-xs h-14">Submit Another</Button>
                            <Button onClick={() => setSelectedPropertyId('all')} className="rounded-xl px-8 font-black uppercase tracking-widest text-xs h-14">Back to Hub</Button>
                         </div>
                    </div>
                </Card>
            </div>
        )
    }

    // --- FORM VIEW ---
    return (
        <div className="max-w-2xl mx-auto space-y-8">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Report Incident</h1>
                    <p className="text-gray-500 font-medium mt-1 text-lg">
                        Filing for: <span className="font-bold text-gray-900">{selectedProperty.address}</span>
                    </p>
                </div>
                <Button variant="ghost" onClick={() => setSelectedPropertyId('all')} className="text-xs font-black uppercase tracking-widest">
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
                            {isSubmitting ? 'Verifying...' : 'Submit Incident Report'}
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
};

export default MissedPickup;
