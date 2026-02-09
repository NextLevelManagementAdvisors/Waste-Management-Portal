
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from './Button.tsx';
import { Card } from './Card.tsx';
import { NewPropertyInfo, PaymentMethod, Service, AddressSuggestion } from '../types.ts';
import { getPaymentMethods, addPaymentMethod, setPrimaryPaymentMethod, getServices } from '../services/mockApiService.ts';
import { getAddressSuggestions } from '../services/addressService.ts';
import { CreditCardIcon, BanknotesIcon, TrashIcon, CheckCircleIcon } from './Icons.tsx';

interface ServiceSelection {
    serviceId: string;
    useSticker: boolean;
    quantity: number;
}

interface StartServiceProps {
    onCompleteSetup: (propertyInfo: NewPropertyInfo, services: ServiceSelection[]) => Promise<void>;
    onCancel: () => void;
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
                className="w-8 h-8 p-0 bg-gray-200 hover:bg-gray-300"
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
                className="w-8 h-8 p-0 bg-gray-200 hover:bg-gray-300"
                aria-label="Increase quantity"
            >
                <span className="text-xl font-thin">+</span>
            </Button>
        </div>
    );
};


const StartService: React.FC<StartServiceProps> = ({ onCompleteSetup, onCancel }) => {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState<NewPropertyInfo>(initialFormState);
    const [isProcessing, setIsProcessing] = useState(false);

    // Step 1: Address Validation State
    const [addressQuery, setAddressQuery] = useState('');
    const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
    const [isAddressValidated, setIsAddressValidated] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const addressInputRef = useRef<HTMLDivElement>(null);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // Step 3 state
    const [availableServices, setAvailableServices] = useState<Service[]>([]);
    const [selectedServices, setSelectedServices] = useState<ServiceSelection[]>([]);
    const [updatingIds, setUpdatingIds] = useState<Record<string, boolean>>({});


    // Step 4 state
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
    const [loadingMethods, setLoadingMethods] = useState(false);
    const [billingChoice, setBillingChoice] = useState<'existing' | 'new'>('existing');
    const [selectedMethodId, setSelectedMethodId] = useState('');
    const [newPaymentType, setNewPaymentType] = useState<'card' | 'bank'>('card');
    const [autoPay, setAutoPay] = useState(true);

    // Debounced address search
     useEffect(() => {
        if (addressQuery.length < 3) {
            setAddressSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        setIsSearching(true);
        const handler = setTimeout(async () => {
            const results = await getAddressSuggestions(addressQuery);
            setAddressSuggestions(results);
            setShowSuggestions(results.length > 0);
            setIsSearching(false);
        }, 300);

        return () => clearTimeout(handler);
    }, [addressQuery]);
    
    // Click outside handler for address suggestions
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (addressInputRef.current && !addressInputRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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

    const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const query = e.target.value;
        setAddressQuery(query);
        setIsAddressValidated(false); // New typing invalidates previous selection

        // When user types in the street field, also reset other address fields
        // to prevent inconsistent data (e.g., old city with new street).
        setFormData(prev => ({
            ...prev,
            street: query,
            city: '',
            state: '',
            zip: '',
        }));
    };

    const handleSuggestionClick = (suggestion: AddressSuggestion) => {
        setFormData(prev => ({
            ...prev,
            street: suggestion.street,
            city: suggestion.city,
            state: suggestion.state,
            zip: suggestion.zip,
        }));
        setAddressQuery(suggestion.street);
        setAddressSuggestions([]);
        setShowSuggestions(false);
        setIsAddressValidated(true);
    };
    
    const handleRadioChange = (name: keyof NewPropertyInfo, value: any) => {
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleNext = () => setStep(s => s + 1);
    const handleBack = () => setStep(s => s - 1);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (step !== 4) return;
        
        setIsProcessing(true);
        try {
            if (billingChoice === 'new') {
                await addPaymentMethod(
                    newPaymentType === 'card' 
                        ? { type: 'Card', brand: 'Visa', last4: '4242', expiryMonth: 12, expiryYear: 2028 }
                        : { type: 'Bank Account', last4: '6789' }
                );
            } else if (billingChoice === 'existing' && selectedMethodId) {
                await setPrimaryPaymentMethod(selectedMethodId);
            }
            
            await onCompleteSetup(formData, selectedServices);

        } catch (error) {
            console.error("Failed during service setup:", error);
            alert("An error occurred during setup. Please check your details and try again.");
            setIsProcessing(false);
        }
    };

    const renderStep1 = () => (
        <div className="space-y-4 animate-in fade-in duration-300">
            <div className="relative" ref={addressInputRef}>
                <label htmlFor="street" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Street Address</label>
                <div className="relative">
                    <input type="text" name="street" id="street" value={formData.street} onChange={handleAddressChange} onFocus={() => addressSuggestions.length > 0 && setShowSuggestions(true)} className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all pr-10" required autoComplete="off" />
                     {isAddressValidated && <CheckCircleIcon className="w-6 h-6 text-green-500 absolute right-3 top-1/2 -translate-y-1/2" />}
                </div>
                 {showSuggestions && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto">
                        <ul>
                            {isSearching ? (
                                <li className="px-4 py-3 text-sm text-gray-500">Searching...</li>
                            ) : (
                                addressSuggestions.map((s, i) => (
                                    <li key={i} onClick={() => handleSuggestionClick(s)} className="px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100 cursor-pointer">
                                        {s.street}, {s.city}, {s.state} {s.zip}
                                    </li>
                                ))
                            )}
                        </ul>
                    </div>
                )}
            </div>
            <div className="flex gap-4">
                <div className="flex-1">
                    <label htmlFor="city" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">City</label>
                    <input type="text" name="city" id="city" value={formData.city} onChange={handleChange} className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required readOnly={isAddressValidated} />
                </div>
                <div className="w-28">
                     <label htmlFor="state" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">State</label>
                    <input type="text" name="state" id="state" value={formData.state} onChange={handleChange} maxLength={2} placeholder="CA" className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all uppercase" required readOnly={isAddressValidated} />
                </div>
            </div>
            <div className="flex gap-4">
                <div className="flex-1">
                    <label htmlFor="zip" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Zip Code</label>
                    <input type="text" name="zip" id="zip" value={formData.zip} onChange={handleChange} className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required readOnly={isAddressValidated} />
                </div>
                <div className="flex-1">
                    <label htmlFor="referralCode" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Referral Code (Optional)</label>
                    <input type="text" name="referralCode" id="referralCode" value={formData.referralCode} onChange={handleChange} placeholder="JANE-D-8432" className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" />
                </div>
            </div>
            <div className="mt-8 pt-6 border-t border-base-200 flex justify-end gap-3">
                <Button type="button" variant="secondary" className="rounded-xl px-6 font-black uppercase tracking-widest text-[10px]" onClick={onCancel}>Cancel</Button>
                <Button type="button" className="rounded-xl px-8 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20" onClick={handleNext} disabled={!isAddressValidated}>Next: Property Details</Button>
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

            <div className="mt-8 pt-6 border-t border-base-200 flex justify-between gap-3">
                <Button type="button" variant="secondary" className="rounded-xl px-6 font-black uppercase tracking-widest text-[10px]" onClick={handleBack}>Back</Button>
                <Button type="button" onClick={handleNext} className="rounded-xl px-10 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20">
                    Next: Select Services
                </Button>
            </div>
        </div>
    );

    const { monthlyTotal, setupTotal, totalDueToday } = useMemo(() => {
        const monthly = selectedServices.reduce((total, selected) => {
            const service = availableServices.find(s => s.id === selected.serviceId);
            return total + (service ? service.price * selected.quantity : 0);
        }, 0);

        const setup = selectedServices.reduce((total, selected) => {
            const service = availableServices.find(s => s.id === selected.serviceId);
            if (!service || service.category !== 'base_service') return total;

            const fee = selected.useSticker ? (service.stickerFee || 0) : (service.setupFee || 0);
            return total + (fee * selected.quantity);
        }, 0);

        return {
            monthlyTotal: monthly,
            setupTotal: setup,
            totalDueToday: monthly + setup
        };
    }, [selectedServices, availableServices]);

    const renderStep3 = () => {
        const baseServices = availableServices.filter(s => s.category === 'base_service');
        const baseFee = availableServices.find(s => s.category === 'base_fee');

        const handleSelectService = (service: Service, useSticker: boolean) => {
            setSelectedServices(prev => {
                let newSelection = [...prev];
        
                // Add the newly selected service.
                // We don't need to check for existence because the UI changes to a remove button.
                newSelection.push({ serviceId: service.id, useSticker, quantity: 1 });
        
                // Check if a base fee needs to be added.
                const hasBaseService = newSelection.some(sel => 
                    availableServices.find(s => s.id === sel.serviceId)?.category === 'base_service'
                );
                const hasBaseFee = newSelection.some(s => s.serviceId === baseFee?.id);
        
                if (baseFee && hasBaseService && !hasBaseFee) {
                    newSelection.push({ serviceId: baseFee.id, useSticker: false, quantity: 1 });
                }
        
                return newSelection;
            });
        };
        
        const handleQuantityChange = (serviceId: string, change: 'increment' | 'decrement') => {
            setUpdatingIds(prev => ({ ...prev, [serviceId]: true }));
        
            setSelectedServices(prev => {
                const newSelection = [...prev];
                const selectionIndex = newSelection.findIndex(s => s.serviceId === serviceId);
        
                if (selectionIndex > -1) {
                    const newQuantity = change === 'increment' 
                        ? newSelection[selectionIndex].quantity + 1 
                        : newSelection[selectionIndex].quantity - 1;
        
                    if (newQuantity > 0) {
                        newSelection[selectionIndex].quantity = newQuantity;
                    } else {
                        newSelection.splice(selectionIndex, 1);
        
                        const baseFee = availableServices.find(s => s.category === 'base_fee');
                        const remainingBaseServices = newSelection.some(sel => 
                            availableServices.find(s => s.id === sel.serviceId)?.category === 'base_service'
                        );
        
                        if (baseFee && !remainingBaseServices) {
                            return newSelection.filter(s => s.serviceId !== baseFee.id);
                        }
                    }
                }
                return newSelection;
            });
        
            setTimeout(() => setUpdatingIds(prev => ({ ...prev, [serviceId]: false })), 300);
        };

        return (
            <div className="space-y-6 animate-in fade-in duration-300">
                {baseServices.map(service => {
                    const selection = selectedServices.find(s => s.serviceId === service.id);
                    const isSelected = !!selection;
                    return (
                        <Card key={service.id} className={`p-4 transition-all duration-300 ${isSelected ? 'ring-2 ring-primary bg-primary/5' : ''}`}>
                            <div className="flex flex-col sm:flex-row gap-4">
                                <div className="flex-1">
                                    <h4 className="font-bold text-lg text-gray-900">{service.name}</h4>
                                    <p className="text-sm text-gray-500">{service.description}</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-black text-2xl text-primary">${service.price.toFixed(2)}</p>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">/ Month</p>
                                </div>
                            </div>
                            {isSelected && selection ? (
                                <div className="mt-4 pt-4 border-t border-primary/10">
                                    <div className="flex items-center justify-between p-3 bg-teal-50 rounded-lg animate-in fade-in duration-300">
                                        <p className="text-sm font-bold text-primary">
                                            ✓ {selection.useSticker ? "Using Your Own Can" : "Renting Our Can"}
                                        </p>
                                        <QuantitySelector
                                            quantity={selection.quantity}
                                            onIncrement={() => handleQuantityChange(service.id, 'increment')}
                                            onDecrement={() => handleQuantityChange(service.id, 'decrement')}
                                            isUpdating={!!updatingIds[service.id]}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-2 gap-3">
                                    <Button onClick={() => handleSelectService(service, false)} variant="secondary" className="flex-col h-auto py-2 rounded-lg">
                                        <span className="font-bold text-sm">Rent Our Can</span>
                                        <span className="text-xs text-gray-500">+${(service.setupFee || 0).toFixed(2)} setup</span>
                                    </Button>
                                    <Button onClick={() => handleSelectService(service, true)} variant="secondary" className="flex-col h-auto py-2 rounded-lg">
                                         <span className="font-bold text-sm">Use Your Own</span>
                                        <span className="text-xs text-gray-500">{(service.stickerFee || 0) > 0 ? `+${(service.stickerFee || 0).toFixed(2)} sticker` : `Free Sticker Included`}</span>
                                    </Button>
                                </div>
                            )}
                        </Card>
                    );
                })}
                
                <div className="mt-8 pt-6 border-t border-base-200 flex justify-between items-center gap-3">
                    <Button type="button" variant="secondary" className="rounded-xl px-6 font-black uppercase tracking-widest text-[10px]" onClick={handleBack}>Back</Button>
                    <div className="text-right">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Monthly Total</p>
                        <p className="text-3xl font-black text-primary">${monthlyTotal.toFixed(2)}</p>
                    </div>
                    <Button type="button" onClick={handleNext} disabled={selectedServices.length === 0} className="rounded-xl px-10 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20">
                        Next: Billing Setup
                    </Button>
                </div>
            </div>
        );
    };

    const renderStep4 = () => {
        if (loadingMethods) {
            return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
        }

        return (
            <div className="space-y-6 animate-in fade-in duration-300">
                {paymentMethods.length > 0 && (
                    <div className="flex border-b-2 border-base-200">
                        <button type="button" onClick={() => setBillingChoice('existing')} className={`flex-1 pb-3 text-center font-black uppercase tracking-widest text-xs transition-colors ${billingChoice === 'existing' ? 'text-primary border-b-2 border-primary -mb-0.5' : 'text-gray-400'}`}>Use Existing</button>
                        <button type="button" onClick={() => setBillingChoice('new')} className={`flex-1 pb-3 text-center font-black uppercase tracking-widest text-xs transition-colors ${billingChoice === 'new' ? 'text-primary border-b-2 border-primary -mb-0.5' : 'text-gray-400'}`}>Add New</button>
                    </div>
                )}

                {billingChoice === 'existing' && paymentMethods.length > 0 ? (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-2 pt-4">
                        {paymentMethods.map(method => (
                            <div 
                                key={method.id} 
                                onClick={() => setSelectedMethodId(method.id)}
                                className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all ${selectedMethodId === method.id ? 'border-primary ring-1 ring-primary bg-teal-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                            >
                                {method.type === 'Card' ? <CreditCardIcon className="w-6 h-6 mr-3 text-neutral" /> : <BanknotesIcon className="w-6 h-6 mr-3 text-neutral" />}
                                <div className="flex-1">
                                    <p className="font-semibold text-neutral">{method.brand ? `${method.brand} ending in ${method.last4}` : `Bank Account ending in ${method.last4}`}</p>
                                    {method.isPrimary && <p className="text-xs text-primary font-bold">Primary</p>}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <>
                        <div className="flex border-b-2 border-base-200">
                            <button type="button" onClick={() => setNewPaymentType('card')} className={`flex-1 pb-3 text-center font-black uppercase tracking-widest text-xs transition-colors ${newPaymentType === 'card' ? 'text-primary border-b-2 border-primary -mb-0.5' : 'text-gray-400'}`}>Credit Card</button>
                            <button type="button" onClick={() => setNewPaymentType('bank')} className={`flex-1 pb-3 text-center font-black uppercase tracking-widest text-xs transition-colors ${newPaymentType === 'bank' ? 'text-primary border-b-2 border-primary -mb-0.5' : 'text-gray-400'}`}>Bank Account</button>
                        </div>
                        {newPaymentType === 'card' ? (
                             <div className="space-y-4 pt-4">
                                <div>
                                    <label htmlFor="cardNumber" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Card Number</label>
                                    <input type="text" id="cardNumber" placeholder="•••• •••• •••• 4242" className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required />
                                </div>
                                 <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label htmlFor="expiry" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Expiry Date</label>
                                        <input type="text" id="expiry" placeholder="MM / YY" className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required />
                                    </div>
                                    <div className="flex-1">
                                        <label htmlFor="cvc" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">CVC</label>
                                        <input type="text" id="cvc" placeholder="•••" className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4 pt-4">
                                 <div>
                                    <label htmlFor="routingNumber" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Routing Number</label>
                                    <input type="text" id="routingNumber" placeholder="123456789" className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required />
                                </div>
                                 <div>
                                    <label htmlFor="accountNumber" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Account Number</label>
                                    <input type="text" id="accountNumber" placeholder="••••••6789" className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required />
                                </div>
                            </div>
                        )}
                         <p className="text-xs text-gray-400 pt-2 text-center">Your payment information is securely stored with our PCI-compliant payment processor.</p>
                    </>
                )}
                
                 <div className="p-6 bg-gray-50 rounded-2xl border border-base-200 space-y-3 my-6">
                    <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">Order Summary</h3>
                    <div className="flex justify-between items-center">
                        <p className="font-medium text-gray-600">First Month's Service</p>
                        <p className="font-bold text-gray-900">${monthlyTotal.toFixed(2)}</p>
                    </div>
                    {setupTotal > 0 && (
                        <div className="flex justify-between items-center">
                            <p className="font-medium text-gray-600">One-Time Setup Fees</p>
                            <p className="font-bold text-gray-900">${setupTotal.toFixed(2)}</p>
                        </div>
                    )}
                    <div className="flex justify-between items-center pt-3 border-t border-base-200">
                        <p className="font-black text-gray-900 uppercase">Total Due Today</p>
                        <p className="font-black text-2xl text-primary">${totalDueToday.toFixed(2)}</p>
                    </div>
                </div>

                 <div className="pt-2">
                    <label className="flex items-center group cursor-pointer">
                        <input 
                            type="checkbox" 
                            checked={autoPay}
                            onChange={() => setAutoPay(prev => !prev)}
                            className="w-5 h-5 text-primary border-gray-300 rounded focus:ring-primary" 
                        />
                        <span className="ml-3 font-bold text-sm text-gray-700 group-hover:text-primary transition-colors">
                            Enroll in Auto-Pay
                        </span>
                    </label>
                     <p className="text-xs text-gray-500 ml-8 mt-1">
                        Your recurring monthly bill of ${monthlyTotal.toFixed(2)} will be automatically charged to this payment method.
                    </p>
                </div>

                <div className="mt-8 pt-6 border-t border-base-200 flex justify-between gap-3">
                    <Button type="button" variant="secondary" className="rounded-xl px-6 font-black uppercase tracking-widest text-[10px]" onClick={handleBack}>Back</Button>
                    <Button type="submit" disabled={isProcessing || (billingChoice === 'existing' && !selectedMethodId)} className="rounded-xl px-10 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20">
                        {isProcessing ? 'Finalizing...' : `Pay $${totalDueToday.toFixed(2)} & Complete`}
                    </Button>
                </div>
            </div>
        );
    };
    
    return (
        <div className="max-w-3xl mx-auto animate-in fade-in duration-500">
            <Card className="shadow-2xl border-none p-6 sm:p-10">
                <div className="text-center mb-10">
                    <h1 className="text-4xl font-black text-gray-900 tracking-tight">
                        Welcome! Let's Start Your Service.
                    </h1>
                     <p className="text-gray-500 mt-2 font-medium">
                        {step === 1 && "First, where do you need service?"}
                        {step === 2 && "Great! Now, tell us about the location."}
                        {step === 3 && "Next, choose your primary collection service."}
                        {step === 4 && "Finally, let's set up your primary payment method."}
                    </p>
                </div>
                <StepIndicator currentStep={step} />
                <form onSubmit={handleSubmit} noValidate>
                    {step === 1 && renderStep1()}
                    {step === 2 && renderStep2()}
                    {step === 3 && renderStep3()}
                    {step === 4 && renderStep4()}
                </form>
            </Card>
        </div>
    );
};

export default StartService;
