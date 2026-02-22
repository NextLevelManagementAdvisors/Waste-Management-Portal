import React, { useState, useEffect, useCallback } from 'react';
import { useProperty } from '../PropertyContext.tsx';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import ToggleSwitch from './ToggleSwitch.tsx';
import { UpdateProfileInfo, UpdatePasswordInfo, NotificationPreferences } from '../types.ts';
import { updateNotificationPreferences } from '../services/apiService.ts';
import {
  UserIcon, BellIcon, KeyIcon, ExclamationTriangleIcon
} from './Icons.tsx';

type SettingsTab = 'profile' | 'notifications' | 'security';

const SettingsHub: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'profile', label: 'Profile', icon: <UserIcon className="w-5 h-5" /> },
    { id: 'notifications', label: 'Notifications', icon: <BellIcon className="w-5 h-5" /> },
    { id: 'security', label: 'Security', icon: <KeyIcon className="w-5 h-5" /> },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-base-200 pb-8">
        <div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight">Settings</h1>
          <p className="text-gray-500 font-medium mt-1 text-lg">Manage your account, preferences, and security.</p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 -mb-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold whitespace-nowrap transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'profile' && <ProfileTab />}
      {activeTab === 'notifications' && <NotificationsTab />}
      {activeTab === 'security' && <SecurityTab />}
    </div>
  );
};

const NotificationPopup: React.FC<{ notification: { type: 'success' | 'error'; message: string } | null }> = ({ notification }) => {
  if (!notification) return null;
  return (
    <div className={`fixed bottom-5 right-5 p-4 rounded-xl shadow-lg text-white z-50 ${notification.type === 'success' ? 'bg-primary' : 'bg-red-600'}`}>
      {notification.message}
    </div>
  );
};

const ProfileTab: React.FC = () => {
  const { user, updateProfile } = useProperty();
  const [isEditing, setIsEditing] = useState(false);
  const [profileData, setProfileData] = useState<UpdateProfileInfo | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (user) {
      setProfileData({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
      });
    }
  }, [user]);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProfileData(prev => (prev ? { ...prev, [e.target.name]: e.target.value } : null));
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileData) return;
    setIsSaving(true);
    try {
      await updateProfile(profileData);
      setIsEditing(false);
      showNotification('success', 'Profile updated successfully!');
    } catch (error) {
      showNotification('error', 'Failed to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!user || !profileData) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card className="border-none ring-1 ring-base-200 shadow-xl">
        <form onSubmit={handleSaveProfile}>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-3">
              <UserIcon className="w-6 h-6 text-primary" />
              Personal Information
            </h2>
            {!isEditing && (
              <Button type="button" variant="secondary" onClick={() => setIsEditing(true)} className="rounded-xl px-6 font-black uppercase text-[10px] tracking-widest">
                Edit
              </Button>
            )}
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">First Name</label>
                {isEditing ? (
                  <input type="text" name="firstName" value={profileData.firstName} onChange={handleProfileChange} className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required />
                ) : (
                  <p className="px-4 py-3 font-bold text-gray-900">{user.firstName}</p>
                )}
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Last Name</label>
                {isEditing ? (
                  <input type="text" name="lastName" value={profileData.lastName} onChange={handleProfileChange} className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required />
                ) : (
                  <p className="px-4 py-3 font-bold text-gray-900">{user.lastName}</p>
                )}
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Email Address</label>
              {isEditing ? (
                <input type="email" name="email" value={profileData.email} onChange={handleProfileChange} className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required />
              ) : (
                <p className="px-4 py-3 font-bold text-gray-900">{user.email}</p>
              )}
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Phone Number</label>
              {isEditing ? (
                <input type="tel" name="phone" value={profileData.phone} onChange={handleProfileChange} className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required />
              ) : (
                <p className="px-4 py-3 font-bold text-gray-900">{user.phone}</p>
              )}
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Member Since</label>
              <p className="px-4 py-3 font-bold text-gray-500">{user.memberSince}</p>
            </div>
          </div>
          {isEditing && (
            <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-base-200">
              <Button type="button" variant="secondary" onClick={() => { setIsEditing(false); setProfileData({ firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone }); }} disabled={isSaving} className="rounded-xl px-8 font-black uppercase text-[10px] tracking-widest">
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving} className="rounded-xl px-8 font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20">
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          )}
        </form>
      </Card>
      <NotificationPopup notification={notification} />
    </div>
  );
};

const NotificationsTab: React.FC = () => {
  const { selectedProperty, properties, refreshUser } = useProperty();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [notification, setNotification] = useState('');

  useEffect(() => {
    if (selectedProperty) {
      const np = selectedProperty.notificationPreferences;
      // Deep copy and set defaults in one go
      setPrefs({
        ...JSON.parse(JSON.stringify(np)),
        invoiceDue: np.invoiceDue !== false,
        paymentConfirmation: np.paymentConfirmation !== false,
        autopayReminder: np.autopayReminder !== false,
        serviceUpdates: np.serviceUpdates !== false,
        promotions: np.promotions === true,
        referralUpdates: np.referralUpdates !== false,
      });
      setHasChanges(false);
    } else {
      setPrefs(null);
    }
  }, [selectedProperty]);

  const handlePrefChange = useCallback((category: keyof NotificationPreferences, type?: 'email' | 'sms') => {
    setPrefs(prev => {
      if (!prev) return null;
      if (type) {
        const newPrefs = { ...prev };
        newPrefs[category] = { ...newPrefs[category], [type]: !newPrefs[category][type] };
        return newPrefs;
      }
      return { ...prev, [category]: !prev[category] };
    });
    setHasChanges(true);
  }, []);

  const handleSave = async () => {
    if (!selectedProperty || !prefs) return;
    setIsSaving(true);
    setNotification('');
    try {
      await updateNotificationPreferences(selectedProperty.id, prefs);
      await refreshUser();
      setHasChanges(false);
      setNotification('Preferences saved successfully!');
      setTimeout(() => setNotification(''), 3000);
    } catch (error) {
      setNotification('Failed to save. Please try again.');
      setTimeout(() => setNotification(''), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const NotifRow: React.FC<{ title: string; description: string; categoryKey: keyof NotificationPreferences }> = ({ title, description, categoryKey }) => (
    <div className="py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex-1">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      {prefs && (
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Email</span>
            <ToggleSwitch checked={prefs[categoryKey].email} onChange={() => handlePrefChange(categoryKey, 'email')} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">SMS</span>
            <ToggleSwitch checked={prefs[categoryKey].sms} onChange={() => handlePrefChange(categoryKey, 'sms')} />
          </div>
        </div>
      )}
    </div>
  );

  const SimpleToggleRow: React.FC<{ title: string; description: string; checked: boolean; onChange: () => void }> = ({ title, description, checked, onChange }) => (
    <div className="py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex-1">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} />
    </div>
  );

  if (properties.length === 0) {
    return (
      <Card className="border-none ring-1 ring-base-200 shadow-xl">
        <div className="text-center py-12">
          <BellIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-600">No Properties</h3>
          <p className="text-gray-400 mt-1">Add a property to configure notification preferences.</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-none ring-1 ring-base-200 shadow-xl">
        <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-3 mb-2">
          <BellIcon className="w-6 h-6 text-primary" />
          Pickup Notifications
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          {selectedProperty ? `Settings for ${selectedProperty.address}` : 'Select a property to configure'}
        </p>
        {prefs && (
          <div className="divide-y divide-base-200">
            <NotifRow title="Pickup Reminders" description="Get a reminder the day before your scheduled pickup." categoryKey="pickupReminders" />
            <NotifRow title="Schedule Changes" description="Be notified about holiday schedule changes or cancellations." categoryKey="scheduleChanges" />
            <NotifRow title="Driver Updates" description="Receive an alert if the driver is running late on pickup day." categoryKey="driverUpdates" />
          </div>
        )}
      </Card>

      <Card className="border-none ring-1 ring-base-200 shadow-xl">
        <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-3 mb-2">
          <CreditCardIconSmall />
          Billing Alerts
        </h2>
        <p className="text-sm text-gray-500 mb-4">Control how you receive billing and payment notifications.</p>
        {prefs && <div className="divide-y divide-base-200">
          <SimpleToggleRow title="Invoice Due Reminders" description="Receive a reminder when an invoice is due or overdue." checked={prefs.invoiceDue!} onChange={() => handlePrefChange('invoiceDue')} />
          <SimpleToggleRow title="Payment Confirmations" description="Get a confirmation when your payment is processed successfully." checked={prefs.paymentConfirmation!} onChange={() => handlePrefChange('paymentConfirmation')} />
          <SimpleToggleRow title="AutoPay Notifications" description="Get notified before an automatic payment is processed." checked={prefs.autopayReminder!} onChange={() => handlePrefChange('autopayReminder')} />
        </div>}
      </Card>

      <Card className="border-none ring-1 ring-base-200 shadow-xl">
        <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-3 mb-2">
          <MegaphoneIconSmall />
          Account & Marketing
        </h2>
        <p className="text-sm text-gray-500 mb-4">Choose which account-related communications you want to receive.</p>
        {prefs && <div className="divide-y divide-base-200">
          <SimpleToggleRow title="Service Updates" description="Important updates about your service plan or account changes." checked={prefs.serviceUpdates!} onChange={() => handlePrefChange('serviceUpdates')} />
          <SimpleToggleRow title="Promotions & Offers" description="Special deals, seasonal offers, and discounts." checked={prefs.promotions!} onChange={() => handlePrefChange('promotions')} />
          <SimpleToggleRow title="Referral Updates" description="Get notified when someone uses your referral code." checked={prefs.referralUpdates!} onChange={() => handlePrefChange('referralUpdates')} />
        </div>}
      </Card>

      <div className="flex justify-end items-center gap-4">
        {notification && <span className="text-sm text-primary font-medium">{notification}</span>}
        <Button onClick={handleSave} disabled={!hasChanges || isSaving} className="rounded-xl px-8 font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20">
          {isSaving ? 'Saving...' : 'Save Preferences'}
        </Button>
      </div>
    </div>
  );
};

const SecurityTab: React.FC = () => {
  const { user, updatePassword } = useProperty();
  const [passwordData, setPasswordData] = useState<UpdatePasswordInfo & { confirmNew: string }>({
    currentPassword: '',
    newPassword: '',
    confirmNew: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPasswordData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmNew) {
      showNotification('error', 'New passwords do not match.');
      return;
    }
    if (passwordData.newPassword.length < 8) {
      showNotification('error', 'New password must be at least 8 characters long.');
      return;
    }
    setIsSaving(true);
    try {
      await updatePassword({ currentPassword: passwordData.currentPassword, newPassword: passwordData.newPassword });
      showNotification('success', 'Password changed successfully!');
      setPasswordData({ currentPassword: '', newPassword: '', confirmNew: '' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      showNotification('error', `Error: ${errorMessage}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-none ring-1 ring-base-200 shadow-xl">
        <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-3 mb-6">
          <KeyIcon className="w-6 h-6 text-primary" />
          Change Password
        </h2>
        <form onSubmit={handleSavePassword} className="space-y-4">
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Current Password</label>
            <input type="password" name="currentPassword" value={passwordData.currentPassword} onChange={handlePasswordChange} className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">New Password</label>
              <input type="password" name="newPassword" value={passwordData.newPassword} onChange={handlePasswordChange} className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required />
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Confirm New Password</label>
              <input type="password" name="confirmNew" value={passwordData.confirmNew} onChange={handlePasswordChange} className="w-full bg-gray-50 border-2 border-base-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-primary transition-all" required />
            </div>
          </div>
          <div className="flex justify-end pt-4">
            <Button type="submit" disabled={isSaving} className="rounded-xl px-8 font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20">
              {isSaving ? 'Updating...' : 'Update Password'}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="border-none ring-1 ring-base-200 shadow-xl">
        <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-3 mb-4">
          <ExclamationTriangleIcon className="w-6 h-6 text-orange-500" />
          Login Sessions
        </h2>
        <p className="text-sm text-gray-500 mb-4">You are currently logged in. If you suspect unauthorized access, change your password immediately.</p>
        <div className="bg-gray-50 rounded-xl p-4 border border-base-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-gray-900">Current Session</p>
              <p className="text-xs text-gray-500 mt-0.5">Logged in as {user?.email}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Active
            </span>
          </div>
        </div>
      </Card>

      <NotificationPopup notification={notification} />
    </div>
  );
};

const CreditCardIconSmall: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-primary">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
  </svg>
);

const MegaphoneIconSmall: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-primary">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
  </svg>
);

export default SettingsHub;
