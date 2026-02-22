
import React, { useState, useEffect } from 'react';
import { useProperty } from '../PropertyContext.tsx';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import { UpdateProfileInfo, UpdatePasswordInfo } from '../types.ts';

const DetailRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div className="flex flex-col sm:flex-row py-3">
        <dt className="text-sm font-medium text-gray-700 sm:w-1/4">{label}</dt>
        <dd className="mt-1 text-sm text-neutral sm:mt-0 sm:w-3/4">{value}</dd>
    </div>
);

const ProfileSettings: React.FC = () => {
    const { user, updateProfile, updatePassword } = useProperty();
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [profileData, setProfileData] = useState<UpdateProfileInfo | null>(null);
    const [passwordData, setPasswordData] = useState<UpdatePasswordInfo & { confirmNew: string }>({
        currentPassword: '', newPassword: '', confirmNew: ''
    });
    
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [isSavingPassword, setIsSavingPassword] = useState(false);
    const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string} | null>(null);

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
        setProfileData(prev => prev ? { ...prev, [e.target.name]: e.target.value } : null);
    };
    
    const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setPasswordData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!profileData) return;
        setIsSavingProfile(true);
        try {
            await updateProfile(profileData);
            setIsEditingProfile(false);
            showNotification('success', 'Profile updated successfully!');
        } catch (error) {
            showNotification('error', 'Failed to update profile.');
        } finally {
            setIsSavingProfile(false);
        }
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

        setIsSavingPassword(true);
        try {
            await updatePassword({
                currentPassword: passwordData.currentPassword,
                newPassword: passwordData.newPassword
            });
            showNotification('success', 'Password changed successfully!');
            setPasswordData({ currentPassword: '', newPassword: '', confirmNew: '' });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
            showNotification('error', `Error: ${errorMessage}`);
        } finally {
            setIsSavingPassword(false);
        }
    };

    if (!user || !profileData) {
        return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-primary"></div></div>;
    }

    return (
        <div className="space-y-8 max-w-4xl mx-auto">
             <div>
                <h1 className="text-3xl font-bold text-neutral">Profile Settings</h1>
                <p className="text-gray-600 mt-1">Manage your personal information and password.</p>
            </div>
            
            <Card>
                <form onSubmit={handleSaveProfile}>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-2xl font-semibold text-neutral">Personal Information</h2>
                         {!isEditingProfile && (
                            <Button type="button" variant="secondary" onClick={() => setIsEditingProfile(true)}>Edit Profile</Button>
                        )}
                    </div>
                    <dl className="space-y-4">
                         <DetailRow label="First Name" value={isEditingProfile ? <input type="text" name="firstName" value={profileData.firstName} onChange={handleProfileChange} className="input-field" required /> : user.firstName} />
                         <DetailRow label="Last Name" value={isEditingProfile ? <input type="text" name="lastName" value={profileData.lastName} onChange={handleProfileChange} className="input-field" required /> : user.lastName} />
                         <DetailRow label="Email Address" value={isEditingProfile ? <input type="email" name="email" value={profileData.email} onChange={handleProfileChange} className="input-field" required /> : user.email} />
                         <DetailRow label="Phone Number" value={isEditingProfile ? <input type="tel" name="phone" value={profileData.phone} onChange={handleProfileChange} className="input-field" required /> : user.phone} />
                         <DetailRow label="Member Since" value={user.memberSince} />
                    </dl>
                    {isEditingProfile && (
                        <div className="flex justify-end gap-3 mt-6">
                            <Button type="button" variant="secondary" onClick={handleCancelEditingProfile} disabled={isSavingProfile}>Cancel</Button>
                            <Button type="submit" disabled={isSavingProfile}>
                                {isSavingProfile ? 'Saving...' : 'Save Changes'}
                            </Button>
                        </div>
                    )}
                </form>
            </Card>

            <Card>
                <h2 className="text-2xl font-semibold text-neutral mb-4">Change Password</h2>
                <form onSubmit={handleSavePassword} className="space-y-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Current Password</label>
                        <input type="password" name="currentPassword" value={passwordData.currentPassword} onChange={handlePasswordChange} className="input-field" required />
                    </div>
                     <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700">New Password</label>
                            <input type="password" name="newPassword" value={passwordData.newPassword} onChange={handlePasswordChange} className="input-field" required />
                        </div>
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700">Confirm New Password</label>
                            <input type="password" name="confirmNew" value={passwordData.confirmNew} onChange={handlePasswordChange} className="input-field" required />
                        </div>
                    </div>
                    <div className="flex justify-end pt-2">
                        <Button type="submit" disabled={isSavingPassword}>
                            {isSavingPassword ? 'Updating...' : 'Update Password'}
                        </Button>
                    </div>
                </form>
            </Card>

             {notification && (
                <div className={`fixed bottom-5 right-5 p-4 rounded-lg shadow-lg text-white ${notification.type === 'success' ? 'bg-primary' : 'bg-red-600'}`}>
                    {notification.message}
                </div>
            )}
            
            <style>{`
                .input-field {
                    width: 100%;
                    padding: 0.5rem 0.75rem;
                    border: 1px solid #E5E7EB;
                    border-radius: 0.375rem;
                    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
                    background-color: #F9FAFB;
                    color: #1F2937;
                    transition: all 0.2s ease-in-out;
                }
                .input-field:focus {
                     outline: none;
                     border-color: #0D9488;
                     box-shadow: 0 0 0 2px rgba(13, 148, 136, 0.2);
                     background-color: #ffffff;
                }
            `}</style>
        </div>
    );
};

export default ProfileSettings;
