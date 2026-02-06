
import React, { useState } from 'react';
import { View } from '../types';
import { 
  ChartPieIcon, WrenchScrewdriverIcon, ListBulletIcon, 
  BanknotesIcon, ChatBubbleLeftRightIcon, Bars3Icon, 
  XMarkIcon, TruckIcon, BellIcon, CalendarDaysIcon, 
  PauseCircleIcon, ExclamationTriangleIcon, BuildingOffice2Icon, 
  UserIcon, CreditCardIcon 
} from './Icons';

interface SidebarProps {
  currentView: View;
  setCurrentView: (view: View) => void;
}

interface NavGroup {
  label: string;
  items: { view: View; label: string; icon: React.ReactNode }[];
}

const navGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { view: 'dashboard', label: 'Command Center', icon: <ChartPieIcon className="w-5 h-5" /> },
      { view: 'services', label: 'Services Catalog', icon: <WrenchScrewdriverIcon className="w-5 h-5" /> },
    ]
  },
  {
    label: 'Collection',
    items: [
      { view: 'special-pickup', label: 'Special Requests', icon: <CalendarDaysIcon className="w-5 h-5" /> },
      { view: 'vacation-holds', label: 'Vacation Holds', icon: <PauseCircleIcon className="w-5 h-5" /> },
      { view: 'missed-pickup', label: 'Missed Pickup', icon: <ExclamationTriangleIcon className="w-5 h-5" /> },
    ]
  },
  {
    label: 'Account',
    items: [
      { view: 'billing', label: 'Statements', icon: <BanknotesIcon className="w-5 h-5" /> },
      { view: 'payment', label: 'Wallets', icon: <CreditCardIcon className="w-5 h-5" /> },
      { view: 'property-settings', label: 'Locations', icon: <BuildingOffice2Icon className="w-5 h-5" /> },
    ]
  },
  {
    label: 'Support',
    items: [
      { view: 'support', label: 'AI Concierge', icon: <ChatBubbleLeftRightIcon className="w-5 h-5" /> },
    ]
  }
];

const NavLink: React.FC<{
  item: { view: View; label: string; icon: React.ReactNode };
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
      className={`flex items-center px-4 py-3 rounded-2xl transition-all duration-300 group ${
        isActive
          ? 'bg-primary text-white shadow-xl shadow-teal-900/20 font-black'
          : 'text-gray-500 hover:bg-gray-100 hover:text-primary font-bold'
      }`}
    >
      <span className={`${isActive ? 'text-white' : 'text-gray-400 group-hover:text-primary'}`}>
        {item.icon}
      </span>
      <span className="ml-3 text-[13px]">{item.label}</span>
      {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
    </a>
  </li>
);

const SidebarContent: React.FC<{ currentView: View, onLinkClick: (view: View) => void }> = ({ currentView, onLinkClick }) => (
    <div className="flex flex-col h-full bg-white lg:border-r lg:border-base-200">
     <div className="flex items-center px-8 h-24">
       <div className="bg-primary p-2 rounded-2xl shadow-lg shadow-primary/20">
           <TruckIcon className="w-7 h-7 text-white" />
       </div>
       <div className="ml-4">
            <h1 className="text-xl font-black text-gray-900 tracking-tighter leading-none">WASTE</h1>
            <p className="text-[10px] font-black text-primary uppercase tracking-[0.3em] mt-0.5">Portal</p>
       </div>
     </div>
     
     <div className="flex-1 overflow-y-auto py-4 px-5 space-y-10">
       {navGroups.map((group) => (
         <div key={group.label} className="space-y-3">
           <h3 className="px-4 text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">{group.label}</h3>
           <ul className="space-y-1.5">
             {group.items.map((item) => (
               <NavLink
                 key={item.view}
                 item={item}
                 isActive={currentView === item.view}
                 onClick={() => onLinkClick(item.view)}
               />
             ))}
           </ul>
         </div>
       ))}
     </div>

     <div className="p-8 border-t border-base-100 bg-gray-50/50">
       <div className="flex items-center gap-4">
           <div className="w-10 h-10 rounded-2xl bg-white shadow-sm border border-base-200 flex items-center justify-center">
               <UserIcon className="w-5 h-5 text-gray-500" />
           </div>
           <div className="flex-1 min-w-0">
               <p className="text-sm font-black text-gray-900 truncate">Jane Doe</p>
               <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate">Platinum Member</p>
           </div>
       </div>
     </div>
   </div>
 );

const Sidebar: React.FC<SidebarProps> = ({ currentView, setCurrentView }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleLinkClick = (view: View) => {
    setCurrentView(view);
    setIsOpen(false);
  };

  return (
    <>
      <button onClick={() => setIsOpen(!isOpen)} className="lg:hidden fixed top-6 left-6 z-50 p-3 rounded-2xl bg-white shadow-2xl border border-base-200 text-gray-900">
        {isOpen ? <XMarkIcon className="w-6 h-6" /> : <Bars3Icon className="w-6 h-6" />}
      </button>

      <div className={`fixed inset-0 z-40 transform transition-transform duration-500 ease-out lg:hidden ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" onClick={() => setIsOpen(false)}></div>
        <div className="relative w-80 h-full shadow-2xl">
            <SidebarContent currentView={currentView} onLinkClick={handleLinkClick} />
        </div>
      </div>
      
      <div className="hidden lg:block lg:w-80 lg:flex-shrink-0">
        <SidebarContent currentView={currentView} onLinkClick={handleLinkClick} />
      </div>
    </>
  );
};

export default Sidebar;
