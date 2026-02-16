import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Sidebar from './components/Sidebar.tsx';
import Header from './components/Header.tsx';
import Dashboard from './components/Dashboard.tsx';
import MyServiceHub from './components/MyServiceHub.tsx';
import RequestsHub from './components/RequestsHub.tsx';
import Support from './components/Support.tsx';
import ProfileSettings from './components/ProfileSettings.tsx';
import ReferralsHub from './components/ReferralsHub.tsx';
import WalletHub from './components/WalletHub.tsx';
import StartService from './components/StartService.tsx';
import AuthLayout from './components/AuthLayout.tsx';
import Login from './components/Login.tsx';
import Registration from './components/Registration.tsx';
import MakePaymentHub from './components/MakePaymentHub.tsx';
import { View, User, NewPropertyInfo, RegistrationInfo, UpdatePropertyInfo, UpdateProfileInfo, UpdatePasswordInfo, Service, PostNavAction } from './types.ts';
import { PropertyContext } from './PropertyContext.tsx';
import { addProperty, login, register, logout, getUser, updatePropertyDetails, updateUserProfile, updateUserPassword, cancelAllSubscriptionsForProperty, restartAllSubscriptionsForProperty, sendTransferReminder, getServices, subscribeToNewService } from './services/mockApiService.ts';
import { Card } from './components/Card.tsx';
import { Button } from './components/Button.tsx';
import { KeyIcon, ExclamationTriangleIcon } from './components/Icons.tsx';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const [authError, setAuthError] = useState<string | null>(null);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState<View>('home');
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [postNavAction, setPostNavAction] = useState<PostNavAction | null>(null);

  const [initialLoading, setInitialLoading] = useState(true);

  const properties = useMemo(() => user?.properties || [], [user]);
  const selectedProperty = useMemo(() => 
    selectedPropertyId === 'all' ? null : properties.find(p => p.id === selectedPropertyId) || null
  , [selectedPropertyId, properties]);

  const fetchUserAndSetState = useCallback((userData: User) => {
    setUser(userData);
    if (userData.properties && userData.properties.length > 0) {
        // Default to 'all' properties view if user has more than one
        if (userData.properties.length > 1) {
            setSelectedPropertyId('all');
        } else {
            // Otherwise, select the single property they have
            setSelectedPropertyId(userData.properties[0].id);
        }
    } else {
        // No properties, so no selection
        setSelectedPropertyId(null);
    }
  }, []);
    
  const refreshUser = useCallback(async () => {
    try {
        const userData = await getUser();
        fetchUserAndSetState(userData);
    } catch (error) {
        console.error("Failed to refresh user data:", error);
    }
  }, [fetchUserAndSetState]);
  
  useEffect(() => {
    getUser()
      .then((userData) => {
        fetchUserAndSetState(userData);
        setIsAuthenticated(true);
        if (userData.properties && userData.properties.length === 0) {
          setCurrentView('start-service');
        }
      })
      .catch(() => {})
      .finally(() => setInitialLoading(false));
  }, [fetchUserAndSetState]);

  useEffect(() => {
    if (postNavAction) {
        setCurrentView(postNavAction.targetView);
    }
  }, [postNavAction]);

  const handleLogin = useCallback(async (email: string, password: string): Promise<void> => {
    setAuthError(null);
    try {
      const userData = await login(email, password);
      fetchUserAndSetState(userData);
      setIsAuthenticated(true);
      if (userData.properties && userData.properties.length === 0) {
        setCurrentView('start-service');
      } else {
        setCurrentView('home');
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "An unknown error occurred.");
    }
  }, [fetchUserAndSetState]);

  const handleRegister = useCallback(async (registrationInfo: RegistrationInfo): Promise<void> => {
     setAuthError(null);
    try {
      const userData = await register(registrationInfo);
      fetchUserAndSetState(userData);
      setIsAuthenticated(true);
      // Direct all new users to start service flow.
      setCurrentView('start-service'); 
    } catch (error)
    {
      setAuthError(error instanceof Error ? error.message : "An unknown error occurred.");
    }
  }, [fetchUserAndSetState]);

  const handleLogout = useCallback(async (): Promise<void> => {
    await logout();
    setIsAuthenticated(false);
    setUser(null);
    setSelectedPropertyId(null);
    setAuthView('login');
    setCurrentView('home');
  }, []);
  
  const startNewServiceFlow = useCallback(() => {
    setCurrentView('start-service');
  }, []);

  const handleCompleteSetup = useCallback(async (
    propertyInfo: NewPropertyInfo, 
    servicesToSubscribe: { serviceId: string; useSticker: boolean; quantity: number }[]
  ) => {
    try {
      // 1. Add property
      const newProperty = await addProperty(propertyInfo);

      // 2. Fetch all available services to get their full details
      const allServices = await getServices();

      // 3. Subscribe to each selected service for the new property
      for (const sub of servicesToSubscribe) {
          const serviceDetails = allServices.find(s => s.id === sub.serviceId);
          if (serviceDetails) {
              await subscribeToNewService(serviceDetails, newProperty.id, sub.quantity, sub.useSticker);
          }
      }
      
      // 4. Refresh user data and navigate
      await refreshUser();
      setSelectedPropertyId(newProperty.id); 
      setCurrentView('myservice'); 
    } catch (error) {
      console.error("Failed to complete setup:", error);
      throw error;
    }
  }, [refreshUser]);

  const handleUpdateProperty = useCallback(async (propertyId: string, details: UpdatePropertyInfo) => {
    try {
      const updatedProperty = await updatePropertyDetails(propertyId, details);
      setUser(prevUser => {
        if (!prevUser) return null;
        const updatedProperties = prevUser.properties.map(p => 
          p.id === propertyId ? updatedProperty : p
        );
        return { ...prevUser, properties: updatedProperties };
      });
    } catch (error) {
      console.error("Failed to update property:", error);
      throw error;
    }
  }, []);
  
  const handleUpdateProfile = useCallback(async (profileInfo: UpdateProfileInfo) => {
     try {
       const updatedUser = await updateUserProfile(profileInfo);
       setUser(updatedUser);
     } catch (error) {
        console.error("Failed to update profile:", error);
        throw error;
     }
  }, []);

  const handleUpdatePassword = useCallback(async (passwordInfo: UpdatePasswordInfo) => {
      try {
          await updateUserPassword(passwordInfo);
      } catch (error) {
          console.error("Failed to update password:", error);
          throw error;
      }
  }, []);

  const handleCancelPropertyServices = useCallback(async (propertyId: string) => {
    try {
      await cancelAllSubscriptionsForProperty(propertyId);
      await refreshUser(); // Re-fetch user data to get updated subscription statuses
    } catch (error) {
      console.error("Failed to cancel services:", error);
      throw error;
    }
  }, [refreshUser]);

  const handleRestartPropertyServices = useCallback(async (propertyId: string) => {
    try {
      await restartAllSubscriptionsForProperty(propertyId);
      await refreshUser(); // Re-fetch user data to get updated subscription statuses
    } catch (error) {
      console.error("Failed to restart services:", error);
      throw error;
    }
  }, [refreshUser]);
  
  const handleSendTransferReminder = useCallback(async (propertyId: string) => {
      try {
          await sendTransferReminder(propertyId);
      } catch (error) {
          console.error("Failed to send reminder:", error);
          throw error;
      }
  }, []);

  const contextValue = useMemo(() => ({
    user,
    properties,
    selectedProperty,
    selectedPropertyId,
    setSelectedPropertyId,
    loading, 
    refreshUser,
    updateProperty: handleUpdateProperty,
    updateProfile: handleUpdateProfile,
    updatePassword: handleUpdatePassword,
    cancelPropertyServices: handleCancelPropertyServices,
    restartPropertyServices: handleRestartPropertyServices,
    sendTransferReminder: handleSendTransferReminder,
    startNewServiceFlow,
    postNavAction,
    setPostNavAction,
    setCurrentView,
  }), [user, properties, selectedProperty, selectedPropertyId, loading, postNavAction, refreshUser, handleUpdateProperty, handleUpdateProfile, handleUpdatePassword, handleCancelPropertyServices, handleRestartPropertyServices, handleSendTransferReminder, startNewServiceFlow, setCurrentView]);

  const renderView = () => {
    switch (currentView) {
      case 'home': return <Dashboard setCurrentView={setCurrentView} />;
      case 'myservice': return <MyServiceHub />;
      case 'wallet': return <WalletHub />;
      case 'make-payment': return <MakePaymentHub />;
      case 'requests': return <RequestsHub />;
      case 'referrals': return <ReferralsHub />;
      case 'help': return <Support />;
      case 'profile-settings': return <ProfileSettings />;
      case 'start-service': return <StartService onCompleteSetup={handleCompleteSetup} onCancel={() => setCurrentView(properties.length > 0 ? 'myservice' : 'home')} />;
      default: return <Dashboard setCurrentView={setCurrentView} />;
    }
  };

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-base-200">
        <div className="text-center">
          <div className="loading loading-spinner loading-lg text-primary mb-4"></div>
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <AuthLayout>
        {authView === 'login' ? (
            <Login onLogin={handleLogin} switchToRegister={() => setAuthView('register')} error={authError} />
        ) : (
            <Registration onRegister={handleRegister} switchToLogin={() => setAuthView('login')} error={authError} />
        )}
      </AuthLayout>
    );
  }
  
  return (
    <PropertyContext.Provider value={contextValue}>
      <div className="flex h-screen bg-base-100 text-neutral">
        <Sidebar currentView={currentView} setCurrentView={setCurrentView} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} onLogout={handleLogout} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header currentView={currentView} setCurrentView={setCurrentView} onAddPropertyClick={startNewServiceFlow} onToggleSidebar={() => setIsSidebarOpen(o => !o)} />
          <main className="flex-1 overflow-x-hidden overflow-y-auto bg-base-100 p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto w-full">
              {renderView()}
            </div>
          </main>
        </div>
      </div>
    </PropertyContext.Provider>
  );
};

export default App;