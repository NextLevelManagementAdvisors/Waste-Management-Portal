
import React from 'react';
import Services from './Services.tsx';
import PropertySettings from './PropertySettings.tsx';
import Notifications from './Notifications.tsx';
import ServiceStatus from './ServiceStatus.tsx';
import PropertyManagement from './PropertyManagement.tsx';
import { useProperty } from '../PropertyContext.tsx';
import { Button } from './Button.tsx';

const Section: React.FC<{ title: string; subtitle: string; children: React.ReactNode; }> = ({ title, subtitle, children }) => (
    <div className="space-y-4">
        <div className="border-b border-base-200 pb-4">
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">{title}</h2>
            <p className="text-gray-500 font-medium mt-1">{subtitle}</p>
        </div>
        <div className="pt-4">
            {children}
        </div>
    </div>
);

const MyServiceHub: React.FC = () => {
    const { selectedProperty, setSelectedPropertyId } = useProperty();
    
    if (!selectedProperty) {
        return (
            <div className="animate-in fade-in duration-500">
                <PropertyManagement />
            </div>
        );
    }
    
    return (
        <div className="space-y-12 animate-in fade-in duration-500">
            <div className="flex justify-between items-end gap-4 border-b border-base-200 pb-8">
                <div>
                    <h1 className="text-4xl font-black text-gray-900 tracking-tight">Manage Property</h1>
                    <p className="text-gray-500 font-medium mt-1 text-lg">
                        Detailed view for: <span className="font-bold text-gray-900">{selectedProperty.address}</span>
                    </p>
                </div>
                <Button variant="secondary" onClick={() => setSelectedPropertyId('all')}>Back to All Properties</Button>
            </div>

            <Section title="Live Schedule & Status" subtitle="Track your upcoming collection and view route history.">
                <ServiceStatus />
            </Section>

            <Section title="Service Plan & Add-ons" subtitle="Adjust can quantities and add or remove optional upgrades.">
                <Services />
            </Section>
            
            <Section title="Location & Notification Settings" subtitle="Manage property details and communication preferences.">
                 <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">
                     <div className="lg:col-span-3">
                        <PropertySettings />
                     </div>
                     <div className="lg:col-span-2">
                        <Notifications />
                     </div>
                </div>
            </Section>
        </div>
    );
};

export default MyServiceHub;