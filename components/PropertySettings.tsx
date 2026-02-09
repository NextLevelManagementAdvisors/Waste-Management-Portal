
import React, { useState, useEffect, useMemo } from 'react';
import { useProperty } from '../PropertyContext.tsx';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import Modal from './Modal.tsx';
import { ServiceType, UpdatePropertyInfo } from '../types.ts';
import { getSubscriptions } from '../services/mockApiService.ts';
import { ExclamationTriangleIcon, CheckCircleIcon, PlayCircleIcon } from './Icons.tsx';

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
    const { selectedProperty, updateProperty, cancelPropertyServices, restartPropertyServices } = useProperty();
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<UpdatePropertyInfo | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [cancelConfirmation, setCancelConfirmation] = useState('');
    const [isCanceling, setIsCanceling] = useState(false);
    const [isRestarting, setIsRestarting] = useState(false);
    const [propertyStatus, setPropertyStatus] = useState<'active' | 'canceled'>('active');

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
            
            // Check current subscription status
            getSubscriptions().then(subs => {
                const hasActiveSub = subs.some(s => s.propertyId === selectedProperty.id && s.status !== 'canceled');
                setPropertyStatus(hasActiveSub ? 'active' : 'canceled');
            });
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

    const handleConfirmCancellation = async () => {
        if (!selectedProperty || cancelConfirmation !== 'CANCEL') return;
        setIsCanceling(true);
        try {
            await cancelPropertyServices(selectedProperty.id);
            setPropertyStatus('canceled');
            setIsCancelModalOpen(false);
        } catch(error) {
            alert("Failed to cancel services. Please try again.");
        } finally {
            setIsCanceling(false);
            setCancelConfirmation('');
        }
    };

    const handleRestartServices = async () => {
        if (!selectedProperty) return;
        setIsRestarting(true);
        try {
            await restartPropertyServices(selectedProperty.id);
            setPropertyStatus('active');
        } catch(error) {
            alert("Failed to restart services. Please try again.");
        } finally {
            setIsRestarting(false);
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
        // This view is now only rendered when a property is selected
        return null;
    }
    
    if (!formData) {
        return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-primary"></div></div>;
    }

    const isTransferPending = selectedProperty.transferStatus === 'pending';

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-black text-gray-900 tracking-tight">Property Details</h3>
                {!isEditing && (
                    <Button onClick={() => setIsEditing(true)} variant="secondary" className="rounded-lg px-4 py-2 font-black uppercase text-[10px] tracking-widest">Edit</Button>
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

            <div className="mt-12">
                <Card className={`border-2 shadow-lg ${isTransferPending ? 'border-gray-300 bg-gray-50' : 'border-red-500 bg-red-50/50'}`}>
                    <h3 className={`text-xl font-black tracking-tight ${isTransferPending ? 'text-gray-500' : 'text-red-800'}`}>Danger Zone</h3>
                    <p className={`text-sm mt-1 font-medium ${isTransferPending ? 'text-gray-500' : 'text-red-700'}`}>
                        {isTransferPending ? 'Actions are disabled while an account transfer is in progress.' : 'These actions are permanent and cannot be undone.'}
                    </p>
                    <div className={`mt-6 border-t-2 pt-6 ${isTransferPending ? 'border-gray-200' : 'border-red-200'}`}>
                        {propertyStatus === 'active' ? (
                            <div className="flex flex-col sm:flex-row justify-between sm:items-center">
                                <div>
                                    <h4 className={`font-bold ${isTransferPending ? 'text-gray-400' : 'text-gray-900'}`}>Cancel Service</h4>
                                    <p className={`text-sm mt-1 ${isTransferPending ? 'text-gray-400' : 'text-gray-600'}`}>Terminate all subscriptions for this location.</p>
                                </div>
                                <Button 
                                    onClick={() => setIsCancelModalOpen(true)} 
                                    className="bg-red-600 hover:bg-red-700 text-white mt-4 sm:mt-0 rounded-xl px-6 font-black uppercase text-xs tracking-widest"
                                    disabled={isTransferPending}
                                >
                                    Cancel All Services
                                </Button>
                            </div>
                        ) : (
                            <div className="flex flex-col sm:flex-row justify-between sm:items-center">
                                <div>
                                    <h4 className={`font-bold ${isTransferPending ? 'text-gray-400' : 'text-gray-900'}`}>Service Canceled</h4>
                                    <p className={`text-sm mt-1 ${isTransferPending ? 'text-gray-400' : 'text-gray-600'}`}>All recurring services are currently inactive for this address.</p>
                                </div>
                                <Button 
                                    onClick={handleRestartServices} 
                                    disabled={isRestarting || isTransferPending} 
                                    className="bg-primary hover:bg-primary-focus text-white mt-4 sm:mt-0 rounded-xl px-6 font-black uppercase text-xs tracking-widest flex items-center"
                                >
                                    {isRestarting 
                                        ? 'Restarting...' 
                                        : <><PlayCircleIcon className="w-5 h-5 mr-2" /> Restart Services</>
                                    }
                                </Button>
                            </div>
                        )}
                    </div>
                </Card>
            </div>

            <Modal
                isOpen={isCancelModalOpen}
                onClose={() => setIsCancelModalOpen(false)}
                title="Confirm Service Cancellation"
            >
                <div className="space-y-4">
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                        <ExclamationTriangleIcon className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
                        <div>
                            <h4 className="font-bold text-red-800">This action is irreversible.</h4>
                            <p className="text-sm text-red-700 mt-1">All services for <span className="font-semibold">{selectedProperty.address}</span> will be terminated at the end of the current billing cycle.</p>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-600 mb-2">To confirm, please type "CANCEL" below:</label>
                        <input
                            type="text"
                            value={cancelConfirmation}
                            onChange={(e) => setCancelConfirmation(e.target.value)}
                            className="w-full border-2 border-gray-300 rounded-md p-2 text-center font-bold tracking-widest focus:border-red-500 focus:ring-red-500"
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="secondary" onClick={() => setIsCancelModalOpen(false)} disabled={isCanceling}>Go Back</Button>
                        <Button
                            onClick={handleConfirmCancellation}
                            disabled={isCanceling || cancelConfirmation !== 'CANCEL'}
                            className="bg-red-600 hover:bg-red-700 text-white focus:ring-red-500"
                        >
                            {isCanceling ? 'Processing...' : 'Yes, Terminate Service'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default PropertySettings;