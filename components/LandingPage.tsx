import React from 'react';
import { HomeIcon, BuildingOffice2Icon, TruckIcon } from './Icons.tsx';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';

interface PortalInfo {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  signInText: string;
  signUpText: string;
  href: string;
  signUpHref: string;
}

const portals: PortalInfo[] = [
  {
    id: 'client',
    name: 'Client Portal',
    description: 'Manage your waste management services, subscriptions, and payments',
    icon: <HomeIcon className="w-16 h-16 text-primary mb-4" />,
    signInText: 'Sign In',
    signUpText: 'Create Account',
    href: '/login',
    signUpHref: '/register',
  },
  {
    id: 'admin',
    name: 'Admin Portal',
    description: 'Manage customers, billing, operations, and system settings',
    icon: <BuildingOffice2Icon className="w-16 h-16 text-primary mb-4" />,
    signInText: 'Sign In',
    signUpText: 'Request Access',
    href: '/admin',
    signUpHref: '/admin',
  },
  {
    id: 'team',
    name: 'Team Portal',
    description: 'Find jobs, manage your schedule, and track your performance',
    icon: <TruckIcon className="w-16 h-16 text-primary mb-4" />,
    signInText: 'Sign In',
    signUpText: 'Create Account',
    href: '/team',
    signUpHref: '/team',
  },
];

const LandingPage: React.FC = () => {
  const handlePortalClick = (href: string) => {
    window.location.href = href;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-base-200 to-base-100 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col items-center">
          <img src="/logo.svg" alt="Rural Waste Management" className="h-12 mb-3" />
          <p className="text-center text-gray-500 font-medium mt-2">
            Choose your portal to continue
          </p>
        </div>
      </div>

      {/* Portal Cards */}
      <div className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {portals.map((portal) => (
            <Card key={portal.id} className="flex flex-col h-full hover:shadow-lg transition-shadow duration-300 cursor-pointer">
              {/* Icon */}
              <div className="flex justify-center">
                {portal.icon}
              </div>

              {/* Content */}
              <div className="flex-1 text-center mb-6">
                <h2 className="text-2xl font-black text-gray-900 tracking-tight mb-3">
                  {portal.name}
                </h2>
                <p className="text-gray-600 text-sm leading-relaxed">
                  {portal.description}
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-3">
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={() => handlePortalClick(portal.href)}
                >
                  {portal.signInText}
                </Button>
                <button
                  className="text-sm text-primary hover:text-primary-focus font-bold transition-colors"
                  onClick={() => handlePortalClick(portal.signUpHref)}
                >
                  {portal.signUpText} →
                </button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-base-200 py-6 text-center text-sm text-gray-500">
        <p>© {new Date().getFullYear()} Rural Waste Management. All rights reserved.</p>
        <p className="mt-2">
          <a href="/privacy.html" className="text-gray-400 hover:text-gray-600 transition-colors">Privacy Policy</a>
          <span className="mx-2">·</span>
          <a href="/terms.html" className="text-gray-400 hover:text-gray-600 transition-colors">Terms of Service</a>
        </p>
      </div>
    </div>
  );
};

export default LandingPage;
