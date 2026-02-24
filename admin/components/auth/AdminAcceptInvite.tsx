import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../../../components/Button.tsx';
import AdminAuthLayout from './AdminAuthLayout.tsx';

interface AdminUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isAdmin: boolean;
}

interface InviteData {
  email: string | null;
  name: string | null;
  phone: string | null;
  roles: string[];
  adminRole: string | null;
}

interface AdminAcceptInviteProps {
  token: string;
  onComplete: (user: AdminUser) => void;
}

const ROLE_LABELS: Record<string, string> = {
  full_admin: 'Full Admin',
  support: 'Support',
  viewer: 'Viewer',
};

const AdminAcceptInvite: React.FC<AdminAcceptInviteProps> = ({ token, onComplete }) => {
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState<'register' | 'login'>('register');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/invitations/${token}`)
      .then(async r => {
        if (r.status === 404) throw new Error('Invitation not found.');
        if (r.status === 410) {
          const d = await r.json();
          throw new Error(d.error || 'Invitation is no longer valid.');
        }
        if (!r.ok) throw new Error('Failed to load invitation.');
        return r.json();
      })
      .then(data => {
        setInvite(data);
        if (data.email) {
          setEmail(data.email);
          setLoginEmail(data.email);
        }
        if (data.name) {
          const parts = data.name.trim().split(/\s+/);
          setFirstName(parts[0] || '');
          setLastName(parts.length >= 2 ? parts.slice(1).join(' ') : '');
        }
        setLoading(false);
      })
      .catch(err => {
        setInviteError(err.message);
        setLoading(false);
      });
  }, [token]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const regRes = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ firstName, lastName, phone, email, password }),
      });
      const regJson = await regRes.json();
      if (!regRes.ok) {
        setError(regJson.error || 'Registration failed');
        setSubmitting(false);
        return;
      }

      // Register endpoint hard-codes isAdmin: false, so fetch /me for real status
      const meRes = await fetch('/api/auth/me', { credentials: 'include' });
      const meJson = await meRes.json();
      if (!meRes.ok || !meJson.data?.isAdmin) {
        setError('Registration succeeded but admin privileges were not applied. Please contact your administrator.');
        setSubmitting(false);
        return;
      }

      onComplete(meJson.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setSubmitting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const loginJson = await loginRes.json();
      if (!loginRes.ok) {
        setError(loginJson.error || 'Login failed');
        setSubmitting(false);
        return;
      }

      // Accept invitation to apply admin roles to existing user
      const acceptRes = await fetch(`/api/invitations/${token}/accept`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!acceptRes.ok) {
        const acceptJson = await acceptRes.json();
        setError(acceptJson.error || 'Failed to accept invitation');
        setSubmitting(false);
        return;
      }

      const meRes = await fetch('/api/auth/me', { credentials: 'include' });
      const meJson = await meRes.json();
      if (!meRes.ok || !meJson.data?.isAdmin) {
        setError('Login succeeded but admin privileges were not detected. Please contact your administrator.');
        setSubmitting(false);
        return;
      }

      onComplete(meJson.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setSubmitting(false);
    }
  };

  const handleGoogleAuth = useCallback(() => {
    const url = '/api/auth/google?popup=1';
    const w = 500, h = 600;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    const popup = window.open(url, 'google-oauth', `width=${w},height=${h},left=${left},top=${top}`);
    if (popup) popup.focus();
  }, []);

  const handleGoogleAuthSuccess = useCallback(async () => {
    setError(null);
    try {
      // Try to accept invitation (may 404 if auto-applied for new users — that's OK)
      await fetch(`/api/invitations/${token}/accept`, {
        method: 'POST',
        credentials: 'include',
      }).catch(() => {});

      const meRes = await fetch('/api/auth/me', { credentials: 'include' });
      const meJson = await meRes.json();
      if (!meRes.ok || !meJson.data?.isAdmin) {
        setError('Google sign-in succeeded but admin privileges were not applied. Please contact your administrator.');
        return;
      }
      onComplete(meJson.data);
    } catch {
      setError('Google sign-in failed. Please try again.');
    }
  }, [token, onComplete]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'google-oauth-success') handleGoogleAuthSuccess();
    };
    const storageHandler = (e: StorageEvent) => {
      if (e.key === 'google-oauth-success' && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          if (Date.now() - data.timestamp < 5000) {
            handleGoogleAuthSuccess();
            localStorage.removeItem('google-oauth-success');
          }
        } catch {}
      }
    };
    window.addEventListener('message', handler);
    window.addEventListener('storage', storageHandler);
    return () => {
      window.removeEventListener('message', handler);
      window.removeEventListener('storage', storageHandler);
    };
  }, [handleGoogleAuthSuccess]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  if (inviteError) {
    return (
      <AdminAuthLayout error={inviteError}>
        <div className="text-center py-4">
          <p className="text-gray-500 mb-4">This invitation link is no longer valid.</p>
          <a href="/admin" className="text-indigo-600 font-bold hover:underline">
            Go to Admin Portal
          </a>
        </div>
      </AdminAuthLayout>
    );
  }

  const roleLabel = invite?.adminRole ? (ROLE_LABELS[invite.adminRole] || invite.adminRole) : 'Administrator';

  const googleButton = (
    <button
      type="button"
      onClick={handleGoogleAuth}
      disabled={submitting}
      className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-300 rounded-lg shadow-sm bg-white hover:bg-gray-50 transition-colors font-bold text-gray-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      {mode === 'register' ? 'Sign up with Google' : 'Sign in with Google'}
    </button>
  );

  const divider = (
    <div className="relative my-5">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-gray-200"></div>
      </div>
      <div className="relative flex justify-center text-sm">
        <span className="px-2 bg-white text-gray-500">Or {mode === 'register' ? 'sign up' : 'sign in'} with email</span>
      </div>
    </div>
  );

  return (
    <AdminAuthLayout error={error}>
      <div className="space-y-5">
        {/* Role badge */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-full mb-3">
            <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
            <span className="text-xs font-bold text-indigo-700">{roleLabel}</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">
            {mode === 'register' ? 'Create Your Admin Account' : 'Sign In to Accept'}
          </h2>
          <p className="text-sm text-gray-500">
            You've been invited to join as <strong>{roleLabel}</strong>
          </p>
        </div>

        {googleButton}
        {divider}

        {mode === 'register' ? (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-1">
                <label htmlFor="firstName" className="block text-sm font-bold text-gray-700 mb-1">First Name</label>
                <input
                  type="text" id="firstName" value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors disabled:opacity-50"
                  required disabled={submitting}
                />
              </div>
              <div className="flex-1">
                <label htmlFor="lastName" className="block text-sm font-bold text-gray-700 mb-1">Last Name</label>
                <input
                  type="text" id="lastName" value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors disabled:opacity-50"
                  required disabled={submitting}
                />
              </div>
            </div>
            <div>
              <label htmlFor="regEmail" className="block text-sm font-bold text-gray-700 mb-1">Email Address</label>
              <input
                type="email" id="regEmail" value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors disabled:opacity-50"
                required disabled={submitting}
              />
            </div>
            <div>
              <label htmlFor="regPhone" className="block text-sm font-bold text-gray-700 mb-1">Phone Number</label>
              <input
                type="tel" id="regPhone" value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors disabled:opacity-50"
                disabled={submitting}
              />
            </div>
            <div>
              <label htmlFor="regPassword" className="block text-sm font-bold text-gray-700 mb-1">Password</label>
              <input
                type="password" id="regPassword" value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors disabled:opacity-50"
                placeholder="Minimum 12 characters"
                required minLength={12} disabled={submitting}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Creating Account...' : 'Create Account'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="loginEmail" className="block text-sm font-bold text-gray-700 mb-1">Email Address</label>
              <input
                type="email" id="loginEmail" value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors disabled:opacity-50"
                required disabled={submitting} autoComplete="email"
              />
            </div>
            <div>
              <label htmlFor="loginPassword" className="block text-sm font-bold text-gray-700 mb-1">Password</label>
              <input
                type="password" id="loginPassword" value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors disabled:opacity-50"
                placeholder="Enter your password"
                required disabled={submitting} autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Signing In...' : 'Sign In & Accept Invitation'}
            </Button>
          </form>
        )}

        <div className="border-t border-gray-200 pt-4">
          <p className="text-center text-sm text-gray-500">
            {mode === 'register' ? (
              <>Already have an account?{' '}
                <button onClick={() => { setMode('login'); setError(null); }} className="font-bold text-indigo-600 hover:underline">Sign in</button>
              </>
            ) : (
              <>Don't have an account?{' '}
                <button onClick={() => { setMode('register'); setError(null); }} className="font-bold text-indigo-600 hover:underline">Create one</button>
              </>
            )}
          </p>
        </div>
      </div>
    </AdminAuthLayout>
  );
};

export default AdminAcceptInvite;
