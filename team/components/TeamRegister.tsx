import React, { useState, useEffect } from 'react';
import { Button } from '../../components/Button';

interface TeamRegisterProps {
  onRegister: (data: {
    full_name: string;
    email: string;
    phone: string;
    password: string;
    registrationType: 'driver' | 'provider';
    companyName?: string;
    inviteToken?: string;
    providerInviteToken?: string;
  }) => Promise<void>;
  switchToLogin: () => void;
  isLoading: boolean;
  googleSsoEnabled?: boolean;
  initialPortalContext?: 'provider' | 'driver';
  initialProviderInviteToken?: string;
}

const TeamRegister: React.FC<TeamRegisterProps> = ({ onRegister, switchToLogin, isLoading, googleSsoEnabled, initialPortalContext, initialProviderInviteToken }) => {
  const [step, setStep] = useState<'pick-type' | 'form'>(() =>
    initialPortalContext ? 'form' : 'pick-type'
  );
  const [registrationType, setRegistrationType] = useState<'driver' | 'provider'>(() =>
    initialPortalContext === 'provider' ? 'provider' : 'driver'
  );
  const [inviteToken, setInviteToken] = useState<string | undefined>(undefined);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('invite');
    if (token) {
      setInviteToken(token);
      setRegistrationType('driver');
      setStep('form');
    }
  }, []);

  const handlePickType = (type: 'driver' | 'provider') => {
    setRegistrationType(type);
    setStep('form');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');

    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    await onRegister({
      full_name: fullName,
      email,
      phone,
      password,
      registrationType,
      companyName: registrationType === 'provider' ? companyName : undefined,
      inviteToken,
      providerInviteToken: initialProviderInviteToken,
    });
  };

  if (step === 'pick-type') {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-1">Create an Account</h2>
          <p className="text-center text-gray-600 text-sm">How will you be using the platform?</p>
        </div>
        {initialProviderInviteToken && (
          <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg">
            <p className="text-xs text-teal-700 font-medium text-center">You were invited to register as a provider partner.</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4">
          <button
            type="button"
            onClick={() => handlePickType('provider')}
            className="flex flex-col items-start gap-2 p-5 border-2 border-gray-200 rounded-xl text-left hover:border-teal-500 hover:bg-teal-50 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-teal-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <p className="font-bold text-gray-900">Register my company</p>
                <p className="text-sm text-gray-500">I own or operate a waste collection business</p>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handlePickType('driver')}
            className="flex flex-col items-start gap-2 p-5 border-2 border-gray-200 rounded-xl text-left hover:border-teal-500 hover:bg-teal-50 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <p className="font-bold text-gray-900">Join a team or drive independently</p>
                <p className="text-sm text-gray-500">I was invited to a team, or I'm an individual driver</p>
              </div>
            </div>
          </button>
        </div>

        <div className="border-t border-gray-200 pt-4">
          <p className="text-center text-sm text-gray-600">
            Already have an account?{' '}
            <button
              type="button"
              onClick={switchToLogin}
              className="text-teal-600 font-bold hover:text-teal-700"
            >
              Sign in here
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          onClick={() => { if (!inviteToken) setStep('pick-type'); }}
          className={`flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3 ${inviteToken ? 'invisible' : ''}`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-1">
          {registrationType === 'provider' ? 'Register Your Company' : 'Create Driver Account'}
        </h2>
        <p className="text-center text-gray-600 text-sm">
          {registrationType === 'provider'
            ? 'Set up your company account to get started'
            : inviteToken
              ? 'Complete your registration to join the team'
              : 'Join our driver network and start earning'}
        </p>
      </div>

      {googleSsoEnabled !== false && (
        <>
          <a
            href={`/api/team/auth/google?intent=${registrationType}`}
            className={`flex items-center justify-center gap-3 w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors ${isLoading ? 'pointer-events-none opacity-50' : ''}`}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
              <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Sign up with Google
          </a>

          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-gray-200" />
            <span className="text-xs text-gray-400">or</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>
        </>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {registrationType === 'provider' && (
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Company Name</label>
            <input
              type="text"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              required
              disabled={isLoading}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Acme Waste Services LLC"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">
            {registrationType === 'provider' ? 'Owner Name' : 'Full Name'}
          </label>
          <input
            type="text"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            required
            disabled={isLoading}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="John Doe"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Email Address</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            disabled={isLoading}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Phone Number</label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            required
            disabled={isLoading}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="(555) 123-4567"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            disabled={isLoading}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="••••••••"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Confirm Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            required
            disabled={isLoading}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="••••••••"
          />
        </div>

        {passwordError && (
          <div className="p-2 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-700 font-medium">{passwordError}</p>
          </div>
        )}

        <Button type="submit" disabled={isLoading} className="w-full">
          {isLoading ? 'Creating account...' : registrationType === 'provider' ? 'Create Company Account' : 'Create Account'}
        </Button>
      </form>

      <div className="border-t border-gray-200 pt-4">
        <p className="text-center text-sm text-gray-600">
          Already have an account?{' '}
          <button
            type="button"
            onClick={switchToLogin}
            disabled={isLoading}
            className="text-teal-600 font-bold hover:text-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Sign in here
          </button>
        </p>
      </div>
    </div>
  );
};

export default TeamRegister;
