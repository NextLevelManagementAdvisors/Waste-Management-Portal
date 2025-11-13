
import React, { useState, useEffect, useCallback } from 'react';
import { useProperty } from '../App';
import { getSpecialPickupServices, getSpecialPickupRequests, requestSpecialPickup } from '../services/mockApiService';
import { SpecialPickupService, SpecialPickupRequest } from '../types';
import { Card } from './Card';
import { Button } from './Button';
import Modal from './Modal';

const SpecialPickup: React.FC = () => {
    const { selectedProperty } = useProperty();
    const [services, setServices] = useState<SpecialPickupService[]>([]);
    const [requests, setRequests] = useState<SpecialPickupRequest[]>([]);
    const [loading, setLoading] = useState(true);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedService, setSelectedService] = useState<SpecialPickupService | null>(null);
    const [pickupDate, setPickupDate] = useState('');
    const [isScheduling, setIsScheduling] = useState(false);

    const fetchData = useCallback(async () => {
        if (!selectedProperty) return;
        setLoading(true);
        try {
            const [servicesData, requestsData] = await Promise.all([
                getSpecialPickupServices(),
                getSpecialPickupRequests()
            ]);
            setServices(servicesData);
            setRequests(requestsData.filter(r => r.propertyId === selectedProperty.id));
        } catch (error) {
            console.error("Failed to fetch special pickup data:", error);
        } finally {
            setLoading(false);
        }
    }, [selectedProperty]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleScheduleClick = (service: SpecialPickupService) => {
        setSelectedService(service);
        const today = new Date();
        today.setDate(today.getDate() + 1); // Earliest pickup is tomorrow
        setPickupDate(today.toISOString().split('T')[0]);
        setIsModalOpen(true);
    };

    const handleConfirmSchedule = async () => {
        if (!selectedService || !selectedProperty || !pickupDate) return;
        
        setIsScheduling(true);
        try {
            await requestSpecialPickup(selectedService.id, selectedProperty.id, pickupDate);
            alert(`Successfully scheduled ${selectedService.name} for ${pickupDate}! An invoice has been added to your billing history.`);
            await fetchData(); // Refresh data
            setIsModalOpen(false);
        } catch (error) {
            console.error("Failed to schedule pickup:", error);
            alert("Scheduling failed. Please try again.");
        } finally {
            setIsScheduling(false);
        }
    };

    if (!selectedProperty) {
        return <div className="text-center p-8">Please select a property to manage special pickups.</div>;
    }

    if (loading) {
        return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-primary"></div></div>;
    }

    const upcomingRequests = requests.filter(r => r.status === 'Scheduled').sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const pastRequests = requests.filter(r => r.status === 'Completed').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-neutral">Special Pickups</h1>
                <p className="text-gray-600 mt-1">
                    Schedule one-time pickups for: <span className="font-semibold text-neutral">{selectedProperty.address}</span>
                </p>
            </div>

            <Card>
                <h2 className="text-2xl font-semibold text-neutral mb-4">Available Services</h2>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {services.map(service => (
                        <div key={service.id} className="border border-base-300 rounded-lg p-6 flex flex-col items-center text-center">
                            {service.icon}
                            <h3 className="text-xl font-semibold text-neutral mt-4">{service.name}</h3>
                            <p className="text-gray-500 mt-2 flex-grow">{service.description}</p>
                            <div className="mt-4">
                                <span className="text-3xl font-bold text-primary">${service.price.toFixed(2)}</span>
                            </div>
                            <Button onClick={() => handleScheduleClick(service)} className="w-full mt-6">
                                Schedule
                            </Button>
                        </div>
                    ))}
                </div>
            </Card>

            <div>
                <h2 className="text-2xl font-semibold text-neutral mb-4">Your Pickup History</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                        <h3 className="text-xl font-semibold text-neutral mb-4">Upcoming</h3>
                        {upcomingRequests.length > 0 ? (
                             <ul className="space-y-3">
                                {upcomingRequests.map(req => (
                                    <li key={req.id} className="flex justify-between items-center p-3 bg-base-200 rounded-md">
                                        <div>
                                            <p className="font-semibold">{req.serviceName}</p>
                                            <p className="text-sm text-gray-600">{new Date(req.date + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}</p>
                                        </div>
                                        <p className="font-semibold text-primary">${req.price.toFixed(2)}</p>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-center text-gray-500 py-4">No upcoming pickups scheduled.</p>
                        )}
                    </Card>
                     <Card>
                        <h3 className="text-xl font-semibold text-neutral mb-4">Past</h3>
                        {pastRequests.length > 0 ? (
                            <ul className="space-y-3">
                                {pastRequests.map(req => (
                                    <li key={req.id} className="flex justify-between items-center p-3 bg-base-200 rounded-md opacity-75">
                                        <div>
                                            <p className="font-semibold">{req.serviceName}</p>
                                            <p className="text-sm text-gray-600">{new Date(req.date + 'T00:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}</p>
                                        </div>
                                        <p className="font-semibold">${req.price.toFixed(2)}</p>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                             <p className="text-center text-gray-500 py-4">No past pickups for this property.</p>
                        )}
                    </Card>
                </div>
            </div>

            {selectedService && (
                <Modal 
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    title={`Schedule ${selectedService.name}`}
                >
                    <div>
                        <p className="text-gray-600 mb-4">Select a date for your pickup. A one-time charge of <strong>${selectedService.price.toFixed(2)}</strong> will be added to your account.</p>
                        <div>
                            <label htmlFor="pickupDate" className="block text-sm font-medium text-gray-700">Pickup Date</label>
                            <input 
                                type="date"
                                id="pickupDate"
                                value={pickupDate}
                                onChange={e => setPickupDate(e.target.value)}
                                min={new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split('T')[0]} // Tomorrow
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                                required
                            />
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <Button variant="secondary" onClick={() => setIsModalOpen(false)} disabled={isScheduling}>Cancel</Button>
                            <Button onClick={handleConfirmSchedule} disabled={isScheduling || !pickupDate}>
                                {isScheduling ? 'Scheduling...' : 'Confirm Pickup'}
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}

        </div>
    );
};

export default SpecialPickup;