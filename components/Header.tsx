import React from 'react';
import { View } from '../types';
import { UserCircleIcon, TruckIcon, ArrowRightOnRectangleIcon } from './Icons';
import { useProperty } from '../App';

interface HeaderProps {
  currentView: View;
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
};

const Header: React.FC<HeaderProps> = ({ currentView, onAddPropertyClick, onLogout }) => {
  const { user, properties, selectedProperty, setSelectedPropertyId, loading } = useProperty();
  const title = viewTitles[currentView] || 'Dashboard';

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
            <div className="hidden sm:flex items-center space-x-4">
                <div className="text-right">
                    <p className="font-semibold text-neutral">{user?.firstName} {user?.lastName}</p>
                    <p className="text-sm text-gray-500">Customer</p>
                </div>
              <UserCircleIcon className="w-12 h-12 text-gray-300" />
               <button onClick={onLogout} title="Logout" className="p-2 rounded-full hover:bg-base-200 transition-colors">
                 <ArrowRightOnRectangleIcon className="w-6 h-6 text-gray-500" />
               </button>
            </div>
        </div>
      </div>
    </header>
  );
};

export default Header;