
import React, { useState, useEffect } from 'react';
import { useProperty } from '../App';
import { Card } from './Card';
import { Button } from './Button';
import { ServiceType, UpdatePropertyInfo } from '../types';

const DetailRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div className="flex flex-col sm:flex-row py-4 border-b border-base-200 last:border-b-0">
        <dt className="text-[10px] font-black text-gray-400 uppercase tracking-widest sm:w-1/3 my-auto">{label}</dt>
        <dd className="mt-1 text-sm text-neutral sm:mt-0 sm:w-2/3 font-bold">{value}</dd>
    </div>
);

const EditRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
     <div className="flex flex-col sm:flex-row py-4 border-b border-base-200 last:border-b-0">
        <dt className="text-[10px] font-black text-gray-400 uppercase tracking-widest sm:w-1/3 my-auto">{label}</dt>
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
                notes: selectedProperty.notes || '',
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
                notes: selectedProperty.notes || '',
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

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => (prev ? { ...prev, [name]: value } : null));
    };

    const handleRadioChange = (name: keyof UpdatePropertyInfo, value: 'yes' | 'no') => {
        setFormData(prev => (prev ? { ...prev, [name]: value } : null));
    };

    if (!selectedProperty) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-500">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mb-4">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                </div>
                <h3 className="text-xl font-black text-gray-900 tracking-tight">Select a Location</h3>
                <p className="text-gray-500 max-w-xs mt-2 font-medium">Please choose a specific property from the header dropdown to view its detailed settings.</p>
            </div>
        );
    }
    
    if (!formData) {
        return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-primary"></div></div>;
    }

    return (
        <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-end gap-4 border-b border-base-200 pb-8">
                <div>
                    <h1 className="text-4xl font-black text-gray-900 tracking-tight">Location Settings</h1>
                    <p className="text-gray-500 font-medium mt-1 text-lg">
                        Details for: <span className="font-bold text-gray-900">{selectedProperty.address}</span>
                    </p>
                </div>
                {!isEditing && (
                    <Button onClick={() => setIsEditing(true)} variant="primary" className="rounded-xl px-8 py-3 font-black uppercase text-xs tracking-widest shadow-lg shadow-primary/20">Edit Details</Button>
                )}
            </div>

            <Card className="border-none ring-1 ring-base-200 shadow-xl">
                {isEditing ? (
                    <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
                        <dl className="divide-y divide-base-100">
                            <DetailRow label="Service Address" value={selectedProperty.address} />
                            <EditRow label="Service Type">
                                 <select 
                                    name="serviceType" 
                                    value={formData.serviceType} 
                                    onChange={handleChange} 
                                    className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-colors appearance-none"
                                >
                                    <option value="personal">Personal Residence</option>
                                    <option value="commercial">Commercial / Business</option>
                                    <option value="short-term">Short-term Rental</option>
                                    <option value="rental">Rental (30+ day lease)</option>
                                    <option value="other">Other</option>
                                </select>
                            </EditRow>
                            <EditRow label="HOA / Gated">
                                <div className="flex items-center gap-6 h-full">
                                    <label className="flex items-center cursor-pointer group">
                                        <input type="radio" name="inHOA" value="yes" checked={formData.inHOA === 'yes'} onChange={() => handleRadioChange('inHOA', 'yes')} className="w-5 h-5 text-primary border-gray-300 focus:ring-primary" /> 
                                        <span className="ml-2 font-black uppercase text-[10px] tracking-widest text-gray-500 group-hover:text-primary transition-colors">Yes</span>
                                    </label>
                                    <label className="flex items-center cursor-pointer group">
                                        <input type="radio" name="inHOA" value="no" checked={formData.inHOA === 'no'} onChange={() => handleRadioChange('inHOA', 'no')} className="w-5 h-5 text-primary border-gray-300 focus:ring-primary" /> 
                                        <span className="ml-2 font-black uppercase text-[10px] tracking-widest text-gray-500 group-hover:text-primary transition-colors">No</span>
                                    </label>
                                </div>
                            </EditRow>
                            {formData.inHOA === 'yes' && (
                                <EditRow label="HOA Name">
                                    <input 
                                        type="text" 
                                        name="communityName" 
                                        value={formData.communityName} 
                                        onChange={handleChange} 
                                        placeholder="e.g. Baldwin Ridge HOA"
                                        className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-colors" 
                                        required 
                                    />
                                </EditRow>
                            )}
                            <EditRow label="Gate Access">
                                 <div className="flex items-center gap-6 h-full">
                                    <label className="flex items-center cursor-pointer group">
                                        <input type="radio" name="hasGateCode" value="yes" checked={formData.hasGateCode === 'yes'} onChange={() => handleRadioChange('hasGateCode', 'yes')} className="w-5 h-5 text-primary border-gray-300 focus:ring-primary" /> 
                                        <span className="ml-2 font-black uppercase text-[10px] tracking-widest text-gray-500 group-hover:text-primary transition-colors">Yes</span>
                                    </label>
                                    <label className="flex items-center cursor-pointer group">
                                        <input type="radio" name="hasGateCode" value="no" checked={formData.hasGateCode === 'no'} onChange={() => handleRadioChange('hasGateCode', 'no')} className="w-5 h-5 text-primary border-gray-300 focus:ring-primary" /> 
                                        <span className="ml-2 font-black uppercase text-[10px] tracking-widest text-gray-500 group-hover:text-primary transition-colors">No</span>
                                    </label>
                                </div>
                            </EditRow>
                            {formData.hasGateCode === 'yes' && (
                                 <EditRow label="Access Code">
                                    <input 
                                        type="text" 
                                        name="gateCode" 
                                        value={formData.gateCode} 
                                        onChange={handleChange} 
                                        placeholder="#1234"
                                        className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-colors" 
                                        required 
                                    />
                                </EditRow>
                            )}
                            <EditRow label="Service Instructions">
                                <textarea
                                    name="notes"
                                    value={formData.notes}
                                    onChange={handleChange}
                                    rows={4}
                                    placeholder="Add notes for the driver (e.g., 'Cans are behind the gate', 'Beware of dog')..."
                                    className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-colors resize-none"
                                />
                            </EditRow>
                        </dl>
                        <div className="flex justify-end gap-3 mt-8">
                            <Button type="button" variant="secondary" onClick={handleCancel} disabled={isSaving} className="rounded-xl px-8 font-black uppercase text-[10px] tracking-widest">Cancel</Button>
                            <Button type="submit" disabled={isSaving} className="rounded-xl px-12 py-3 font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20">
                                {isSaving ? 'Saving...' : 'Commit Changes'}
                            </Button>
                        </div>
                    </form>
                ) : (
                    <dl className="divide-y divide-base-100">
                        <DetailRow label="Service Address" value={selectedProperty.address} />
                        <DetailRow label="Service Type" value={formatServiceType(selectedProperty.serviceType)} />
                        <DetailRow 
                            label="In HOA / Gated" 
                            value={selectedProperty.inHOA ? 'Yes' : 'No'} 
                        />
                        {selectedProperty.inHOA && selectedProperty.communityName && (
                            <DetailRow label="Community Name" value={selectedProperty.communityName} />
                        )}
                        <DetailRow 
                            label="Has Gate Access" 
                            value={selectedProperty.hasGateCode ? 'Yes' : 'No'} 
                        />
                         {selectedProperty.hasGateCode && selectedProperty.gateCode && (
                            <DetailRow label="Access Code" value={selectedProperty.gateCode} />
                        )}
                        <DetailRow 
                            label="Service Instructions" 
                            value={
                                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 text-gray-600 italic font-medium leading-relaxed">
                                    {selectedProperty.notes || "No special instructions provided for this location."}
                                </div>
                            } 
                        />
                    </dl>
                )}
            </Card>
        </div>
    );
};

export default PropertySettings;
