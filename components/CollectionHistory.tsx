import React, { useState, useEffect } from 'react';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import Modal from './Modal.tsx';
import { useProperty } from '../PropertyContext.tsx';
import { getCollectionHistory, leaveDriverTip, leaveDriverNote, reportMissedPickup, CollectionHistoryLogWithFeedback } from '../services/apiService.ts';
import { CheckCircleIcon, ExclamationTriangleIcon, SparklesIcon, CurrencyDollarIcon, PencilSquareIcon, UserCircleIcon, TruckIcon } from './Icons.tsx';

const CollectionHistory: React.FC = () => {
    const { selectedProperty, postNavAction, setPostNavAction } = useProperty();
    const [history, setHistory] = useState<CollectionHistoryLogWithFeedback[]>([]);
    const [loading, setLoading] = useState(true);

    const [isTipModalOpen, setIsTipModalOpen] = useState(false);
    const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
    const [selectedLog, setSelectedLog] = useState<CollectionHistoryLogWithFeedback | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [customTipAmount, setCustomTipAmount] = useState('');
    const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const showNotification = (type: 'success' | 'error', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 4000);
    };

    // State for missed pickup reporting
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
    const [reportNotes, setReportNotes] = useState('');
    const [isSubmittingReport, setIsSubmittingReport] = useState(false);
    const [reportSubmitted, setReportSubmitted] = useState(false);


    const fetchData = async () => {
        if (!selectedProperty) return;
        setLoading(true);
        try {
            const historyData = await getCollectionHistory(selectedProperty.id);
            setHistory(historyData);
        } catch (error) {
            console.error("Failed to fetch collection history:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [selectedProperty]);

    useEffect(() => {
      if (postNavAction && postNavAction.action === 'openTipModal' && !loading && history.length > 0) {
        const logToTip = history.find(h => h.date === postNavAction.targetDate);
        if (logToTip) {
          openTipModal(logToTip);
        }
        // Clear the action so it doesn't re-trigger
        setPostNavAction(null);
      }
    }, [postNavAction, loading, history, setPostNavAction]);

    const openTipModal = (log: CollectionHistoryLogWithFeedback) => {
        setSelectedLog(log);
        setCustomTipAmount('');
        setIsTipModalOpen(true);
    };

    const openNoteModal = (log: CollectionHistoryLogWithFeedback) => {
        setSelectedLog(log);
        setIsNoteModalOpen(true);
    };

    const handleLeaveTip = async (amount: number) => {
        if (!selectedProperty || !selectedLog) return;
        setIsSubmitting(true);
        try {
            await leaveDriverTip(selectedProperty.id, amount, selectedLog.date);
            setIsTipModalOpen(false);
            fetchData(); // Refresh to update feedback status
        } catch (e) {
            console.error("Failed to leave tip", e);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleLeaveNote = async (note: string) => {
        if (!selectedProperty || !selectedLog) return;
        setIsSubmitting(true);
        try {
            await leaveDriverNote(selectedProperty.id, note, selectedLog.date);
            setIsNoteModalOpen(false);
            fetchData(); // Refresh to update feedback status
        } catch (e) {
            console.error("Failed to leave note", e);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleOpenReportModal = () => {
        setReportSubmitted(false);
        setReportNotes('');
        setReportDate(new Date().toISOString().split('T')[0]);
        setIsReportModalOpen(true);
    };

    const handleReportSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProperty) return;
        
        setIsSubmittingReport(true);
        try {
            await reportMissedPickup(selectedProperty.id, reportDate, reportNotes);
            setReportSubmitted(true);
        } catch (error) {
            console.error("Failed to report missed pickup:", error);
            showNotification('error', "Report failed. Please try again.");
        } finally {
            setIsSubmittingReport(false);
        }
    };

    if (loading) {
        return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div></div>;
    }

    if (history.length === 0) {
        return (
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                    <h2 className="text-xl font-black text-gray-900 tracking-tight">Full Collection History</h2>
                    <Button variant="secondary" className="rounded-xl" onClick={handleOpenReportModal}>
                        <ExclamationTriangleIcon className="w-4 h-4 mr-2 text-red-500"/>
                        Report a Missed Pickup
                    </Button>
                </div>
                <Card className="text-center py-16">
                    <TruckIcon className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                    <h3 className="text-sm font-bold text-gray-900">No Collections Yet</h3>
                    <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">Your pickup history will appear here after your first scheduled collection.</p>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
             <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <h2 className="text-xl font-black text-gray-900 tracking-tight">Full Collection History</h2>
                <Button variant="secondary" className="rounded-xl" onClick={handleOpenReportModal}>
                    <ExclamationTriangleIcon className="w-4 h-4 mr-2 text-red-500"/>
                    Report a Missed Pickup
                </Button>
            </div>
             <Card className="border-none ring-1 ring-base-200 p-0 overflow-hidden shadow-xl">
                <div className="divide-y divide-base-100">
                    {history.map((log) => (
                        <div key={log.date} className="p-5 flex flex-col sm:flex-row justify-between sm:items-center gap-4 hover:bg-gray-50/50 transition-colors">
                            <div className="flex-1">
                                <p className="text-sm font-bold text-gray-900">{log.event}</p>
                                <p className="text-[10px] text-gray-400 font-black uppercase mt-1">{new Date(log.date + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}</p>
                            </div>
                            <div className="flex items-center gap-6 w-full sm:w-auto">
                                {log.status === 'completed' && (
                                    <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
                                        <UserCircleIcon className="w-5 h-5 text-gray-400" />
                                        Driver: {log.driver}
                                    </div>
                                )}
                                {log.status === 'completed' ? (
                                    log.feedbackSubmitted ? (
                                        <div className="flex items-center gap-2 text-xs font-bold text-primary">
                                            <CheckCircleIcon className="w-5 h-5" />
                                            Feedback Sent
                                        </div>
                                    ) : (
                                        <div className="flex gap-2">
                                            <Button size="sm" variant="ghost" className="text-xs" onClick={() => openTipModal(log)}><CurrencyDollarIcon className="w-4 h-4 mr-1"/> Tip</Button>
                                            <Button size="sm" variant="ghost" className="text-xs" onClick={() => openNoteModal(log)}><PencilSquareIcon className="w-4 h-4 mr-1"/> Note</Button>
                                        </div>
                                    )
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-blue-600">Notice</span>
                                        <ExclamationTriangleIcon className="w-5 h-5 text-blue-500" />
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </Card>

            {/* Tip Modal */}
            <Modal isOpen={isTipModalOpen} onClose={() => setIsTipModalOpen(false)} title={`Tip Driver ${selectedLog?.driver}`}>
                <div className="text-center space-y-6">
                    <p className="text-gray-600">A small gesture goes a long way. 100% of your tip goes directly to the driver for the collection on {selectedLog?.date}.</p>
                    <div className="grid grid-cols-3 gap-3">
                        {[2, 5, 10].map(amount => (
                            <Button key={amount} onClick={() => handleLeaveTip(amount)} variant="secondary" className="h-16 text-xl font-black" disabled={isSubmitting}>
                                ${amount}
                            </Button>
                        ))}
                    </div>
                     <p className="text-xs text-gray-400 font-bold uppercase">Or enter a custom amount</p>
                    <input type="number" min="1" step="1" value={customTipAmount} onChange={e => setCustomTipAmount(e.target.value)} className="w-full text-center bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-black text-3xl text-gray-900 focus:outline-none focus:border-primary transition-colors" placeholder="$ 0.00" />
                    <Button onClick={() => {
                        if (customTipAmount) handleLeaveTip(parseFloat(customTipAmount));
                    }} className="w-full h-14 rounded-xl uppercase tracking-widest font-black" disabled={isSubmitting || !customTipAmount}>
                        {isSubmitting ? 'Sending...' : 'Send Tip'}
                    </Button>
                </div>
            </Modal>
            
            {/* Note Modal */}
            <Modal isOpen={isNoteModalOpen} onClose={() => setIsNoteModalOpen(false)} title={`Leave Note for ${selectedLog?.driver}`}>
                <form onSubmit={(e) => { e.preventDefault(); handleLeaveNote(e.currentTarget.note.value); }}>
                     <div className="space-y-6">
                        <p className="text-gray-600">Your feedback is valuable. Let us know how we did on {selectedLog?.date}.</p>
                        <textarea name="note" rows={4} className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-colors resize-none" placeholder="e.g., Thank you for always being so careful with the cans!" required />
                        <div className="flex justify-end gap-3">
                            <Button type="button" variant="secondary" onClick={() => setIsNoteModalOpen(false)} disabled={isSubmitting}>Cancel</Button>
                            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Sending...' : 'Send Note'}</Button>
                        </div>
                    </div>
                </form>
            </Modal>
            
            {/* Report Missed Pickup Modal */}
            <Modal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} title={reportSubmitted ? "Report Received" : "Report Missed Pickup"}>
                {reportSubmitted ? (
                    <div className="text-center py-4">
                        <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-neutral">We're on it!</h3>
                        <p className="text-gray-600 mt-2">Our dispatch team has been notified. We will review the route history for <span className="font-semibold">{reportDate}</span> and schedule a recovery collection if verified.</p>
                        <Button onClick={() => setIsReportModalOpen(false)} className="mt-6">Close</Button>
                    </div>
                ) : (
                    <form onSubmit={handleReportSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="pickupDate" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Missed Collection Date</label>
                            <input 
                                type="date"
                                id="pickupDate"
                                value={reportDate}
                                onChange={e => setReportDate(e.target.value)}
                                max={new Date().toISOString().split('T')[0]}
                                className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all"
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="notes" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Details (Optional)</label>
                            <textarea
                                id="notes"
                                rows={3}
                                value={reportNotes}
                                onChange={e => setReportNotes(e.target.value)}
                                placeholder="e.g., Cans were at the curb by 6:00 AM..."
                                className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all resize-none"
                            />
                        </div>
                        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                            <ExclamationTriangleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-red-700 font-medium">Fraudulent reports (e.g., cans not out on time) may result in a $15.00 recovery dispatch fee.</p>
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                            <Button type="button" variant="secondary" onClick={() => setIsReportModalOpen(false)} disabled={isSubmittingReport}>Cancel</Button>
                            <Button type="submit" disabled={isSubmittingReport} className="bg-red-600 hover:bg-red-700 focus:ring-red-500">
                                {isSubmittingReport ? 'Submitting...' : 'Submit Report'}
                            </Button>
                        </div>
                    </form>
                )}
            </Modal>

            {notification && (
                <div className={`fixed bottom-5 right-5 z-50 p-4 rounded-lg shadow-lg text-white text-sm font-bold max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-300 ${
                    notification.type === 'error' ? 'bg-red-600' : 'bg-primary'
                }`}>
                    {notification.message}
                </div>
            )}
        </div>
    );
};

export default CollectionHistory;