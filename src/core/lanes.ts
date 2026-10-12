import type { Lane, NavGraph, NavNode, Vec2 } from './types';

export interface PathPlan { pts: Vec2[]; laneAt: (string | null)[]; cum: number[]; total: number }

/** Directed lane graph. Routing is fleet-aware: a fleet can only use lanes tagged with it. */
export class LaneGraph {
  nodes = new Map<string, NavNode>(); lanes = new Map<string, Lane>(); out = new Map<string, Lane[]>();
  constructor(public nav: NavGraph) {
    nav.nodes.forEach((n) => { this.nodes.set(n.id, n); this.out.set(n.id, []); });
    for (const l of nav.lanes) { this.lanes.set(l.id, l); this.out.get(l.from)?.push(l); }
  }
  station(id: string) { return this.nav.stations.find((s) => s.id === id); }
  stationNode(id: string) { const s = this.station(id); return s ? this.nodes.get(s.nodeId) : undefined; }
  /** Dijkstra over lanes (a lane is only traversed forward). Returns lanes or null. */
  route(from: string, to: string, fleet: string): Lane[] | null {
    if (!this.nodes.has(from) || !this.nodes.has(to)) return null;
    const dist = new Map<string, number>([[from, 0]]), prev = new Map<string, Lane>(), done = new Set<string>();
    for (;;) {
      let cur = '', best = Infinity;
      for (const [id, d] of dist) if (!done.has(id) && d < best) { best = d; cur = id; }
      if (!cur) return null; if (cur === to) break; done.add(cur);
      for (const l of this.out.get(cur) ?? []) {
        if (!l.fleets.includes(fleet)) continue;
        const nd = best + l.len + 0.5; if (nd < (dist.get(l.to) ?? Infinity)) { dist.set(l.to, nd); prev.set(l.to, l); }
      }
    }
    const lanes: Lane[] = []; let c = to; while (c !== from) { const l = prev.get(c)!; lanes.unshift(l); c = l.from; }
    return lanes;
  }
  /** Concatenate lane geometries (consecutive lanes are joined by a short connector segment). `start` is the robot's current pose. */
  plan(lanes: Lane[], start?: Vec2): PathPlan {
    const pts: Vec2[] = [], laneAt: (string | null)[] = [];
    if (start) { pts.push(start); laneAt.push(lanes[0]?.id ?? null); }
    for (const l of lanes) for (const g of l.geom) {
      const q = { x: g[0], y: g[1] };
      // offset lanes of different edges can join slightly out of order at junctions; drop a lane-end point that would make the path reverse (>107 deg) over a short hop
      for (;;) {
        const n = pts.length; if (n < 2) break; const a = pts[n - 2], b = pts[n - 1];
        const d1x = b.x - a.x, d1y = b.y - a.y, d2x = q.x - b.x, d2y = q.y - b.y, L1 = Math.hypot(d1x, d1y), L2 = Math.hypot(d2x, d2y);
        if (L1 > 1e-6 && L2 > 1e-6 && L2 < 1.5 && (d1x * d2x + d1y * d2y) / (L1 * L2) < -0.3) { pts.pop(); laneAt.pop(); } else break;
      }
      pts.push(q); laneAt.push(l.id);
    }
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    return { pts, laneAt, cum, total: cum[cum.length - 1] };
  }
}
export function pointAt(p: PathPlan, s: number): { x: number; y: number; heading: number; lane: string | null } {
  const c = p.cum; let lo = 0, hi = c.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
  const a = p.pts[lo], b = p.pts[Math.min(lo + 1, p.pts.length - 1)], L = c[lo + 1] - c[lo] || 1e-9, t = Math.max(0, Math.min(1, (s - c[lo]) / L));
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, heading: Math.atan2(b.y - a.y, b.x - a.x), lane: p.laneAt[Math.min(lo + 1, p.laneAt.length - 1)] };
}
