
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useProperty } from '../App';
import { getSpecialPickupServices, getSpecialPickupRequests, requestSpecialPickup } from '../services/mockApiService';
import { SpecialPickupService, SpecialPickupRequest, Property } from '../types';
import { Card } from './Card';
import { Button } from './Button';
import Modal from './Modal';
import { CalendarDaysIcon, ArrowRightIcon, BuildingOffice2Icon, CheckCircleIcon, ClockIcon } from './Icons';

const PortfolioPickupCard: React.FC<{
    property: Property;
    requests: SpecialPickupRequest[];
    onSelect: (id: string) => void;
}> = ({ property, requests, onSelect }) => {
    const upcomingCount = requests.filter(r => r.propertyId === property.id && r.status === 'Scheduled').length;
    
    return (
        <Card className="hover:shadow-xl transition-all duration-300 border-none ring-1 ring-base-200 group">
            <div className="flex justify-between items-start mb-6">
                <div className="flex-1">
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">{property.serviceType}</p>
                    <h3 className="text-xl font-black text-gray-900 group-hover:text-primary transition-colors">{property.address}</h3>
                </div>
                {upcomingCount > 0 ? (
                    <div className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full flex items-center gap-2">
                        <ClockIcon className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">{upcomingCount} Scheduled</span>
                    </div>
                ) : (
                    <div className="px-3 py-1 bg-gray-50 text-gray-400 rounded-full">
                        <span className="text-[10px] font-black uppercase tracking-widest">No Active Requests</span>
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between border-t border-base-100 pt-4 mt-auto">
                <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">History</p>
                    <p className="text-sm font-bold text-gray-600 mt-1">{requests.filter(r => r.propertyId === property.id).length} Total Pickups</p>
                </div>
                <Button 
                    onClick={() => onSelect(property.id)} 
                    variant="primary" 
                    size="sm" 
                    className="rounded-xl px-5 py-2.5 font-black uppercase text-[10px] tracking-widest"
                >
                    Manage Requests <ArrowRightIcon className="w-4 h-4 ml-2" />
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

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedService, setSelectedService] = useState<SpecialPickupService | null>(null);
    const [pickupDate, setPickupDate] = useState('');
    const [isScheduling, setIsScheduling] = useState(false);

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

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleScheduleClick = (service: SpecialPickupService) => {
        setSelectedService(service);
        const today = new Date();
        today.setDate(today.getDate() + 1);
        setPickupDate(today.toISOString().split('T')[0]);
        setIsModalOpen(true);
    };

    const handleConfirmSchedule = async () => {
        if (!selectedService || !selectedProperty || !pickupDate) return;
        
        setIsScheduling(true);
        try {
            await requestSpecialPickup(selectedService.id, selectedProperty.id, pickupDate);
            await fetchData();
            setIsModalOpen(false);
        } catch (error) {
            console.error("Failed to schedule pickup:", error);
            alert("Scheduling failed. Please try again.");
        } finally {
            setIsScheduling(false);
        }
    };

    if (loading) {
        return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-primary"></div></div>;
    }

    // --- PORTFOLIO VIEW ---
    if (!selectedProperty) {
        const globalUpcoming = allRequests.filter(r => r.status === 'Scheduled').length;

        return (
            <div className="space-y-8 animate-in fade-in duration-500">
                <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-base-200 pb-8">
                    <div>
                        <h1 className="text-4xl font-black text-gray-900 tracking-tight">Special Requests Hub</h1>
                        <p className="text-gray-500 font-medium mt-1 text-lg">Portfolio-wide management for bulk and specialized collections.</p>
                    </div>
                    <div className="bg-primary/5 px-6 py-4 rounded-2xl border border-primary/10">
                        <p className="text-[10px] font-black text-primary uppercase tracking-widest leading-none">Global Scheduled</p>
                        <p className="text-2xl font-black text-gray-900 mt-1">{globalUpcoming} Pickups</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {properties.map(prop => (
                        <PortfolioPickupCard 
                            key={prop.id} 
                            property={prop} 
                            requests={allRequests} 
                            onSelect={setSelectedPropertyId} 
                        />
                    ))}
                </div>
            </div>
        );
    }

    // --- PROPERTY FOCUS VIEW ---
    const requests = allRequests.filter(r => r.propertyId === selectedProperty.id);
    const upcomingRequests = requests.filter(r => r.status === 'Scheduled').sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const pastRequests = requests.filter(r => r.status === 'Completed').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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

            <Card className="border-none ring-1 ring-base-200">
                <h2 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-8">Available Specialty Services</h2>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {services.map(service => (
                        <div key={service.id} className="group relative flex flex-col p-6 rounded-3xl bg-gray-50 border border-transparent hover:border-primary/20 hover:bg-white hover:shadow-xl transition-all duration-300">
                            <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                {service.icon}
                            </div>
                            <h3 className="text-xl font-black text-gray-900">{service.name}</h3>
                            <p className="text-sm text-gray-500 mt-2 font-medium leading-relaxed">{service.description}</p>
                            <div className="mt-8 flex items-baseline gap-1">
                                <span className="text-3xl font-black text-gray-900">${service.price.toFixed(0)}</span>
                                <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Flat Fee</span>
                            </div>
                            <Button onClick={() => handleScheduleClick(service)} className="w-full mt-6 rounded-2xl font-black uppercase tracking-widest text-xs py-4">
                                Schedule Pickup
                            </Button>
                        </div>
                    ))}
                </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
                                <div key={req.id} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                    <div>
                                        <p className="font-black text-gray-900 uppercase text-xs tracking-tight">{req.serviceName}</p>
                                        <p className="text-sm font-bold text-primary mt-1">{new Date(req.date + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })}</p>
                                    </div>
                                    <p className="font-black text-lg text-gray-900">${req.price.toFixed(2)}</p>
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
                                        <p className="font-bold text-gray-700 uppercase text-xs tracking-tight">{req.serviceName}</p>
                                        <p className="text-sm font-medium text-gray-400 mt-1">{new Date(req.date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</p>
                                    </div>
                                    <p className="font-bold text-gray-600">${req.price.toFixed(2)}</p>
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

            {selectedService && (
                <Modal 
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    title={`Schedule ${selectedService.name}`}
                >
                    <div className="space-y-6">
                        <p className="text-gray-500 font-medium text-sm leading-relaxed">
                            Pickups are scheduled between <span className="font-bold text-gray-900">7:00 AM and 5:00 PM</span> on your selected date. A flat service fee of <span className="font-black text-primary">${selectedService.price.toFixed(2)}</span> will be added to your next statement.
                        </p>
                        <div>
                            <label htmlFor="pickupDate" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Target Date</label>
                            <input 
                                type="date"
                                id="pickupDate"
                                value={pickupDate}
                                onChange={e => setPickupDate(e.target.value)}
                                min={new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split('T')[0]}
                                className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-colors"
                                required
                            />
                        </div>
                        <div className="flex gap-3 pt-4">
                            <Button variant="secondary" onClick={() => setIsModalOpen(false)} disabled={isScheduling} className="flex-1 rounded-xl uppercase tracking-widest text-xs font-black h-14">Cancel</Button>
                            <Button onClick={handleConfirmSchedule} disabled={isScheduling || !pickupDate} className="flex-1 rounded-xl uppercase tracking-widest text-xs font-black h-14 shadow-lg shadow-primary/20">
                                {isScheduling ? 'Processing...' : 'Confirm Schedule'}
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}

        </div>
    );
};

export default SpecialPickup;
