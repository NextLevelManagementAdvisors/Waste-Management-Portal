
import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { Button } from './Button';
import { NewPropertyInfo, ServiceType } from '../types';

interface AddPropertyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAddProperty: (propertyInfo: NewPropertyInfo) => Promise<void>;
}

const initialFormState: NewPropertyInfo = {
    street: '', city: '', state: '', zip: '',
    serviceType: 'personal',
    inHOA: 'no',
    communityName: '',
    hasGateCode: 'no',
    gateCode: ''
};

const AddPropertyModal: React.FC<AddPropertyModalProps> = ({ isOpen, onClose, onAddProperty }) => {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState<NewPropertyInfo>(initialFormState);
    const [isAdding, setIsAdding] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setStep(1);
            setFormData(initialFormState);
        }
    }, [isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    
    const handleRadioChange = (name: keyof NewPropertyInfo, value: any) => {
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleNext = () => setStep(2);
    const handleBack = () => setStep(1);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsAdding(true);
        try {
            await onAddProperty(formData);
        } finally {
            setIsAdding(false);
        }
    };

    const renderStep1 = () => (
        <div className="space-y-4">
            <div>
                <label htmlFor="street" className="block text-sm font-medium text-gray-700">Street Address</label>
                <input type="text" name="street" id="street" value={formData.street} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary" required />
            </div>
            <div className="flex gap-4">
                <div className="flex-1">
                    <label htmlFor="city" className="block text-sm font-medium text-gray-700">City</label>
                    <input type="text" name="city" id="city" value={formData.city} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary" required />
                </div>
                <div className="w-24">
                     <label htmlFor="state" className="block text-sm font-medium text-gray-700">State</label>
                    <input type="text" name="state" id="state" value={formData.state} onChange={handleChange} maxLength={2} placeholder="CA" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary" required />
                </div>
            </div>
             <div>
                <label htmlFor="zip" className="block text-sm font-medium text-gray-700">Zip Code</label>
                <input type="text" name="zip" id="zip" value={formData.zip} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary" required />
            </div>
            <div className="mt-6 flex justify-end gap-3">
                <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                <Button type="button" onClick={handleNext}>Next</Button>
            </div>
        </div>
    );
    
    const renderStep2 = () => (
         <div className="space-y-6">
            <div>
                <label className="block text-sm font-medium text-gray-700">Service Type</label>
                <select name="serviceType" value={formData.serviceType} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary">
                    <option value="personal">Personal Residence</option>
                    <option value="commercial">Commercial / Business</option>
                    <option value="short-term">Short-term Rental (Airbnb, VRBO, etc)</option>
                    <option value="rental">Rental (30+ day lease)</option>
                    <option value="other">Other</option>
                </select>
            </div>

            <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Is the address in a HOA or gated community?</label>
                <div className="flex gap-4">
                    <label className="flex items-center"><input type="radio" name="inHOA" value="yes" checked={formData.inHOA === 'yes'} onChange={() => handleRadioChange('inHOA', 'yes')} className="form-radio" /> <span className="ml-2">Yes</span></label>
                    <label className="flex items-center"><input type="radio" name="inHOA" value="no" checked={formData.inHOA === 'no'} onChange={() => handleRadioChange('inHOA', 'no')} className="form-radio" /> <span className="ml-2">No</span></label>
                </div>
            </div>

            {formData.inHOA === 'yes' && (
                 <div>
                    <label htmlFor="communityName" className="block text-sm font-medium text-gray-700">Community Name</label>
                    <input type="text" name="communityName" id="communityName" value={formData.communityName} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary" required />
                </div>
            )}
            
            <div className="space-y-2">
                 <label className="block text-sm font-medium text-gray-700">Is there a gate code?</label>
                <div className="flex gap-4">
                    <label className="flex items-center"><input type="radio" name="hasGateCode" value="yes" checked={formData.hasGateCode === 'yes'} onChange={() => handleRadioChange('hasGateCode', 'yes')} className="form-radio" /> <span className="ml-2">Yes</span></label>
                    <label className="flex items-center"><input type="radio" name="hasGateCode" value="no" checked={formData.hasGateCode === 'no'} onChange={() => handleRadioChange('hasGateCode', 'no')} className="form-radio" /> <span className="ml-2">No</span></label>
                </div>
            </div>

             {formData.hasGateCode === 'yes' && (
                <div>
                    <label htmlFor="gateCode" className="block text-sm font-medium text-gray-700">Gate Code</label>
                    <input type="text" name="gateCode" id="gateCode" value={formData.gateCode} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary" required />
                </div>
            )}

            <div className="mt-8 flex justify-between gap-3">
                <Button type="button" variant="secondary" onClick={handleBack}>Back</Button>
                <Button type="submit" disabled={isAdding}>
                    {isAdding ? 'Adding...' : 'Add Property'}
                </Button>
            </div>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={step === 1 ? "Add Service Location (1/2)" : "Property Details (2/2)"}>
            <form onSubmit={handleSubmit} noValidate>
                {step === 1 ? renderStep1() : renderStep2()}
            </form>
        </Modal>
    );
};

export default AddPropertyModal;
