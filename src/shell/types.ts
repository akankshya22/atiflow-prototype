import type { ReactNode } from 'react';

export interface NavItem { id: string; label: string; icon: string; active?: boolean; badge?: number; onSelect?: () => void }
export interface NavGroup { id: string; label?: string; items: NavItem[]; extra?: ReactNode }
export interface NavModel { groups: NavGroup[]; footerItems: NavItem[] }
export interface SearchHit { kind: string; title: string; sub?: string; go?(): void; /** Route to open (the top bar navigates there). */ to?: string }
