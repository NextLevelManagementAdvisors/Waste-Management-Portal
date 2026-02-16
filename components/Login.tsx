
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
