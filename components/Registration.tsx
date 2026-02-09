
import React, { useState } from 'react';
import { Button } from './Button.tsx';
import { RegistrationInfo } from '../types.ts';

interface RegistrationProps {
    onRegister: (info: RegistrationInfo) => Promise<void>;
    switchToLogin: () => void;
    error: string | null;
}

const initialFormData: RegistrationInfo = {
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    password: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    serviceType: 'personal',
    inHOA: 'no',
    communityName: '',
    hasGateCode: 'no',
    gateCode: '',
    notes: ''
};

const Registration: React.FC<RegistrationProps> = ({ onRegister, switchToLogin, error }) => {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState<RegistrationInfo>(initialFormData);
    const [isLoading, setIsLoading] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleRadioChange = (name: keyof RegistrationInfo, value: any) => {
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        await onRegister(formData);
        setIsLoading(false);
    };

    const nextStep = () => setStep(prev => prev + 1);
    const prevStep = () => setStep(prev => prev - 1);

    const renderStepIndicator = () => (
        <div className="flex justify-center items-center mb-10">
            {[1, 2, 3].map(s => (
                <React.Fragment key={s}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 font-black text-sm ${step >= s ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-110' : 'bg-base-300 text-gray-500'}`}>
                        {s}
                    </div>
                    {s < 3 && <div className={`flex-1 h-1.5 mx-2 rounded-full transition-colors duration-500 ${step > s ? 'bg-primary' : 'bg-base-300'}`} />}
                </React.Fragment>
            ))}
        </div>
    );

    const renderStep1 = () => (
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex gap-4">
                <div className="flex-1">
                    <label htmlFor="firstName" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">First Name</label>
                    <input type="text" name="firstName" id="firstName" value={formData.firstName} onChange={handleChange} className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3.5 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required />
                </div>
                <div className="flex-1">
                    <label htmlFor="lastName" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Last Name</label>
                    <input type="text" name="lastName" id="lastName" value={formData.lastName} onChange={handleChange} className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3.5 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required />
                </div>
            </div>
            <div>
                <label htmlFor="emailReg" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Email Address</label>
                <input type="email" name="email" id="emailReg" value={formData.email} onChange={handleChange} className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3.5 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required />
            </div>
            <div>
                <label htmlFor="phone" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Phone Number</label>
                <input type="tel" name="phone" id="phone" value={formData.phone} onChange={handleChange} className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3.5 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required />
            </div>
            <div>
                <label htmlFor="passwordReg" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Password</label>
                <input type="password" name="password" id="passwordReg" value={formData.password} onChange={handleChange} className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3.5 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required />
            </div>
            <Button type="button" className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-xs mt-4 shadow-xl shadow-primary/20" onClick={nextStep}>Next: Service Address</Button>
        </div>
    );

    const renderStep2 = () => (
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div>
                <label htmlFor="street" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Street Address</label>
                <input type="text" name="street" id="street" value={formData.street} onChange={handleChange} className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3.5 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required />
            </div>
            <div className="flex gap-4">
                <div className="flex-1">
                    <label htmlFor="city" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">City</label>
                    <input type="text" name="city" id="city" value={formData.city} onChange={handleChange} className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3.5 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required />
                </div>
                <div className="w-32">
                     <label htmlFor="state" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">State</label>
                    <input type="text" name="state" id="state" value={formData.state} onChange={handleChange} maxLength={2} placeholder="CA" className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3.5 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all uppercase" required />
                </div>
            </div>
             <div>
                <label htmlFor="zip" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Zip Code</label>
                <input type="text" name="zip" id="zip" value={formData.zip} onChange={handleChange} className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3.5 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required />
            </div>
            <div className="flex justify-between gap-3 pt-4">
                <Button type="button" variant="secondary" className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-xs" onClick={prevStep}>Back</Button>
                <Button type="button" className="flex-2 h-14 px-8 rounded-2xl font-black uppercase tracking-widest text-xs" onClick={nextStep}>Next: Property Details</Button>
            </div>
        </div>
    );

    const renderStep3 = () => (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
                        <input type="radio" name="inHOA" value="yes" checked={formData.inHOA === 'yes'} onChange={() => handleRadioChange('inHOA', 'yes')} className="w-5 h-5 text-primary focus:ring-primary border-gray-300" /> 
                        <span className="ml-2 font-bold text-sm text-gray-600 group-hover:text-primary transition-colors">Yes</span>
                    </label>
                    <label className="flex items-center group cursor-pointer">
                        <input type="radio" name="inHOA" value="no" checked={formData.inHOA === 'no'} onChange={() => handleRadioChange('inHOA', 'no')} className="w-5 h-5 text-primary focus:ring-primary border-gray-300" /> 
                        <span className="ml-2 font-bold text-sm text-gray-600 group-hover:text-primary transition-colors">No</span>
                    </label>
                </div>
            </div>
            {formData.inHOA === 'yes' && (
                <div className="animate-in slide-in-from-top-2 duration-300">
                    <label htmlFor="communityName" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Community Name</label>
                    <input type="text" name="communityName" id="communityName" value={formData.communityName} onChange={handleChange} className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3.5 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required />
                </div>
            )}
            <div className="space-y-3">
                 <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Is there a gate code?</label>
                <div className="flex gap-6">
                    <label className="flex items-center group cursor-pointer">
                        <input type="radio" name="hasGateCode" value="yes" checked={formData.hasGateCode === 'yes'} onChange={() => handleRadioChange('hasGateCode', 'yes')} className="w-5 h-5 text-primary focus:ring-primary border-gray-300" /> 
                        <span className="ml-2 font-bold text-sm text-gray-600 group-hover:text-primary transition-colors">Yes</span>
                    </label>
                    <label className="flex items-center group cursor-pointer">
                        <input type="radio" name="hasGateCode" value="no" checked={formData.hasGateCode === 'no'} onChange={() => handleRadioChange('hasGateCode', 'no')} className="w-5 h-5 text-primary focus:ring-primary border-gray-300" /> 
                        <span className="ml-2 font-bold text-sm text-gray-600 group-hover:text-primary transition-colors">No</span>
                    </label>
                </div>
            </div>
            {formData.hasGateCode === 'yes' && (
                <div className="animate-in slide-in-from-top-2 duration-300">
                    <label htmlFor="gateCode" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Gate Code</label>
                    <input type="text" name="gateCode" id="gateCode" value={formData.gateCode} onChange={handleChange} className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3.5 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required />
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
                    className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3.5 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all resize-none"
                />
            </div>

             {error && <p className="text-sm font-bold text-red-600 text-center">{error}</p>}
            
            <div className="flex justify-between gap-3 pt-6">
                <Button type="button" variant="secondary" className="flex-1 h-16 rounded-2xl font-black uppercase tracking-widest text-xs" onClick={prevStep}>Back</Button>
                 <Button type="submit" disabled={isLoading} className="flex-2 h-16 px-12 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20">
                    {isLoading ? 'Processing...' : 'Complete Registration'}
                </Button>
            </div>
        </div>
    );
    
    const stepTitles = ["Create Your Profile", "Add Service Address", "Property Details"];

    return (
        <div>
            <h2 className="text-3xl font-black text-center text-gray-900 tracking-tight mb-2">{stepTitles[step-1]}</h2>
            <p className="text-center text-gray-500 font-medium mb-10">Start managing your residential services today</p>
            {renderStepIndicator()}
            <form onSubmit={handleSubmit} className="space-y-4">
                {step === 1 && renderStep1()}
                {step === 2 && renderStep2()}
                {step === 3 && renderStep3()}
            </form>
            <div className="mt-10 pt-6 border-t border-base-200 text-center">
                <p className="text-sm font-medium text-gray-500">
                    Already have an account?{' '}
                    <button onClick={switchToLogin} className="font-black text-primary hover:text-primary-focus transition-colors">
                        Sign In
                    </button>
                </p>
            </div>
        </div>
    );
};

export default Registration;
