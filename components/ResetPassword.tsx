import React, { useState, useEffect } from 'react';
import { Button } from './Button.tsx';

interface ResetPasswordProps {
    token: string;
    switchToLogin: () => void;
}

const ResetPassword: React.FC<ResetPasswordProps> = ({ token, switchToLogin }) => {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [verifying, setVerifying] = useState(true);
    const [tokenValid, setTokenValid] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch(`/api/auth/verify-reset-token?token=${encodeURIComponent(token)}`)
            .then(res => res.text())
            .then(text => {
                try { const json = JSON.parse(text); setTokenValid(json.valid === true); } catch { setTokenValid(false); }
                setVerifying(false);
            })
            .catch(() => {
                setTokenValid(false);
                setVerifying(false);
            });
    }, [token]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setIsLoading(true);
        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, newPassword }),
            });
            const text = await res.text();
            let json;
            try { json = JSON.parse(text); } catch { throw new Error(`Server error (${res.status})`); }
            if (!res.ok) throw new Error(json.error || 'Reset failed');
            setSuccess(true);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    if (verifying) {
        return (
            <div className="text-center">
                <div className="loading loading-spinner loading-lg text-primary mb-4"></div>
                <p className="text-gray-500">Verifying your reset link...</p>
            </div>
        );
    }

    if (!tokenValid) {
        return (
            <div>
                <h2 className="text-2xl font-bold text-center text-neutral mb-2">Invalid Reset Link</h2>
                <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
                        <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </div>
                </div>
                <p className="text-center text-gray-600 mb-6">
                    This password reset link is invalid or has expired. Please request a new one.
                </p>
                <button
                    onClick={switchToLogin}
                    className="w-full text-center font-medium text-primary hover:text-primary-focus"
                >
                    Back to Sign In
                </button>
            </div>
        );
    }

    if (success) {
        return (
            <div>
                <h2 className="text-2xl font-bold text-center text-neutral mb-2">Password Reset!</h2>
                <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
                        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                </div>
                <p className="text-center text-gray-600 mb-6">
                    Your password has been successfully reset. You can now sign in with your new password.
                </p>
                <Button onClick={switchToLogin} className="w-full">
                    Sign In
                </Button>
            </div>
        );
    }

    return (
        <div>
            <h2 className="text-2xl font-bold text-center text-neutral mb-2">Set New Password</h2>
            <p className="text-center text-gray-500 mb-6">Enter your new password below.</p>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="new-password" className="block text-sm font-medium text-gray-700">New Password</label>
                    <input
                        type="password"
                        id="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
                        required
                        minLength={6}
                        autoComplete="new-password"
                        placeholder="At least 6 characters"
                    />
                </div>
                <div>
                    <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700">Confirm Password</label>
                    <input
                        type="password"
                        id="confirm-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
                        required
                        minLength={6}
                        autoComplete="new-password"
                        placeholder="Re-enter your password"
                    />
                </div>
                {error && <p className="text-sm text-red-600 text-center">{error}</p>}
                <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Resetting...' : 'Reset Password'}
                </Button>
            </form>
        </div>
    );
};

export default ResetPassword;
