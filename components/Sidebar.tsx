import React from 'react';
import { View } from '../types.ts';
import { useProperty } from '../PropertyContext.tsx';
import { VIEW_TO_PATH } from '../constants.ts';
import {
  HomeIcon, SparklesIcon, TruckIcon, BanknotesIcon,
  GiftIcon, UserIcon, ArrowRightOnRectangleIcon, ClipboardDocumentIcon
} from './Icons.tsx';

interface SidebarProps {
  currentView: View;
  setCurrentView: (view: View) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onLogout: () => void;
}

interface NavItem {
  id: View;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { id: 'home', label: 'Overview', icon: <HomeIcon className="w-5 h-5" /> },
  { id: 'myservice', label: 'Manage Plan', icon: <TruckIcon className="w-5 h-5" /> },
  { id: 'billing', label: 'Billing', icon: <BanknotesIcon className="w-5 h-5" /> },
  { id: 'requests', label: 'Requests', icon: <ClipboardDocumentIcon className="w-5 h-5" /> },
  { id: 'referrals', label: 'Referrals', icon: <GiftIcon className="w-5 h-5" /> },
  { id: 'help', label: 'Help', icon: <SparklesIcon className="w-5 h-5" /> },
];

const NavLink: React.FC<{
  item: NavItem;
  isActive: boolean;
  onClick: () => void;
}> = ({ item, isActive, onClick }) => (
  <li>
    <a
      href={VIEW_TO_PATH[item.id] || '/'}
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={`flex items-center px-4 py-3.5 rounded-2xl transition-all duration-300 group ${
        isActive
          ? 'bg-primary text-white shadow-xl shadow-teal-900/20 font-black scale-[1.02]'
          : 'text-gray-500 hover:bg-gray-100 hover:text-primary font-bold'
      }`}
    >
      <span className={`${isActive ? 'text-white' : 'text-gray-400 group-hover:text-primary'}`}>
        {item.icon}
      </span>
      <span className="ml-3 text-[14px] tracking-tight">{item.label}</span>
      {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white" />}
    </a>
  </li>
);

const SidebarContent: React.FC<{ currentView: View, onLinkClick: (view: View) => void, onLogout: () => void }> = ({ currentView, onLinkClick, onLogout }) => {
    const { user, properties } = useProperty();
    const hasProperties = properties.length > 0;

    const baseItems = hasProperties
      ? navItems
      : navItems.filter(item => !['myservice', 'billing'].includes(item.id));
    const visibleNavItems = baseItems;

    return (
        <div className="flex flex-col h-full bg-white lg:border-r lg:border-base-200">
         <div className="flex items-center px-8 h-24">
           <img src="/logo.svg" alt="Rural Waste Management" className="h-10" />
         </div>
         
         <div className="flex-1 overflow-y-auto py-8 px-5">
           <nav>
             <ul className="space-y-2">
               {visibleNavItems.map((item) => (
                 <NavLink
                   key={item.id}
                   item={item}
                   isActive={currentView === item.id}
                   onClick={() => onLinkClick(item.id)}
                 />
               ))}
             </ul>
           </nav>
         </div>

        <div className="p-5 border-t border-base-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-black text-white flex-shrink-0">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-gray-400 truncate">{user?.email}</p>
            </div>
          </div>
          <div className="space-y-1">
            <a
              href="/settings"
              onClick={(e) => { e.preventDefault(); onLinkClick('profile-settings'); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-gray-500 hover:text-primary hover:bg-gray-100 transition-colors"
            >
              <UserIcon className="w-4 h-4" />
              Profile Settings
            </a>
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <ArrowRightOnRectangleIcon className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
       </div>
    );
};

const Sidebar: React.FC<SidebarProps> = ({ currentView, setCurrentView, isOpen, setIsOpen, onLogout }) => {
  const handleLinkClick = (view: View) => {
    setCurrentView(view);
    setIsOpen(false);
  };

  return (
    <>
      <div className={`fixed inset-0 z-40 transform transition-transform duration-500 ease-out lg:hidden ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" onClick={() => setIsOpen(false)}></div>
        <div className="relative w-80 h-full shadow-2xl">
            <SidebarContent currentView={currentView} onLinkClick={handleLinkClick} onLogout={onLogout} />
        </div>
      </div>
      
      <div className="hidden lg:block lg:w-80 lg:flex-shrink-0">
        <SidebarContent currentView={currentView} onLinkClick={handleLinkClick} onLogout={onLogout} />
      </div>
    </>
  );
};

export default Sidebar;