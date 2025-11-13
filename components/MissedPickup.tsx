
import React, { useState } from 'react';
import { useProperty } from '../App';
import { reportMissedPickup } from '../services/mockApiService';
import { Card } from './Card';
import { Button } from './Button';

const MissedPickup: React.FC = () => {
    const { selectedProperty } = useProperty();
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

    if (!selectedProperty) {
        return <div className="text-center p-8">Please select a property to report a missed pickup.</div>;
    }
    
    if (submitted) {
        return (
            <div className="max-w-2xl mx-auto">
                 <h1 className="text-3xl font-bold text-neutral mb-2">Report Submitted</h1>
                 <p className="text-gray-600 mb-6">
                    Thank you for your report for property: <span className="font-semibold text-neutral">{selectedProperty.address}</span>
                </p>
                <Card>
                    <div className="text-center py-12">
                         <h2 className="text-2xl font-semibold text-primary">We're on it!</h2>
                         <p className="mt-2 text-gray-600">Your report has been received and our team will investigate. We will contact you shortly with an update. Thank you for your patience.</p>
                         <Button onClick={() => setSubmitted(false)} className="mt-6">Submit Another Report</Button>
                    </div>
                </Card>
            </div>
        )
    }

    return (
        <div className="max-w-2xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold text-neutral">Report a Missed Pickup</h1>
                <p className="text-gray-600 mt-1">
                    Let us know if we missed you. Reporting for: <span className="font-semibold text-neutral">{selectedProperty.address}</span>
                </p>
            </div>
            <Card className="mt-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                     <div>
                        <label htmlFor="pickupDate" className="block text-sm font-medium text-gray-700">
                            What was the date of the missed pickup?
                        </label>
                        <input 
                            type="date"
                            id="pickupDate"
                            value={pickupDate}
                            onChange={e => setPickupDate(e.target.value)}
                            max={new Date().toISOString().split('T')[0]} // Cannot be a future date
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                            required
                        />
                    </div>
                     <div>
                        <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                            Additional Notes (optional)
                        </label>
                        <textarea
                            id="notes"
                            rows={4}
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="e.g., The can was out by 7 AM, but was not emptied."
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                        />
                    </div>
                    <div className="flex justify-end">
                         <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Submitting...' : 'Submit Report'}
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
};

export default MissedPickup;
