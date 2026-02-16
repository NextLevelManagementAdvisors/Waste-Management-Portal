
import React, { useState } from 'react';
import { Button } from './Button.tsx';

interface LoginProps {
    onLogin: (email: string, password: string) => Promise<void>;
    switchToRegister: () => void;
    switchToForgotPassword: () => void;
    error: string | null;
}

const Login: React.FC<LoginProps> = ({ onLogin, switchToRegister, switchToForgotPassword, error }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        await onLogin(email, password);
        setIsLoading(false);
    };

    return (
        <div>
            <h2 className="text-2xl font-bold text-center text-neutral mb-2">Welcome Back!</h2>
            <p className="text-center text-gray-500 mb-6">Sign in to your account</p>
            <div className="mb-6">
                <a
                    href="/api/auth/google"
                    className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-300 rounded-md shadow-sm bg-white hover:bg-gray-50 transition-colors font-medium text-gray-700"
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Sign in with Google
                </a>
            </div>
            <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500">Or sign in with email</span>
                </div>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email Address</label>
                    <input
                        type="email"
                        id="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
                        required
                        autoComplete="email"
                    />
                </div>
                <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
                    <input
                        type="password"
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
                        required
                        autoComplete="current-password"
                    />
                </div>
                <div className="flex justify-end">
                    <button type="button" onClick={switchToForgotPassword} className="text-sm font-medium text-primary hover:text-primary-focus">
                        Forgot password?
                    </button>
                </div>
                {error && <p className="text-sm text-red-600 text-center">{error}</p>}
                <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Signing In...' : 'Sign In'}
                </Button>
            </form>
            <p className="mt-6 text-center text-sm text-gray-600">
                Don't have an account?{' '}
                <button onClick={switchToRegister} className="font-medium text-primary hover:text-primary-focus">
                    Sign Up
                </button>
            </p>
        </div>
    );
};

export default Login;
