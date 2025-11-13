import React, { useState } from 'react';
import { View } from '../types';
import { ChartPieIcon, WrenchScrewdriverIcon, ListBulletIcon, BanknotesIcon, ChatBubbleLeftRightIcon, Bars3Icon, XMarkIcon, TruckIcon, CreditCardIcon, BellIcon, CalendarDaysIcon, PauseCircleIcon, ExclamationTriangleIcon, BuildingOffice2Icon, UserIcon } from './Icons';

interface SidebarProps {
  currentView: View;
  setCurrentView: (view: View) => void;
}

// FIX: Explicitly type navItems to ensure item.view is of type 'View'
const navItems: { view: View; label: string; icon: React.ReactNode }[] = [
  { view: 'dashboard', label: 'Dashboard', icon: <ChartPieIcon className="w-6 h-6" /> },
  { view: 'services', label: 'All Services', icon: <WrenchScrewdriverIcon className="w-6 h-6" /> },
  { view: 'subscriptions', label: 'My Subscriptions', icon: <ListBulletIcon className="w-6 h-6" /> },
  { view: 'property-settings', label: 'Property Settings', icon: <BuildingOffice2Icon className="w-6 h-6" /> },
  { view: 'notifications', label: 'Notifications', icon: <BellIcon className="w-6 h-6" /> },
  { view: 'special-pickup', label: 'Special Pickups', icon: <CalendarDaysIcon className="w-6 h-6" /> },
  { view: 'vacation-holds', label: 'Vacation Holds', icon: <PauseCircleIcon className="w-6 h-6" /> },
  { view: 'missed-pickup', label: 'Report Missed Pickup', icon: <ExclamationTriangleIcon className="w-6 h-6" /> },
  { view: 'support', label: 'Support', icon: <ChatBubbleLeftRightIcon className="w-6 h-6" /> },
];

const NavLink: React.FC<{
  item: typeof navItems[0];
  isActive: boolean;
  onClick: () => void;
}> = ({ item, isActive, onClick }) => (
  <li>
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={`flex items-center p-3 rounded-lg transition-colors duration-200 ${
        isActive
          ? 'bg-primary text-primary-content shadow-md'
          : 'text-neutral hover:bg-base-200 hover:text-primary'
      }`}
    >
      {item.icon}
      <span className="ml-4 font-medium">{item.label}</span>
    </a>
  </li>
);

const Sidebar: React.FC<SidebarProps> = ({ currentView, setCurrentView }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleLinkClick = (view: View) => {
    setCurrentView(view);
    setIsOpen(false);
  };

  const SidebarContent = () => (
     <div className="flex flex-col h-full bg-base-200 lg:bg-base-100 lg:border-r lg:border-base-300">
      <div className="flex items-center justify-center h-20 border-b border-base-300 px-2">
        <TruckIcon className="w-8 h-8 text-primary flex-shrink-0" />
        <h1 className="text-xl font-bold ml-2 text-neutral text-center">Waste Management</h1>
      </div>
      <nav className="flex-1 p-4 space-y-2">
        <ul>
          {navItems.map((item) => (
            <NavLink
              key={item.view}
              item={item}
              isActive={currentView === item.view}
              onClick={() => handleLinkClick(item.view)}
            />
          ))}
        </ul>
      </nav>
      <div className="p-4 border-t border-base-300">
        <div className="text-center text-xs text-gray-500">
            &copy; {new Date().getFullYear()} Waste Management
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Menu Button */}
      <button onClick={() => setIsOpen(!isOpen)} className="lg:hidden absolute top-4 left-4 z-30 p-2 rounded-md bg-white/50 backdrop-blur-sm">
        <Bars3Icon className="w-6 h-6 text-neutral" />
      </button>

      {/* Mobile Sidebar */}
      <div className={`fixed inset-0 z-40 transform transition-transform duration-300 ease-in-out lg:hidden ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="absolute inset-0 bg-black/30" onClick={() => setIsOpen(false)}></div>
        <div className="relative w-72 h-full">
            <SidebarContent />
            <button onClick={() => setIsOpen(false)} className="absolute top-4 right-[-40px] z-50 p-2 text-white">
                 <XMarkIcon className="w-6 h-6" />
            </button>
        </div>
      </div>
      
      {/* Desktop Sidebar */}
      <div className="hidden lg:block lg:w-72 lg:flex-shrink-0">
        <SidebarContent />
      </div>
    </>
  );
};

export default Sidebar;