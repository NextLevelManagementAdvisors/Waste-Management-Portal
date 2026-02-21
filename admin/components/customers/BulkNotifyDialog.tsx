import React, { useState } from 'react';
import { Card } from '../../../components/Card.tsx';
import { Button } from '../../../components/Button.tsx';

const BulkNotifyDialog: React.FC<{
  isOpen: boolean;
  selectedCount: number;
  onClose: () => void;
  onSend: (channel: string, message: string) => void;
  isSending: boolean;
}> = ({ isOpen, selectedCount, onClose, onSend, isSending }) => {
  const [channel, setChannel] = useState('email');
  const [message, setMessage] = useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <Card className="relative w-full max-w-md p-6 shadow-lg">
        <h2 className="text-lg font-black text-gray-900 mb-1">Send Notification</h2>
        <p className="text-sm text-gray-500 mb-4">Send to {selectedCount} selected customer{selectedCount !== 1 ? 's' : ''}</p>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Channel</label>
            <select
              value={channel}
              onChange={e => setChannel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="both">Email + SMS</option>
            </select>
          </div>
          {channel !== 'email' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-700">SMS will only be sent to customers who have a phone number on file.</p>
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Message</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={4}
              placeholder="Enter notification message..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none"
            />
            {channel !== 'email' && (
              <p className="text-xs text-gray-400 mt-1">{message.length}/160 characters (SMS best practice)</p>
            )}
          </div>
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={isSending} className="flex-1">
              Cancel
            </Button>
            <Button size="sm" disabled={isSending || !message.trim()} onClick={() => onSend(channel, message)} className="flex-1">
              {isSending ? 'Sending...' : 'Send'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default BulkNotifyDialog;
