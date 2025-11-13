import React, { useState, useEffect } from 'react';
import { useProperty } from '../App';
import { Card } from './Card';
import { Button } from './Button';
import { ServiceType, UpdatePropertyInfo } from '../types';

const DetailRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div className="flex flex-col sm:flex-row py-4 border-b border-base-200 last:border-b-0">
        <dt className="text-sm font-medium text-gray-500 sm:w-1/3 my-auto">{label}</dt>
        <dd className="mt-1 text-sm text-neutral sm:mt-0 sm:w-2/3">{value}</dd>
    </div>
);

const EditRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
     <div className="flex flex-col sm:flex-row py-4 border-b border-base-200 last:border-b-0">
        <dt className="text-sm font-medium text-gray-500 sm:w-1/3 my-auto">{label}</dt>
        <dd className="mt-1 text-sm text-neutral sm:mt-0 sm:w-2/3">{children}</dd>
    </div>
);


const formatServiceType = (type: ServiceType) => {
    const words = type.replace('-', ' ').split(' ');
    return words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

const PropertySettings: React.FC = () => {
    const { selectedProperty, updateProperty } = useProperty();
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<UpdatePropertyInfo | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (selectedProperty) {
            setFormData({
                serviceType: selectedProperty.serviceType,
                inHOA: selectedProperty.inHOA ? 'yes' : 'no',
                communityName: selectedProperty.communityName || '',
                hasGateCode: selectedProperty.hasGateCode ? 'yes' : 'no',
                gateCode: selectedProperty.gateCode || '',
            });
            setIsEditing(false);
        }
    }, [selectedProperty]);

    const handleCancel = () => {
        if (selectedProperty) {
            setFormData({
                serviceType: selectedProperty.serviceType,
                inHOA: selectedProperty.inHOA ? 'yes' : 'no',
                communityName: selectedProperty.communityName || '',
                hasGateCode: selectedProperty.hasGateCode ? 'yes' : 'no',
                gateCode: selectedProperty.gateCode || '',
            });
        }
        setIsEditing(false);
    };

    const handleSave = async () => {
        if (!selectedProperty || !formData) return;
        setIsSaving(true);
        try {
            await updateProperty(selectedProperty.id, formData);
            setIsEditing(false);
        } catch (error) {
            alert("Failed to save changes. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => (prev ? { ...prev, [name]: value } : null));
    };

    const handleRadioChange = (name: keyof UpdatePropertyInfo, value: 'yes' | 'no') => {
        setFormData(prev => (prev ? { ...prev, [name]: value } : null));
    };

    if (!selectedProperty) {
        return <div className="text-center p-8">Please select a property to view its settings.</div>;
    }
    
    if (!formData) {
        return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-primary"></div></div>;
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold text-neutral">Property Settings</h1>
                <p className="text-gray-600 mt-1">
                    Viewing details for: <span className="font-semibold text-neutral">{selectedProperty.address}</span>
                </p>
            </div>

            <Card>
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-2xl font-semibold text-neutral">Property Details</h2>
                    {!isEditing && (
                        <Button variant="secondary" onClick={() => setIsEditing(true)}>Edit</Button>
                    )}
                </div>
                
                {isEditing ? (
                    <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
                        <dl>
                            <DetailRow label="Service Address" value={selectedProperty.address} />
                            <EditRow label="Service Type">
                                 <select name="serviceType" value={formData.serviceType} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary">
                                    <option value="personal">Personal Residence</option>
                                    <option value="commercial">Commercial / Business</option>
                                    <option value="short-term">Short-term Rental</option>
                                    <option value="rental">Rental (30+ day lease)</option>
                                    <option value="other">Other</option>
                                </select>
                            </EditRow>
                            <EditRow label="In HOA / Gated Community">
                                <div className="flex items-center gap-4 h-full">
                                    <label className="flex items-center"><input type="radio" name="inHOA" value="yes" checked={formData.inHOA === 'yes'} onChange={() => handleRadioChange('inHOA', 'yes')} className="form-radio" /> <span className="ml-2">Yes</span></label>
                                    <label className="flex items-center"><input type="radio" name="inHOA" value="no" checked={formData.inHOA === 'no'} onChange={() => handleRadioChange('inHOA', 'no')} className="form-radio" /> <span className="ml-2">No</span></label>
                                </div>
                            </EditRow>
                            {formData.inHOA === 'yes' && (
                                <EditRow label="Community Name">
                                    <input type="text" name="communityName" value={formData.communityName} onChange={handleChange} className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary" required />
                                </EditRow>
                            )}
                            <EditRow label="Has Gate Code">
                                 <div className="flex items-center gap-4 h-full">
                                    <label className="flex items-center"><input type="radio" name="hasGateCode" value="yes" checked={formData.hasGateCode === 'yes'} onChange={() => handleRadioChange('hasGateCode', 'yes')} className="form-radio" /> <span className="ml-2">Yes</span></label>
                                    <label className="flex items-center"><input type="radio" name="hasGateCode" value="no" checked={formData.hasGateCode === 'no'} onChange={() => handleRadioChange('hasGateCode', 'no')} className="form-radio" /> <span className="ml-2">No</span></label>
                                </div>
                            </EditRow>
                            {formData.hasGateCode === 'yes' && (
                                 <EditRow label="Gate Code">
                                    <input type="text" name="gateCode" value={formData.gateCode} onChange={handleChange} className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary" required />
                                </EditRow>
                            )}
                        </dl>
                        <div className="flex justify-end gap-3 mt-6">
                            <Button type="button" variant="secondary" onClick={handleCancel} disabled={isSaving}>Cancel</Button>
                            <Button type="submit" disabled={isSaving}>
                                {isSaving ? 'Saving...' : 'Save Changes'}
                            </Button>
                        </div>
                    </form>
                ) : (
                    <dl>
                        <DetailRow label="Service Address" value={selectedProperty.address} />
                        <DetailRow label="Service Type" value={formatServiceType(selectedProperty.serviceType)} />
                        <DetailRow 
                            label="In HOA / Gated Community" 
                            value={selectedProperty.inHOA ? 'Yes' : 'No'} 
                        />
                        {selectedProperty.inHOA && selectedProperty.communityName && (
                            <DetailRow label="Community Name" value={selectedProperty.communityName} />
                        )}
                        <DetailRow 
                            label="Has Gate Code" 
                            value={selectedProperty.hasGateCode ? 'Yes' : 'No'} 
                        />
                         {selectedProperty.hasGateCode && selectedProperty.gateCode && (
                            <DetailRow label="Gate Code" value={selectedProperty.gateCode} />
                        )}
                    </dl>
                )}
            </Card>
        </div>
    );
};

export default PropertySettings;