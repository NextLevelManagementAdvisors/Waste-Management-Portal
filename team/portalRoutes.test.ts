import { describe, expect, it } from 'vitest';

import {
  getAuthModeFromPath,
  getAuthPath,
  getDriverViewFromPath,
  getPortalContextFromPath,
  getProviderTabFromPath,
  isExplicitAuthPath,
  isProviderPath,
  normalizeTeamPath,
} from './portalRoutes.ts';

describe('team portal route helpers', () => {
  it('keeps explicit provider auth routes distinct from the dashboard root', () => {
    expect(getPortalContextFromPath('/provider/login')).toBe('provider');
    expect(getAuthModeFromPath('/provider/login')).toBe('login');
    expect(isExplicitAuthPath('/provider/login')).toBe(true);

    expect(getPortalContextFromPath('/provider/register/')).toBe('provider');
    expect(getAuthModeFromPath('/provider/register/')).toBe('register');
    expect(normalizeTeamPath('/provider/register/')).toBe('/provider/register');
  });

  it('treats protected provider pages as login routes when unauthenticated', () => {
    expect(isProviderPath('/provider/team')).toBe(true);
    expect(getProviderTabFromPath('/provider/team')).toBe('team');
    expect(getAuthModeFromPath('/provider/team')).toBe('login');
  });

  it('preserves the bare portal root as the register entry point', () => {
    expect(getAuthModeFromPath('/provider')).toBe('register');
    expect(getAuthModeFromPath('/driver')).toBe('register');
  });

  it('parses driver deep links without treating auth pages as app views', () => {
    expect(getDriverViewFromPath('/driver/routes')).toBe('routes');
    expect(getAuthModeFromPath('/driver/routes')).toBe('login');
    expect(getDriverViewFromPath('/driver/login')).toBe('dashboard');
    expect(isExplicitAuthPath('/driver/login')).toBe(true);
  });

  it('builds explicit auth paths for each portal', () => {
    expect(getAuthPath('provider', 'login')).toBe('/provider/login');
    expect(getAuthPath('provider', 'register')).toBe('/provider/register');
    expect(getAuthPath('driver', 'login')).toBe('/driver/login');
  });
});
