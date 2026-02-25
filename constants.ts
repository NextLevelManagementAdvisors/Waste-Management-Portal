import { View } from './types.ts';

export const VIEW_TO_PATH: Record<View, string> = {
  'home': '/',
  'myservice': '/manage-plan',
  'billing': '/billing',
  'requests': '/requests',
  'referrals': '/referrals',
  'help': '/help',
  'profile-settings': '/settings',
};
