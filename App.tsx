import React, { useState, useEffect, createContext, useContext } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import Services from './components/Services';
import Subscriptions from './components/Subscriptions';
import Billing from './components/Billing';
import PaymentMethods from './components/PaymentMethods';
import Support from './components/Support';
import Notifications from './components/Notifications';
import SpecialPickup from './components/SpecialPickup';
import VacationHolds from './components/VacationHolds';
import MissedPickup from './components/MissedPickup';
import AddPropertyModal from './components/AddPropertyModal';
import PropertySettings from './components/PropertySettings';
import ProfileSettings from './components/ProfileSettings';
import AuthLayout from './components/AuthLayout';
import Login from './components/Login';
import Registration from './components/Registration';
import { View, User, Property, NewPropertyInfo, RegistrationInfo, UpdatePropertyInfo, UpdateProfileInfo, UpdatePasswordInfo } from './types';
import { addProperty, login, register, logout, getUser, updatePropertyDetails, updateUserProfile, updateUserPassword } from './services/mockApiService';

interface PropertyContextType {
    user: User | null;
    properties: Property[];
    selectedProperty: Property | null;
    setSelectedPropertyId: (id: string) => void;
    loading: boolean;
    refreshUser: () => Promise<void>;
    updateProperty: (propertyId: string, details: UpdatePropertyInfo) => Promise<void>;
    updateProfile: (profileInfo: UpdateProfileInfo) => Promise<void>;
    updatePassword: (passwordInfo: UpdatePasswordInfo) => Promise<void>;
}

export const PropertyContext = createContext<PropertyContextType>({
    user: null,
    properties: [],
    selectedProperty: null,
    setSelectedPropertyId: () => {},
    loading: true,
    refreshUser: async () => {},
    updateProperty: async () => {},
    updateProfile: async () => {},
    updatePassword: async () => {},
});

export const useProperty = () => useContext(PropertyContext);


const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const [authError, setAuthError] = useState<string | null>(null);
  
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false); 
  const [isAddPropertyModalOpen, setIsAddPropertyModalOpen] = useState(false);
  
  const fetchUserAndSetState = (userData: User) => {
    setUser(userData);
    if (userData.properties && userData.properties.length > 0) {
      const currentSelectedExists = userData.properties.some(p => p.id === selectedPropertyId) || selectedPropertyId === 'all';
      if (!currentSelectedExists) {
        // Default to "all" if user has multiple properties, else the first one
        setSelectedPropertyId(userData.properties.length > 1 ? 'all' : userData.properties[0].id);
      }
    } else {
      setSelectedPropertyId(null);
    }
  };
    
  const refreshUser = async () => {
    try {
        const userData = await getUser();
        fetchUserAndSetState(userData);
    } catch (error) {
        console.error("Failed to refresh user data:", error);
    }
  };

  const handleLogin = async (email: string, password: string): Promise<void> => {
    setAuthError(null);
    try {
      const userData = await login(email, password);
      fetchUserAndSetState(userData);
      setIsAuthenticated(true);
      if (userData.properties && userData.properties.length === 0) {
        setIsAddPropertyModalOpen(true);
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "An unknown error occurred.");
    }
  };

  const handleRegister = async (registrationInfo: RegistrationInfo): Promise<void> => {
     setAuthError(null);
    try {
      const userData = await register(registrationInfo);
      fetchUserAndSetState(userData);
      setIsAuthenticated(true);
      setCurrentView('services'); 
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "An unknown error occurred.");
    }
  };

  const handleLogout = async (): Promise<void> => {
    await logout();
    setIsAuthenticated(false);
    setUser(null);
    setSelectedPropertyId(null);
    setAuthView('login');
  };

  const handleAddProperty = async (propertyInfo: NewPropertyInfo) => {
    try {
      const newProperty = await addProperty(propertyInfo);
      setUser(prevUser => {
        if (!prevUser) return null;
        const updatedUser = { ...prevUser, properties: [...prevUser.properties, newProperty]};
        return updatedUser;
      });
      setSelectedPropertyId(newProperty.id); 
      setCurrentView('services'); 
      setIsAddPropertyModalOpen(false); 
    } catch (error) {
      console.error("Failed to add property:", error);
      alert("Could not add the new property. Please try again.");
    }
  };

  const handleUpdateProperty = async (propertyId: string, details: UpdatePropertyInfo) => {
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
  };
  
  const handleUpdateProfile = async (profileInfo: UpdateProfileInfo) => {
     try {
       const updatedUser = await updateUserProfile(profileInfo);
       setUser(updatedUser);
     } catch (error) {
        console.error("Failed to update profile:", error);
        throw error;
     }
  };

  const handleUpdatePassword = async (passwordInfo: UpdatePasswordInfo) => {
      try {
          await updateUserPassword(passwordInfo);
      } catch (error) {
          console.error("Failed to update password:", error);
          throw error;
      }
  };

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard setCurrentView={setCurrentView} />;
      case 'services':
        return <Services />;
      case 'subscriptions':
        return <Subscriptions />;
      case 'billing':
        return <Billing />;
      case 'payment':
        return <PaymentMethods setCurrentView={setCurrentView} />;
      case 'notifications':
        return <Notifications />;
      case 'special-pickup':
        return <SpecialPickup />;
      case 'vacation-holds':
        return <VacationHolds />;
      case 'missed-pickup':
        return <MissedPickup />;
      case 'support':
        return <Support />;
      case 'property-settings':
        return <PropertySettings />;
      case 'profile-settings':
        return <ProfileSettings />;
      default:
        return <Dashboard setCurrentView={setCurrentView} />;
    }
  };
  
  if (!isAuthenticated) {
    return (
        <AuthLayout>
            {authView === 'login' ? (
                <Login onLogin={handleLogin} switchToRegister={() => setAuthView('register')} error={authError} />
            ) : (
                <Registration onRegister={handleRegister} switchToLogin={() => setAuthView('login')} error={authError} />
            )}
        </AuthLayout>
    )
  }

  const properties = user?.properties || [];
  // selectedProperty is null if selectedPropertyId is 'all'
  const selectedProperty = selectedPropertyId === 'all' ? null : properties.find(p => p.id === selectedPropertyId) || null;

  const contextValue = {
    user,
    properties,
    selectedProperty,
    setSelectedPropertyId,
    loading: false, 
    refreshUser: refreshUser,
    updateProperty: handleUpdateProperty,
    updateProfile: handleUpdateProfile,
    updatePassword: handleUpdatePassword,
  };

  return (
    <PropertyContext.Provider value={contextValue}>
      <div className="flex h-screen bg-base-100 text-neutral">
        <Sidebar currentView={currentView} setCurrentView={setCurrentView} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header currentView={currentView} setCurrentView={setCurrentView} onAddPropertyClick={() => setIsAddPropertyModalOpen(true)} onLogout={handleLogout} />
          <main className="flex-1 overflow-x-hidden overflow-y-auto bg-base-100 p-4 sm:p-6 lg:p-8">
            {renderView()}
          </main>
        </div>
        <AddPropertyModal 
          isOpen={isAddPropertyModalOpen}
          onClose={() => setIsAddPropertyModalOpen(false)}
          onAddProperty={handleAddProperty}
        />
      </div>
    </PropertyContext.Provider>
  );
};

export default App;