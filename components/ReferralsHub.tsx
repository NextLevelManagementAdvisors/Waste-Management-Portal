import React, { useState, useEffect } from 'react';
import { getReferralInfo, redeemCredits } from '../services/apiService.ts';
import { ReferralInfo, Redemption } from '../types.ts';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import { GiftIcon, CurrencyDollarIcon, ClipboardDocumentIcon, CheckCircleIcon, ClockIcon } from './Icons.tsx';
import Modal from './Modal.tsx';

const ReferralsHub: React.FC = () => {
    const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState<'code' | 'link' | null>(null);
    const [isRedeemModalOpen, setIsRedeemModalOpen] = useState(false);
    const [redeemAmount, setRedeemAmount] = useState('');
    const [redeemError, setRedeemError] = useState('');
    const [redeemSuccess, setRedeemSuccess] = useState('');
    const [loadError, setLoadError] = useState('');

    const fetchReferralInfo = () => {
        setLoadError('');
        getReferralInfo().then(data => {
            setReferralInfo(data);
        }).catch(() => {
            setLoadError('Failed to load referral information. Please try again later.');
        }).finally(() => {
            setLoading(false);
        });
    };

    useEffect(() => {
        fetchReferralInfo();
    }, []);

    const handleCopy = (text: string, type: 'code' | 'link') => {
        navigator.clipboard.writeText(text);
        setCopied(type);
        setTimeout(() => setCopied(null), 2000);
    };

    const handleRedeem = async (e: React.FormEvent) => {
        e.preventDefault();
        setRedeemError('');
        setRedeemSuccess('');
        const amount = parseFloat(redeemAmount);
        if (isNaN(amount) || amount <= 0) {
            setRedeemError('Please enter a valid amount.');
            return;
        }
        if (referralInfo && amount > referralInfo.totalRewards) {
            setRedeemError('You cannot redeem more than your available balance.');
            return;
        }

        try {
            await redeemCredits(amount, 'stripe');
            setRedeemSuccess(`Successfully redeemed $${amount.toFixed(2)}.`);
            setIsRedeemModalOpen(false);
            fetchReferralInfo();
        } catch (error: any) {
            setRedeemError(error?.message || 'An error occurred while redeeming credits.');
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-96">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary/20 border-t-primary"></div>
            </div>
        );
    }

    if (loadError || !referralInfo) {
        return (
            <div className="flex flex-col justify-center items-center h-96 text-gray-500">
                <p>{loadError || 'Unable to load referral information.'}</p>
                <button onClick={fetchReferralInfo} className="mt-4 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">
                    Try Again
                </button>
            </div>
        );
    }
    
    const statusConfig = {
        completed: { icon: <CheckCircleIcon className="w-4 h-4 text-green-500" />, text: 'Completed', color: 'text-green-800', bg: 'bg-green-100' },
        pending: { icon: <ClockIcon className="w-4 h-4 text-orange-500" />, text: 'Pending', color: 'text-orange-800', bg: 'bg-orange-100' },
        failed: { icon: <ClockIcon className="w-4 h-4 text-red-500" />, text: 'Failed', color: 'text-red-800', bg: 'bg-red-100' },
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-base-200 pb-8">
                <div>
                    <h1 className="text-4xl font-black text-gray-900 tracking-tight">Referrals & Rewards</h1>
                    <p className="text-gray-500 font-medium mt-1 text-lg">Share with your neighbors and earn credits toward your bill.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8">
                <div className="lg:col-span-1 space-y-8">
                    <Card className="bg-primary/5 border-primary/10 text-center">
                        <GiftIcon className="w-12 h-12 text-primary mx-auto mb-4" />
                        <h2 className="text-2xl font-black text-gray-900 tracking-tight">Share & Earn $10</h2>
                        <p className="text-gray-600 font-medium mt-2">
                            Give your neighbor a <span className="font-bold text-primary">$10 credit</span> on their first bill, and you'll get a <span className="font-bold text-primary">$10 credit</span> too!
                        </p>
                    </Card>

                    <Card>
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center text-green-600">
                                <CurrencyDollarIcon className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.1em]">Total Rewards Earned</h3>
                                <p className="text-3xl font-black text-gray-900 leading-none mt-1">${Number(referralInfo.totalRewards).toFixed(2)}</p>
                            </div>
                        </div>
                        <Button onClick={() => setIsRedeemModalOpen(true)} className="w-full">Redeem Credits</Button>
                    </Card>
                </div>

                <div className="lg:col-span-2 space-y-8">
                     <Card>
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Your Unique Referral Code</h3>
                        <div className="flex flex-col sm:flex-row gap-4">
                            <div className="flex-1 text-center font-mono text-xl font-bold bg-gray-50 border-2 border-dashed border-gray-200 text-gray-600 rounded-2xl flex items-center justify-center py-4">
                                {referralInfo.referralCode}
                            </div>
                            <Button
                                onClick={() => handleCopy(referralInfo.referralCode, 'code')}
                                variant="secondary"
                                className="rounded-2xl h-16 font-black uppercase tracking-widest text-xs"
                            >
                                <ClipboardDocumentIcon className="w-5 h-5 mr-2" />
                                {copied === 'code' ? 'Copied!' : 'Copy Code'}
                            </Button>
                        </div>
                        <div className="mt-6">
                            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Shareable Link</label>
                            <div className="flex gap-4">
                                <input 
                                    type="text"
                                    readOnly
                                    value={referralInfo.shareLink}
                                    className="w-full bg-gray-50 border-2 border-base-200 rounded-2xl px-4 py-3 font-mono text-sm text-gray-500"
                                />
                                <Button
                                    onClick={() => handleCopy(referralInfo.shareLink, 'link')}
                                    className="rounded-2xl font-black uppercase tracking-widest text-xs h-auto"
                                >
                                    {copied === 'link' ? 'Copied!' : 'Copy Link'}
                                </Button>
                            </div>
                        </div>
                    </Card>

                    <Card>
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Your Referrals</h3>
                        <div className="space-y-3">
                            {referralInfo.referrals.length > 0 ? referralInfo.referrals.map(ref => (
                                <div key={ref.id} className="p-4 bg-gray-50 rounded-2xl flex justify-between items-center border border-gray-100">
                                    <div>
                                        <p className="font-bold text-gray-900">{ref.name}</p>
                                        <p className="text-xs text-gray-400 font-medium">Referred on: {new Date(ref.date).toLocaleDateString()}</p>
                                    </div>
                                    <div className={`px-3 py-1 ${statusConfig[ref.status]?.bg || 'bg-gray-100'} ${statusConfig[ref.status]?.color || 'text-gray-800'} rounded-full flex items-center gap-2`}>
                                        {statusConfig[ref.status]?.icon}
                                        <span className="text-[10px] font-black uppercase tracking-widest">{ref.status}</span>
                                    </div>
                                </div>
                            )) : (
                                <p className="text-center text-sm text-gray-500 py-8">You haven't referred anyone yet. Share your code to start earning!</p>
                            )}
                        </div>
                    </Card>

                    <Card>
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Redemption History</h3>
                        <div className="space-y-3">
                            {referralInfo.redemptions && referralInfo.redemptions.length > 0 ? referralInfo.redemptions.map((redemption: Redemption) => (
                                <div key={redemption.id} className="p-4 bg-gray-50 rounded-2xl flex justify-between items-center border border-gray-100">
                                    <div>
                                        <p className="font-bold text-gray-900">${Number(redemption.amount).toFixed(2)} redeemed</p>
                                        <p className="text-xs text-gray-400 font-medium">On: {new Date(redemption.created_at).toLocaleDateString()}</p>
                                    </div>
                                    <div className={`px-3 py-1 ${statusConfig[redemption.status]?.bg || 'bg-gray-100'} ${statusConfig[redemption.status]?.color || 'text-gray-800'} rounded-full flex items-center gap-2`}>
                                        {statusConfig[redemption.status]?.icon}
                                        <span className="text-[10px] font-black uppercase tracking-widest">{redemption.status}</span>
                                    </div>
                                </div>
                            )) : (
                                <p className="text-center text-sm text-gray-500 py-8">You haven't redeemed any credits yet.</p>
                            )}
                        </div>
                    </Card>
                </div>
            </div>
            <Modal isOpen={isRedeemModalOpen} onClose={() => setIsRedeemModalOpen(false)} title="Redeem Referral Credits">
                <form onSubmit={handleRedeem} className="p-6">
                    {redeemError && <p className="text-red-500 text-sm mb-4">{redeemError}</p>}
                    {redeemSuccess && <p className="text-green-500 text-sm mb-4">{redeemSuccess}</p>}
                    <div className="mb-4">
                        <label htmlFor="redeemAmount" className="block text-sm font-medium text-gray-700">Amount to Redeem</label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <span className="text-gray-500 sm:text-sm">$</span>
                            </div>
                            <input
                                type="number"
                                name="redeemAmount"
                                id="redeemAmount"
                                className="focus:ring-primary focus:border-primary block w-full pl-7 pr-12 sm:text-sm border-gray-300 rounded-md"
                                placeholder="0.00"
                                value={redeemAmount}
                                onChange={(e) => setRedeemAmount(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <Button type="submit">Redeem</Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default ReferralsHub;
