import React from 'react';
import { ShieldCheckIcon } from '../../components/Icons.tsx';
import { Card } from '../../components/Card.tsx';

interface AdminAuthLayoutProps {
  children: React.ReactNode;
  error?: string | null;
}

const AdminAuthLayout: React.FC<AdminAuthLayoutProps> = ({ children, error }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 bg-indigo-600 rounded-xl">
              <ShieldCheckIcon className="w-6 h-6 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-black text-gray-900">Admin Portal</h1>
          <p className="text-gray-500 mt-2">Waste Management Operations</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700 font-medium">{error}</p>
          </div>
        )}

        {/* Card Content */}
        <Card className="bg-white shadow-lg">
          {children}
        </Card>

        {/* Footer Links */}
        <div className="text-center text-sm text-gray-500 mt-6">
          <p>
            Customer portal:{' '}
            <a href="/" className="text-indigo-600 font-medium hover:underline">
              Go to main site
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminAuthLayout;
