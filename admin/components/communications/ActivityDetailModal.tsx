import React from 'react';
import { Card } from '../../../components/Card.tsx';
import { Button } from '../../../components/Button.tsx';

interface LogEntry {
  id: string;
  recipient_name: string | null;
  recipient_contact: string | null;
  recipient_type: string | null;
  channel: string;
  direction: string;
  subject: string | null;
  body: string | null;
  status: string;
  scheduled_for: string | null;
  sent_at: string | null;
  error_message: string | null;
  sent_by_first: string | null;
  sent_by_last: string | null;
  created_at: string;
}

const ActivityDetailModal: React.FC<{
  entry: LogEntry;
  onClose: () => void;
}> = ({ entry, onClose }) => {
  const formatDate = (d: string | null) => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  const statusColor = (s: string) => {
    switch (s) {
      case 'sent': return 'bg-green-100 text-green-700';
      case 'failed': return 'bg-red-100 text-red-700';
      case 'scheduled': return 'bg-blue-100 text-blue-700';
      case 'cancelled': return 'bg-gray-100 text-gray-500';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const channelColor = (ch: string) => {
    switch (ch) {
      case 'email': return 'bg-blue-100 text-blue-700';
      case 'sms': return 'bg-green-100 text-green-700';
      case 'in_app': return 'bg-purple-100 text-purple-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <Card className="relative w-full max-w-lg p-6 shadow-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-black text-gray-900 mb-4">Message Detail</h2>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${channelColor(entry.channel)}`}>{entry.channel}</span>
            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${statusColor(entry.status)}`}>{entry.status}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase">Recipient</p>
              <p className="font-bold text-gray-900">{entry.recipient_name || 'Unknown'}</p>
              <p className="text-gray-500 text-xs">{entry.recipient_contact}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase">Sent By</p>
              <p className="font-bold text-gray-900">{entry.sent_by_first ? `${entry.sent_by_first} ${entry.sent_by_last}` : 'System'}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase">Created</p>
              <p className="text-gray-700">{formatDate(entry.created_at)}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase">{entry.status === 'scheduled' ? 'Scheduled For' : 'Sent At'}</p>
              <p className="text-gray-700">{entry.status === 'scheduled' ? formatDate(entry.scheduled_for) : formatDate(entry.sent_at)}</p>
            </div>
          </div>

          {entry.subject && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase">Subject</p>
              <p className="text-sm font-bold text-gray-900">{entry.subject}</p>
            </div>
          )}

          <div>
            <p className="text-xs font-bold text-gray-400 uppercase mb-1">Message</p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-700 whitespace-pre-wrap">
              {entry.body || '(no content)'}
            </div>
          </div>

          {entry.error_message && (
            <div>
              <p className="text-xs font-bold text-red-500 uppercase mb-1">Error</p>
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                {entry.error_message}
              </div>
            </div>
          )}
        </div>

        <div className="pt-4 mt-4 border-t border-gray-200">
          <Button variant="secondary" onClick={onClose} className="w-full">Close</Button>
        </div>
      </Card>
    </div>
  );
};

export default ActivityDetailModal;
