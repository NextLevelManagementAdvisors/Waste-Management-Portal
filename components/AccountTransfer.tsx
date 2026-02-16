
import React, { useState } from 'react';
import { useProperty } from '../PropertyContext.tsx';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import { transferPropertyOwnership } from '../services/mockApiService.ts';
import { ArrowPathRoundedSquareIcon, CheckCircleIcon, PaperAirplaneIcon, ClockIcon } from './Icons.tsx';

const AccountTransfer: React.FC = () => {
    const { selectedProperty, refreshUser, sendTransferReminder } = useProperty();
    
    const [transferData, setTransferData] = useState({ firstName: '', lastName: '', email: '' });
    const [transferConfirmation, setTransferConfirmation] = useState('');
    const [isTransferring, setIsTransferring] = useState(false);
    const [transferSuccess, setTransferSuccess] = useState(false);
    const [reminderSent, setReminderSent] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string} | null>(null);

    const showNotification = (type: 'success' | 'error', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 3000);
    };

    const handleTransferChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setTransferData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleInitiateTransfer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProperty || transferConfirmation.toUpperCase() !== 'TRANSFER') return;
        setIsTransferring(true);
        try {
            await transferPropertyOwnership(selectedProperty.id, transferData);
            await refreshUser();
            setTransferSuccess(true);
        } catch (error) {
            showNotification('error', 'Account transfer failed. Please try again.');
        } finally {
            setIsTransferring(false);
        }
    };

    const handleCancelTransfer = async () => {
        if (!selectedProperty) return;
        setIsCancelling(true);
        try {
            const res = await fetch('/api/account-transfer/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ propertyId: selectedProperty.id }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error);
            await refreshUser();
            showNotification('success', 'Transfer cancelled successfully.');
        } catch (e: any) {
            showNotification('error', e.message || 'Could not cancel transfer.');
        } finally {
            setIsCancelling(false);
        }
    };

    const handleSendReminder = async () => {
        if (!selectedProperty) return;
        try {
            await sendTransferReminder(selectedProperty.id);
            setReminderSent(true);
            setTimeout(() => setReminderSent(false), 3000);
        } catch(e) {
            showNotification('error', 'Could not send reminder.');
        }
    };

    if (!selectedProperty) return null;

    const isTransferPending = selectedProperty.transferStatus === 'pending';
    
    return (
        <Card className="border-none ring-1 ring-base-200 shadow-xl">
            <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-3 mb-4">
                <ArrowPathRoundedSquareIcon className="w-6 h-6 text-primary" />
                Account Transfer
            </h2>
            { isTransferPending ? (
                <div className="text-center py-8">
                    <ClockIcon className="w-12 h-12 text-orange-500 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-neutral">Transfer in Progress</h3>
                    <p className="text-gray-600 mt-2">
                        An invitation to take over the service at <span className="font-semibold">{selectedProperty.address}</span> has been sent to <span className="font-semibold">{selectedProperty.pendingOwner?.email}</span>.
                    </p>
                    <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                        <Button onClick={handleSendReminder} disabled={reminderSent} className="rounded-xl px-8 font-black uppercase tracking-widest text-xs h-14">
                            {reminderSent ? <><CheckCircleIcon className="w-5 h-5 mr-2" /> Reminder Sent!</> : <><PaperAirplaneIcon className="w-5 h-5 mr-2" /> Send Reminder</>}
                        </Button>
                        <Button onClick={handleCancelTransfer} disabled={isCancelling} className="bg-red-500 hover:bg-red-600 focus:ring-red-500 rounded-xl px-8 font-black uppercase tracking-widest text-xs h-14">
                            {isCancelling ? 'Cancelling...' : 'Cancel Transfer'}
                        </Button>
                    </div>
                </div>
            ) : transferSuccess ? (
                <div className="text-center py-8">
                    <CheckCircleIcon className="w-12 h-12 text-green-500 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-neutral">Transfer Initiated</h3>
                    <p className="text-gray-600 mt-2">An invitation to take over the service at <span className="font-semibold">{selectedProperty.address}</span> has been sent to <span className="font-semibold">{transferData.email}</span>.</p>
                </div>
            ) : (
                <form onSubmit={handleInitiateTransfer} className="space-y-4">
                    <p className="text-sm text-gray-600">Enter the new resident's information below to send them an invitation to take over the account for this property.</p>
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">New Resident First Name</label>
                            <input type="text" name="firstName" value={transferData.firstName} onChange={handleTransferChange} className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required />
                        </div>
                            <div className="flex-1">
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">New Resident Last Name</label>
                            <input type="text" name="lastName" value={transferData.lastName} onChange={handleTransferChange} className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required />
                        </div>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">New Resident Email</label>
                        <input type="email" name="email" value={transferData.email} onChange={handleTransferChange} className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required />
                    </div>

                    <div className="!mt-6 pt-6 border-t border-base-200">
                            <label className="block text-sm font-medium text-gray-700">Confirm Transfer</label>
                            <p className="text-xs text-gray-500 mb-2">You can cancel this transfer before the new resident accepts. To confirm, please type "TRANSFER" in the box below.</p>
                            <input type="text" value={transferConfirmation} onChange={(e) => setTransferConfirmation(e.target.value.toUpperCase())} className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all uppercase tracking-widest" placeholder="TRANSFER" />
                    </div>
                    
                    <div className="flex justify-end pt-2">
                        <Button type="submit" disabled={isTransferring || transferConfirmation.toUpperCase() !== 'TRANSFER'} className="bg-orange-500 hover:bg-orange-600 focus:ring-orange-500 rounded-xl px-8 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-orange-500/20">
                            {isTransferring ? 'Processing...' : 'Initiate Transfer'}
                        </Button>
                    </div>
                </form>
            )}
            {notification && (
                <div className={`fixed bottom-5 right-5 p-4 rounded-lg shadow-lg text-white ${notification.type === 'success' ? 'bg-primary' : 'bg-red-600'}`}>
                    {notification.message}
                </div>
            )}
        </Card>
    );
};

export default AccountTransfer;
