import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View } from '../types.ts';
import { Bars3Icon, UserCircleIcon, BellIcon } from './Icons.tsx';
import { useProperty } from '../PropertyContext.tsx';
import { getNotifications, markNotificationsRead, InPortalNotification } from '../services/apiService.ts';

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

function formatTimeAgo(dateStr: string): string {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

const Header: React.FC<HeaderProps> = ({ currentView, setCurrentView, onAddPropertyClick, onToggleSidebar }) => {
  const { properties, selectedProperty, setSelectedPropertyId, loading } = useProperty();
  const title = viewTitles[currentView] || 'Overview';

  // Notification state
  const [notifications, setNotifications] = useState<InPortalNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
      try {
          const result = await getNotifications();
          setNotifications(result.data);
          setUnreadCount(result.unreadCount);
      } catch {
          // Silently fail
      }
  }, []);

  // Initial load + poll every 60 seconds
  useEffect(() => {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 60000);
      return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close dropdown when clicking outside
  useEffect(() => {
      const handler = (e: MouseEvent) => {
          if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
              setIsNotifOpen(false);
          }
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleMarkAllRead = async () => {
      await markNotificationsRead();
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleNotificationClick = async (notif: InPortalNotification) => {
      if (!notif.read) {
          await markNotificationsRead(notif.id);
          setUnreadCount(prev => Math.max(0, prev - 1));
          setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
      }
      if (notif.type.startsWith('address_')) {
          setCurrentView('home');
      }
      setIsNotifOpen(false);
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
            {/* Notification Bell */}
            <div className="relative" ref={notifRef}>
                <button
                    type="button"
                    onClick={() => setIsNotifOpen(prev => !prev)}
                    className="relative p-2 rounded-xl text-gray-400 hover:text-primary hover:bg-gray-100 transition-colors"
                    aria-label="Notifications"
                >
                    <BellIcon className="w-6 h-6" />
                    {unreadCount > 0 && (
                        <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                    )}
                </button>
                {isNotifOpen && (
                    <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-base-200 z-50 overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-base-200">
                            <h3 className="text-sm font-black text-gray-900">Notifications</h3>
                            {unreadCount > 0 && (
                                <button
                                    type="button"
                                    onClick={handleMarkAllRead}
                                    className="text-xs font-bold text-primary hover:underline"
                                >
                                    Mark all read
                                </button>
                            )}
                        </div>
                        <div className="max-h-80 overflow-y-auto">
                            {notifications.length === 0 ? (
                                <div className="px-4 py-8 text-center text-sm text-gray-400">
                                    No notifications yet
                                </div>
                            ) : (
                                notifications.map(notif => (
                                    <button
                                        type="button"
                                        key={notif.id}
                                        onClick={() => handleNotificationClick(notif)}
                                        className={`w-full text-left px-4 py-3 border-b border-base-100 hover:bg-gray-50 transition-colors ${
                                            !notif.read ? 'bg-primary/5' : ''
                                        }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            {!notif.read && (
                                                <div className="w-2 h-2 bg-primary rounded-full mt-1.5 flex-shrink-0" />
                                            )}
                                            <div className={!notif.read ? '' : 'ml-5'}>
                                                <p className="text-sm font-bold text-gray-900">{notif.title}</p>
                                                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.body}</p>
                                                <p className="text-[10px] text-gray-400 mt-1">
                                                    {formatTimeAgo(notif.createdAt)}
                                                </p>
                                            </div>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
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
