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
      { view: 'dashboard', label: 'Dashboard', icon: <ChartPieIcon className="w-5 h-5" /> },
      { view: 'services', label: 'Explore Services', icon: <WrenchScrewdriverIcon className="w-5 h-5" /> },
    ]
  },
  {
    label: 'Scheduling',
    items: [
      { view: 'special-pickup', label: 'Special Pickups', icon: <CalendarDaysIcon className="w-5 h-5" /> },
      { view: 'vacation-holds', label: 'Vacation Holds', icon: <PauseCircleIcon className="w-5 h-5" /> },
      { view: 'missed-pickup', label: 'Report Missed', icon: <ExclamationTriangleIcon className="w-5 h-5" /> },
    ]
  },
  {
    label: 'Finance & Account',
    items: [
      { view: 'subscriptions', label: 'Subscriptions', icon: <ListBulletIcon className="w-5 h-5" /> },
      { view: 'billing', label: 'Billing & History', icon: <BanknotesIcon className="w-5 h-5" /> },
      { view: 'payment', label: 'Payment Methods', icon: <CreditCardIcon className="w-5 h-5" /> },
      { view: 'property-settings', label: 'Property Details', icon: <BuildingOffice2Icon className="w-5 h-5" /> },
    ]
  },
  {
    label: 'Support',
    items: [
      { view: 'support', label: 'Help Center', icon: <ChatBubbleLeftRightIcon className="w-5 h-5" /> },
      { view: 'notifications', label: 'Notifications', icon: <BellIcon className="w-5 h-5" /> },
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
      className={`flex items-center px-4 py-2.5 rounded-xl transition-all duration-200 group ${
        isActive
          ? 'bg-primary text-white shadow-lg shadow-teal-900/20 font-bold'
          : 'text-gray-500 hover:bg-base-200 hover:text-primary font-medium'
      }`}
    >
      <span className={`${isActive ? 'text-white' : 'text-gray-400 group-hover:text-primary'}`}>
        {item.icon}
      </span>
      <span className="ml-3 text-sm">{item.label}</span>
    </a>
  </li>
);

const SidebarContent: React.FC<{ currentView: View, onLinkClick: (view: View) => void }> = ({ currentView, onLinkClick }) => (
    <div className="flex flex-col h-full bg-white lg:border-r lg:border-base-300">
     <div className="flex items-center px-6 h-20 border-b border-base-200">
       <div className="bg-primary p-1.5 rounded-lg">
           <TruckIcon className="w-6 h-6 text-white" />
       </div>
       <h1 className="text-lg font-black ml-3 text-gray-900 tracking-tighter uppercase">WastePortal</h1>
     </div>
     
     <div className="flex-1 overflow-y-auto py-6 px-4 space-y-8">
       {navGroups.map((group) => (
         <div key={group.label} className="space-y-2">
           <h3 className="px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">{group.label}</h3>
           <ul className="space-y-1">
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

     <div className="p-6 border-t border-base-200 bg-gray-50/50">
       <div className="flex items-center gap-3">
           <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
               <UserIcon className="w-4 h-4 text-primary" />
           </div>
           <div className="flex-1 min-w-0">
               <p className="text-xs font-black text-gray-900 truncate">Jane Doe</p>
               <p className="text-[10px] text-gray-500 truncate">Member since 2022</p>
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
      <button onClick={() => setIsOpen(!isOpen)} className="lg:hidden fixed top-5 left-5 z-50 p-2.5 rounded-xl bg-white shadow-xl border border-base-300">
        <Bars3Icon className="w-6 h-6 text-neutral" />
      </button>

      <div className={`fixed inset-0 z-40 transform transition-transform duration-300 ease-in-out lg:hidden ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setIsOpen(false)}></div>
        <div className="relative w-72 h-full shadow-2xl">
            <SidebarContent currentView={currentView} onLinkClick={handleLinkClick} />
            <button onClick={() => setIsOpen(false)} className="absolute top-5 right-[-50px] p-2 bg-white rounded-full text-gray-900 shadow-xl">
                 <XMarkIcon className="w-6 h-6" />
            </button>
        </div>
      </div>
      
      <div className="hidden lg:block lg:w-72 lg:flex-shrink-0">
        <SidebarContent currentView={currentView} onLinkClick={handleLinkClick} />
      </div>
    </>
  );
};

export default Sidebar;