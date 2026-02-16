import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Button } from './Button.tsx';
import { Card } from './Card.tsx';
import { NewPropertyInfo, PaymentMethod, Service } from '../types.ts';
import AddressAutocomplete from './AddressAutocomplete.tsx';
import { getPaymentMethods, addPaymentMethod, setPrimaryPaymentMethod, getServices } from '../services/mockApiService.ts';
import { CreditCardIcon, BanknotesIcon, TrashIcon, CheckCircleIcon, HomeModernIcon, TruckIcon, SunIcon } from './Icons.tsx';
import ToggleSwitch from './ToggleSwitch.tsx';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { getCustomerId } from '../services/stripeService.ts';

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
    referralCode: ''
};

const StepIndicator: React.FC<{ currentStep: number }> = ({ currentStep }) => (
    <div className="flex justify-center items-center mb-10">
        {[1, 2, 3, 4].map(s => (
            <React.Fragment key={s}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 font-black text-sm ${currentStep >= s ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-110' : 'bg-base-300 text-gray-500'}`}>
                    {s}
                </div>
                {s < 4 && <div className={`flex-1 h-1.5 mx-2 rounded-full transition-colors duration-500 ${currentStep > s ? 'bg-primary' : 'bg-base-300'}`} />}
            </React.Fragment>
        ))}
    </div>
);

const QuantitySelector: React.FC<{
    quantity: number;
    onIncrement: () => void;
    onDecrement: () => void;
    isUpdating: boolean;
}> = ({ quantity, onIncrement, onDecrement, isUpdating }) => {
    return (
        <div className="flex items-center gap-1">
            <Button
                size="sm"
                variant="secondary"
                onClick={onDecrement}
                disabled={isUpdating || quantity <= 0}
                className="w-8 h-8 p-0 bg-gray-200 hover:bg-gray-300 rounded-full"
                aria-label="Decrease quantity"
            >
                {quantity > 1 ? <span className="text-xl font-thin">-</span> : <TrashIcon className="w-4 h-4 text-red-500" /> }
            </Button>
            <div
                className="w-10 h-8 flex items-center justify-center text-base font-bold text-neutral"
                aria-live="polite"
            >
                {isUpdating ? <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-primary"></div> : quantity}
            </div>
            <Button
                size="sm"
                variant="secondary"
                onClick={onIncrement}
                disabled={isUpdating}
                className="w-8 h-8 p-0 bg-gray-200 hover:bg-gray-300 rounded-full"
                aria-label="Increase quantity"
            >
                <span className="text-xl font-thin">+</span>
            </Button>
        </div>
    );
};


const StartService: React.FC<StartServiceProps> = ({ onCompleteSetup, onCancel, isOnboarding = false, serviceFlowType }) => {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState<NewPropertyInfo>(initialFormState);
    const [isProcessing, setIsProcessing] = useState(false);

    // Step 3 state
    const [availableServices, setAvailableServices] = useState<Service[]>([]);
    const [selectedServices, setSelectedServices] = useState<ServiceSelection[]>([]);

    // Step 4 state
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
    const [loadingMethods, setLoadingMethods] = useState(false);
    const [billingChoice, setBillingChoice] = useState<'existing' | 'new'>('existing');
    const [selectedMethodId, setSelectedMethodId] = useState('');
    
     useEffect(() => {
        if (step === 3 && availableServices.length === 0) {
            getServices().then(setAvailableServices);
        }
        if (step === 4) {
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
    }, [step, availableServices.length]);

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
            street: components.street,
            city: components.city,
            state: components.state,
            zip: components.zip,
        }));
    }, []);

    const handleNext = () => setStep(s => s + 1);
    const handleBack = () => setStep(s => s - 1);

    const stripe = useStripe();
    const elements = useElements();
    const [setupError, setSetupError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (step !== 4) return;
        
        setIsProcessing(true);
        setSetupError(null);
        try {
            if (billingChoice === 'new') {
                if (!stripe || !elements) {
                    setSetupError('Payment system is still loading. Please wait.');
                    setIsProcessing(false);
                    return;
                }
                const customerId = getCustomerId();
                if (!customerId) {
                    setSetupError('No customer account found. Please log in again.');
                    setIsProcessing(false);
                    return;
                }

                const setupRes = await fetch('/api/setup-intent', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ customerId }),
                });
                const setupText = await setupRes.text();
                let setupJson;
                try { setupJson = JSON.parse(setupText); } catch { throw new Error('Server error while setting up payment'); }
                const { data: setupData } = setupJson;

                const cardElement = elements.getElement(CardElement);
                if (!cardElement) {
                    setSetupError('Card input not found. Please try again.');
                    setIsProcessing(false);
                    return;
                }

                const { error: stripeError, setupIntent } = await stripe.confirmCardSetup(
                    setupData.clientSecret,
                    { payment_method: { card: cardElement as any } }
                );

                if (stripeError) {
                    setSetupError(stripeError.message || 'Failed to add card.');
                    setIsProcessing(false);
                    return;
                }

                if (setupIntent?.payment_method) {
                    const pmId = typeof setupIntent.payment_method === 'string'
                        ? setupIntent.payment_method
                        : setupIntent.payment_method.id;
                    await addPaymentMethod(pmId);
                    setSelectedMethodId(pmId);
                }
            } else if (billingChoice === 'existing' && selectedMethodId) {
                await setPrimaryPaymentMethod(selectedMethodId);
            }
            
            await onCompleteSetup(formData, selectedServices);

        } catch (error) {
            console.error("Failed during service setup:", error);
            setSetupError("An error occurred during setup. Please check your details and try again.");
            setIsProcessing(false);
        }
    };
    
    // --- Step 3 Service Selection Logic ---

    const baseFeeService = useMemo(() => availableServices.find(s => s.category === 'base_fee'), [availableServices]);
    const atHouseService = useMemo(() => availableServices.find(s => s.id === 'prod_TOvyKnOx4KLBc2'), [availableServices]);
    const linerService = useMemo(() => availableServices.find(s => s.id === 'prod_TOx5lSdv97AAGb'), [availableServices]);

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
        if (!baseFeeService || !linerService || serviceFlowType === 'request') return;

        setSelectedServices(prev => {
            const hasBaseFee = prev.some(s => s.serviceId === baseFeeService.id);
            const linerSub = prev.find(s => s.serviceId === linerService.id);
            
            let nextState = [...prev];
            let hasChanged = false;
    
            // Manage base fee
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
    
            // Sync or remove liner service
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
    }, [totalBaseServiceCans, baseFeeService, atHouseService, linerService]);

    const handleCollectionMethodToggle = () => {
        if (!atHouseService) return;
        if (isAtHouseSelected) {
            setSelectedServices(prev => prev.filter(s => s.serviceId !== atHouseService.id));
        } else {
            setSelectedServices(prev => [...prev, { serviceId: atHouseService.id, quantity: 1, useSticker: false }]);
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


    const renderStep1 = () => {
        const canProceed = !!(formData.street && formData.city && formData.state && formData.zip);
        const inputClass = "w-full bg-gray-100 border border-gray-200 shadow-inner rounded-lg px-4 py-3 font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all";

        return (
            <div className="space-y-6 animate-in fade-in duration-300">
                <div>
                    <label htmlFor="street" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Street Address</label>
                    <AddressAutocomplete
                        id="street"
                        name="street"
                        value={formData.street}
                        onChange={(val) => setFormData(prev => ({ ...prev, street: val }))}
                        onAddressSelect={handleAddressSelect}
                        className={inputClass}
                        required
                    />
                </div>
                
                <div className="flex gap-4">
                    <div className="flex-1">
                        <label htmlFor="city" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">City</label>
                        <input type="text" name="city" id="city" value={formData.city} onChange={handleChange} className={inputClass} required />
                    </div>
                    <div className="w-24 sm:w-28">
                         <label htmlFor="state" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">State</label>
                        <input type="text" name="state" id="state" value={formData.state} onChange={handleChange} maxLength={2} placeholder="CA" className={`${inputClass} uppercase`} required />
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                        <label htmlFor="zip" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Zip Code</label>
                        <input type="text" name="zip" id="zip" value={formData.zip} onChange={handleChange} className={inputClass} required />
                    </div>
                    <div className="flex-1">
                        <label htmlFor="referralCode" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Referral Code (Optional)</label>
                        <input type="text" name="referralCode" id="referralCode" value={formData.referralCode} onChange={handleChange} placeholder="JANE-D-8432" className={inputClass} />
                    </div>
                </div>
                <div className="mt-8 pt-6 border-t border-base-200 flex justify-between items-stretch gap-3">
                    <Button 
                        type="button" 
                        variant="secondary" 
                        className="rounded-lg px-8 font-bold uppercase" 
                        onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button 
                        type="button" 
                        className="flex-grow rounded-lg py-3 px-6 shadow-lg shadow-primary/30 text-center" 
                        onClick={handleNext} 
                        disabled={!canProceed}>
                        <div className="leading-tight">
                            <span className="text-[10px] font-bold opacity-80 block uppercase">Next:</span>
                            <span className="font-bold text-sm tracking-wider block uppercase">Property Details</span>
                        </div>
                    </Button>
                </div>
            </div>
        );
    }
    
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
            <div className="mt-8 pt-6 border-t border-base-200 flex justify-between gap-3">
                <Button type="button" variant="secondary" className="rounded-xl px-6 font-black uppercase tracking-widest text-[10px]" onClick={handleBack}>Back</Button>
                <Button type="button" className="rounded-xl px-8 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20" onClick={handleNext}>Next: Choose Services</Button>
            </div>
        </div>
    );

    const renderStep3 = () => {
        if (serviceFlowType === 'request') {
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
                                                <p className="text-sm font-bold text-primary mt-1">${service.price.toFixed(2)}</p>
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
                    </Card>
                    <div className="mt-8 pt-6 border-t border-base-200 flex justify-between gap-3">
                        <Button type="button" variant="secondary" className="rounded-xl px-6 font-black uppercase tracking-widest text-[10px]" onClick={handleBack}>Back</Button>
                        <Button type="button" className="rounded-xl px-8 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20" onClick={handleNext} disabled={selectedServices.length === 0}>Next: Billing</Button>
                    </div>
                </div>
            );
        }

        const baseServices = availableServices.filter(s => s.category === 'base_service');
        const upgradeServices = availableServices.filter(s => s.category === 'upgrade' && s.id !== atHouseService?.id && s.id !== linerService?.id);
        const isLinerSelected = selectedServices.some(s => s.serviceId === linerService?.id);

        const handleLinerToggle = () => {
            if (!linerService || totalBaseServiceCans === 0) return;
            if (isLinerSelected) {
                setSelectedServices(prev => prev.filter(s => s.serviceId !== linerService.id));
            } else {
                setSelectedServices(prev => [...prev, { serviceId: linerService.id, quantity: totalBaseServiceCans, useSticker: false }]);
            }
        };

        return (
            <div className="space-y-8 animate-in fade-in duration-300">
                 <Card className="p-0 overflow-hidden">
                    <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider px-6 pt-6">Equipment & Frequency</h2>
                     <div className="divide-y divide-base-200">
                        {baseServices.map(service => {
                            const selection = selectedServices.find(s => s.serviceId === service.id);
                            return (
                                <div key={service.id} className="p-6 flex flex-row justify-between items-center gap-4">
                                    <div className="flex items-center gap-4 flex-1">
                                        <div className="w-10 h-10 bg-gray-100 rounded-full flex-shrink-0"></div>
                                        <div>
                                            <h3 className="font-bold text-gray-900">{service.name}</h3>
                                            <p className="text-xs text-gray-500">{service.description}</p>
                                            <p className="text-sm font-bold text-primary mt-1">${service.price.toFixed(2)}/mo</p>
                                        </div>
                                    </div>
                                    <QuantitySelector
                                        quantity={selection?.quantity || 0}
                                        onIncrement={() => handleServiceQuantityChange(service.id, 'increment')}
                                        onDecrement={() => handleServiceQuantityChange(service.id, 'decrement')}
                                        isUpdating={false}
                                    />
                                </div>
                            )
                        })}
                    </div>
                </Card>

                 {(atHouseService || linerService) && (
                    <Card className="p-0 overflow-hidden">
                        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider px-6 pt-6">Service Upgrades</h2>
                        <div className="divide-y divide-base-200">
                            {atHouseService && (
                                <div className="p-6 flex justify-between items-center">
                                    <div className="flex-1 pr-4">
                                        <h4 className="font-bold">{atHouseService.name}</h4>
                                        <p className="text-xs text-gray-500">{atHouseService.description}</p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <p className="text-sm font-bold text-primary shrink-0">+${atHouseService.price.toFixed(2)}/mo</p>
                                        <ToggleSwitch 
                                            checked={isAtHouseSelected}
                                            onChange={handleCollectionMethodToggle}
                                            disabled={totalBaseServiceCans === 0}
                                        />
                                    </div>
                                </div>
                            )}
                            {linerService && (
                                <div className="p-6 flex justify-between items-center">
                                    <div className="flex-1 pr-4">
                                        <h4 className="font-bold">{linerService.name}</h4>
                                        <p className="text-xs text-gray-500">{linerService.description}</p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <p className="text-sm font-bold text-primary shrink-0" aria-live="polite">
                                            +${(linerService.price * totalBaseServiceCans).toFixed(2)}/mo
                                        </p>
                                        <ToggleSwitch 
                                            checked={isLinerSelected}
                                            onChange={handleLinerToggle}
                                            disabled={totalBaseServiceCans === 0}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </Card>
                )}

                {upgradeServices.length > 0 && (
                    <Card className="p-0 overflow-hidden">
                        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider px-6 pt-6">Other Available Services</h2>
                        <div className="divide-y divide-base-200">
                            {upgradeServices.map(service => {
                                const selection = selectedServices.find(s => s.serviceId === service.id);
                                return (
                                    <div key={service.id} className="p-6 flex justify-between items-center">
                                        <div>
                                            <h4 className="font-bold">{service.name}</h4>
                                            <p className="text-xs text-gray-500">{service.description}</p>
                                            <p className="text-sm font-bold text-primary mt-1">${service.price.toFixed(2)}/mo</p>
                                        </div>
                                        <QuantitySelector
                                            quantity={selection?.quantity || 0}
                                            onIncrement={() => handleServiceQuantityChange(service.id, 'increment')}
                                            onDecrement={() => handleServiceQuantityChange(service.id, 'decrement')}
                                            isUpdating={false}
                                        />
                                    </div>
                                )
                            })}
                        </div>
                    </Card>
                )}

                <div className="mt-8 pt-6 border-t border-base-200">
                    <div className="space-y-3 mb-6">
                        <div className="flex justify-between items-center">
                            <p className="text-sm font-medium text-gray-500">One-Time Setup Fees</p>
                            <p className="text-sm font-semibold text-gray-500">${setupTotal.toFixed(2)}</p>
                        </div>
                        <div className="flex justify-between items-baseline">
                            <p className="text-lg font-bold text-gray-800">Total Monthly Bill</p>
                            <p className="text-3xl font-black text-primary">${monthlyTotal.toFixed(2)}</p>
                        </div>
                    </div>

                    <div className="flex justify-between gap-3">
                        <Button type="button" variant="secondary" className="rounded-xl px-6 font-black uppercase tracking-widest text-[10px]" onClick={handleBack}>Back</Button>
                        <Button type="button" className="rounded-xl px-8 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20" onClick={handleNext} disabled={selectedServices.length === 0 || totalBaseServiceCans === 0}>Next: Billing</Button>
                    </div>
                </div>
            </div>
        );
    };

    const CARD_ELEMENT_OPTIONS = {
        style: {
            base: {
                fontSize: '16px',
                color: '#1f2937',
                '::placeholder': { color: '#9ca3af' },
                fontFamily: 'system-ui, -apple-system, sans-serif',
            },
            invalid: { color: '#ef4444', iconColor: '#ef4444' },
        },
    };

    const renderStep4 = () => (
         <div className="space-y-6 animate-in fade-in duration-300">
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
                            {billingChoice === 'new' && (
                                <div className="mt-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Card Details</label>
                                    <div className="border border-gray-300 rounded-md p-3 bg-white focus-within:ring-2 focus-within:ring-primary focus-within:border-primary transition-all">
                                        <CardElement options={CARD_ELEMENT_OPTIONS} />
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2 text-center">Securely processed by Stripe.</p>
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
            
            <div className="mt-8 pt-6 border-t border-base-200 flex justify-between gap-3">
                <Button type="button" variant="secondary" className="rounded-xl px-6 font-black uppercase tracking-widest text-[10px]" onClick={handleBack}>Back</Button>
                <Button type="submit" className="rounded-xl px-8 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20" disabled={isProcessing || (billingChoice === 'new' && !stripe)}>
                    {isProcessing ? 'Processing...' : 'Complete Setup'}
                </Button>
            </div>
        </div>
    );
    
    const renderContent = () => {
        switch (step) {
            case 1: return renderStep1();
            case 2: return renderStep2();
            case 3: return renderStep3();
            case 4: return renderStep4();
            default: return renderStep1();
        }
    };

    return (
        <div className="max-w-3xl mx-auto space-y-8 p-4 sm:p-6 lg:p-8 animate-in fade-in duration-500">
            <div className="text-center">
                <h1 className="text-4xl font-black text-gray-900 tracking-tighter">
                    {isOnboarding
                        ? serviceFlowType === 'request'
                            ? 'Welcome! Request a Service'
                            : 'Welcome! Let\'s Get You Set Up'
                        : 'Add Service Address'}
                </h1>
                <p className="text-gray-500 font-medium mt-2">
                    {isOnboarding
                        ? serviceFlowType === 'request'
                            ? 'Add your address to request a one-time or special service.'
                            : 'Follow these steps to add your address and choose your services.'
                        : 'Add a new property and select your services.'}
                </p>
            </div>

            <StepIndicator currentStep={step} />

            <Card className="shadow-lg border-none">
                <form onSubmit={handleSubmit} noValidate>
                    {renderContent()}
                </form>
            </Card>
        </div>
    );
};

export default StartService;