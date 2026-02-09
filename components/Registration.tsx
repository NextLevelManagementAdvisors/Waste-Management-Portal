
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
};

const Registration: React.FC<RegistrationProps> = ({ onRegister, switchToLogin, error }) => {
    const [formData, setFormData] = useState<RegistrationInfo>(initialFormData);
    const [isLoading, setIsLoading] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        await onRegister(formData);
        setIsLoading(false);
    };

    return (
        <div>
            <h2 className="text-3xl font-black text-center text-gray-900 tracking-tight mb-2">Create an Account</h2>
            <p className="text-center text-gray-500 font-medium mb-10">Let's get you started with our service.</p>
            <form onSubmit={handleSubmit} className="space-y-5">
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
                 {error && <p className="text-sm font-bold text-red-600 text-center">{error}</p>}
                <Button type="submit" disabled={isLoading} className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-xs mt-4 shadow-xl shadow-primary/20">
                    {isLoading ? 'Creating Account...' : 'Continue'}
                </Button>
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
