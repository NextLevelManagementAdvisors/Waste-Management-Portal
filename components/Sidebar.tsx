import React, { useState, useEffect, useRef } from 'react';
import { View } from '../types.ts';
import { useProperty } from '../PropertyContext.tsx';
import { 
  HomeIcon, SparklesIcon, TruckIcon, BanknotesIcon, 
  CalendarDaysIcon, GiftIcon, PlusCircleIcon, UserIcon, CreditCardIcon, ArrowRightOnRectangleIcon, ClipboardDocumentIcon
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
  { id: 'make-payment', label: 'Make a Payment', icon: <CreditCardIcon className="w-5 h-5" /> },
  { id: 'requests', label: 'Requests', icon: <ClipboardDocumentIcon className="w-5 h-5" /> },
  { id: 'referrals', label: 'Referrals', icon: <GiftIcon className="w-5 h-5" /> },
  { id: 'help', label: 'Help', icon: <SparklesIcon className="w-5 h-5" /> },
];

const VIEW_TO_PATH: Record<string, string> = {
  'home': '/',
  'myservice': '/manage-plan',
  'wallet': '/wallet',
  'make-payment': '/pay',
  'requests': '/requests',
  'referrals': '/referrals',
  'help': '/help',
  'profile-settings': '/settings',
};

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
      : navItems.filter(item => !['myservice', 'make-payment'].includes(item.id));
    const visibleNavItems = baseItems;
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
        onLinkClick(view);
        setIsDropdownOpen(false);
    };

    return (
        <div className="flex flex-col h-full bg-white lg:border-r lg:border-base-200">
         <div className="flex items-center px-8 h-24">
           <div className="bg-primary p-2 rounded-2xl shadow-lg shadow-primary/20">
               <TruckIcon className="w-7 h-7 text-white" />
           </div>
           <div className="ml-4">
                <h1 className="text-xl font-black text-gray-900 tracking-tighter leading-none">ZIP-A-DEE</h1>
                <p className="text-[10px] font-black text-primary uppercase tracking-[0.3em] mt-0.5">Services</p>
           </div>
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

        <div ref={dropdownRef} className="relative hidden lg:block p-5 border-t border-base-100">
            {isDropdownOpen && (
                <div className="absolute bottom-full left-5 right-5 mb-2 w-auto origin-bottom bg-white rounded-xl shadow-2xl ring-1 ring-black ring-opacity-5 focus:outline-none z-30">
                    <div className="py-1">
                        <div className="px-4 py-3 border-b border-base-200 bg-gray-50 rounded-t-xl">
                            <p className="text-sm font-bold text-gray-900 truncate">{user?.firstName} {user?.lastName}</p>
                            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                        </div>
                        <a href="/settings" onClick={(e) => { e.preventDefault(); handleNavigation('profile-settings'); }} className="flex items-center w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors font-medium">
                            <UserIcon className="w-5 h-5 mr-3 text-gray-400" /> Profile Settings
                        </a>
                        <a href="/wallet" onClick={(e) => { e.preventDefault(); handleNavigation('wallet'); }} className="flex items-center w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors font-medium">
                            <BanknotesIcon className="w-5 h-5 mr-3 text-gray-400" /> Digital Wallet
                        </a>
                        <div className="border-t border-base-200 my-1"></div>
                        <button onClick={onLogout} className="w-full text-left flex items-center px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors font-bold">
                             <ArrowRightOnRectangleIcon className="w-5 h-5 mr-3 text-red-400" /> Logout
                        </button>
                    </div>
                </div>
            )}
            <button 
                onClick={() => setIsDropdownOpen(prev => !prev)}
                className="flex w-full items-center gap-4 p-3 rounded-2xl hover:bg-gray-100 transition-colors"
                aria-label="Open user menu"
            >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <UserIcon className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-black text-gray-900 truncate">{user?.firstName} {user?.lastName}</p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate">Platinum Member</p>
                </div>
            </button>
        </div>

          <div className="p-5 border-t border-base-100 bg-gray-50/50 lg:hidden">
           <div
             className="flex items-center gap-4 p-3 rounded-2xl cursor-pointer hover:bg-gray-100 transition-colors"
             onClick={() => onLinkClick('profile-settings')}
             role="button"
             tabIndex={0}
             onKeyPress={(e) => { if (e.key === 'Enter' || e.key === ' ') onLinkClick('profile-settings'); }}
             aria-label="Open profile settings"
           >
               <div className="w-10 h-10 rounded-2xl bg-white shadow-sm border border-base-200 flex items-center justify-center">
                   <UserIcon className="w-5 h-5 text-gray-500" />
               </div>
               <div className="flex-1 min-w-0">
                   <p className="text-sm font-black text-gray-900 truncate">{user?.firstName} {user?.lastName}</p>
                   <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate">Platinum Member</p>
               </div>
           </div>
           <button
             onClick={onLogout}
             className="flex items-center w-full mt-2 px-4 py-3 rounded-2xl text-sm text-red-600 hover:bg-red-50 transition-colors font-bold"
           >
               <ArrowRightOnRectangleIcon className="w-5 h-5 mr-3 text-red-400" />
               Sign Out
           </button>
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