
import React from 'react';
import { Card } from './Card.tsx';
import { CheckCircleIcon, ExclamationTriangleIcon } from './Icons.tsx';

const CollectionHistory: React.FC = () => {
    // Mock data for now, as it was in the original component
    const historyLogs = [
        { date: 'July 18, 2025', event: 'Waste Collected', status: 'success' },
        { date: 'July 11, 2025', event: 'Waste Collected', status: 'success' },
        { date: 'July 04, 2025', event: 'Holiday Skip (Independence Day)', status: 'info' },
        { date: 'June 27, 2025', event: 'Waste Collected', status: 'success' },
        { date: 'June 20, 2025', event: 'Waste & Recycling Collected', status: 'success' },
        { date: 'June 13, 2025', event: 'Waste Collected', status: 'success' },
        { date: 'June 06, 2025', event: 'Waste Collected', status: 'success' },
        { date: 'May 30, 2025', event: 'Waste Collected', status: 'success' },
        { date: 'May 23, 2025', event: 'Holiday Skip (Memorial Day)', status: 'info' },
    ];

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <h2 className="text-xl font-black text-gray-900 tracking-tight">Full Collection History</h2>
             <Card className="border-none ring-1 ring-base-200 p-0 overflow-hidden shadow-xl">
                <div className="divide-y divide-base-100">
                    {historyLogs.map((log, i) => (
                        <div key={i} className="p-5 flex justify-between items-center hover:bg-gray-50/50 transition-colors">
                            <div>
                                <p className="text-sm font-bold text-gray-900">{log.event}</p>
                                <p className="text-[10px] text-gray-400 font-black uppercase mt-1">{log.date}</p>
                            </div>
                            {log.status === 'success' ? (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-green-600">Success</span>
                                    <CheckCircleIcon className="w-5 h-5 text-green-500" />
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-blue-600">Notice</span>
                                    <ExclamationTriangleIcon className="w-5 h-5 text-blue-500" />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
};

export default CollectionHistory;
