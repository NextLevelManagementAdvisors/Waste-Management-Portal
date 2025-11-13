import React, { useState, useEffect, useRef } from 'react';
import { View } from '../types';
import { UserCircleIcon, ArrowRightOnRectangleIcon, UserIcon, BellIcon, BanknotesIcon, CreditCardIcon } from './Icons';
import { useProperty } from '../App';

interface HeaderProps {
  currentView: View;
  setCurrentView: (view: View) => void;
  onAddPropertyClick: () => void;
  onLogout: () => void;
}

const viewTitles: Record<View, string> = {
    dashboard: 'Dashboard',
    services: 'All Services',
    subscriptions: 'My Subscriptions',
    'special-pickup': 'Special Pickups',
    'vacation-holds': 'Vacation Holds',
    billing: 'Billing',
    payment: 'Payment Methods',
    notifications: 'Notifications',
    'missed-pickup': 'Report Missed Pickup',
    support: 'Support',
    'property-settings': 'Property Settings',
    'profile-settings': 'Profile Settings',
};

const Header: React.FC<HeaderProps> = ({ currentView, setCurrentView, onAddPropertyClick, onLogout }) => {
  const { user, properties, selectedProperty, setSelectedPropertyId, loading } = useProperty();
  const title = viewTitles[currentView] || 'Dashboard';
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  const handleNavigation = (view: View) => {
    setCurrentView(view);
    setIsDropdownOpen(false);
  };

  const handlePropertyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      if (e.target.value === 'add_new') {
          onAddPropertyClick();
      } else {
          setSelectedPropertyId(e.target.value);
      }
  };

  return (
    <header className="flex-shrink-0 bg-white border-b border-base-300">
      <div className="flex items-center justify-between p-4 h-20">
        <div className="flex items-center">
            <h2 className="text-2xl font-bold text-neutral capitalize pl-12 lg:pl-0">{title}</h2>
        </div>
        <div className="flex items-center space-x-4">
            {loading ? (
                <div className="w-48 h-8 bg-gray-200 rounded animate-pulse"></div>
            ) : (
                <div className="relative">
                    <select
                        value={selectedProperty?.id || ''}
                        onChange={handlePropertyChange}
                        className="appearance-none w-full bg-base-200 border border-base-300 text-neutral py-2 pl-4 pr-8 rounded-lg leading-tight focus:outline-none focus:bg-white focus:border-primary"
                        aria-label="Select a property"
                        disabled={properties.length === 0}
                    >
                        {properties.length > 0 ? (
                            properties.map(p => (
                                <option key={p.id} value={p.id}>{p.address}</option>
                            ))
                        ) : (
                            <option>No properties found</option>
                        )}
                        <option value="add_new" className="font-bold text-primary">
                            + Add New Property...
                        </option>
                    </select>
                     <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                    </div>
                </div>
            )}
            <div className="w-px h-10 bg-base-300 hidden sm:block"></div>
            <div className="relative hidden sm:block" ref={dropdownRef}>
                <button onClick={() => setIsDropdownOpen(prev => !prev)} className="flex items-center space-x-2 p-2 rounded-lg hover:bg-base-200 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary">
                    <UserCircleIcon className="w-10 h-10 text-gray-400" />
                    <div className="text-right">
                        <p className="font-semibold text-neutral">{user?.firstName} {user?.lastName}</p>
                        <p className="text-sm text-gray-500">Customer</p>
                    </div>
                </button>

                {isDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-56 origin-top-right bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-10">
                        <div className="py-1">
                            <div className="px-4 py-3 border-b border-base-200">
                                <p className="text-sm font-semibold text-neutral truncate">{user?.firstName} {user?.lastName}</p>
                                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                            </div>
                            <a href="#" onClick={(e) => { e.preventDefault(); handleNavigation('profile-settings'); }} className="flex items-center w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors">
                                <UserIcon className="w-5 h-5 mr-3 text-gray-500" /> Profile Settings
                            </a>
                             <a href="#" onClick={(e) => { e.preventDefault(); handleNavigation('billing'); }} className="flex items-center w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors">
                                <BanknotesIcon className="w-5 h-5 mr-3 text-gray-500" /> Billing
                            </a>
                             <a href="#" onClick={(e) => { e.preventDefault(); handleNavigation('payment'); }} className="flex items-center w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors">
                                <CreditCardIcon className="w-5 h-5 mr-3 text-gray-500" /> Payment Methods
                            </a>
                            <div className="border-t border-base-200 my-1"></div>
                            <button onClick={onLogout} className="w-full text-left flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors">
                                 <ArrowRightOnRectangleIcon className="w-5 h-5 mr-3 text-gray-500" /> Logout
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
      </div>
    </header>
  );
};

export default Header;