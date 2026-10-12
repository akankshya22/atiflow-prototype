import type { UserRecord } from './types';
import arjun from './avatars/arjun.png';
import kavin from './avatars/kavin.png';
import meera from './avatars/meera.png';

/**
 * Prototype user directory (the single place accounts live). Plain-text passwords are intentional for this prototype.
 * To add a user: add a record here. To add a role: extend `Role` in types.ts and register its landing page in src/app/roles.ts.
 */
export const USERS: UserRecord[] = [
  { username: 'arjun', password: '1234', role: 'supervisor',   name: 'Arjun Singh', title: 'Lead Supervisor', avatar: arjun },
  { username: 'kavin', password: '1234', role: 'configurator', name: 'Kavin',       title: 'Ati Support Engineer',    avatar: kavin },
  { username: 'meera', password: '1234', role: 'configurator', name: 'Meera',       title: 'System Integrator',   avatar: meera },
];
