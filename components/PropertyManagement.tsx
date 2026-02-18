
import React, { useState, useEffect, useMemo } from 'react';
import { useProperty } from '../PropertyContext.tsx';
import { getSubscriptions } from '../services/apiService.ts';
import { Property, Subscription } from '../types.ts';
import PropertyCard from './PropertyCard.tsx';
import { ListBulletIcon, CheckCircleIcon, PauseCircleIcon, XCircleIcon, PlusCircleIcon } from './Icons.tsx';
import { Card } from './Card.tsx';

type FilterStatus = 'all' | 'active' | 'paused' | 'canceled';

export interface PropertyWithStatus extends Property {
    status: 'active' | 'paused' | 'canceled';
    monthlyTotal: number;
    activeServicesCount: number;
}

const FilterButton: React.FC<{
    label: string;
    count: number;
    icon: React.ReactNode;
    isActive: boolean;
    onClick: () => void;
}> = ({ label, count, icon, isActive, onClick }) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-3 px-4 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all duration-300
            ${isActive
                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                : 'bg-white text-gray-500 hover:bg-gray-50 hover:text-primary'
            }`}
    >
        {icon}
        {label}
        <span className={`px-2 py-0.5 rounded-full text-[10px] ${isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>{count}</span>
    </button>
);

interface PropertyManagementProps {
    onAddProperty?: () => void;
}

const PropertyManagement: React.FC<PropertyManagementProps> = ({ onAddProperty }) => {
    const { properties, startNewServiceFlow } = useProperty();
    const handleAddProperty = onAddProperty || startNewServiceFlow;
    const [allSubscriptions, setAllSubscriptions] = useState<Subscription[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState<FilterStatus>('all');

    useEffect(() => {
        getSubscriptions().then(subs => {
            setAllSubscriptions(subs);
            setLoading(false);
        });
    }, []);

    const propertiesWithStatus = useMemo((): PropertyWithStatus[] => {
        return properties.map(prop => {
            const propSubs = allSubscriptions.filter(s => s.propertyId === prop.id);
            let status: 'active' | 'paused' | 'canceled' = 'canceled';
            if (propSubs.some(s => s.status === 'active')) {
                status = 'active';
            } else if (propSubs.some(s => s.status === 'paused')) {
                status = 'paused';
            }
            
            const activeSubs = propSubs.filter(s => s.status === 'active' || s.status === 'paused');
            return {
                ...prop,
                status,
                monthlyTotal: activeSubs.reduce((acc, s) => acc + s.totalPrice, 0),
                activeServicesCount: activeSubs.length,
            };
        });
    }, [properties, allSubscriptions]);

    const filteredProperties = useMemo(() => {
        if (activeFilter === 'all') return propertiesWithStatus;
        return propertiesWithStatus.filter(p => p.status === activeFilter);
    }, [propertiesWithStatus, activeFilter]);
    
    const filterCounts = useMemo(() => ({
        all: propertiesWithStatus.length,
        active: propertiesWithStatus.filter(p => p.status === 'active').length,
        paused: propertiesWithStatus.filter(p => p.status === 'paused').length,
        canceled: propertiesWithStatus.filter(p => p.status === 'canceled').length,
    }), [propertiesWithStatus]);

    if (loading) {
        return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary"></div></div>;
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-base-200 pb-8">
                <div>
                    <h1 className="text-4xl font-black text-gray-900 tracking-tight">Service Hub</h1>
                    <p className="text-gray-500 font-medium mt-1 text-lg">Manage collection plans for all your registered addresses.</p>
                </div>
            </div>

            {properties.length > 0 && (
                 <div className="flex flex-wrap items-center gap-3 p-3 bg-gray-100 rounded-2xl">
                    <FilterButton label="All" count={filterCounts.all} icon={<ListBulletIcon className="w-5 h-5" />} isActive={activeFilter === 'all'} onClick={() => setActiveFilter('all')} />
                    <FilterButton label="Active" count={filterCounts.active} icon={<CheckCircleIcon className="w-5 h-5" />} isActive={activeFilter === 'active'} onClick={() => setActiveFilter('active')} />
                    <FilterButton label="On Hold" count={filterCounts.paused} icon={<PauseCircleIcon className="w-5 h-5" />} isActive={activeFilter === 'paused'} onClick={() => setActiveFilter('paused')} />
                    <FilterButton label="Canceled" count={filterCounts.canceled} icon={<XCircleIcon className="w-5 h-5" />} isActive={activeFilter === 'canceled'} onClick={() => setActiveFilter('canceled')} />
                </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-500">
                {filteredProperties.map(prop => (
                    <PropertyCard key={prop.id} property={prop} />
                ))}

                {/* Always show this card in portfolio view, adapting text if it's the first one */}
                {(activeFilter === 'all' || properties.length === 0) && (
                    <Card 
                        onClick={handleAddProperty}
                        className="bg-gray-50 border-2 border-dashed border-gray-300 hover:border-primary hover:bg-primary/5 transition-all duration-300 cursor-pointer flex flex-col items-center justify-center text-center p-8 group min-h-[300px] sm:min-h-[370px]"
                    >
                        <PlusCircleIcon className="w-12 h-12 text-gray-400 group-hover:text-primary transition-colors mb-4" />
                        <h3 className="text-xl font-black text-gray-700 group-hover:text-primary transition-colors">
                             {properties.length > 0 ? 'Add New Service Address' : 'Add Your First Service Address'}
                        </h3>
                        <p className="text-sm text-gray-500 mt-2">
                            {properties.length > 0 ? 'Register a new property to manage its waste services.' : 'Get started by registering a property to manage its services.'}
                        </p>
                    </Card>
                )}

                {filteredProperties.length === 0 && properties.length > 0 && activeFilter !== 'all' && (
                    <div className="text-center py-20 bg-gray-50 rounded-2xl md:col-span-2 lg:col-span-3">
                        <h3 className="text-lg font-bold text-gray-500">No properties match the filter "{activeFilter}".</h3>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PropertyManagement;