import React, { useState } from 'react';
import { Button } from './Button.tsx';

interface ForgotPasswordProps {
    switchToLogin: () => void;
}

const ForgotPassword: React.FC<ForgotPasswordProps> = ({ switchToLogin }) => {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Request failed');
            setSubmitted(true);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    if (submitted) {
        return (
            <div>
                <h2 className="text-2xl font-bold text-center text-neutral mb-2">Check Your Email</h2>
                <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
                        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                    </div>
                </div>
                <p className="text-center text-gray-600 mb-6">
                    If an account exists for <strong>{email}</strong>, we've sent a password reset link. Please check your inbox and spam folder.
                </p>
                <p className="text-center text-sm text-gray-500 mb-4">
                    The link will expire in 1 hour.
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

    return (
        <div>
            <h2 className="text-2xl font-bold text-center text-neutral mb-2">Forgot Password?</h2>
            <p className="text-center text-gray-500 mb-6">Enter your email address and we'll send you a link to reset your password.</p>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="reset-email" className="block text-sm font-medium text-gray-700">Email Address</label>
                    <input
                        type="email"
                        id="reset-email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
                        required
                        autoComplete="email"
                        placeholder="you@example.com"
                    />
                </div>
                {error && <p className="text-sm text-red-600 text-center">{error}</p>}
                <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Sending...' : 'Send Reset Link'}
                </Button>
            </form>
            <p className="mt-6 text-center text-sm text-gray-600">
                Remember your password?{' '}
                <button onClick={switchToLogin} className="font-medium text-primary hover:text-primary-focus">
                    Sign In
                </button>
            </p>
        </div>
    );
};

export default ForgotPassword;
