
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
import { View, User, Property } from './types';
import { getUser } from './services/mockApiService';

interface PropertyContextType {
    user: User | null;
    properties: Property[];
    selectedProperty: Property | null;
    setSelectedPropertyId: (id: string) => void;
    loading: boolean;
    refreshUser: () => Promise<void>;
}

export const PropertyContext = createContext<PropertyContextType>({
    user: null,
    properties: [],
    selectedProperty: null,
    setSelectedPropertyId: () => {},
    loading: true,
    refreshUser: async () => {},
});

export const useProperty = () => useContext(PropertyContext);


const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  const fetchUser = async () => {
      // Don't show main loader on refresh
      if (!user) {
        setLoading(true);
      }
      try {
        const userData = await getUser();
        setUser(userData);
        if (!selectedPropertyId && userData.properties && userData.properties.length > 0) {
          setSelectedPropertyId(userData.properties[0].id);
        }
      } catch (error) {
        console.error("Failed to fetch user data:", error);
      } finally {
        setLoading(false);
      }
    };
    
  useEffect(() => {
    fetchUser();
  }, []);

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />;
      case 'services':
        return <Services />;
      case 'subscriptions':
        return <Subscriptions />;
      case 'billing':
        return <Billing />;
      case 'payment':
        return <PaymentMethods />;
      case 'notifications':
        return <Notifications />;
      case 'support':
        return <Support />;
      default:
        return <Dashboard />;
    }
  };

  const properties = user?.properties || [];
  const selectedProperty = properties.find(p => p.id === selectedPropertyId) || null;

  const contextValue = {
    user,
    properties,
    selectedProperty,
    setSelectedPropertyId,
    loading,
    refreshUser: fetchUser,
  };

  return (
    <PropertyContext.Provider value={contextValue}>
      <div className="flex h-screen bg-base-100 text-neutral">
        <Sidebar currentView={currentView} setCurrentView={setCurrentView} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header currentView={currentView} />
          <main className="flex-1 overflow-x-hidden overflow-y-auto bg-base-100 p-4 sm:p-6 lg:p-8">
            {loading ? (
                 <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-primary"></div></div>
            ) : renderView()}
          </main>
        </div>
      </div>
    </PropertyContext.Provider>
  );
};

export default App;
