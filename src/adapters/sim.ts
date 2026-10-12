import { LaneGraph, pointAt, type PathPlan } from '../core/lanes';
import { angleDiff, pointInPoly } from '../core/geom';
import type { NavGraph, RobotState, RobotTelemetry, Vec2 } from '../core/types';

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const HOLD = 1.8, V = 1.1, HEADWAY = 2.4;

interface Bot {
  id: string; model: string; fleetId: string; pos: Vec2; theta: number; battery: number; state: RobotState;
  node: string; stationId: string | null; plan: PathPlan | null; s: number; entries: { zoneId: string; s: number; exitS: number }[]; entryIdx: number;
  holds: Map<string, number>; waitingZone: string | null; waitReason: 'traffic' | 'headway' | null;
  timer: number; speed: number; blockedUntil: number; task: RobotTelemetry['task']; payload: RobotTelemetry['payload']; dest: string | null; lane: string | null;
}

/** Pure, deterministic fleet simulation (no timers). Obeys the same rules a real fleet does: fleet-confined lanes, directed lanes,
 *  traffic zones (capacity, FIFO queue, hold point at the entrance), headway behind other robots, no forbidden zones (lanes avoid them). */
export class FleetSim {
  readonly graph: LaneGraph; bots: Bot[] = []; time = 0; private rand: () => number;
  zones = new Map<string, { occ: Set<string>; queue: string[] }>();
  constructor(nav: NavGraph, private siteId: string, count = 14, seed = 7) {
    this.graph = new LaneGraph(nav); this.rand = rng(seed);
    nav.trafficZones.forEach((z) => this.zones.set(z.id, { occ: new Set(), queue: [] }));
    const used = new Set<string>();
    for (let i = 0; i < count; i++) {
      const fleet = nav.fleets[i % nav.fleets.length].id;
      const own = nav.stations.filter((s) => s.fleets.includes(fleet) && s.type !== 'charge' && !used.has(s.id));
      const st = own[Math.floor(this.rand() * own.length)]; used.add(st.id); const n = this.graph.nodes.get(st.nodeId)!;
      this.bots.push({ id: `TRP-${20480 + i}`, model: i % 5 === 4 ? 'sherpa-tug' : 'sherpa-xt-lite', fleetId: fleet, pos: { x: n.x, y: n.y }, theta: 0, battery: 45 + this.rand() * 55, state: 'idle', node: n.id, stationId: st.id,
        plan: null, s: 0, entries: [], entryIdx: 0, holds: new Map(), waitingZone: null, waitReason: null, timer: this.rand() * 4, speed: 0, blockedUntil: 0, task: null, payload: null, dest: null, lane: null });
    }
  }
  private incoming(id: string) { return this.bots.filter((b) => b.dest === id).length; }
  private planRoute(b: Bot): boolean {
    const low = b.battery < 25; const g = this.graph.nav;
    const cands = g.stations.filter((s) => s.fleets.includes(b.fleetId) && s.id !== b.stationId && (low ? s.type === 'charge' : s.type !== 'charge'))
      .sort((p, q) => this.incoming(p.id) - this.incoming(q.id) + (this.rand() - 0.5) * 2.5);
    for (const st of cands) {
      if (!low && this.incoming(st.id) >= 2) continue;
      const lanes = this.graph.route(b.node, st.nodeId, b.fleetId); if (!lanes || !lanes.length) continue;
      const plan = this.graph.plan(lanes, b.pos); const entries: Bot['entries'] = [];
      for (const z of g.trafficZones) {                       // intervals [enter, exit] of the path inside each zone; passes <6 m apart are one pass
        const iv: Bot['entries'] = []; let inside = pointInPoly(plan.pts[0].x, plan.pts[0].y, z.polygon); let start = 0;
        for (let s = 0.2; s <= plan.total + 0.2; s += 0.2) {
          const p = pointAt(plan, Math.min(s, plan.total)); const now = pointInPoly(p.x, p.y, z.polygon);
          if (now && !inside) start = s; if (!now && inside) iv.push({ zoneId: z.id, s: start, exitS: s }); inside = now;
        }
        if (inside) iv.push({ zoneId: z.id, s: start, exitS: plan.total });
        for (const q of iv) { const last = entries[entries.length - 1]; const prev = [...entries].reverse().find((x) => x.zoneId === z.id);
          if (prev && q.s - prev.exitS < 6) prev.exitS = q.exitS; else entries.push(q); void last; }
      }
      entries.sort((a, c) => a.s - c.s);
      Object.assign(b, { plan, s: 0, entries, entryIdx: 0, state: 'moving', dest: st.id, stationId: null, timer: 0,
        task: { id: `T-${Math.floor(this.rand() * 90000 + 10000)}`, type: low ? 'charge' : 'transport', from: b.stationId ?? undefined, to: st.id, progress: 0 },
        payload: low ? null : { kind: ['PCBA tray', 'Reel box', 'Material'][Math.floor(this.rand() * 3)], qty: 1 + Math.floor(this.rand() * 9) } });
      return true;
    }
    return false;
  }
  private release(b: Bot, zoneId: string) { this.zones.get(zoneId)?.occ.delete(b.id); b.holds.delete(zoneId); }
  private acquire(b: Bot, zoneId: string): boolean {
    const z = this.graph.nav.trafficZones.find((q) => q.id === zoneId)!; const st = this.zones.get(zoneId)!;
    if (!st.queue.includes(b.id)) st.queue.push(b.id);
    if (st.occ.size < z.capacity && st.queue[0] === b.id) { st.queue.shift(); st.occ.add(b.id); return true; }
    return false;
  }
  private blockedAhead(b: Bot) {
    const hx = Math.cos(b.theta), hy = Math.sin(b.theta);
    return this.bots.some((o) => {
      if (o === b || o.state === 'offline') return false; const vx = o.pos.x - b.pos.x, vy = o.pos.y - b.pos.y, d = Math.hypot(vx, vy); if (d > HEADWAY) return false;
      const along = vx * hx + vy * hy, lat = Math.abs(vx * hy - vy * hx);
      return along > 0.2 && lat < 0.45 && Math.cos(angleDiff(o.theta, b.theta)) > 0.7;
    });
  }
  step(dt: number) { this.time += dt; for (const b of this.bots) this.stepBot(b, dt); }
  private stepBot(b: Bot, dt: number) {
    b.speed = 0;
    if (b.state === 'blocked') { if (this.time >= b.blockedUntil) b.state = 'moving'; return; }
    if (b.state === 'idle' || b.state === 'working' || b.state === 'charging') {
      b.timer -= dt; if (b.state === 'charging') b.battery = Math.min(100, b.battery + dt * 6);
      if (b.timer <= 0 && !(b.state === 'charging' && b.battery < 90)) { if (!this.planRoute(b)) b.timer = 1.5; }
      return;
    }
    const plan = b.plan!; const ahead = pointAt(plan, Math.min(b.s + 0.5, plan.total));
    const dth = angleDiff(b.theta, ahead.heading);
    if (Math.abs(dth) > 0.35) { b.theta += Math.max(-1.9 * dt, Math.min(1.9 * dt, dth)); b.state = b.waitingZone ? 'waiting' : 'moving'; return; }   // rotate in place before driving
    if (this.blockedAhead(b)) { b.state = 'waiting'; b.waitReason = 'headway'; b.waitingZone = null; return; }
    let limit = plan.total; const e = b.entries[b.entryIdx];
    if (e) {
      const hold = Math.max(0, e.s - HOLD);
      if (b.s >= hold - 1e-3) {
        if (this.acquire(b, e.zoneId)) { b.holds.set(e.zoneId, e.exitS); b.entryIdx++; }
        else { b.s = Math.min(b.s, hold); b.state = 'waiting'; b.waitReason = 'traffic'; b.waitingZone = e.zoneId; return; }
      } else limit = Math.min(limit, hold);
    }
    b.state = 'moving'; b.waitReason = null; b.waitingZone = null;
    const before = b.s; b.s = Math.min(b.s + V * dt, limit); b.speed = b.s - before > 1e-6 ? V : 0;
    const p = pointAt(plan, b.s); b.pos = { x: p.x, y: p.y }; b.theta += angleDiff(b.theta, p.heading) * Math.min(1, dt * 8); b.lane = p.lane;
    for (const [zid, exitS] of [...b.holds]) if (b.s > exitS + 0.1) this.release(b, zid);   // left the zone: let the next robot in
    b.battery = Math.max(0, b.battery - dt * 0.05); if (b.task) b.task.progress = Math.min(1, b.s / Math.max(plan.total, 1));
    if (b.s >= plan.total - 1e-3) {
      for (const zid of [...b.holds.keys()]) this.release(b, zid);
      const st = this.graph.station(b.dest!)!; b.node = st.nodeId; b.stationId = st.id; b.dest = null; b.plan = null; b.speed = 0;
      const charge = b.task?.type === 'charge'; b.state = charge ? 'charging' : 'working'; b.timer = charge ? 3 : 3 + this.rand() * 4; if (b.task) b.task.progress = 1; return;
    }
    if (this.rand() < dt * 0.0012) { b.state = 'blocked'; b.blockedUntil = this.time + 5 + this.rand() * 4; b.speed = 0; }
  }
  snapshot(): RobotTelemetry[] {
    const ts = Date.now();
    return this.bots.map((b) => {
      const moving = (b.state === 'moving' || b.state === 'waiting' || b.state === 'blocked') && b.plan;
      const traffic = b.waitingZone ? { zoneId: b.waitingZone, status: 'waiting' as const } : b.holds.size ? { zoneId: [...b.holds.keys()][0], status: 'inside' as const } : null;
      const alerts: NonNullable<RobotTelemetry['alerts']> = [];
      if (b.state === 'blocked') alerts.push({ code: 'OBSTACLE', severity: 'critical', msg: 'Path obstructed' });
      if (b.battery < 25) alerts.push({ code: 'LOW_BATT', severity: 'warn', msg: 'Low battery' });
      if (b.waitingZone) alerts.push({ code: 'TRAFFIC_WAIT', severity: 'info', msg: `Waiting for ${b.waitingZone}` });
      return { id: b.id, model: b.model, fleetId: b.fleetId, siteId: this.siteId, pose: { x: b.pos.x, y: b.pos.y, theta: b.theta }, speed: b.speed, state: b.state, battery: Math.round(b.battery),
        payload: b.payload, task: b.task, path: moving ? [b.pos, ...b.plan!.pts.filter((_, i) => b.plan!.cum[i] > b.s)] : [], laneId: b.lane, traffic, waitReason: b.waitReason,
        atStation: b.stationId && (b.state === 'working' || b.state === 'charging' || b.state === 'idle') ? b.stationId : null, alerts, ts };
    });
  }
}
