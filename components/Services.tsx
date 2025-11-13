
import React, { useEffect, useState } from 'react';
import { getServices, addSubscription } from '../services/mockApiService';
import { Service } from '../types';
import { Card } from './Card';
import { Button } from './Button';
import { useProperty } from '../App';

const Services: React.FC = () => {
    const { selectedProperty } = useProperty();
    const [services, setServices] = useState<Service[]>([]);
    const [loading, setLoading] = useState(true);
    const [subscribingId, setSubscribingId] = useState<string | null>(null);

    useEffect(() => {
        const fetchServices = async () => {
            setLoading(true);
            const data = await getServices();
            setServices(data);
            setLoading(false);
        };
        fetchServices();
    }, []);

    const handleSubscribe = async (service: Service) => {
        if (!selectedProperty) {
            alert("Please select a property before subscribing.");
            return;
        }
        setSubscribingId(service.id);
        try {
            await addSubscription(service, selectedProperty.id);
            alert(`Successfully subscribed to ${service.name} for ${selectedProperty.address}!`);
        } catch (error) {
            console.error("Failed to subscribe:", error);
            alert("Subscription failed. Please try again.");
        } finally {
            setSubscribingId(null);
        }
    };

    if (loading) {
        return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-primary"></div></div>;
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-neutral">Explore Our Services</h1>
            <p className="text-gray-600">
                Choose services to add to your currently selected property: <span className="font-semibold text-neutral">{selectedProperty?.address || 'None'}</span>.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {services.map(service => (
                    <Card key={service.id} className="flex flex-col">
                        <div className="flex justify-center p-6 bg-secondary rounded-t-lg">
                             {service.icon}
                        </div>
                        <div className="p-6 flex flex-col flex-grow">
                            <h3 className="text-xl font-semibold text-neutral">{service.name}</h3>
                            <p className="text-gray-500 mt-2 flex-grow">{service.description}</p>
                            <div className="mt-4">
                                <span className="text-3xl font-bold text-primary">${service.price.toFixed(2)}</span>
                                <span className="text-gray-500">/{service.frequency}</span>
                            </div>
                        </div>
                        <div className="p-6 pt-0 mt-auto">
                            <Button 
                                onClick={() => handleSubscribe(service)} 
                                className="w-full"
                                disabled={subscribingId === service.id || !selectedProperty}
                                title={!selectedProperty ? "Select a property to subscribe" : `Subscribe to ${service.name}`}
                            >
                                {subscribingId === service.id ? 'Subscribing...' : 'Subscribe'}
                            </Button>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
};

export default Services;
