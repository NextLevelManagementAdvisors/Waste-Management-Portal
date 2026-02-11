import React, { useState, useEffect } from 'react';
import { useProperty } from '../PropertyContext.tsx';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import ToggleSwitch from './ToggleSwitch.tsx';
import { getPaymentMethods, updateAutopayStatus } from '../services/mockApiService.ts';
import { PaymentMethod, View } from '../types.ts';
import { CreditCardIcon, BanknotesIcon, ArrowRightIcon, SparklesIcon } from './Icons.tsx';

const AutopaySettings: React.FC = () => {
    const { user, refreshUser, setCurrentView } = useProperty();
    const [isAutopayEnabled, setIsAutopayEnabled] = useState(user?.autopayEnabled || false);
    const [primaryMethod, setPrimaryMethod] = useState<PaymentMethod | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setIsAutopayEnabled(user?.autopayEnabled || false);
        getPaymentMethods().then(methods => {
            const primary = methods.find(m => m.isPrimary);
            setPrimaryMethod(primary || null);
        });
    }, [user]);

    const handleToggleAutopay = async () => {
        setIsSaving(true);
        try {
            await updateAutopayStatus(!isAutopayEnabled);
            await refreshUser();
        } catch (error) {
            console.error("Failed to update autopay status:", error);
            alert("Could not update autopay status. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleManageMethods = () => {
        if (setCurrentView) {
            setCurrentView('wallet');
        }
    };

    return (
        <Card className="border-none ring-1 ring-base-200 shadow-xl">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                    <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                        <SparklesIcon className="w-6 h-6 text-primary" />
                        Autopay Settings
                    </h2>
                    <p className="text-gray-500 text-sm mt-1">
                        {isAutopayEnabled ? 'Autopay is enabled. Balances will be paid automatically.' : 'Autopay is disabled. You will need to pay balances manually.'}
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-sm font-bold text-gray-600">
                        {isAutopayEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <ToggleSwitch
                        checked={isAutopayEnabled}
                        onChange={handleToggleAutopay}
                        disabled={isSaving}
                    />
                </div>
            </div>
            {isAutopayEnabled && (
                <div className="mt-6 pt-6 border-t border-base-200">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Primary Payment Method</h3>
                    {primaryMethod ? (
                        <div className="p-4 bg-gray-50 rounded-2xl flex justify-between items-center border border-gray-100">
                            <div className="flex items-center gap-3">
                                {primaryMethod.type === 'Card' ? <CreditCardIcon className="w-6 h-6 text-gray-500" /> : <BanknotesIcon className="w-6 h-6 text-gray-500" />}
                                <div>
                                    <p className="font-bold text-gray-900">{primaryMethod.brand ? `${primaryMethod.brand} ending in ${primaryMethod.last4}` : `Bank Account ending in ${primaryMethod.last4}`}</p>
                                    <p className="text-xs text-gray-500">Will be charged on due dates.</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="sm" className="text-xs" onClick={handleManageMethods}>
                                Manage
                            </Button>
                        </div>
                    ) : (
                        <div className="p-4 bg-yellow-50 rounded-2xl text-center border border-yellow-200">
                            <p className="text-sm font-bold text-yellow-800">No primary payment method found.</p>
                            <p className="text-xs text-yellow-700 mt-1">Please add a payment method to use Autopay.</p>
                            <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={handleManageMethods}>
                                Add a Method <ArrowRightIcon className="w-3 h-3 ml-1"/>
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </Card>
    );
};

export default AutopaySettings;