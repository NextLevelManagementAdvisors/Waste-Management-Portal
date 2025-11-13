import React, { useState } from 'react';
import { Button } from './Button';
import { RegistrationInfo } from '../types';

interface RegistrationProps {
    onRegister: (userInfo: RegistrationInfo) => Promise<void>;
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
    gateCode: ''
};


const Registration: React.FC<RegistrationProps> = ({ onRegister, switchToLogin, error }) => {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState<RegistrationInfo>(initialFormData);
    const [isLoading, setIsLoading] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
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
        <div className="flex justify-center items-center mb-6">
            {[1, 2, 3].map(s => (
                <React.Fragment key={s}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${step >= s ? 'bg-primary text-white' : 'bg-base-200 text-neutral'}`}>
                        {s}
                    </div>
                    {s < 3 && <div className={`flex-1 h-1 transition-colors ${step > s ? 'bg-primary' : 'bg-base-200'}`} />}
                </React.Fragment>
            ))}
        </div>
    );

    const renderStep1 = () => (
        <div className="space-y-4">
            <div className="flex gap-4">
                <div className="flex-1">
                    <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">First Name</label>
                    <input type="text" name="firstName" id="firstName" value={formData.firstName} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary" required />
                </div>
                <div className="flex-1">
                    <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">Last Name</label>
                    <input type="text" name="lastName" id="lastName" value={formData.lastName} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary" required />
                </div>
            </div>
            <div>
                <label htmlFor="emailReg" className="block text-sm font-medium text-gray-700">Email Address</label>
                <input type="email" name="email" id="emailReg" value={formData.email} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary" required />
            </div>
            <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Phone Number</label>
                <input type="tel" name="phone" id="phone" value={formData.phone} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary" required />
            </div>
            <div>
                <label htmlFor="passwordReg" className="block text-sm font-medium text-gray-700">Password</label>
                <input type="password" name="password" id="passwordReg" value={formData.password} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary" required />
            </div>
            <Button type="button" className="w-full" onClick={nextStep}>Next: Service Address</Button>
        </div>
    );

    const renderStep2 = () => (
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
            <div className="flex justify-between gap-3">
                <Button type="button" variant="secondary" onClick={prevStep}>Back</Button>
                <Button type="button" onClick={nextStep}>Next: Property Details</Button>
            </div>
        </div>
    );

    const renderStep3 = () => (
        <div className="space-y-6">
            <div>
                <label className="block text-sm font-medium text-gray-700">Service Type</label>
                <select name="serviceType" value={formData.serviceType} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary">
                    <option value="personal">Personal Residence</option>
                    <option value="commercial">Commercial / Business</option>
                    <option value="short-term">Short-term Rental</option>
                    <option value="rental">Rental (30+ day lease)</option>
                    <option value="other">Other</option>
                </select>
            </div>
             <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Is the address in a HOA or gated community?</label>
                <div className="flex gap-4"><label className="flex items-center"><input type="radio" name="inHOA" value="yes" checked={formData.inHOA === 'yes'} onChange={() => handleRadioChange('inHOA', 'yes')} className="form-radio" /> <span className="ml-2">Yes</span></label><label className="flex items-center"><input type="radio" name="inHOA" value="no" checked={formData.inHOA === 'no'} onChange={() => handleRadioChange('inHOA', 'no')} className="form-radio" /> <span className="ml-2">No</span></label></div>
            </div>
            {formData.inHOA === 'yes' && (<div><label htmlFor="communityName" className="block text-sm font-medium text-gray-700">Community Name</label><input type="text" name="communityName" id="communityName" value={formData.communityName} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary" required /></div>)}
            <div className="space-y-2">
                 <label className="block text-sm font-medium text-gray-700">Is there a gate code?</label>
                <div className="flex gap-4"><label className="flex items-center"><input type="radio" name="hasGateCode" value="yes" checked={formData.hasGateCode === 'yes'} onChange={() => handleRadioChange('hasGateCode', 'yes')} className="form-radio" /> <span className="ml-2">Yes</span></label><label className="flex items-center"><input type="radio" name="hasGateCode" value="no" checked={formData.hasGateCode === 'no'} onChange={() => handleRadioChange('hasGateCode', 'no')} className="form-radio" /> <span className="ml-2">No</span></label></div>
            </div>
            {formData.hasGateCode === 'yes' && (<div><label htmlFor="gateCode" className="block text-sm font-medium text-gray-700">Gate Code</label><input type="text" name="gateCode" id="gateCode" value={formData.gateCode} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary" required /></div>)}
            
             {error && <p className="text-sm text-red-600 text-center">{error}</p>}
            
            <div className="flex justify-between gap-3">
                <Button type="button" variant="secondary" onClick={prevStep}>Back</Button>
                 <Button type="submit" disabled={isLoading}>
                    {isLoading ? 'Creating Account...' : 'Complete Registration'}
                </Button>
            </div>
        </div>
    );
    
    const stepTitles = ["Create Your Profile", "Add First Service Address", "Property Details"];

    return (
        <div>
            <h2 className="text-2xl font-bold text-center text-neutral mb-2">{stepTitles[step-1]}</h2>
            <p className="text-center text-gray-500 mb-6">Start managing your services today</p>
            {renderStepIndicator()}
            <form onSubmit={handleSubmit} className="space-y-4">
                {step === 1 && renderStep1()}
                {step === 2 && renderStep2()}
                {step === 3 && renderStep3()}
            </form>
            <p className="mt-6 text-center text-sm text-gray-600">
                Already have an account?{' '}
                <button onClick={switchToLogin} className="font-medium text-primary hover:text-primary-focus">
                    Sign In
                </button>
            </p>
        </div>
    );
};

export default Registration;