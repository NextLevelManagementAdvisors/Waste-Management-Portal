import React, { useState } from 'react';
import { useProperty } from '../PropertyContext.tsx';
import { reportMissedPickup } from '../services/mockApiService.ts';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import { ExclamationTriangleIcon, ArrowRightIcon, CheckCircleIcon } from './Icons.tsx';
import { Property } from '../types.ts';

const PortfolioMissedCard: React.FC<{
    property: Property;
    onSelect: (id: string) => void;
}> = ({ property, onSelect }) => {
    return (
        <Card className="flex flex-col p-6">
            <div className="flex justify-between items-center mb-2">
                <p className="text-[10px] font-black text-primary uppercase tracking-widest">{property.serviceType}</p>
                <div className="px-3 py-1 bg-gray-100 text-gray-500 rounded-full">
                    <span className="text-[10px] font-black uppercase tracking-widest">Ready to Report</span>
                </div>
            </div>

            <h3 className="text-2xl font-black text-gray-900 leading-tight mb-auto">
                {property.address}
            </h3>

            <div className="flex items-end justify-end mt-4">
                <Button 
                    onClick={() => onSelect(property.id)} 
                    variant="primary" 
                    className="rounded-lg px-4 py-3 font-black uppercase text-[10px] tracking-widest bg-red-600 hover:bg-red-700"
                >
                    Report Issue
                </Button>
            </div>
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
                <div className="flex flex-col md:flex-row justify-between items-end gap-4">
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
                            onSelect={(id) => setSelectedPropertyId(id)}
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