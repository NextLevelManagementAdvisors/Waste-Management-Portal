
import React, { useState } from 'react';
import { useProperty } from '../PropertyContext.tsx';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import Modal from './Modal.tsx';
import { ExclamationTriangleIcon } from './Icons.tsx';

const DangerZone: React.FC = () => {
    const { selectedProperty, cancelPropertyServices, refreshUser } = useProperty();
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [cancelConfirmation, setCancelConfirmation] = useState('');
    const [isCanceling, setIsCanceling] = useState(false);
    
    if (!selectedProperty) return null;

    const isTransferPending = selectedProperty.transferStatus === 'pending';

    const handleConfirmCancellation = async () => {
        if (!selectedProperty || cancelConfirmation.toUpperCase() !== 'CANCEL') return;
        setIsCanceling(true);
        try {
            await cancelPropertyServices(selectedProperty.id);
            await refreshUser();
            setIsCancelModalOpen(false);
        } catch(error) {
            alert("Failed to cancel services. Please try again.");
        } finally {
            setIsCanceling(false);
            setCancelConfirmation('');
        }
    };
    
    return (
        <>
            <Card className={`border-2 shadow-lg ${isTransferPending ? 'border-gray-300 bg-gray-50' : 'border-red-500 bg-red-50/50'}`}>
                <h3 className={`text-xl font-black tracking-tight ${isTransferPending ? 'text-gray-500' : 'text-red-800'}`}>Danger Zone</h3>
                <p className={`text-sm mt-1 font-medium ${isTransferPending ? 'text-gray-500' : 'text-red-700'}`}>
                    {isTransferPending ? 'Actions are disabled while an account transfer is in progress.' : 'These actions are permanent and cannot be undone.'}
                </p>
                <div className={`mt-6 border-t-2 pt-6 ${isTransferPending ? 'border-gray-200' : 'border-red-200'}`}>
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center">
                        <div>
                            <h4 className={`font-bold ${isTransferPending ? 'text-gray-400' : 'text-gray-900'}`}>Cancel Service</h4>
                            <p className={`text-sm mt-1 ${isTransferPending ? 'text-gray-400' : 'text-gray-600'}`}>Terminate all subscriptions for this location.</p>
                        </div>
                        <Button 
                            onClick={() => setIsCancelModalOpen(true)} 
                            className="bg-red-600 hover:bg-red-700 text-white mt-4 sm:mt-0 rounded-xl px-6 font-black uppercase text-xs tracking-widest"
                            disabled={isTransferPending}
                        >
                            Cancel All Services
                        </Button>
                    </div>
                </div>
            </Card>

            <Modal
                isOpen={isCancelModalOpen}
                onClose={() => setIsCancelModalOpen(false)}
                title="Confirm Service Cancellation"
            >
                <div className="space-y-4">
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                        <ExclamationTriangleIcon className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
                        <div>
                            <h4 className="font-bold text-red-800">This action is irreversible.</h4>
                            <p className="text-sm text-red-700 mt-1">All services for <span className="font-semibold">{selectedProperty?.address}</span> will be terminated at the end of the current billing cycle.</p>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-600 mb-2">To confirm, please type "CANCEL" below:</label>
                        <input
                            type="text"
                            value={cancelConfirmation}
                            onChange={(e) => setCancelConfirmation(e.target.value.toUpperCase())}
                            className="w-full border-2 border-gray-300 rounded-md p-2 text-center font-bold tracking-widest focus:border-red-500 focus:ring-red-500 uppercase"
                            placeholder="CANCEL"
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="secondary" onClick={() => setIsCancelModalOpen(false)} disabled={isCanceling}>Go Back</Button>
                        <Button
                            onClick={handleConfirmCancellation}
                            disabled={isCanceling || cancelConfirmation.toUpperCase() !== 'CANCEL'}
                            className="bg-red-600 hover:bg-red-700 text-white focus:ring-red-500"
                        >
                            {isCanceling ? 'Processing...' : 'Yes, Terminate Service'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </>
    );
};
export default DangerZone;
