/** Roles are plain strings so new roles can be added without touching the auth feature; the app maps role -> landing page (src/app/roles.ts). */
export type Role = 'supervisor' | 'configurator';

export interface UserRecord {
  username: string;
  /** PROTOTYPE ONLY: plain text on purpose (no encryption requested). Replace with a real backend before any real use. */
  password: string;
  role: Role;
  name: string;      // display name
  title: string;     // role title shown under the name
  avatar: string;    // image url
}
/** What the rest of the app may see: never the password. */
export type PublicUser = Omit<UserRecord, 'password'>;
