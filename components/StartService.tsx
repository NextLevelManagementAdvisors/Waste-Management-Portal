
import React, { useState } from 'react';
import { Button } from './Button.tsx';
import { Card } from './Card.tsx';
import { NewPropertyInfo } from '../types.ts';

interface StartServiceProps {
    onAddProperty: (propertyInfo: NewPropertyInfo) => Promise<void>;
    onCancel: () => void;
}

const initialFormState: NewPropertyInfo = {
    street: '', city: '', state: '', zip: '',
    serviceType: 'personal',
    inHOA: 'no',
    communityName: '',
    hasGateCode: 'no',
    gateCode: '',
    notes: ''
};

const StartService: React.FC<StartServiceProps> = ({ onAddProperty, onCancel }) => {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState<NewPropertyInfo>(initialFormState);
    const [isAdding, setIsAdding] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
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
        <div className="space-y-4 animate-in fade-in duration-300">
            <div>
                <label htmlFor="street" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Street Address</label>
                <input type="text" name="street" id="street" value={formData.street} onChange={handleChange} className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required />
            </div>
            <div className="flex gap-4">
                <div className="flex-1">
                    <label htmlFor="city" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">City</label>
                    <input type="text" name="city" id="city" value={formData.city} onChange={handleChange} className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required />
                </div>
                <div className="w-28">
                     <label htmlFor="state" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">State</label>
                    <input type="text" name="state" id="state" value={formData.state} onChange={handleChange} maxLength={2} placeholder="CA" className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all uppercase" required />
                </div>
            </div>
             <div>
                <label htmlFor="zip" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Zip Code</label>
                <input type="text" name="zip" id="zip" value={formData.zip} onChange={handleChange} className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required />
            </div>
            <div className="mt-8 flex justify-end gap-3">
                <Button type="button" variant="secondary" className="rounded-xl px-6 font-black uppercase tracking-widest text-[10px]" onClick={onCancel}>Cancel</Button>
                <Button type="button" className="rounded-xl px-8 font-black uppercase tracking-widest text-[10px]" onClick={handleNext}>Next Details</Button>
            </div>
        </div>
    );
    
    const renderStep2 = () => (
         <div className="space-y-6 animate-in fade-in duration-300">
            <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Service Type</label>
                <div className="relative">
                    <select 
                        name="serviceType" 
                        value={formData.serviceType} 
                        onChange={handleChange} 
                        className="appearance-none w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3.5 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all cursor-pointer"
                    >
                        <option value="personal">Personal Residence</option>
                        <option value="commercial">Commercial / Business</option>
                        <option value="short-term">Short-term Rental</option>
                        <option value="rental">Rental (30+ day lease)</option>
                        <option value="other">Other</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-400">
                        <svg className="fill-current h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                            <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                        </svg>
                    </div>
                </div>
            </div>

            <div className="space-y-3">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Is the address in a HOA or gated community?</label>
                <div className="flex gap-6">
                    <label className="flex items-center group cursor-pointer">
                        <input type="radio" name="inHOA" value="yes" checked={formData.inHOA === 'yes'} onChange={() => handleRadioChange('inHOA', 'yes')} className="w-5 h-5 text-primary border-gray-300 focus:ring-primary" /> 
                        <span className="ml-2 font-bold text-sm text-gray-600 group-hover:text-primary transition-colors">Yes</span>
                    </label>
                    <label className="flex items-center group cursor-pointer">
                        <input type="radio" name="inHOA" value="no" checked={formData.inHOA === 'no'} onChange={() => handleRadioChange('inHOA', 'no')} className="w-5 h-5 text-primary border-gray-300 focus:ring-primary" /> 
                        <span className="ml-2 font-bold text-sm text-gray-600 group-hover:text-primary transition-colors">No</span>
                    </label>
                </div>
            </div>

            {formData.inHOA === 'yes' && (
                 <div className="animate-in slide-in-from-top-2 duration-300">
                    <label htmlFor="communityName" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Community Name</label>
                    <input type="text" name="communityName" id="communityName" value={formData.communityName} onChange={handleChange} className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required />
                </div>
            )}
            
            <div className="space-y-3">
                 <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Is there a gate code?</label>
                <div className="flex gap-6">
                    <label className="flex items-center group cursor-pointer">
                        <input type="radio" name="hasGateCode" value="yes" checked={formData.hasGateCode === 'yes'} onChange={() => handleRadioChange('hasGateCode', 'yes')} className="w-5 h-5 text-primary border-gray-300 focus:ring-primary" /> 
                        <span className="ml-2 font-bold text-sm text-gray-600 group-hover:text-primary transition-colors">Yes</span>
                    </label>
                    <label className="flex items-center group cursor-pointer">
                        <input type="radio" name="hasGateCode" value="no" checked={formData.hasGateCode === 'no'} onChange={() => handleRadioChange('hasGateCode', 'no')} className="w-5 h-5 text-primary border-gray-300 focus:ring-primary" /> 
                        <span className="ml-2 font-bold text-sm text-gray-600 group-hover:text-primary transition-colors">No</span>
                    </label>
                </div>
            </div>

             {formData.hasGateCode === 'yes' && (
                <div className="animate-in slide-in-from-top-2 duration-300">
                    <label htmlFor="gateCode" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Gate Code</label>
                    <input type="text" name="gateCode" id="gateCode" value={formData.gateCode} onChange={handleChange} className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required />
                </div>
            )}

            <div>
                <label htmlFor="notes" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Service Instructions</label>
                <textarea
                    name="notes"
                    id="notes"
                    value={formData.notes}
                    onChange={handleChange}
                    rows={3}
                    placeholder="e.g., Cans are behind the side gate, Beware of dog..."
                    className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all resize-none"
                />
            </div>

            <div className="mt-8 flex justify-between gap-3">
                <Button type="button" variant="secondary" className="rounded-xl px-6 font-black uppercase tracking-widest text-[10px]" onClick={handleBack}>Back</Button>
                <Button type="submit" disabled={isAdding} className="rounded-xl px-10 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20">
                    {isAdding ? 'Adding...' : 'Register Location'}
                </Button>
            </div>
        </div>
    );

    return (
        <div className="max-w-3xl mx-auto animate-in fade-in duration-500">
            <Card className="shadow-2xl border-none p-6 sm:p-10">
                <div className="text-center mb-10">
                    <h1 className="text-4xl font-black text-gray-900 tracking-tight">
                        Start New Service
                    </h1>
                     <p className="text-gray-500 mt-2 font-medium">
                        {step === 1 ? "Let's start with the address where you need service." : "Tell us a bit more about this location."}
                    </p>
                </div>
                <form onSubmit={handleSubmit} noValidate>
                    {step === 1 ? renderStep1() : renderStep2()}
                </form>
            </Card>
        </div>
    );
};

export default StartService;
