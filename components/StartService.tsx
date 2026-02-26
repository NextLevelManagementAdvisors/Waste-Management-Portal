import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from './Button.tsx';
import { Card } from './Card.tsx';
import { NewPropertyInfo, PaymentMethod, Service } from '../types.ts';
import AddressAutocomplete from './AddressAutocomplete.tsx';
import { getPaymentMethods, addPaymentMethod, setPrimaryPaymentMethod, getServices } from '../services/apiService.ts';
import * as stripeService from '../services/stripeService.ts';
import { CreditCardIcon, BanknotesIcon } from './Icons.tsx';
import { PaymentElement, useStripe, useElements, Elements } from '@stripe/react-stripe-js';
import { getStripePromise } from './StripeProvider.tsx';
import ServiceSelector, { QuantitySelector } from './ServiceSelector.tsx';
import { useProperty } from '../PropertyContext.tsx';

interface ServiceSelection {
    serviceId: string;
    useSticker: boolean;
    quantity: number;
}

interface StartServiceProps {
    onCompleteSetup: (propertyInfo: NewPropertyInfo, services: ServiceSelection[]) => Promise<void>;
    onCancel: () => void;
    isOnboarding?: boolean;
    serviceFlowType?: 'recurring' | 'request';
}

const initialFormState: NewPropertyInfo = {
    street: '', city: '', state: '', zip: '',
    serviceType: 'personal',
    inHOA: 'no',
    communityName: '',
    hasGateCode: 'no',
    gateCode: '',
    notes: '',
};

const StepIndicator: React.FC<{ currentStep: number; totalSteps: number }> = ({ currentStep, totalSteps }) => (
    <div className="flex justify-center items-center mb-10">
        {Array.from({ length: totalSteps }, (_, i) => i + 1).map(s => (
            <React.Fragment key={s}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 font-black text-sm ${currentStep >= s ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-110' : 'bg-base-300 text-gray-500'}`}>
                    {s}
                </div>
                {s < totalSteps && <div className={`flex-1 h-1.5 mx-2 rounded-full transition-colors duration-500 ${currentStep > s ? 'bg-primary' : 'bg-base-300'}`} />}
            </React.Fragment>
        ))}
    </div>
);


const NewPaymentForm: React.FC<{
    onConfirmed: (paymentMethodId: string) => Promise<void>;
    onBack: () => void;
    isProcessing: boolean;
    setIsProcessing: (v: boolean) => void;
    setSetupError: (msg: string | null) => void;
    submitLabel?: string;
}> = ({ onConfirmed, onBack, isProcessing, setIsProcessing, setSetupError, submitLabel = 'Complete Setup' }) => {
    const stripe = useStripe();
    const elements = useElements();

    const handleConfirm = async () => {
        if (!stripe || !elements) {
            setSetupError('Payment system is still loading. Please wait.');
            return;
        }
        setIsProcessing(true);
        setSetupError(null);
        try {
            const { error: stripeError, setupIntent } = await stripe.confirmSetup({
                elements,
                redirect: 'if_required',
            });
            if (stripeError) {
                setSetupError(stripeError.message || 'Failed to add payment method.');
                setIsProcessing(false);
                return;
            }
            if (setupIntent?.payment_method) {
                const pmId = typeof setupIntent.payment_method === 'string'
                    ? setupIntent.payment_method
                    : setupIntent.payment_method.id;
                await addPaymentMethod(pmId);
                await onConfirmed(pmId);
            }
        } catch (error) {
            console.error('Failed during payment setup:', error);
            setSetupError('An error occurred during setup. Please check your details and try again.');
            setIsProcessing(false);
        }
    };

    return (
        <>
            <PaymentElement />
            <p className="text-xs text-gray-500 mt-2 text-center">Securely processed by Stripe.</p>
            <div className="mt-8 pt-6 border-t border-base-200 flex justify-between gap-3">
                <Button type="button" variant="secondary" className="rounded-xl px-6 font-black uppercase tracking-widest text-[10px]" onClick={onBack} disabled={isProcessing}>Back</Button>
                <Button type="button" className="rounded-xl px-8 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20" onClick={handleConfirm} disabled={isProcessing || !stripe}>
                    {isProcessing ? 'Processing...' : submitLabel}
                </Button>
            </div>
        </>
    );
};

// ── Order Summary Panel ─────────────────────────────────────────────
const OrderSummary: React.FC<{
    selectedServices: ServiceSelection[];
    availableServices: Service[];
    monthlyTotal: number;
    setupTotal: number;
    isOneTime: boolean;
}> = ({ selectedServices, availableServices, monthlyTotal, setupTotal, isOneTime }) => {
    const lineItems = selectedServices
        .map(sel => {
            const service = availableServices.find(s => s.id === sel.serviceId);
            if (!service) return null;
            return { name: service.name, quantity: sel.quantity, price: service.price * sel.quantity };
        })
        .filter(Boolean) as { name: string; quantity: number; price: number }[];

    if (lineItems.length === 0) return null;

    return (
        <Card className="border-none ring-1 ring-base-200 sticky top-4">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Order Summary</h3>
            <div className="space-y-3 mb-4">
                {lineItems.map((item, i) => (
                    <div key={i} className="flex justify-between items-center text-sm">
                        <span className="text-gray-700 font-medium">
                            {item.name}{item.quantity > 1 && <span className="text-gray-400 ml-1">x{item.quantity}</span>}
                        </span>
                        <span className="font-bold text-gray-900">${item.price.toFixed(2)}</span>
                    </div>
                ))}
            </div>
            <div className="border-t border-base-200 pt-4 space-y-2">
                {setupTotal > 0 && (
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">One-Time Setup Fees</span>
                        <span className="font-semibold text-gray-600">${setupTotal.toFixed(2)}</span>
                    </div>
                )}
                <div className="flex justify-between items-baseline">
                    <span className="text-sm font-bold text-gray-500 uppercase tracking-wider">
                        {isOneTime ? 'Total' : 'Monthly Total'}
                    </span>
                    <span className="text-3xl font-black text-primary">${monthlyTotal.toFixed(2)}</span>
                </div>
            </div>
            {!isOneTime && (
                <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                    You won't be charged until your address is reviewed and approved.
                </p>
            )}
        </Card>
    );
};


const StartService: React.FC<StartServiceProps> = ({ onCompleteSetup, onCancel, isOnboarding = false, serviceFlowType }) => {
    const { properties, setCurrentView } = useProperty();

    // Flow type: determined by prop or chosen by user in step 0
    const [flowType, setFlowType] = useState<'recurring' | 'request' | null>(serviceFlowType || null);
    const isOneTime = flowType === 'request';
    const totalSteps = isOneTime ? 3 : 4;

    // Step 0 = flow selector (only shown when serviceFlowType prop not provided)
    // For one-time: steps 1=Address, 2=Services, 3=Payment
    // For recurring: steps 1=Address, 2=Details, 3=Services, 4=Payment
    const [step, setStep] = useState(serviceFlowType ? 1 : 0);

    const [formData, setFormData] = useState<NewPropertyInfo>(initialFormState);
    const [isProcessing, setIsProcessing] = useState(false);

    // Service selection state
    const [availableServices, setAvailableServices] = useState<Service[]>([]);
    const [selectedServices, setSelectedServices] = useState<ServiceSelection[]>([]);

    // Payment state
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
    const [loadingMethods, setLoadingMethods] = useState(false);
    const [billingChoice, setBillingChoice] = useState<'existing' | 'new'>('existing');
    const [selectedMethodId, setSelectedMethodId] = useState('');
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [setupError, setSetupError] = useState<string | null>(null);

    // Determine which logical step we're on
    const servicesStep = isOneTime ? 2 : 3;
    const paymentStep = isOneTime ? 3 : 4;

    useEffect(() => {
        if (step === servicesStep && availableServices.length === 0) {
            getServices().then(setAvailableServices);
        }
        if (step === paymentStep) {
            setLoadingMethods(true);
            getPaymentMethods().then(methods => {
                setPaymentMethods(methods);
                if (methods.length === 0) {
                    setBillingChoice('new');
                } else {
                    const primary = methods.find(m => m.isPrimary) || methods[0];
                    setSelectedMethodId(primary.id);
                    setBillingChoice('existing');
                }
                setLoadingMethods(false);
            }).catch(() => setLoadingMethods(false));
        }
    }, [step, availableServices.length, servicesStep, paymentStep]);

    useEffect(() => {
        if (billingChoice === 'new' && !clientSecret) {
            fetch('/api/setup-intent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
            })
                .then(async res => {
                    if (!res.ok) {
                        const json = await res.json().catch(() => ({}));
                        throw new Error(json.error || 'Failed to initialize payment form.');
                    }
                    return res.json();
                })
                .then(json => {
                    if (json.data.customerId) stripeService.setCustomerId(json.data.customerId);
                    setClientSecret(json.data.clientSecret);
                })
                .catch(err => setSetupError(err.message || 'Failed to initialize payment form.'));
        }
    }, [billingChoice, clientSecret]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleRadioChange = (name: keyof NewPropertyInfo, value: any) => {
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleAddressSelect = useCallback((components: { street: string; city: string; state: string; zip: string }) => {
        setFormData(prev => ({
            ...prev,
            city: components.city,
            state: components.state,
            zip: components.zip,
        }));
    }, []);

    const handleNext = () => setStep(s => s + 1);
    const handleBack = () => {
        if (step === 1 && !serviceFlowType) {
            setStep(0); // Go back to flow selector
        } else {
            setStep(s => s - 1);
        }
    };

    const submitLabel = isOneTime ? 'Submit Request' : 'Complete Setup';

    const handleNewPaymentConfirmed = async (paymentMethodId: string) => {
        try {
            setSelectedMethodId(paymentMethodId);
            await setPrimaryPaymentMethod(paymentMethodId);
            await onCompleteSetup(formData, selectedServices);
        } catch (error) {
            console.error("Failed during service setup:", error);
            setSetupError("An error occurred during setup. Please check your details and try again.");
            setIsProcessing(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (step !== paymentStep) return;
        if (billingChoice === 'new') return; // handled by NewPaymentForm

        setIsProcessing(true);
        setSetupError(null);
        try {
            if (selectedMethodId) {
                await setPrimaryPaymentMethod(selectedMethodId);
            }
            await onCompleteSetup(formData, selectedServices);
        } catch (error) {
            console.error("Failed during service setup:", error);
            setSetupError("An error occurred during setup. Please check your details and try again.");
            setIsProcessing(false);
        }
    };

    // --- Service Selection Logic ---

    const baseFeeService = useMemo(() => availableServices.find(s => s.category === 'base_fee'), [availableServices]);
    const atHouseService = useMemo(() => availableServices.find(s => s.name.toLowerCase().includes('at house')), [availableServices]);
    const linerService = useMemo(() => availableServices.find(s => s.name.toLowerCase().includes('liner')), [availableServices]);

    const totalBaseServiceCans = useMemo(() => {
        if (!availableServices.length) return 0;
        const baseServiceIds = availableServices.filter(s => s.category === 'base_service').map(s => s.id);
        return selectedServices
            .filter(s => baseServiceIds.includes(s.serviceId))
            .reduce((total, sub) => total + sub.quantity, 0);
    }, [selectedServices, availableServices]);

    const isAtHouseSelected = useMemo(() => {
        if (!atHouseService) return false;
        return selectedServices.some(s => s.serviceId === atHouseService.id);
    }, [selectedServices, atHouseService]);

    const isLinerSelected = useMemo(() => {
        if (!linerService) return false;
        return selectedServices.some(s => s.serviceId === linerService.id);
    }, [selectedServices, linerService]);

    const { monthlyTotal, setupTotal } = useMemo(() => {
        let monthly = 0;
        let setup = 0;
        selectedServices.forEach(sel => {
            const service = availableServices.find(s => s.id === sel.serviceId);
            if (!service) return;
            monthly += service.price * sel.quantity;
            const currentSetupFee = sel.useSticker ? (service.stickerFee || 0) : (service.setupFee || 0);
            setup += currentSetupFee * sel.quantity;
        });
        return { monthlyTotal: monthly, setupTotal: setup };
    }, [selectedServices, availableServices]);

    useEffect(() => {
        if (!baseFeeService || !linerService || isOneTime) return;

        setSelectedServices(prev => {
            const hasBaseFee = prev.some(s => s.serviceId === baseFeeService.id);
            const linerSub = prev.find(s => s.serviceId === linerService.id);

            let nextState = [...prev];
            let hasChanged = false;

            if (totalBaseServiceCans > 0 && !hasBaseFee) {
                nextState.push({ serviceId: baseFeeService.id, quantity: 1, useSticker: false });
                hasChanged = true;
            } else if (totalBaseServiceCans === 0) {
                const initialLength = nextState.length;
                nextState = nextState.filter(s =>
                    s.serviceId !== baseFeeService.id &&
                    s.serviceId !== atHouseService?.id &&
                    s.serviceId !== linerService.id
                );
                if (nextState.length !== initialLength) hasChanged = true;
            }

            if (linerSub) {
                if (totalBaseServiceCans > 0 && linerSub.quantity !== totalBaseServiceCans) {
                    nextState = nextState.map(s => s.serviceId === linerService.id ? { ...s, quantity: totalBaseServiceCans } : s);
                    hasChanged = true;
                } else if (totalBaseServiceCans === 0) {
                    nextState = nextState.filter(s => s.serviceId !== linerService.id);
                    hasChanged = true;
                }
            }

            return hasChanged ? nextState : prev;
        });
    }, [totalBaseServiceCans, baseFeeService, atHouseService, linerService, isOneTime]);

    const handleCollectionMethodToggle = () => {
        if (!atHouseService) return;
        if (isAtHouseSelected) {
            setSelectedServices(prev => prev.filter(s => s.serviceId !== atHouseService.id));
        } else {
            setSelectedServices(prev => [...prev, { serviceId: atHouseService.id, quantity: 1, useSticker: false }]);
        }
    };

    const handleLinerToggle = () => {
        if (!linerService || totalBaseServiceCans === 0) return;
        if (isLinerSelected) {
            setSelectedServices(prev => prev.filter(s => s.serviceId !== linerService.id));
        } else {
            setSelectedServices(prev => [...prev, { serviceId: linerService.id, quantity: totalBaseServiceCans, useSticker: false }]);
        }
    };

    const handleServiceQuantityChange = (serviceId: string, change: 'increment' | 'decrement') => {
        const existing = selectedServices.find(s => s.serviceId === serviceId);
        const currentQty = existing?.quantity || 0;
        const newQty = change === 'increment' ? currentQty + 1 : currentQty - 1;

        if (newQty <= 0) {
            setSelectedServices(prev => prev.filter(s => s.serviceId !== serviceId));
        } else if (existing) {
            setSelectedServices(prev => prev.map(s => s.serviceId === serviceId ? { ...s, quantity: newQty } : s));
        } else {
            setSelectedServices(prev => [...prev, { serviceId: serviceId, quantity: 1, useSticker: false }]);
        }
    };

    // ── Step 0: Flow Type Selector ───────────────────────────────────
    const renderFlowSelector = () => (
        <div className="space-y-6 animate-in fade-in duration-300">
            <h2 className="text-lg font-bold text-gray-700 text-center mb-2">What do you need?</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                    type="button"
                    onClick={() => { setFlowType('recurring'); setStep(1); }}
                    className="p-6 border-2 border-gray-200 rounded-2xl hover:border-primary hover:bg-primary/5 transition-all text-left group"
                >
                    <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                        <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>
                    </div>
                    <h3 className="text-xl font-black text-gray-900 mb-1">Recurring Service</h3>
                    <p className="text-sm text-gray-500">Weekly or bi-weekly trash and recycling pickup at your address.</p>
                </button>
                <button
                    type="button"
                    onClick={() => {
                        if (properties.length > 0) {
                            setCurrentView('requests');
                        } else {
                            setFlowType('request');
                            setStep(1);
                        }
                    }}
                    className="p-6 border-2 border-gray-200 rounded-2xl hover:border-primary hover:bg-primary/5 transition-all text-left group"
                >
                    <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                        <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25m-2.25 0h-2.25m0 0V3.375c0-.621-.504-1.125-1.125-1.125H6.375c-.621 0-1.125.504-1.125 1.125v3.659M9.75 7.034V3.375" /></svg>
                    </div>
                    <h3 className="text-xl font-black text-gray-900 mb-1">One-Time Pickup</h3>
                    <p className="text-sm text-gray-500">Bulk items, yard waste, or special pickup — no recurring commitment.</p>
                </button>
            </div>
            <div className="pt-4 flex justify-center">
                <Button type="button" variant="secondary" className="rounded-xl px-8 font-black uppercase tracking-widest text-[10px]" onClick={onCancel}>Cancel</Button>
            </div>
        </div>
    );

    // ── Step 1: Address ──────────────────────────────────────────────
    const renderAddressStep = () => {
        const canProceed = !!(formData.city && formData.state && formData.zip);
        const inputClass = "w-full bg-gray-100 border border-gray-200 shadow-inner rounded-lg px-4 py-3 font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all";
        const nextLabel = isOneTime ? 'Choose Services' : 'Property Details';

        return (
            <div className="space-y-6 animate-in fade-in duration-300">
                <div>
                    <label htmlFor="street" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Address</label>
                    <AddressAutocomplete
                        id="street"
                        name="street"
                        value={formData.street}
                        onChange={(val) => setFormData(prev => ({ ...prev, street: val }))}
                        onAddressSelect={handleAddressSelect}
                        className={inputClass}
                        placeholder="Start typing your address..."
                        required
                    />
                </div>
                <div className="mt-8 pt-6 border-t border-base-200 flex justify-between items-stretch gap-3">
                    <Button
                        type="button"
                        variant="secondary"
                        className="rounded-lg px-8 font-bold uppercase"
                        onClick={serviceFlowType ? onCancel : handleBack}>
                        {serviceFlowType ? 'Cancel' : 'Back'}
                    </Button>
                    <Button
                        type="button"
                        className="flex-grow rounded-lg py-3 px-6 shadow-lg shadow-primary/30 text-center"
                        onClick={handleNext}
                        disabled={!canProceed}>
                        <div className="leading-tight">
                            <span className="text-[10px] font-bold opacity-80 block uppercase">Next:</span>
                            <span className="font-bold text-sm tracking-wider block uppercase">{nextLabel}</span>
                        </div>
                    </Button>
                </div>
            </div>
        );
    };

    // ── Step 2 (recurring only): Property Details ────────────────────
    const renderDetailsStep = () => (
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
            <div className="mt-8 pt-6 border-t border-base-200 flex justify-between gap-3">
                <Button type="button" variant="secondary" className="rounded-xl px-6 font-black uppercase tracking-widest text-[10px]" onClick={handleBack}>Back</Button>
                <Button type="button" className="rounded-xl px-8 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20" onClick={handleNext}>Next: Choose Services</Button>
            </div>
        </div>
    );

    // ── Services Step ────────────────────────────────────────────────
    const renderServicesStep = () => {
        if (isOneTime) {
            const standaloneServices = availableServices.filter(s => s.category === 'standalone');
            return (
                <div className="space-y-8 animate-in fade-in duration-300">
                    <Card className="p-0 overflow-hidden">
                        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider px-6 pt-6">Available Services</h2>
                        <div className="divide-y divide-base-200">
                            {standaloneServices.length === 0 && (
                                <p className="p-6 text-gray-500 text-sm">No one-time services are currently available.</p>
                            )}
                            {standaloneServices.map(service => {
                                const selection = selectedServices.find(s => s.serviceId === service.id);
                                return (
                                    <div key={service.id} className="p-6 flex flex-row justify-between items-center gap-4">
                                        <div className="flex items-center gap-4 flex-1">
                                            <div className="w-10 h-10 bg-gray-100 rounded-full flex-shrink-0"></div>
                                            <div>
                                                <h3 className="font-bold text-gray-900">{service.name}</h3>
                                                <p className="text-xs text-gray-500">{service.description}</p>
                                                <p className="text-sm font-bold text-primary mt-1">${Number(service.price).toFixed(2)}</p>
                                            </div>
                                        </div>
                                        <QuantitySelector
                                            quantity={selection?.quantity || 0}
                                            onIncrement={() => handleServiceQuantityChange(service.id, 'increment')}
                                            onDecrement={() => handleServiceQuantityChange(service.id, 'decrement')}
                                            isUpdating={false}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                        {/* One-time total footer */}
                        <div className="p-6 border-t border-base-200 bg-gray-50/50">
                            <div className="flex justify-between items-baseline">
                                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Total</h3>
                                <p className="text-4xl font-black text-primary">${monthlyTotal.toFixed(2)}</p>
                            </div>
                        </div>
                    </Card>
                    <div className="flex justify-between gap-3">
                        <Button type="button" variant="secondary" className="rounded-xl px-6 font-black uppercase tracking-widest text-[10px]" onClick={handleBack}>Back</Button>
                        <Button type="button" className="rounded-xl px-8 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20" onClick={handleNext} disabled={selectedServices.length === 0}>Next: Payment</Button>
                    </div>
                </div>
            );
        }

        return (
            <div className="space-y-8 animate-in fade-in duration-300">
                <ServiceSelector
                    services={availableServices}
                    getQuantity={(serviceId) => selectedServices.find(s => s.serviceId === serviceId)?.quantity || 0}
                    onIncrement={(service) => handleServiceQuantityChange(service.id, 'increment')}
                    onDecrement={(service) => handleServiceQuantityChange(service.id, 'decrement')}
                    isUpdating={() => false}
                    isAtHouseActive={isAtHouseSelected}
                    onAtHouseToggle={handleCollectionMethodToggle}
                    isLinerActive={isLinerSelected}
                    onLinerToggle={handleLinerToggle}
                    totalBaseServiceCans={totalBaseServiceCans}
                    monthlyTotal={monthlyTotal}
                    setupTotal={setupTotal}
                    showPricingSummary={false}
                    footerAction={
                        <div className="flex justify-between gap-3">
                            <Button type="button" variant="secondary" className="rounded-xl px-6 font-black uppercase tracking-widest text-[10px]" onClick={handleBack}>Back</Button>
                            <Button type="button" className="rounded-xl px-8 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20" onClick={handleNext} disabled={selectedServices.length === 0 || totalBaseServiceCans === 0}>Next: Payment</Button>
                        </div>
                    }
                />
            </div>
        );
    };

    // ── Payment Step ─────────────────────────────────────────────────
    const renderPaymentStep = () => (
         <div className="space-y-6 animate-in fade-in duration-300">
             {/* ACH savings nudge */}
             <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                 <p className="text-sm font-bold text-green-800">Save on processing fees</p>
                 <p className="text-xs text-green-600 mt-1">Pay by bank transfer (ACH) for lower transaction costs. Card payments are also accepted.</p>
             </div>

             {loadingMethods ? <p>Loading payment methods...</p> : (
                 <>
                     {paymentMethods.length > 0 && (
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Use Existing Payment Method</label>
                            {paymentMethods.map(method => (
                                <div key={method.id} onClick={() => { setSelectedMethodId(method.id); setBillingChoice('existing');}} className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all mb-2 ${selectedMethodId === method.id && billingChoice === 'existing' ? 'border-primary ring-1 ring-primary bg-teal-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                                    <input type="radio" name="paymentMethod" value={method.id} checked={selectedMethodId === method.id && billingChoice === 'existing'} readOnly className="h-4 w-4 text-primary focus:ring-primary border-gray-300"/>
                                    {method.type === 'Card' ? <CreditCardIcon className="w-6 h-6 mx-3 text-neutral" /> : <BanknotesIcon className="w-6 h-6 mx-3 text-neutral" />}
                                    <p className="font-semibold text-neutral">{method.brand ? `${method.brand} ending in ${method.last4}` : `Bank Account ending in ${method.last4}`}</p>
                                    {method.isPrimary && <span className="ml-auto text-xs text-primary font-bold">Primary</span>}
                                </div>
                             ))}
                        </div>
                     )}

                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Add New Payment Method</label>
                        <div onClick={() => setBillingChoice('new')} className={`p-4 border rounded-lg cursor-pointer ${billingChoice === 'new' ? 'border-primary ring-1 ring-primary bg-teal-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                            <input type="radio" name="paymentMethod" value="new" checked={billingChoice === 'new'} readOnly className="h-4 w-4 text-primary focus:ring-primary border-gray-300 mb-3"/>
                            {billingChoice === 'new' && clientSecret && (
                                <div className="mt-2">
                                    <Elements stripe={getStripePromise()} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
                                        <NewPaymentForm
                                            onConfirmed={handleNewPaymentConfirmed}
                                            onBack={handleBack}
                                            isProcessing={isProcessing}
                                            setIsProcessing={setIsProcessing}
                                            setSetupError={setSetupError}
                                            submitLabel={submitLabel}
                                        />
                                    </Elements>
                                </div>
                            )}
                            {billingChoice === 'new' && !clientSecret && !setupError && (
                                <div className="mt-2 flex justify-center py-4">
                                    <div className="animate-spin rounded-full h-6 w-6 border-4 border-primary/20 border-t-primary"></div>
                                </div>
                            )}
                        </div>
                    </div>
                </>
             )}

            {setupError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                    {setupError}
                </div>
            )}

            {billingChoice !== 'new' && (
                <div className="mt-8 pt-6 border-t border-base-200 flex justify-between gap-3">
                    <Button type="button" variant="secondary" className="rounded-xl px-6 font-black uppercase tracking-widest text-[10px]" onClick={handleBack}>Back</Button>
                    <Button type="submit" className="rounded-xl px-8 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20" disabled={isProcessing}>
                        {isProcessing ? 'Processing...' : submitLabel}
                    </Button>
                </div>
            )}
        </div>
    );

    // ── Route steps to render functions ──────────────────────────────
    const renderContent = () => {
        if (step === 0) return renderFlowSelector();
        if (step === 1) return renderAddressStep();
        if (isOneTime) {
            // One-time: 1=Address, 2=Services, 3=Payment
            if (step === 2) return renderServicesStep();
            if (step === 3) return renderPaymentStep();
        } else {
            // Recurring: 1=Address, 2=Details, 3=Services, 4=Payment
            if (step === 2) return renderDetailsStep();
            if (step === 3) return renderServicesStep();
            if (step === 4) return renderPaymentStep();
        }
        return renderAddressStep();
    };

    // Show order summary sidebar on services and payment steps
    const showSummary = step >= servicesStep && selectedServices.length > 0;

    // ── Titles ───────────────────────────────────────────────────────
    const getTitle = () => {
        if (step === 0) return isOnboarding ? "Welcome! Let's Get Started" : 'Start a Service';
        if (isOnboarding) {
            return isOneTime ? 'Request a One-Time Pickup' : "Let's Get You Set Up";
        }
        return isOneTime ? 'Request a Pickup' : 'Add Service Address';
    };

    const getSubtitle = () => {
        if (step === 0) return 'Choose the type of service you need.';
        if (isOneTime) return 'Tell us your address and select your pickup services.';
        return 'Follow these steps to add your address and choose your services.';
    };

    return (
        <div className={`mx-auto space-y-8 p-4 sm:p-6 lg:p-8 animate-in fade-in duration-500 ${showSummary ? 'max-w-5xl' : 'max-w-3xl'}`}>
            <div className="text-center">
                <h1 className="text-4xl font-black text-gray-900 tracking-tighter">{getTitle()}</h1>
                <p className="text-gray-500 font-medium mt-2">{getSubtitle()}</p>
            </div>

            {step > 0 && <StepIndicator currentStep={step} totalSteps={totalSteps} />}

            {showSummary ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                        <Card className="shadow-lg border-none">
                            <form onSubmit={handleSubmit} noValidate>
                                {renderContent()}
                            </form>
                        </Card>
                    </div>
                    <div className="lg:col-span-1">
                        <OrderSummary
                            selectedServices={selectedServices}
                            availableServices={availableServices}
                            monthlyTotal={monthlyTotal}
                            setupTotal={setupTotal}
                            isOneTime={isOneTime}
                        />
                    </div>
                </div>
            ) : (
                <Card className="shadow-lg border-none">
                    <form onSubmit={handleSubmit} noValidate>
                        {renderContent()}
                    </form>
                </Card>
            )}
        </div>
    );
};

export default StartService;
