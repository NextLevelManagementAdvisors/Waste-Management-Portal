import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Sidebar from './components/Sidebar.tsx';
import Header from './components/Header.tsx';
import Dashboard from './components/Dashboard.tsx';
import MyServiceHub from './components/MyServiceHub.tsx';
import RequestsHub from './components/RequestsHub.tsx';
import Support from './components/Support.tsx';
import SettingsHub from './components/SettingsHub.tsx';
import ReferralsHub from './components/ReferralsHub.tsx';
import WalletHub from './components/WalletHub.tsx';
import AuthLayout from './components/AuthLayout.tsx';
import Login from './components/Login.tsx';
import Registration from './components/Registration.tsx';
import ForgotPassword from './components/ForgotPassword.tsx';
import ResetPassword from './components/ResetPassword.tsx';
import MakePaymentHub from './components/MakePaymentHub.tsx';
import AcceptTransfer from './components/AcceptTransfer.tsx';
import ChatWidget from './components/ChatWidget.tsx';
import { View, User, NewPropertyInfo, RegistrationInfo, UpdatePropertyInfo, UpdateProfileInfo, UpdatePasswordInfo, Service, PostNavAction } from './types.ts';
import { PropertyContext } from './PropertyContext.tsx';
import { addProperty, login, register, logout, getUser, updatePropertyDetails, updateUserProfile, updateUserPassword, cancelAllSubscriptionsForProperty, restartAllSubscriptionsForProperty, sendTransferReminder, getServices, subscribeToNewService } from './services/mockApiService.ts';
import StripeProvider from './components/StripeProvider.tsx';
import { Card } from './components/Card.tsx';
import { Button } from './components/Button.tsx';
import { KeyIcon, ExclamationTriangleIcon } from './components/Icons.tsx';

const VIEW_TO_PATH: Record<View, string> = {
  'home': '/',
  'myservice': '/manage-plan',
  'wallet': '/wallet',
  'make-payment': '/pay',
  'requests': '/requests',
  'referrals': '/referrals',
  'help': '/help',
  'profile-settings': '/settings',
};

const PATH_TO_VIEW: Record<string, View> = Object.fromEntries(
  Object.entries(VIEW_TO_PATH).map(([view, path]) => [path, view as View])
) as Record<string, View>;

const AUTH_PATHS: Record<string, 'login' | 'register' | 'forgot-password'> = {
  '/login': 'login',
  '/register': 'register',
  '/forgot-password': 'forgot-password',
};

function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

function getViewFromPath(pathname: string): View | null {
  const normalized = normalizePath(pathname);
  return PATH_TO_VIEW[normalized] ?? null;
}

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authView, setAuthView] = useState<'login' | 'register' | 'forgot-password' | 'reset-password'>(() => {
    const path = normalizePath(window.location.pathname);
    if (path === '/reset-password') return 'reset-password';
    return AUTH_PATHS[path] || 'login';
  });
  const [authError, setAuthError] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [pendingTransferToken, setPendingTransferToken] = useState<string | null>(() => {
    const path = normalizePath(window.location.pathname);
    if (path === '/accept-transfer') {
      return new URLSearchParams(window.location.search).get('token');
    }
    return new URLSearchParams(window.location.search).get('transfer') || null;
  });
  const [registrationPrefill, setRegistrationPrefill] = useState<{firstName?: string; lastName?: string; email?: string} | null>(null);
  const [loginPrefillEmail, setLoginPrefillEmail] = useState<string>('');
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentView, setCurrentViewRaw] = useState<View>(() => getViewFromPath(window.location.pathname) || 'home');
  const [pendingDeepLink, setPendingDeepLink] = useState<View | null>(() => {
    const path = normalizePath(window.location.pathname);
    if (AUTH_PATHS[path] || path === '/reset-password' || path === '/login') return null;
    return getViewFromPath(path);
  });
  const [pendingDeepLinkQuery, setPendingDeepLinkQuery] = useState<string>(() => {
    return window.location.search ? window.location.search.slice(1) : '';
  });
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [postNavAction, setPostNavAction] = useState<PostNavAction | null>(null);
  const [impersonating, setImpersonating] = useState(false);
  const [impersonatedBy, setImpersonatedBy] = useState<string | null>(null);

  const [initialLoading, setInitialLoading] = useState(true);

  const setCurrentView = useCallback((view: View, queryString?: string) => {
    setCurrentViewRaw(view);
    const targetPath = VIEW_TO_PATH[view] || '/';
    const fullPath = queryString ? `${targetPath}?${queryString}` : targetPath;
    if (window.location.pathname !== targetPath || queryString) {
      window.history.pushState({ view }, '', fullPath);
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const pathname = normalizePath(window.location.pathname);
      if (!isAuthenticated) {
        if (pathname === '/reset-password') {
          const token = new URLSearchParams(window.location.search).get('token');
          if (token) {
            setResetToken(token);
            setAuthView('reset-password');
          }
        } else {
          setAuthView(AUTH_PATHS[pathname] || 'login');
        }
      } else {
        const view = getViewFromPath(pathname);
        if (view) {
          setCurrentViewRaw(view);
        } else {
          setCurrentViewRaw('home');
          window.history.replaceState({ view: 'home' }, '', '/');
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isAuthenticated]);

  const properties = useMemo(() => user?.properties || [], [user]);
  const selectedProperty = useMemo(() => 
    selectedPropertyId === 'all' ? null : properties.find(p => p.id === selectedPropertyId) || null
  , [selectedPropertyId, properties]);

  const fetchUserAndSetState = useCallback((userData: any) => {
    setImpersonating(!!userData.impersonating);
    setImpersonatedBy(userData.impersonatedBy || null);
    setUser(userData);
    if (userData.properties && userData.properties.length > 0) {
        if (userData.properties.length > 1) {
            setSelectedPropertyId('all');
        } else {
            setSelectedPropertyId(userData.properties[0].id);
        }
    } else {
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
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (window.location.pathname === '/reset-password' && token) {
      setResetToken(token);
      setAuthView('reset-password');
      setInitialLoading(false);
      return;
    }

    const googleError = urlParams.get('error');
    if (googleError) {
      const errorMessages: Record<string, string> = {
        google_auth_failed: 'Google sign-in failed. Please try again.',
        google_token_failed: 'Google authentication error. Please try again.',
        google_email_not_verified: 'Your Google email is not verified.',
        google_not_configured: 'Google sign-in is not available right now.',
      };
      setAuthError(errorMessages[googleError] || 'Sign-in failed. Please try again.');
      window.history.replaceState({}, '', '/login');
    }

    getUser()
      .then((userData) => {
        fetchUserAndSetState(userData);
        setIsAuthenticated(true);
        const pathname = normalizePath(window.location.pathname);
        if (userData.isAdmin && !userData.impersonating && !pathname.startsWith('/accept-transfer')) {
          window.location.href = '/admin/';
          return;
        }
        if (pathname === '/accept-transfer') {
          setPendingDeepLink(null);
          return;
        }
        const deepLinkedView = getViewFromPath(pathname);
        const search = window.location.search;
        if (userData.properties && userData.properties.length === 0) {
          setCurrentViewRaw('myservice');
          const managePlanPath = VIEW_TO_PATH['myservice'] + (search || '');
          window.history.replaceState({ view: 'myservice' }, '', managePlanPath);
        } else if (deepLinkedView && deepLinkedView !== 'home') {
          setCurrentViewRaw(deepLinkedView);
          window.history.replaceState({ view: deepLinkedView }, '', pathname + search);
        } else {
          setCurrentViewRaw('home');
          window.history.replaceState({ view: 'home' }, '', '/');
        }
        setPendingDeepLink(null);
      })
      .catch(() => {
        const pathname = normalizePath(window.location.pathname);
        if (pathname !== '/reset-password' && pathname !== '/accept-transfer' && !AUTH_PATHS[pathname]) {
          setAuthView('login');
          window.history.replaceState({}, '', '/login');
        }
      })
      .finally(() => setInitialLoading(false));
  }, [fetchUserAndSetState]);

  useEffect(() => {
    if (postNavAction) {
        setCurrentView(postNavAction.targetView);
    }
  }, [postNavAction, setCurrentView]);

  const handleLogin = useCallback(async (email: string, password: string): Promise<void> => {
    setAuthError(null);
    try {
      const userData = await login(email, password);
      fetchUserAndSetState(userData);
      setIsAuthenticated(true);
      if (userData.isAdmin && !pendingTransferToken) {
        window.location.href = '/admin/';
        return;
      }
      if (pendingTransferToken) {
        return;
      }
      if (userData.properties && userData.properties.length === 0) {
        setCurrentView('myservice', pendingDeepLinkQuery || undefined);
      } else if (pendingDeepLink && pendingDeepLink !== 'home') {
        setCurrentView(pendingDeepLink, pendingDeepLinkQuery || undefined);
        setPendingDeepLink(null);
      } else {
        setCurrentView('home');
      }
      setPendingDeepLinkQuery('');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "An unknown error occurred.");
    }
  }, [fetchUserAndSetState, setCurrentView, pendingDeepLink, pendingDeepLinkQuery, pendingTransferToken]);

  const handleRegister = useCallback(async (registrationInfo: RegistrationInfo): Promise<void> => {
     setAuthError(null);
    try {
      const userData = await register(registrationInfo);
      fetchUserAndSetState(userData);
      setIsAuthenticated(true);
      if (pendingTransferToken) {
        return;
      }
      setCurrentView('myservice', pendingDeepLinkQuery || undefined); 
      setPendingDeepLinkQuery('');
    } catch (error)
    {
      setAuthError(error instanceof Error ? error.message : "An unknown error occurred.");
    }
  }, [fetchUserAndSetState, setCurrentView, pendingDeepLinkQuery, pendingTransferToken]);

  const handleLogout = useCallback(async (): Promise<void> => {
    await logout();
    setIsAuthenticated(false);
    setUser(null);
    setSelectedPropertyId(null);
    setAuthView('login');
    setCurrentViewRaw('home');
    window.history.replaceState({}, '', '/login');
  }, []);
  
  const handleGoogleAuthSuccess = useCallback(async () => {
    try {
      const userData = await getUser();
      fetchUserAndSetState(userData);
      setIsAuthenticated(true);
      if (userData.isAdmin) {
        window.location.href = '/admin/';
        return;
      }
      if (userData.properties && userData.properties.length === 0) {
        setCurrentView('myservice', pendingDeepLinkQuery || undefined);
      } else if (pendingDeepLink && pendingDeepLink !== 'home') {
        setCurrentView(pendingDeepLink, pendingDeepLinkQuery || undefined);
        setPendingDeepLink(null);
      } else {
        setCurrentView('home');
      }
      setPendingDeepLinkQuery('');
    } catch (error) {
      setAuthError('Google sign-in completed but session check failed. Please try logging in.');
    }
  }, [fetchUserAndSetState, setCurrentView, pendingDeepLink, pendingDeepLinkQuery]);

  const startNewServiceFlow = useCallback(() => {
    setSelectedPropertyId(null);
    setCurrentView('myservice');
  }, [setCurrentView]);

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
  }, [refreshUser, setCurrentView]);

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
      case 'myservice': return <MyServiceHub onCompleteSetup={handleCompleteSetup} />;
      case 'wallet': return <WalletHub />;
      case 'make-payment': return <MakePaymentHub />;
      case 'requests': return <RequestsHub />;
      case 'referrals': return <ReferralsHub />;
      case 'help': return <Support />;
      case 'profile-settings': return <SettingsHub />;
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

  if (pendingTransferToken) {
    const handleTransferAccepted = async () => {
      setPendingTransferToken(null);
      try {
        const userData = await getUser();
        fetchUserAndSetState(userData);
      } catch {}
      setCurrentView('home');
      window.history.replaceState({}, '', '/');
    };

    if (!isAuthenticated) {
      if (authView === 'register' || authView === 'login') {
        const switchToLogin = () => {
          setAuthView('login');
          setAuthError(null);
        };
        const switchToRegister = () => {
          setAuthView('register');
          setAuthError(null);
        };
        const switchToForgotPassword = () => {
          setAuthView('forgot-password');
          setAuthError(null);
        };
        return (
          <AuthLayout>
            {authView === 'register' ? (
              <Registration onRegister={handleRegister} switchToLogin={switchToLogin} error={authError} pendingQueryString={pendingDeepLinkQuery} prefill={registrationPrefill || undefined} onGoogleAuthSuccess={handleGoogleAuthSuccess} />
            ) : (
              <Login onLogin={handleLogin} switchToRegister={switchToRegister} switchToForgotPassword={switchToForgotPassword} error={authError} pendingQueryString={pendingDeepLinkQuery} prefillEmail={loginPrefillEmail} onGoogleAuthSuccess={handleGoogleAuthSuccess} />
            )}
          </AuthLayout>
        );
      }

      return (
        <AcceptTransfer
          token={pendingTransferToken}
          isAuthenticated={false}
          onAccepted={handleTransferAccepted}
          onSwitchToLogin={(prefill) => {
            setLoginPrefillEmail(prefill?.email || '');
            setAuthView('login');
            setAuthError(null);
          }}
          onSwitchToRegister={(prefill) => {
            setRegistrationPrefill(prefill || null);
            setAuthView('register');
            setAuthError(null);
          }}
        />
      );
    }

    return (
      <AcceptTransfer
        token={pendingTransferToken}
        isAuthenticated={true}
        onAccepted={handleTransferAccepted}
        onSwitchToLogin={() => {}}
        onSwitchToRegister={() => {}}
      />
    );
  }

  if (!isAuthenticated) {
    const switchToLogin = () => {
      window.history.replaceState({}, '', '/login');
      setResetToken(null);
      setAuthView('login');
      setAuthError(null);
    };

    const switchToRegister = () => {
      window.history.pushState({}, '', '/register');
      setAuthView('register');
      setAuthError(null);
    };

    const switchToForgotPassword = () => {
      window.history.pushState({}, '', '/forgot-password');
      setAuthView('forgot-password');
      setAuthError(null);
    };

    return (
      <AuthLayout>
        {authView === 'reset-password' && resetToken ? (
            <ResetPassword token={resetToken} switchToLogin={switchToLogin} />
        ) : authView === 'forgot-password' ? (
            <ForgotPassword switchToLogin={switchToLogin} />
        ) : authView === 'register' ? (
            <Registration onRegister={handleRegister} switchToLogin={switchToLogin} error={authError} pendingQueryString={pendingDeepLinkQuery} onGoogleAuthSuccess={handleGoogleAuthSuccess} />
        ) : (
            <Login onLogin={handleLogin} switchToRegister={switchToRegister} switchToForgotPassword={switchToForgotPassword} error={authError} pendingQueryString={pendingDeepLinkQuery} onGoogleAuthSuccess={handleGoogleAuthSuccess} />
        )}
      </AuthLayout>
    );
  }
  
  const handleStopImpersonation = async () => {
    try {
      const res = await fetch('/api/admin/stop-impersonate', { method: 'POST', credentials: 'include' });
      if (res.ok) {
        window.location.href = '/admin/';
      }
    } catch {}
  };

  return (
    <StripeProvider>
      <PropertyContext.Provider value={contextValue}>
        <div className="flex h-screen bg-base-100 text-neutral">
          <Sidebar currentView={currentView} setCurrentView={setCurrentView} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} onLogout={handleLogout} />
          <div className="flex-1 flex flex-col overflow-hidden">
            {impersonating && (
              <div className="bg-indigo-600 text-white px-4 py-2 flex items-center justify-between text-sm shrink-0 z-50">
                <div className="flex items-center gap-2">
                  <ExclamationTriangleIcon className="w-4 h-4" />
                  <span>
                    <span className="font-bold">Admin View</span> — You are viewing as {user?.firstName} {user?.lastName} ({user?.email})
                    {impersonatedBy && <span className="opacity-75"> | Signed in by {impersonatedBy}</span>}
                  </span>
                </div>
                <button
                  onClick={handleStopImpersonation}
                  className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg font-bold transition-colors"
                >
                  Back to Admin
                </button>
              </div>
            )}
            <Header currentView={currentView} setCurrentView={setCurrentView} onAddPropertyClick={startNewServiceFlow} onToggleSidebar={() => setIsSidebarOpen(o => !o)} />
            <main className="flex-1 overflow-x-hidden overflow-y-auto bg-base-100 p-4 sm:p-6 lg:p-8">
              <div className="max-w-7xl mx-auto w-full">
                {renderView()}
              </div>
            </main>
          </div>
        </div>
        {user && <ChatWidget userId={user.id} />}
      </PropertyContext.Provider>
    </StripeProvider>
  );
};

export default App;