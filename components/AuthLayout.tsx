import React from 'react';
import { TruckIcon } from './Icons';

interface AuthLayoutProps {
    children: React.ReactNode;
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-base-200 p-4">
            <div className="flex items-center justify-center mb-8">
                <TruckIcon className="w-10 h-10 text-primary" />
                <h1 className="text-3xl font-bold ml-2 text-neutral text-center">Waste Management</h1>
            </div>
            <div className="w-full max-w-md bg-base-100 rounded-lg shadow-md p-8 border border-base-300">
                {children}
            </div>
            <div className="mt-6 text-center text-sm text-gray-500">
                &copy; {new Date().getFullYear()} Waste Management Portal. All rights reserved.
            </div>
        </div>
    );
};

export default AuthLayout;
