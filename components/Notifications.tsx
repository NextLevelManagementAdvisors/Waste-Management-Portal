
import React, { useState, useEffect, useCallback } from 'react';
import { useProperty } from '../App';
import { updateNotificationPreferences } from '../services/mockApiService';
import { NotificationPreferences } from '../types';
import { Card } from './Card';
import { Button } from './Button';
import ToggleSwitch from './ToggleSwitch';

const Notifications: React.FC = () => {
    const { selectedProperty, refreshUser } = useProperty();
    const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [notification, setNotification] = useState('');

    useEffect(() => {
        if (selectedProperty) {
            // Deep copy to prevent direct mutation of context state
            setPrefs(JSON.parse(JSON.stringify(selectedProperty.notificationPreferences)));
            setHasChanges(false);
        } else {
            setPrefs(null);
        }
    }, [selectedProperty]);

    const handlePrefChange = useCallback((category: keyof NotificationPreferences, type: 'email' | 'sms') => {
        setPrefs(prev => {
            if (!prev) return null;
            const newPrefs = { ...prev };
            newPrefs[category] = { ...newPrefs[category], [type]: !newPrefs[category][type] };
            return newPrefs;
        });
        setHasChanges(true);
    }, []);

    const handleSaveChanges = async () => {
        if (!selectedProperty || !prefs) return;
        setIsSaving(true);
        setNotification('');
        try {
            await updateNotificationPreferences(selectedProperty.id, prefs);
            await refreshUser(); // Refresh global user state
            setHasChanges(false);
            setNotification('Preferences saved successfully!');
            setTimeout(() => setNotification(''), 3000);
        } catch (error) {
            console.error("Failed to save preferences:", error);
            setNotification('Failed to save. Please try again.');
            setTimeout(() => setNotification(''), 3000);
        } finally {
            setIsSaving(false);
        }
    };
    
    if (!selectedProperty) {
        return <div className="text-center p-8">Please select a property to manage notifications.</div>;
    }
    
    if (!prefs) {
        return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-primary"></div></div>;
    }

    const NotificationCategory: React.FC<{
        title: string;
        description: string;
        categoryKey: keyof NotificationPreferences;
    }> = ({ title, description, categoryKey }) => (
        <div className="py-4 sm:py-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-neutral">{title}</h3>
                    <p className="text-sm text-gray-500 mt-1">{description}</p>
                </div>
                <div className="flex items-center space-x-6 mt-4 sm:mt-0">
                    <div>
                        <span className="text-sm font-medium text-gray-700">Email</span>
                        <ToggleSwitch
                            checked={prefs[categoryKey].email}
                            onChange={() => handlePrefChange(categoryKey, 'email')}
                        />
                    </div>
                    <div>
                        <span className="text-sm font-medium text-gray-700">SMS</span>
                        <ToggleSwitch
                            checked={prefs[categoryKey].sms}
                            onChange={() => handlePrefChange(categoryKey, 'sms')}
                        />
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-neutral">Notification Preferences</h1>
                <p className="text-gray-600 mt-1">
                    Manage notifications for: <span className="font-semibold text-neutral">{selectedProperty.address}</span>
                </p>
            </div>
            <Card>
                <div className="divide-y divide-gray-200">
                    <NotificationCategory 
                        title="Pickup Reminders"
                        description="Get a reminder the day before your scheduled pickup."
                        categoryKey="pickupReminders"
                    />
                     <NotificationCategory 
                        title="Schedule Changes"
                        description="Be notified about holiday schedule changes or cancellations."
                        categoryKey="scheduleChanges"
                    />
                     <NotificationCategory 
                        title="Driver Updates"
                        description="Receive an alert if the driver is running late on pickup day."
                        categoryKey="driverUpdates"
                    />
                </div>
            </Card>
            <div className="flex justify-end items-center gap-4">
                {notification && <span className="text-sm text-primary">{notification}</span>}
                <Button onClick={handleSaveChanges} disabled={!hasChanges || isSaving}>
                    {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
            </div>
        </div>
    );
};

export default Notifications;
