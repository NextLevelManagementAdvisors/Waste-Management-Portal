export type DriverView =
  | 'dashboard'
  | 'routes'
  | 'schedule'
  | 'pickups'
  | 'zones'
  | 'contracts'
  | 'messages'
  | 'profile';

export type ProviderTab =
  | 'overview'
  | 'team'
  | 'clients'
  | 'fleet'
  | 'roles'
  | 'dispatch'
  | 'accounting';

export type TeamPortalContext = 'provider' | 'driver';
export type TeamAuthMode = 'login' | 'register';

export const DRIVER_VIEW_TO_PATH: Record<DriverView, string> = {
  dashboard: '/driver',
  routes: '/driver/routes',
  schedule: '/driver/schedule',
  pickups: '/driver/pickups',
  zones: '/driver/zones',
  contracts: '/driver/contracts',
  messages: '/driver/messages',
  profile: '/driver/profile',
};

export const PROVIDER_TAB_TO_PATH: Record<ProviderTab, string> = {
  overview: '/provider',
  team: '/provider/team',
  clients: '/provider/clients',
  fleet: '/provider/fleet',
  roles: '/provider/roles',
  dispatch: '/provider/dispatch',
  accounting: '/provider/accounting',
};

const DRIVER_PATH_TO_VIEW = Object.fromEntries(
  Object.entries(DRIVER_VIEW_TO_PATH).map(([view, path]) => [path, view as DriverView])
) as Record<string, DriverView>;

const PROVIDER_PATH_TO_TAB = Object.fromEntries(
  Object.entries(PROVIDER_TAB_TO_PATH).map(([tab, path]) => [path, tab as ProviderTab])
) as Record<string, ProviderTab>;

const EXPLICIT_AUTH_PATHS = new Set<string>([
  '/provider/login',
  '/provider/register',
  '/driver/login',
  '/driver/register',
]);

export function normalizeTeamPath(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, '');
  return normalized || '/';
}

export function isProviderPath(pathname: string): boolean {
  const normalized = normalizeTeamPath(pathname);
  return normalized === '/provider' || normalized.startsWith('/provider/');
}

export function isDriverPath(pathname: string): boolean {
  const normalized = normalizeTeamPath(pathname);
  return normalized === '/driver' || normalized.startsWith('/driver/');
}

export function getPortalContextFromPath(pathname: string): TeamPortalContext | null {
  if (isProviderPath(pathname)) return 'provider';
  if (isDriverPath(pathname)) return 'driver';
  return null;
}

export function getDriverViewFromPath(pathname: string): DriverView {
  return DRIVER_PATH_TO_VIEW[normalizeTeamPath(pathname)] || 'dashboard';
}

export function getProviderTabFromPath(pathname: string): ProviderTab {
  return PROVIDER_PATH_TO_TAB[normalizeTeamPath(pathname)] || 'overview';
}

export function isExplicitAuthPath(pathname: string): boolean {
  return EXPLICIT_AUTH_PATHS.has(normalizeTeamPath(pathname));
}

export function getAuthModeFromPath(pathname: string): TeamAuthMode {
  const normalized = normalizeTeamPath(pathname);
  if (normalized === '/provider/register' || normalized === '/driver/register') return 'register';
  if (normalized === '/provider' || normalized === '/driver') return 'register';
  return 'login';
}

export function getAuthPath(
  portalContext: TeamPortalContext | null | undefined,
  authMode: TeamAuthMode
): string {
  const portal = portalContext === 'provider' ? 'provider' : 'driver';
  return `/${portal}/${authMode}`;
}
