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
  /** Concatenate lane geometries (consecutive lanes are joined by a short connector) and round every corner, so a robot turns smoothly instead of stopping to rotate. `start` is the robot's current pose. */
  plan(lanes: Lane[], start?: Vec2): PathPlan {
    const pts: Vec2[] = [], laneAt: (string | null)[] = [];
    if (start) { pts.push(start); laneAt.push(lanes[0]?.id ?? null); }
    for (const l of lanes) for (const g of l.geom) joinPoint(pts, laneAt, { x: g[0], y: g[1] }, l.id);
    const sm = smoothCorners(pts, laneAt); pts.length = 0; pts.push(...sm.pts); laneAt.length = 0; laneAt.push(...sm.laneAt);
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

/** Append q to a path. Offset lanes of different edges can join slightly out of order at junctions: drop a lane-end point that would make the path reverse (>107 deg) over a short hop. */
function joinPoint(pts: Vec2[], laneAt: (string | null)[], q: Vec2, lane: string | null) {
  for (;;) {
    const n = pts.length; if (n < 2) break; const a = pts[n - 2], b = pts[n - 1];
    const d1x = b.x - a.x, d1y = b.y - a.y, d2x = q.x - b.x, d2y = q.y - b.y, L1 = Math.hypot(d1x, d1y), L2 = Math.hypot(d2x, d2y);
    if (L1 > 1e-6 && L2 > 1e-6 && L2 < 1.5 && (d1x * d2x + d1y * d2y) / (L1 * L2) < -0.3) { pts.pop(); laneAt.pop(); } else break;
  }
  const l = pts[pts.length - 1]; if (l && Math.hypot(q.x - l.x, q.y - l.y) < 0.02) return;
  pts.push(q); laneAt.push(lane);
}

/** Largest corner radius (m). Corners are rounded with a curve tangent to both sides, using at most half of each neighbouring segment. */
export const CORNER_R = 1.6;
/** Replace every corner of a polyline by a smooth curve (quadratic Bezier between the tangent points), so heading changes continuously.
 *  `laneAt[i]` is the lane of the segment ending at point i; curve points keep the lane of the side they lie on. */
export function smoothCorners(pts: Vec2[], laneAt: (string | null)[], R = CORNER_R): { pts: Vec2[]; laneAt: (string | null)[] } {
  if (pts.length < 3) return { pts: [...pts], laneAt: [...laneAt] };
  const outP: Vec2[] = [pts[0]], outL: (string | null)[] = [laneAt[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], p = pts[i], b = pts[i + 1];
    const L1 = Math.hypot(p.x - a.x, p.y - a.y), L2 = Math.hypot(b.x - p.x, b.y - p.y);
    if (L1 < 1e-6 || L2 < 1e-6) continue;
    const u1 = { x: (p.x - a.x) / L1, y: (p.y - a.y) / L1 }, u2 = { x: (b.x - p.x) / L2, y: (b.y - p.y) / L2 };
    const turn = Math.acos(Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y)));
    if (turn < 0.03) { outP.push(p); outL.push(laneAt[i]); continue; }
    const t = Math.min(R * Math.tan(Math.min(turn, 3.0) / 2), L1 * 0.5, L2 * 0.5);
    const s0 = { x: p.x - u1.x * t, y: p.y - u1.y * t }, s1 = { x: p.x + u2.x * t, y: p.y + u2.y * t };
    const n = Math.max(2, Math.ceil(turn / 0.12));
    for (let k = 0; k <= n; k++) {
      const f = k / n, g = 1 - f;
      outP.push({ x: g * g * s0.x + 2 * g * f * p.x + f * f * s1.x, y: g * g * s0.y + 2 * g * f * p.y + f * f * s1.y }); outL.push(k === 0 || f < 0.5 ? laneAt[i] : laneAt[i + 1]);
    }
  }
  outP.push(pts[pts.length - 1]); outL.push(laneAt[pts.length - 1]);
  // drop zero-length steps (two corners sharing a tangent point)
  const P: Vec2[] = [], Lz: (string | null)[] = [];
  outP.forEach((q, i) => { const l = P[P.length - 1]; if (l && Math.hypot(q.x - l.x, q.y - l.y) < 1e-4) return; P.push(q); Lz.push(outL[i]); });
  return { pts: P, laneAt: Lz };
}

/** Smoothed geometry of the junction where lane `a` hands over to lane `b` (end of a -> start of b), for drawing connected routes. */
export function junctionCurve(a: Lane, b: Lane): Vec2[] {
  const pts: Vec2[] = [], laneAt: (string | null)[] = [];
  for (const g of a.geom.slice(-2)) joinPoint(pts, laneAt, { x: g[0], y: g[1] }, a.id);
  for (const g of b.geom.slice(0, 2)) joinPoint(pts, laneAt, { x: g[0], y: g[1] }, b.id);
  return smoothCorners(pts, laneAt).pts;
}
