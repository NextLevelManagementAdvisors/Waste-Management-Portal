import React from 'react';
import { View } from '../types.ts';
import { Bars3Icon, UserCircleIcon } from './Icons.tsx';
import { useProperty } from '../PropertyContext.tsx';

interface HeaderProps {
  currentView: View;
  setCurrentView: (view: View) => void;
  onAddPropertyClick: () => void;
  onToggleSidebar: () => void;
}

const viewTitles: Record<View, string> = {
    home: 'Overview',
    myservice: 'Manage Plan',
    billing: 'Billing',
    requests: 'Requests',
    help: 'Help',
    'profile-settings': 'Profile Settings',
    referrals: 'Referrals',
};

const Header: React.FC<HeaderProps> = ({ currentView, setCurrentView, onAddPropertyClick, onToggleSidebar }) => {
  const { properties, selectedProperty, setSelectedPropertyId, loading } = useProperty();
  const title = viewTitles[currentView] || 'Overview';

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
      <div className="flex items-center justify-between px-4 h-16 sm:h-20 gap-2">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <button
                onClick={onToggleSidebar}
                className="lg:hidden text-gray-500 hover:text-gray-900 flex-shrink-0"
                aria-label="Open menu"
            >
                <Bars3Icon className="w-6 h-6" />
            </button>
            <h2 className="text-base sm:text-2xl font-black text-gray-900 tracking-tight truncate">{title}</h2>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
             {loading ? (
                <div className="w-32 sm:w-48 h-8 bg-gray-200 rounded animate-pulse"></div>
            ) : (
                <div className="relative">
                    <select
                        value={currentVal}
                        onChange={handlePropertyChange}
                        className="appearance-none w-full bg-base-200 border border-base-300 text-gray-900 py-2 sm:py-2.5 pl-3 sm:pl-4 pr-8 sm:pr-10 rounded-xl leading-tight focus:outline-none focus:bg-white focus:border-primary font-bold text-xs sm:text-sm transition-all cursor-pointer hover:border-primary max-w-[140px] sm:max-w-[220px]"
                        aria-label="Select property context"
                        disabled={properties.length === 0}
                    >
                        {properties.length > 1 && (
                            <option value="all">All Properties</option>
                        )}
                        {properties.length > 0 ? (
                            properties.map(p => (
                                <option key={p.id} value={p.id}>{p.address}</option>
                            ))
                        ) : (
                            <option value="">No properties found</option>
                        )}
                        <option value="add_new" className="font-bold text-primary">
                            + Add New Address...
                        </option>
                    </select>
                     <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 sm:px-3 text-gray-400">
                        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                    </div>
                </div>
            )}
            <button
                type="button"
                onClick={() => setCurrentView('profile-settings')}
                className={`lg:hidden flex-shrink-0 p-2 rounded-xl transition-colors ${
                    currentView === 'profile-settings'
                        ? 'bg-primary text-white'
                        : 'text-gray-400 hover:text-primary hover:bg-gray-100'
                }`}
                aria-label="Profile settings"
            >
                <UserCircleIcon className="w-7 h-7" />
            </button>
        </div>
      </div>
    </header>
  );
};

export default Header;