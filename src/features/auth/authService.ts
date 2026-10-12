import { USERS } from './users';
import type { PublicUser, UserRecord } from './types';

const strip = ({ password: _pw, ...user }: UserRecord): PublicUser => user;

export function findUser(username: string): PublicUser | null {
  const u = USERS.find((x) => x.username === username.trim().toLowerCase());
  return u ? strip(u) : null;
}

/** Pure credential check (username is case-insensitive, password exact). Swap for an API call later; callers only use the result. */
export function authenticate(username: string, password: string): PublicUser | null {
  const u = USERS.find((x) => x.username === username.trim().toLowerCase());
  return u && u.password === password ? strip(u) : null;
}
