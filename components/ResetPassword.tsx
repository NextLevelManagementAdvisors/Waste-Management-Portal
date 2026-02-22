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
        const verifyToken = async () => {
            try {
                const res = await fetch(`/api/auth/verify-reset-token?token=${encodeURIComponent(token)}`);
                const data = await res.json();
                setTokenValid(res.ok && data.valid === true);
            } catch {
                setTokenValid(false);
            } finally {
                setVerifying(false);
            }
        };
        verifyToken();
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
            if (!res.ok) {
                let message = 'Reset failed';
                try {
                    const json = await res.json();
                    message = json.error || `Server error (${res.status})`;
                } catch (e) {
                    // Response body is not JSON or is empty
                }
                throw new Error(message);
            }
            setSuccess(true);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    if (verifying) {
        return (
            <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-gray-500 font-medium">Verifying your reset link...</p>
            </div>
        );
    }

    if (!tokenValid) {
        return (
            <div>
                <h2 className="text-3xl font-black text-center text-gray-900 tracking-tight mb-2">Invalid Reset Link</h2>
                <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
                        <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </div>
                </div>
                <p className="text-center text-gray-600 font-medium mb-6">
                    This password reset link is invalid or has expired. Please request a new one.
                </p>
                <button
                    onClick={switchToLogin}
                    className="w-full text-center font-black text-primary hover:text-primary-focus transition-colors"
                >
                    Back to Sign In
                </button>
            </div>
        );
    }

    if (success) {
        return (
            <div>
                <h2 className="text-3xl font-black text-center text-gray-900 tracking-tight mb-2">Password Reset!</h2>
                <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
                        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                </div>
                <p className="text-center text-gray-600 font-medium mb-6">
                    Your password has been successfully reset. You can now sign in with your new password.
                </p>
                <Button onClick={switchToLogin} className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20">
                    Sign In
                </Button>
            </div>
        );
    }

    return (
        <div>
            <h2 className="text-3xl font-black text-center text-gray-900 tracking-tight mb-2">Set New Password</h2>
            <p className="text-center text-gray-500 font-medium mb-6">Enter your new password below.</p>
            <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                    <label htmlFor="new-password" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">New Password</label>
                    <input
                        type="password"
                        id="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3.5 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all"
                        required
                        minLength={6}
                        autoComplete="new-password"
                        placeholder="At least 6 characters"
                    />
                </div>
                <div>
                    <label htmlFor="confirm-password" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Confirm Password</label>
                    <input
                        type="password"
                        id="confirm-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3.5 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all"
                        required
                        minLength={6}
                        autoComplete="new-password"
                        placeholder="Re-enter your password"
                    />
                </div>
                {error && <p className="text-sm font-bold text-red-600 text-center">{error}</p>}
                <Button type="submit" className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20" disabled={isLoading}>
                    {isLoading ? 'Resetting...' : 'Reset Password'}
                </Button>
            </form>
        </div>
    );
};

export default ResetPassword;
