
import React, { useState, useEffect } from 'react';
import { getReferralInfo } from '../services/mockApiService.ts';
import { ReferralInfo, Referral } from '../types.ts';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import { GiftIcon, CurrencyDollarIcon, ClipboardDocumentIcon, CheckCircleIcon, ClockIcon } from './Icons.tsx';

const ReferralsHub: React.FC = () => {
    const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState<'code' | 'link' | null>(null);

    useEffect(() => {
        getReferralInfo().then(data => {
            setReferralInfo(data);
            setLoading(false);
        });
    }, []);

    const handleCopy = (text: string, type: 'code' | 'link') => {
        navigator.clipboard.writeText(text);
        setCopied(type);
        setTimeout(() => setCopied(null), 2000);
    };

    if (loading || !referralInfo) {
        return (
            <div className="flex justify-center items-center h-96">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary/20 border-t-primary"></div>
            </div>
        );
    }
    
    const statusConfig = {
        completed: { icon: <CheckCircleIcon className="w-4 h-4 text-green-500" />, text: 'Completed', color: 'text-green-800', bg: 'bg-green-100' },
        pending: { icon: <ClockIcon className="w-4 h-4 text-orange-500" />, text: 'Pending', color: 'text-orange-800', bg: 'bg-orange-100' },
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-base-200 pb-8">
                <div>
                    <h1 className="text-4xl font-black text-gray-900 tracking-tight">Referrals & Rewards</h1>
                    <p className="text-gray-500 font-medium mt-1 text-lg">Share with your neighbors and earn credits toward your bill.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
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
                                    <div className={`px-3 py-1 ${statusConfig[ref.status].bg} ${statusConfig[ref.status].color} rounded-full flex items-center gap-2`}>
                                        {statusConfig[ref.status].icon}
                                        <span className="text-[10px] font-black uppercase tracking-widest">{statusConfig[ref.status].text}</span>
                                    </div>
                                </div>
                            )) : (
                                <p className="text-center text-sm text-gray-500 py-8">You haven't referred anyone yet. Share your code to start earning!</p>
                            )}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default ReferralsHub;
