import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../components/Card.tsx';
import { Button } from '../components/Button.tsx';
import {
  UsersIcon,
  ChartPieIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
} from '../components/Icons.tsx';
import DashboardView from './components/dashboard/DashboardView.tsx';
import PeopleView from './components/people/PeopleView.tsx';
import AccountingView from './components/accounting/AccountingView.tsx';
import type { AccountingTabType } from './components/accounting/AccountingView.tsx';
import OperationsView from './components/operations/OperationsView.tsx';
import type { OpsTabType } from './components/operations/OperationsView.tsx';
import SystemView from './components/system/SystemView.tsx';
import type { SystemTabType } from './components/system/SystemView.tsx';
import CommunicationsView from './components/communications/CommunicationsView.tsx';
import type { CommsTabType } from './components/communications/CommunicationsView.tsx';
import AdminAuthLayout from './components/auth/AdminAuthLayout.tsx';
import AdminLogin from './components/auth/AdminLogin.tsx';
import AdminAcceptInvite from './components/auth/AdminAcceptInvite.tsx';
import type { NavFilter } from '../shared/types/index.ts';

interface AdminUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isAdmin: boolean;
}

type AdminView = 'dashboard' | 'people' | 'accounting' | 'operations' | 'communications' | 'system';

const VIEW_TO_PATH: Record<AdminView, string> = {
  dashboard: '/admin',
  people: '/admin/people',
  accounting: '/admin/accounting',
  operations: '/admin/operations',
  communications: '/admin/communications',
  system: '/admin/system',
};

const PATH_TO_VIEW: Record<string, AdminView> = Object.fromEntries(
  Object.entries(VIEW_TO_PATH).map(([view, path]) => [path, view as AdminView])
) as Record<string, AdminView>;

const OPS_TAB_TO_PATH: Record<OpsTabType, string> = {
  'address-review': '/admin/operations/address-review',
  routes: '/admin/operations',
  orders: '/admin/operations/orders',
  'route-jobs': '/admin/operations/jobs',
  'missed-pickups': '/admin/operations/missed',
  'pickup-schedule': '/admin/operations/schedule',
  'customer-sync': '/admin/operations/customer-sync',
};

const OPS_PATH_TO_TAB: Record<string, OpsTabType> = Object.fromEntries(
  Object.entries(OPS_TAB_TO_PATH).map(([tab, path]) => [path, tab as OpsTabType])
) as Record<string, OpsTabType>;

const SYSTEM_TAB_TO_PATH: Record<SystemTabType, string> = {
  audit: '/admin/system',
  errors: '/admin/system/errors',
  settings: '/admin/system/settings',
  integrations: '/admin/system/integrations',
};
const SYSTEM_PATH_TO_TAB: Record<string, SystemTabType> = Object.fromEntries(
  Object.entries(SYSTEM_TAB_TO_PATH).map(([tab, path]) => [path, tab as SystemTabType])
) as Record<string, SystemTabType>;

const COMMS_TAB_TO_PATH: Record<CommsTabType, string> = {
  inbox: '/admin/communications',
  compose: '/admin/communications/compose',
  templates: '/admin/communications/templates',
  activity: '/admin/communications/activity',
};
const COMMS_PATH_TO_TAB: Record<string, CommsTabType> = Object.fromEntries(
  Object.entries(COMMS_TAB_TO_PATH).map(([tab, path]) => [path, tab as CommsTabType])
) as Record<string, CommsTabType>;

const ACCT_TAB_TO_PATH: Record<AccountingTabType, string> = {
  overview: '/admin/accounting',
  income: '/admin/accounting/income',
  expenses: '/admin/accounting/expenses',
  invoices: '/admin/accounting/invoices',
  'customer-billing': '/admin/accounting/customer-billing',
};
const ACCT_PATH_TO_TAB: Record<string, AccountingTabType> = Object.fromEntries(
  Object.entries(ACCT_TAB_TO_PATH).map(([tab, path]) => [path, tab as AccountingTabType])
) as Record<string, AccountingTabType>;

function parseAdminPath(pathname: string): { view: AdminView; personId: string | null; opsTab: OpsTabType | null; systemTab: SystemTabType | null; commsTab: CommsTabType | null; acctTab: AccountingTabType | null } {
  const normalized = pathname.replace(/\/+$/, '') || '/admin';
  const base = { personId: null, opsTab: null, systemTab: null, commsTab: null, acctTab: null };
  const personMatch = normalized.match(/^\/admin\/people\/([a-f0-9-]+)$/i);
  if (personMatch) return { ...base, view: 'people', personId: personMatch[1] };
  if (normalized.startsWith('/admin/operations')) {
    return { ...base, view: 'operations', opsTab: OPS_PATH_TO_TAB[normalized] || 'routes' };
  }
  if (normalized.startsWith('/admin/system')) {
    return { ...base, view: 'system', systemTab: SYSTEM_PATH_TO_TAB[normalized] || 'audit' };
  }
  if (normalized.startsWith('/admin/communications')) {
    return { ...base, view: 'communications', commsTab: COMMS_PATH_TO_TAB[normalized] || 'inbox' };
  }
  if (normalized.startsWith('/admin/accounting')) {
    return { ...base, view: 'accounting', acctTab: ACCT_PATH_TO_TAB[normalized] || 'overview' };
  }
  // Backward compat: /admin/billing → accounting/customer-billing
  if (normalized.startsWith('/admin/billing')) {
    return { ...base, view: 'accounting', acctTab: 'customer-billing' };
  }
  return { ...base, view: PATH_TO_VIEW[normalized] || 'dashboard' };
}

function buildAdminUrl(view: AdminView, opts?: { personId?: string | null; search?: string | null; opsTab?: OpsTabType | null; systemTab?: SystemTabType | null; commsTab?: CommsTabType | null; acctTab?: AccountingTabType | null }): string {
  if (view === 'people' && opts?.personId) return `/admin/people/${opts.personId}`;
  if (view === 'operations' && opts?.opsTab) return OPS_TAB_TO_PATH[opts.opsTab] || '/admin/operations';
  if (view === 'system' && opts?.systemTab) return SYSTEM_TAB_TO_PATH[opts.systemTab] || '/admin/system';
  if (view === 'communications' && opts?.commsTab) return COMMS_TAB_TO_PATH[opts.commsTab] || '/admin/communications';
  if (view === 'accounting' && opts?.acctTab) return ACCT_TAB_TO_PATH[opts.acctTab] || '/admin/accounting';
  const base = VIEW_TO_PATH[view] || '/admin';
  if (opts?.search) return `${base}?search=${encodeURIComponent(opts.search)}`;
  return base;
}

const CurrencyIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </svg>
);

const TruckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
  </svg>
);

const ChatIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
  </svg>
);

const CogIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
  </svg>
);

const PeopleIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
  </svg>
);

const AdminApp: React.FC = () => {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const initialParsed = parseAdminPath(window.location.pathname);
  const initialSearch = new URLSearchParams(window.location.search).get('search');
  const [currentView, setCurrentViewRaw] = useState<AdminView>(initialParsed.view);
  const [selectedPersonId, setSelectedPersonIdRaw] = useState<string | null>(initialParsed.personId);
  const [opsTab, setOpsTabRaw] = useState<OpsTabType>(initialParsed.opsTab || 'routes');
  const [systemTab, setSystemTabRaw] = useState<SystemTabType>(initialParsed.systemTab || 'audit');
  const [commsTab, setCommsTabRaw] = useState<CommsTabType>(initialParsed.commsTab || 'conversations');
  const [acctTab, setAcctTabRaw] = useState<AccountingTabType>(initialParsed.acctTab || 'overview');
  const [navFilter, setNavFilter] = useState<NavFilter | null>(initialSearch ? { search: initialSearch } : null);
  const [pendingDeepLink] = useState(() => {
    const parsed = parseAdminPath(window.location.pathname);
    if (parsed.view !== 'dashboard' || parsed.personId) return { view: parsed.view, personId: parsed.personId, search: initialSearch, opsTab: parsed.opsTab, systemTab: parsed.systemTab, commsTab: parsed.commsTab, acctTab: parsed.acctTab };
    return null;
  });
  const [inviteToken] = useState<string | null>(() => {
    const pathname = window.location.pathname.replace(/\/+$/, '');
    if (pathname === '/admin/accept-invite') {
      return new URLSearchParams(window.location.search).get('token');
    }
    return null;
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);

  const navigateTo = useCallback((view: AdminView, filter?: NavFilter) => {
    setNavFilter(filter || null);
    setCurrentViewRaw(view);
    setSelectedPersonIdRaw(null);
    if (view === 'operations') setOpsTabRaw('routes');
    if (view === 'system') setSystemTabRaw('audit');
    if (view === 'communications') setCommsTabRaw('conversations');
    if (view === 'accounting') setAcctTabRaw(filter?.tab as AccountingTabType || 'overview');
    const url = buildAdminUrl(view, { search: filter?.search, acctTab: filter?.tab as AccountingTabType });
    window.history.pushState({ view }, '', url);
  }, []);

  const handleOpsTabChange = useCallback((tab: OpsTabType) => {
    setOpsTabRaw(tab);
    const url = OPS_TAB_TO_PATH[tab] || '/admin/operations';
    window.history.pushState({ view: 'operations', opsTab: tab }, '', url);
  }, []);

  const handleSystemTabChange = useCallback((tab: SystemTabType) => {
    setSystemTabRaw(tab);
    const url = SYSTEM_TAB_TO_PATH[tab] || '/admin/system';
    window.history.pushState({ view: 'system', systemTab: tab }, '', url);
  }, []);

  const handleCommsTabChange = useCallback((tab: CommsTabType) => {
    setCommsTabRaw(tab);
    const url = COMMS_TAB_TO_PATH[tab] || '/admin/communications';
    window.history.pushState({ view: 'communications', commsTab: tab }, '', url);
  }, []);

  const handleAcctTabChange = useCallback((tab: AccountingTabType) => {
    setAcctTabRaw(tab);
    const url = ACCT_TAB_TO_PATH[tab] || '/admin/accounting';
    window.history.pushState({ view: 'accounting', acctTab: tab }, '', url);
  }, []);

  const selectPerson = useCallback((id: string) => {
    setSelectedPersonIdRaw(id);
    setCurrentViewRaw('people');
    window.history.pushState({ view: 'people', personId: id }, '', `/admin/people/${id}`);
  }, []);

  const deselectPerson = useCallback(() => {
    setSelectedPersonIdRaw(null);
    window.history.pushState({ view: 'people' }, '', '/admin/people');
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const parsed = parseAdminPath(window.location.pathname);
      setCurrentViewRaw(parsed.view);
      setSelectedPersonIdRaw(parsed.personId);
      if (parsed.view === 'operations') setOpsTabRaw(parsed.opsTab || 'routes');
      if (parsed.view === 'system') setSystemTabRaw(parsed.systemTab || 'audit');
      if (parsed.view === 'communications') setCommsTabRaw(parsed.commsTab || 'conversations');
      if (parsed.view === 'accounting') setAcctTabRaw(parsed.acctTab || 'overview');
      const search = new URLSearchParams(window.location.search).get('search');
      setNavFilter(search ? { search } : null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleAdminLogin = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const json = await res.json();

      if (!res.ok) {
        setAuthError(json.error || 'Login failed');
        return;
      }

      // Check if user is admin
      if (!json.data?.isAdmin) {
        setAuthError('You do not have admin privileges. Please use the Client Portal to sign in.');
        return;
      }

      setUser(json.data);
      if (pendingDeepLink) {
        setCurrentViewRaw(pendingDeepLink.view);
        setSelectedPersonIdRaw(pendingDeepLink.personId);
        if (pendingDeepLink.search) setNavFilter({ search: pendingDeepLink.search });
        if (pendingDeepLink.opsTab) setOpsTabRaw(pendingDeepLink.opsTab);
        if (pendingDeepLink.systemTab) setSystemTabRaw(pendingDeepLink.systemTab);
        if (pendingDeepLink.commsTab) setCommsTabRaw(pendingDeepLink.commsTab);
        if (pendingDeepLink.acctTab) setAcctTabRaw(pendingDeepLink.acctTab);
      }
      setAuthChecked(true);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'An error occurred during login');
    }
  }, [pendingDeepLink]);

  const handleGoogleAuthSuccess = useCallback(async () => {
    setAuthError(null);
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (!res.ok) {
        setAuthError('Google sign-in failed. Please try again.');
        return;
      }
      const json = await res.json();
      if (!json.data?.isAdmin) {
        setAuthError('You do not have admin privileges. Please use the Client Portal to sign in.');
        return;
      }
      setUser(json.data);
      if (pendingDeepLink) {
        setCurrentViewRaw(pendingDeepLink.view);
        setSelectedPersonIdRaw(pendingDeepLink.personId);
        if (pendingDeepLink.search) setNavFilter({ search: pendingDeepLink.search });
        if (pendingDeepLink.opsTab) setOpsTabRaw(pendingDeepLink.opsTab);
        if (pendingDeepLink.systemTab) setSystemTabRaw(pendingDeepLink.systemTab);
        if (pendingDeepLink.commsTab) setCommsTabRaw(pendingDeepLink.commsTab);
        if (pendingDeepLink.acctTab) setAcctTabRaw(pendingDeepLink.acctTab);
      }
      setAuthChecked(true);
    } catch {
      setAuthError('Google sign-in failed. Please try again.');
    }
  }, [pendingDeepLink]);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => {
        if (!r.ok) throw new Error('Not authenticated');
        return r.json();
      })
      .then(json => {
        if (json.data?.isAdmin) {
          setUser(json.data);
          // Deep link is already set from initial state
        }
      })
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, []);

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
    setCurrentViewRaw('dashboard');
    setSelectedPersonIdRaw(null);
    setNavFilter(null);
    window.history.replaceState({}, '', '/admin');
  }, []);

  const handleInviteComplete = useCallback((adminUser: AdminUser) => {
    setUser(adminUser);
    setAuthChecked(true);
    window.history.replaceState({}, '', '/admin');
  }, []);

  const handleGlobalSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults(null); return; }
    try {
      const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`, { credentials: 'include' });
      if (res.ok) setSearchResults(await res.json());
    } catch {}
  }, []);

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  if (inviteToken && !user) {
    return <AdminAcceptInvite token={inviteToken} onComplete={handleInviteComplete} />;
  }

  if (!user) {
    return (
      <AdminAuthLayout error={authError}>
        <AdminLogin onLogin={handleAdminLogin} onGoogleAuthSuccess={handleGoogleAuthSuccess} />
      </AdminAuthLayout>
    );
  }

  const navItems: { view: AdminView; label: string; icon: React.ReactNode }[] = [
    { view: 'dashboard', label: 'Dashboard', icon: <ChartPieIcon className="w-5 h-5" /> },
    { view: 'operations', label: 'Operations', icon: <TruckIcon className="w-5 h-5" /> },
    { view: 'people', label: 'People', icon: <PeopleIcon className="w-5 h-5" /> },
    { view: 'communications', label: 'Communications', icon: <ChatIcon className="w-5 h-5" /> },
    { view: 'accounting', label: 'Accounting', icon: <CurrencyIcon className="w-5 h-5" /> },
    { view: 'system', label: 'System', icon: <CogIcon className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-gray-900 text-white transform transition-transform lg:translate-x-0 lg:static lg:inset-auto ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <ShieldCheckIcon className="w-8 h-8 text-teal-400" />
            <div>
              <h1 className="text-lg font-black tracking-tight">Admin Portal</h1>
              <p className="text-xs text-gray-400">Waste Management</p>
            </div>
          </div>
        </div>

        <nav className="p-4 space-y-1">
          {navItems.map(item => (
            <button
              key={item.view}
              onClick={() => { navigateTo(item.view); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-colors ${
                currentView === item.view
                  ? 'bg-teal-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center text-xs font-black flex-shrink-0">
              {user.firstName[0]}{user.lastName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{user.firstName} {user.lastName}</p>
              <p className="text-xs text-gray-400 truncate">{user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15m-3 0-3-3m0 0 3-3m-3 3H15" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <main className="flex-1 min-w-0">
        <header className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-gray-500 hover:text-gray-900">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <h2 className="text-lg font-black text-gray-900">
            {navItems.find(n => n.view === currentView)?.label || 'Admin'}
          </h2>
          <div className="ml-auto relative">
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className="text-gray-400 hover:text-gray-600 transition-colors p-2 rounded-lg hover:bg-gray-100"
            >
              <MagnifyingGlassIcon className="w-5 h-5" />
            </button>
            {searchOpen && (
              <div className="absolute right-0 top-12 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => handleGlobalSearch(e.target.value)}
                  placeholder="Search customers, properties..."
                  className="w-full px-4 py-3 text-sm border-b border-gray-100 rounded-t-xl focus:outline-none"
                  autoFocus
                />
                {searchResults && (
                  <div className="max-h-80 overflow-y-auto p-2">
                    {searchResults.users?.length > 0 && (
                      <div className="mb-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 px-2 py-1">Customers</p>
                        {searchResults.users.map((u: any) => (
                          <button key={u.id} onClick={() => { navigateTo('people', { search: u.email }); setSearchOpen(false); setSearchQuery(''); setSearchResults(null); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm">
                            <p className="font-bold text-gray-900">{u.first_name} {u.last_name}</p>
                            <p className="text-xs text-gray-400">{u.email}</p>
                          </button>
                        ))}
                      </div>
                    )}
                    {searchResults.properties?.length > 0 && (
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 px-2 py-1">Properties</p>
                        {searchResults.properties.map((p: any) => (
                          <button key={p.id} onClick={() => { navigateTo('people', { search: p.address }); setSearchOpen(false); setSearchQuery(''); setSearchResults(null); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm">
                            <p className="font-bold text-gray-900">{p.address}</p>
                            <p className="text-xs text-gray-400">{p.owner_name} · {p.service_type}</p>
                          </button>
                        ))}
                      </div>
                    )}
                    {(!searchResults.users?.length && !searchResults.properties?.length) && (
                      <p className="text-sm text-gray-400 text-center py-4">No results found</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        <div className="p-4 sm:p-6 lg:p-8">
          {currentView === 'dashboard' && <DashboardView onNavigate={navigateTo} navFilter={navFilter} onFilterConsumed={() => setNavFilter(null)} />}
          {currentView === 'people' && <PeopleView navFilter={navFilter} onFilterConsumed={() => setNavFilter(null)} selectedPersonId={selectedPersonId} onSelectPerson={selectPerson} onBack={deselectPerson} />}
          {currentView === 'accounting' && <AccountingView navFilter={navFilter} onFilterConsumed={() => setNavFilter(null)} activeTab={acctTab} onTabChange={handleAcctTabChange} />}
          {currentView === 'operations' && <OperationsView navFilter={navFilter} onFilterConsumed={() => setNavFilter(null)} activeTab={opsTab} onTabChange={handleOpsTabChange} />}
          {currentView === 'communications' && <CommunicationsView activeTab={commsTab} onTabChange={handleCommsTabChange} />}
          {currentView === 'system' && <SystemView activeTab={systemTab} onTabChange={handleSystemTabChange} />}
        </div>
      </main>
    </div>
  );
};

export default AdminApp;
