
import React, { useState, useEffect, useRef } from 'react';
import { View } from '../types.ts';
import { UserCircleIcon, ArrowRightOnRectangleIcon, UserIcon } from './Icons.tsx';
import { useProperty } from '../PropertyContext.tsx';

interface HeaderProps {
  currentView: View;
  setCurrentView: (view: View) => void;
  onAddPropertyClick: () => void;
  onLogout: () => void;
}

const viewTitles: Record<View, string> = {
    home: 'Overview',
    myservice: 'My Service',
    wallet: 'Digital Wallet',
    requests: 'Requests',
    help: 'Help',
    'profile-settings': 'Profile Settings',
    referrals: 'Referrals'
};

const Header: React.FC<HeaderProps> = ({ currentView, setCurrentView, onAddPropertyClick, onLogout }) => {
  const { user, properties, selectedProperty, setSelectedPropertyId, loading } = useProperty();
  const title = viewTitles[currentView] || 'Overview';
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

  const currentVal = selectedProperty 
    ? selectedProperty.id 
    : (properties.length > 1 ? 'all' : (properties[0]?.id || ''));

  return (
    <header className="flex-shrink-0 bg-white border-b border-base-300 z-20 sticky top-0">
      <div className="flex items-center justify-between p-4 h-20">
        <div className="flex items-center">
            <h2 className="text-2xl font-black text-gray-900 tracking-tight pl-12 lg:pl-0">{title}</h2>
        </div>
        <div className="flex items-center space-x-4">
            {loading ? (
                <div className="w-48 h-8 bg-gray-200 rounded animate-pulse"></div>
            ) : (
                <div className="relative min-w-[220px]">
                    <select
                        value={currentVal}
                        onChange={handlePropertyChange}
                        className="appearance-none w-full bg-base-200 border border-base-300 text-gray-900 py-2.5 pl-4 pr-10 rounded-xl leading-tight focus:outline-none focus:bg-white focus:border-primary font-bold text-sm transition-all cursor-pointer hover:border-primary"
                        aria-label="Select property context"
                        disabled={properties.length === 0}
                    >
                        {properties.length > 1 && (
                            <option value="all">📂 All Properties</option>
                        )}
                        {properties.length > 0 ? (
                            properties.map(p => (
                                <option key={p.id} value={p.id}>🏠 {p.address}</option>
                            ))
                        ) : (
                            <option value="">No properties found</option>
                        )}
                        <option value="add_new" className="font-bold text-primary">
                            + Add New Address...
                        </option>
                    </select>
                     <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-400">
                        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                    </div>
                </div>
            )}
            <div className="w-px h-10 bg-base-300 hidden sm:block"></div>
            <div className="relative hidden sm:block" ref={dropdownRef}>
                <button onClick={() => setIsDropdownOpen(prev => !prev)} className="flex items-center space-x-2 p-2 rounded-lg hover:bg-base-200 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary">
                    <UserCircleIcon className="w-10 h-10 text-gray-400" />
                    <div className="text-right">
                        <p className="font-bold text-gray-900 text-sm">{user?.firstName} {user?.lastName}</p>
                        <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest">Customer</p>
                    </div>
                </button>

                {isDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-56 origin-top-right bg-white rounded-xl shadow-2xl ring-1 ring-black ring-opacity-5 focus:outline-none z-30">
                        <div className="py-1">
                            <div className="px-4 py-3 border-b border-base-200 bg-gray-50 rounded-t-xl">
                                <p className="text-sm font-bold text-gray-900 truncate">{user?.firstName} {user?.lastName}</p>
                                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                            </div>
                            <a href="#" onClick={(e) => { e.preventDefault(); handleNavigation('profile-settings'); }} className="flex items-center w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors font-medium">
                                <UserIcon className="w-5 h-5 mr-3 text-gray-400" /> Profile Settings
                            </a>
                            <div className="border-t border-base-200 my-1"></div>
                            <button onClick={onLogout} className="w-full text-left flex items-center px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors font-bold">
                                 <ArrowRightOnRectangleIcon className="w-5 h-5 mr-3 text-red-400" /> Logout
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