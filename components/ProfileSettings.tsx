
import React, { useState, useEffect } from 'react';
import { useProperty } from '../PropertyContext.tsx';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import { UpdateProfileInfo, UpdatePasswordInfo } from '../types.ts';
import { transferPropertyOwnership, sendTransferReminder } from '../services/mockApiService.ts';
import { ArrowPathRoundedSquareIcon, CheckCircleIcon, PaperAirplaneIcon, ClockIcon } from './Icons.tsx';

const DetailRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div className="flex flex-col sm:flex-row py-3">
        <dt className="text-sm font-medium text-gray-500 sm:w-1/4">{label}</dt>
        <dd className="mt-1 text-sm text-neutral sm:mt-0 sm:w-3/4">{value}</dd>
    </div>
);

const ProfileSettings: React.FC = () => {
    const { user, selectedProperty, updateProfile, updatePassword, refreshUser, sendTransferReminder } = useProperty();
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [profileData, setProfileData] = useState<UpdateProfileInfo | null>(null);
    const [passwordData, setPasswordData] = useState<UpdatePasswordInfo & { confirmNew: string }>({
        currentPassword: '', newPassword: '', confirmNew: ''
    });
    
    // State for Account Transfer
    const [transferData, setTransferData] = useState({ firstName: '', lastName: '', email: '' });
    const [transferConfirmation, setTransferConfirmation] = useState('');
    const [isTransferring, setIsTransferring] = useState(false);
    const [transferSuccess, setTransferSuccess] = useState(false);
    const [reminderSent, setReminderSent] = useState(false);
    
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
        setTransferSuccess(false); // Reset on user/property change
    }, [user, selectedProperty]);
    
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
    
    const handleTransferChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setTransferData(prev => ({ ...prev, [e.target.name]: e.target.value }));
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

    const handleInitiateTransfer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProperty || transferConfirmation !== 'TRANSFER') return;
        setIsTransferring(true);
        try {
            await transferPropertyOwnership(selectedProperty.id, transferData);
            await refreshUser(); // This is key to update the property state
            setTransferSuccess(true);
        } catch (error) {
            showNotification('error', 'Account transfer failed. Please try again.');
        } finally {
            setIsTransferring(false);
        }
    };

    const handleSendReminder = async () => {
        if (!selectedProperty) return;
        try {
            await sendTransferReminder(selectedProperty.id);
            setReminderSent(true);
            setTimeout(() => setReminderSent(false), 3000);
        } catch(e) {
            showNotification('error', 'Could not send reminder.');
        }
    };

    if (!user || !profileData) {
        return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-primary"></div></div>;
    }

    const isTransferPending = selectedProperty?.transferStatus === 'pending';

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
                            <Button type="button" variant="secondary" onClick={() => setIsEditingProfile(false)} disabled={isSavingProfile}>Cancel</Button>
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

             <Card className={!selectedProperty ? 'bg-gray-50' : ''}>
                <h2 className="text-2xl font-semibold text-neutral mb-4 flex items-center gap-3">
                    <ArrowPathRoundedSquareIcon className="w-6 h-6 text-primary" />
                    Account Transfer
                </h2>

                {!selectedProperty ? (
                    <p className="text-sm text-gray-500 font-medium italic">Please select a single property from the header dropdown to initiate a service transfer.</p>
                ) : isTransferPending ? (
                     <div className="text-center py-8">
                        <ClockIcon className="w-12 h-12 text-orange-500 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-neutral">Transfer in Progress</h3>
                        <p className="text-gray-600 mt-2">
                            An invitation to take over the service at <span className="font-semibold">{selectedProperty.address}</span> has been sent to <span className="font-semibold">{selectedProperty.pendingOwner?.email}</span>.
                        </p>
                        <div className="mt-8">
                            <Button onClick={handleSendReminder} disabled={reminderSent} className="rounded-xl px-8 font-black uppercase tracking-widest text-xs h-14">
                                {reminderSent ? <><CheckCircleIcon className="w-5 h-5 mr-2" /> Reminder Sent!</> : <><PaperAirplaneIcon className="w-5 h-5 mr-2" /> Send Reminder</>}
                            </Button>
                        </div>
                    </div>
                ) : transferSuccess ? (
                    <div className="text-center py-8">
                        <CheckCircleIcon className="w-12 h-12 text-green-500 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-neutral">Transfer Initiated</h3>
                        <p className="text-gray-600 mt-2">An invitation to take over the service at <span className="font-semibold">{selectedProperty.address}</span> has been sent to <span className="font-semibold">{transferData.email}</span>.</p>
                    </div>
                ) : (
                    <form onSubmit={handleInitiateTransfer} className="space-y-4">
                        <p className="text-sm text-gray-600">Transferring service for <span className="font-bold text-neutral">{selectedProperty.address}</span>. Enter the new resident's information below to send them an invitation to take over the account.</p>
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="block text-sm font-medium text-gray-700">New Resident First Name</label>
                                <input type="text" name="firstName" value={transferData.firstName} onChange={handleTransferChange} className="input-field" required />
                            </div>
                             <div className="flex-1">
                                <label className="block text-sm font-medium text-gray-700">New Resident Last Name</label>
                                <input type="text" name="lastName" value={transferData.lastName} onChange={handleTransferChange} className="input-field" required />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">New Resident Email</label>
                            <input type="email" name="email" value={transferData.email} onChange={handleTransferChange} className="input-field" required />
                        </div>

                        <div className="!mt-6 pt-6 border-t border-base-200">
                             <label className="block text-sm font-medium text-gray-700">Confirm Transfer</label>
                             <p className="text-xs text-gray-500 mb-2">This action is irreversible. To confirm, please type "TRANSFER" in the box below.</p>
                             <input type="text" value={transferConfirmation} onChange={(e) => setTransferConfirmation(e.target.value)} className="input-field font-bold tracking-widest" placeholder="Type TRANSFER to confirm" />
                        </div>
                        
                        <div className="flex justify-end pt-2">
                            <Button type="submit" disabled={isTransferring || transferConfirmation !== 'TRANSFER'} className="bg-orange-500 hover:bg-orange-600 focus:ring-orange-500">
                                {isTransferring ? 'Processing...' : 'Initiate Transfer'}
                            </Button>
                        </div>
                    </form>
                )}
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
                }
                .input-field:focus {
                     outline: none;
                     border-color: #0D9488;
                     box-shadow: 0 0 0 2px rgba(13, 148, 136, 0.2);
                }
            `}</style>
        </div>
    );
};

export default ProfileSettings;