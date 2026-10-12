import { STATE_COLOR } from '@/engine/stateStyle';

export interface LocateHit { kind: 'robot' | 'station'; id: string; sub: string; color: string }

/** Robots and stations whose ID (or station name) contains the query; exact and prefix matches first. Pure, so it is easy to test. */
export function locateHits(q: string, robots: { id: string; state: string }[], stations: { id: string; name: string; type: string }[], limit = 8): LocateHit[] {
  const s = q.trim().toLowerCase().replace(/\s+/g, ''); if (!s) return [];
  const rank = (id: string, extra = '') => { const i = id.toLowerCase(); return i === s ? 0 : i.startsWith(s) ? 1 : i.includes(s) ? 2 : extra.toLowerCase().replace(/\s+/g, '').includes(s) ? 3 : -1; };
  const hits = [
    ...robots.map((r) => ({ hit: { kind: 'robot' as const, id: r.id, sub: r.state, color: STATE_COLOR[r.state as keyof typeof STATE_COLOR] ?? '#94a3b8' }, r: rank(r.id) })),
    ...stations.map((st) => ({ hit: { kind: 'station' as const, id: st.id, sub: st.name, color: '#64748b' }, r: rank(st.id, st.name) })),
  ].filter((h) => h.r >= 0).sort((a, b) => a.r - b.r || a.hit.id.localeCompare(b.hit.id));
  return hits.slice(0, limit).map((h) => h.hit);
}
