
import React from 'react';
import PaymentMethods from './PaymentMethods.tsx';

const WalletHub: React.FC = () => {
    return (
        <div className="space-y-8 animate-in fade-in duration-500">
             <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-base-200 pb-8">
                <div>
                    <h1 className="text-4xl font-black text-gray-900 tracking-tight">Digital Wallet</h1>
                    <p className="text-gray-500 font-medium mt-1 text-lg">Manage all your saved payment methods in one place.</p>
                </div>
            </div>
            <PaymentMethods />
        </div>
    );
};

export default WalletHub;