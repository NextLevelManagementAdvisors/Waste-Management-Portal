
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
            <p className="text-center text-gray-500 font-medium mb-6">Let's get you started with our service.</p>
            <div className="mb-6">
                <a
                    href="/api/auth/google"
                    className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border-2 border-base-200 rounded-xl shadow-sm bg-white hover:bg-gray-50 transition-colors font-bold text-gray-700"
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Sign up with Google
                </a>
            </div>
            <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500">Or sign up with email</span>
                </div>
            </div>
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
