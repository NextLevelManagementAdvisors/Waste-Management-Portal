import React from 'react';
import { Service } from '../types.ts';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import { TrashIcon } from './Icons.tsx';
import ToggleSwitch from './ToggleSwitch.tsx';
import Modal from './Modal.tsx';

export const QuantitySelector: React.FC<{
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

export const EquipmentChoiceModal: React.FC<{
    service: Service | null;
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (useSticker: boolean) => void;
    isProcessing: boolean;
}> = ({ service, isOpen, onClose, onConfirm, isProcessing }) => {
    if (!service) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Add ${service.name}`}>
            <div className="space-y-4">
                <p className="text-center text-gray-600 mb-6">Choose how you want to source your equipment. One-time setup fees may apply.</p>
                <div className="space-y-3">
                     <button
                        onClick={() => onConfirm(false)}
                        disabled={isProcessing}
                        className="w-full text-left p-4 border-2 rounded-lg hover:border-primary transition-all flex justify-between items-center disabled:opacity-50"
                    >
                        <div>
                            <h4 className="font-bold text-neutral">Rent Our Can</h4>
                            <p className="text-xs text-gray-500">We'll provide and maintain a can for you.</p>
                        </div>
                        <span className="font-bold text-primary text-sm">
                            ${(service.setupFee || 0).toFixed(2)} Setup
                        </span>
                    </button>
                    <button
                        onClick={() => onConfirm(true)}
                        disabled={isProcessing}
                        className="w-full text-left p-4 border-2 rounded-lg hover:border-primary transition-all flex justify-between items-center disabled:opacity-50"
                    >
                        <div>
                            <h4 className="font-bold text-neutral">Use Your Own Can</h4>
                            <p className="text-xs text-gray-500">We'll provide a sticker for identification.</p>
                        </div>
                        <span className="font-bold text-primary text-sm">
                           ${(service.stickerFee || 0).toFixed(2)} Setup
                        </span>
                    </button>
                </div>
            </div>
        </Modal>
    );
};

interface ServiceSelectorProps {
    services: Service[];
    getQuantity: (serviceId: string) => number;
    onIncrement: (service: Service) => void;
    onDecrement: (service: Service) => void;
    isUpdating: (serviceId: string) => boolean;
    isAtHouseActive: boolean;
    onAtHouseToggle: () => void;
    isLinerActive: boolean;
    onLinerToggle: () => void;
    totalBaseServiceCans: number;
    monthlyTotal: number;
    setupTotal?: number;
    footerAction?: React.ReactNode;
    showPricingSummary?: boolean;
}

const ServiceSelector: React.FC<ServiceSelectorProps> = ({
    services,
    getQuantity,
    onIncrement,
    onDecrement,
    isUpdating,
    isAtHouseActive,
    onAtHouseToggle,
    isLinerActive,
    onLinerToggle,
    totalBaseServiceCans,
    monthlyTotal,
    setupTotal,
    footerAction,
    showPricingSummary = true,
}) => {
    const baseServices = services.filter(s => s.category === 'base_service');
    const atHouseService = services.find(s => s.name.toLowerCase().includes('at house'));
    const linerService = services.find(s => s.name.toLowerCase().includes('liner'));
    const atHouseId = atHouseService?.id;
    const linerId = linerService?.id;
    const upgradeServices = services.filter(s => s.category === 'upgrade' && s.id !== atHouseId && s.id !== linerId);

    return (
        <div className="space-y-6">
            <Card className="p-0 overflow-hidden">
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider px-6 pt-6">Equipment & Frequency</h2>
                <div className="divide-y divide-base-200">
                    {baseServices.map(service => {
                        const quantity = getQuantity(service.id);
                        return (
                            <div key={service.id} className="p-6 flex justify-between items-center gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-gray-100 rounded-full flex-shrink-0"></div>
                                    <div>
                                        <h3 className="font-bold text-gray-900">{service.name}</h3>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Weekly Collection</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <p className="font-bold text-lg text-gray-900 leading-none">${Number(service.price).toFixed(2)}</p>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">Per Can</p>
                                    </div>
                                    <QuantitySelector
                                        quantity={quantity}
                                        onIncrement={() => onIncrement(service)}
                                        onDecrement={() => onDecrement(service)}
                                        isUpdating={isUpdating(service.id)}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
                {(atHouseService || linerService) && (
                    <div className="border-t border-base-200">
                        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider px-6 pt-6">Service Upgrades</h2>
                        <div className="divide-y divide-base-200">
                            {atHouseService && (
                                <div className="p-6 flex justify-between items-center">
                                    <div className="flex-1 pr-4">
                                        <h4 className="font-bold">{atHouseService.name}</h4>
                                        <p className="text-xs text-gray-500">{atHouseService.description}</p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <p className="text-sm font-bold text-primary shrink-0">+${Number(atHouseService.price).toFixed(2)}/mo</p>
                                        <ToggleSwitch
                                            checked={isAtHouseActive}
                                            onChange={onAtHouseToggle}
                                            disabled={totalBaseServiceCans === 0 || isUpdating(atHouseService.id)}
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
                                            +${(Number(linerService.price) * totalBaseServiceCans).toFixed(2)}/mo
                                        </p>
                                        <ToggleSwitch
                                            checked={isLinerActive}
                                            onChange={onLinerToggle}
                                            disabled={totalBaseServiceCans === 0 || isUpdating(linerService.id)}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {upgradeServices.length > 0 && (
                    <div className="border-t border-base-200">
                        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider px-6 pt-6">Other Available Services</h2>
                        <div className="divide-y divide-base-200">
                            {upgradeServices.map(service => {
                                const quantity = getQuantity(service.id);
                                return (
                                    <div key={service.id} className="p-6 flex justify-between items-center">
                                        <div>
                                            <h4 className="font-bold">{service.name}</h4>
                                            <p className="text-xs text-gray-500">{service.description}</p>
                                            <p className="text-sm font-bold text-primary mt-1">${Number(service.price).toFixed(2)}/mo</p>
                                        </div>
                                        <QuantitySelector
                                            quantity={quantity}
                                            onIncrement={() => onIncrement(service)}
                                            onDecrement={() => onDecrement(service)}
                                            isUpdating={isUpdating(service.id)}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {(showPricingSummary || footerAction) && (
                    <div className="p-6 border-t border-base-200 bg-gray-50/50">
                        {showPricingSummary && (
                            <div className="space-y-3">
                                {setupTotal != null && setupTotal > 0 && (
                                    <div className="flex justify-between items-center">
                                        <p className="text-sm font-medium text-gray-500">One-Time Setup Fees</p>
                                        <p className="text-sm font-semibold text-gray-500">${setupTotal.toFixed(2)}</p>
                                    </div>
                                )}
                                <div className="flex justify-between items-baseline">
                                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Total Monthly Bill</h3>
                                    <p className="text-4xl font-black text-primary">${monthlyTotal.toFixed(2)}</p>
                                </div>
                            </div>
                        )}
                        {footerAction && <div className={showPricingSummary ? "mt-4" : ""}>{footerAction}</div>}
                    </div>
                )}
            </Card>
        </div>
    );
};

export default ServiceSelector;
