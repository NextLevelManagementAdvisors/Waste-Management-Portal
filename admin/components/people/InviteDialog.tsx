import React, { useState } from 'react';
import { Button } from '../../../components/Button.tsx';

interface InviteDialogProps {
  onClose: () => void;
  onInvited: () => void;
}

const InviteDialog: React.FC<InviteDialogProps> = ({ onClose, onInvited }) => {
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<string[]>(['customer']);
  const [adminRole, setAdminRole] = useState('full_admin');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const toggleRole = (role: string) => {
    setRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || roles.length === 0) return;

    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/admin/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: email.trim(),
          roles,
          adminRole: roles.includes('admin') ? adminRole : undefined,
        }),
      });

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => onInvited(), 1500);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to send invitation');
      }
    } catch {
      setError('Failed to send invitation');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <h2 className="text-lg font-black text-gray-900 mb-4">Invite Contact</h2>

        {success ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <p className="font-bold text-gray-900">Invitation Sent!</p>
            <p className="text-sm text-gray-500 mt-1">An email has been sent to {email}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="person@example.com"
                required
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-2">Roles</label>
              <div className="flex gap-3">
                {(['customer', 'driver', 'admin'] as const).map(role => (
                  <label key={role} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={roles.includes(role)}
                      onChange={() => toggleRole(role)}
                      className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                    />
                    <span className="text-sm font-medium text-gray-700 capitalize">{role}</span>
                  </label>
                ))}
              </div>
            </div>

            {roles.includes('admin') && (
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Admin Level</label>
                <select
                  value={adminRole}
                  onChange={e => setAdminRole(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                >
                  <option value="full_admin">Full Admin</option>
                  <option value="support">Support</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={onClose} disabled={sending}>
                Cancel
              </Button>
              <Button type="submit" disabled={sending || !email.trim() || roles.length === 0}>
                {sending ? 'Sending...' : 'Send Invitation'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default InviteDialog;
