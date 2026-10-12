import { LaneGraph, pointAt, type PathPlan } from '../core/lanes';
import { angleDiff, pointInPoly } from '../core/geom';
import { boxesOverlap, footprint, Trail, TROLLEY, trolleyBack, type Box } from '../core/footprint';
import type { NavGraph, RobotState, RobotTelemetry, Vec2 } from '../core/types';

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const HOLD = 1.8, V = 1.1, V_CURVE = 0.6;
/** Safety: a robot looks LOOK m ahead along its own path and stops if its body there would come within 2*GAP of the robot or trolley in front. */
const LOOK = 1.6, STEP = 0.2, GAP = 0.02;
/** Reservations are checked with a slightly larger margin than driving, so sampling differences never stop a robot inside its own reservation. */
const RGAP = 0.08;
/** Rotate in place only when the path turns more than this from where the robot faces (route starts, U-turns); smaller turns are driven. */
const SPIN = 0.6, SPIN_RATE = 1.6;
/** Two boxes "go the same way" when their headings are within ~72 deg: such robots may share a stretch and simply follow each other. */
const SAME_WAY = 0.3;

type Claim = { s: number; box: Box };
interface Bot {
  id: string; model: string; fleetId: string; pos: Vec2; theta: number; battery: number; state: RobotState;
  node: string; stationId: string | null; plan: PathPlan | null; s: number; entries: { zoneId: string; s: number; exitS: number }[]; entryIdx: number;
  holds: Map<string, number>; waitingZone: string | null; waitReason: 'traffic' | 'headway' | null;
  timer: number; speed: number; blockedUntil: number; task: RobotTelemetry['task']; payload: RobotTelemetry['payload']; dest: string | null; lane: string | null;
  /** loaded = carries goods; hitched = the trolley is attached behind it (from departure until it has unloaded at the delivery station). */
  loaded: boolean; hitched: boolean; trail: Trail;
  /** The space this robot reserved for its whole trip (robot-sized boxes along the path, plus the turn in place and the trolley at the start).
   *  Released behind the robot as it drives. */
  claim: Claim[];
}

/** Pure, deterministic fleet simulation (no timers). Obeys the same rules a real fleet does: fleet-confined lanes, directed lanes,
 *  traffic zones (capacity, FIFO queue, hold point at the entrance), no forbidden zones (lanes avoid them), and robots never touch.
 *
 *  How "never touch" works without gridlock: a robot only sets off when it can reserve the space its body sweeps along its WHOLE route.
 *  A reservation may not cross another robot's reservation (at an angle or head-on), may not cover a robot standing anywhere, and may not
 *  end (parking spot) on someone else's reservation. Robots going the same way may share a stretch and keep their distance by looking ahead.
 *  So a robot on its way can always reach its station, nobody waits on each other in a circle, and robots that cannot go yet wait at their station.
 *  Loaded robots tow a trolley; empty ones do not. */
export class FleetSim {
  readonly graph: LaneGraph; bots: Bot[] = []; time = 0; private rand: () => number;
  zones = new Map<string, { occ: Set<string>; queue: string[] }>();
  constructor(nav: NavGraph, private siteId: string, count = 14, seed = 7) {
    this.graph = new LaneGraph(nav); this.rand = rng(seed);
    nav.trafficZones.forEach((z) => this.zones.set(z.id, { occ: new Set(), queue: [] }));
    const used: Vec2[] = [];
    for (let i = 0; i < count; i++) {
      const fleet = nav.fleets[i % nav.fleets.length].id;
      const room = (id: string) => { const n = this.graph.nodes.get(id)!; return Math.min(99, ...used.map((u) => Math.hypot(u.x - n.x, u.y - n.y))); };   // spread robots out at start
      const own = nav.stations.filter((s) => s.fleets.includes(fleet) && s.type !== 'charge'); const roomy = own.filter((s) => room(s.nodeId) > 6);
      const st = roomy.length ? roomy[Math.floor(this.rand() * roomy.length)] : own.reduce((a, c) => (room(c.nodeId) > room(a.nodeId) ? c : a));
      const n = this.graph.nodes.get(st.nodeId)!; used.push(n);
      const out = (this.graph.out.get(n.id) ?? []).find((l) => l.fleets.includes(fleet)); const g = out?.geom;
      const theta = g && g.length > 1 ? Math.atan2(g[1][1] - g[0][1], g[1][0] - g[0][0]) : 0;
      const loaded = i % 2 === 0;
      this.bots.push({ id: `TRP-${20480 + i}`, model: i % 5 === 4 ? 'sherpa-tug' : 'sherpa-xt-lite', fleetId: fleet, pos: { x: n.x, y: n.y }, theta, battery: 45 + this.rand() * 55, state: 'idle', node: n.id, stationId: st.id,
        plan: null, s: 0, entries: [], entryIdx: 0, holds: new Map(), waitingZone: null, waitReason: null, timer: this.rand() * 4, speed: 0, blockedUntil: 0, task: null,
        payload: loaded ? this.cargo() : null, dest: null, lane: null, loaded, hitched: loaded, trail: new Trail(n.x, n.y, theta), claim: [] });
    }
  }
  private cargo(): RobotTelemetry['payload'] { return { kind: ['PCBA tray', 'Reel box', 'Material'][Math.floor(this.rand() * 3)], qty: 2 + Math.floor(this.rand() * 5) }; }
  private incoming(id: string) { return this.bots.filter((b) => b.dest === id).length; }
  /** Is a robot parked at, or heading to, a station within 4 m of this node? */
  private taken(b: Bot, nodeId: string) {
    const n = this.graph.nodes.get(nodeId)!;
    return this.bots.some((o) => { if (o === b) return false; const id = o.dest ?? o.stationId; const m = id ? this.graph.stationNode(id) : null; return !!m && Math.hypot(m.x - n.x, m.y - n.y) < 4; });
  }
  /** How far behind the robot's centre its body (and trolley) still covers its path. */
  private tail(b: Bot) { return (b.hitched || b.loaded ? trolleyBack(b.model) + TROLLEY.L / 2 : footprint(b.model)[0] / 2) + 0.3; }
  private planRoute(b: Bot): boolean {
    const low = b.battery < 25 && !b.loaded; const g = this.graph.nav;   // a loaded robot delivers first, then charges
    const cands = g.stations.filter((s) => s.fleets.includes(b.fleetId) && s.id !== b.stationId && (low ? s.type === 'charge' : s.type !== 'charge'))
      .sort((p, q) => this.incoming(p.id) - this.incoming(q.id) + (this.rand() - 0.5) * 2.5);
    for (const st of cands) {
      if (this.taken(b, st.nodeId)) continue;                 // one robot at a time at a station and at the stations right next to it
      const lanes = this.graph.route(b.node, st.nodeId, b.fleetId); if (!lanes || !lanes.length) continue;
      const plan = this.graph.plan(lanes, b.pos); const claim = this.reserve(b, plan); if (!claim) continue;
      const entries: Bot['entries'] = [];
      for (const z of g.trafficZones) {                       // intervals [enter, exit] of the path inside each zone; passes <6 m apart are one pass
        const iv: Bot['entries'] = []; let inside = pointInPoly(plan.pts[0].x, plan.pts[0].y, z.polygon); let start = 0;
        for (let s = 0.2; s <= plan.total + 0.2; s += 0.2) {
          const p = pointAt(plan, Math.min(s, plan.total)); const now = pointInPoly(p.x, p.y, z.polygon);
          if (now && !inside) start = s; if (!now && inside) iv.push({ zoneId: z.id, s: start, exitS: s }); inside = now;
        }
        if (inside) iv.push({ zoneId: z.id, s: start, exitS: plan.total });
        for (const q of iv) { const prev = [...entries].reverse().find((x) => x.zoneId === z.id);
          if (prev && q.s - prev.exitS < 6) prev.exitS = q.exitS; else entries.push(q); }
      }
      entries.sort((a, c) => a.s - c.s);
      Object.assign(b, { plan, s: 0, entries, entryIdx: 0, state: 'moving', dest: st.id, stationId: null, timer: 0, claim,
        task: { id: `T-${Math.floor(this.rand() * 90000 + 10000)}`, type: low ? 'charge' : b.loaded ? 'deliver' : 'pickup', from: b.stationId ?? undefined, to: st.id, progress: 0 },
        payload: b.loaded ? b.payload : null, hitched: false });   // the trolley is hitched once the robot faces its way out; an empty robot leaves the trolley at the delivery station
      return true;
    }
    return false;
  }
  /** Reserve the space for a whole trip, or null when it conflicts with another robot (see the class comment). */
  private reserve(b: Bot, plan: PathPlan): Claim[] | null {
    const claim: Claim[] = []; const [L, W] = footprint(b.model); const box = (x: number, y: number, th: number): Box => ({ x, y, th, hl: L / 2, hw: W / 2 });
    const trolleyAt = (x: number, y: number, th: number): Box => { const back = trolleyBack(b.model); return { x: x - Math.cos(th) * back, y: y - Math.sin(th) * back, th, hl: TROLLEY.L / 2, hw: TROLLEY.W / 2 }; };
    const h0 = pointAt(plan, Math.min(0.05, plan.total)).heading, d = angleDiff(b.theta, h0);
    if (Math.abs(d) > 0.02) for (let k = 0; k <= 6; k++) claim.push({ s: 0, box: box(b.pos.x, b.pos.y, b.theta + (d * k) / 6) });   // turning in place
    if (b.loaded) claim.push({ s: 0, box: trolleyAt(b.pos.x, b.pos.y, h0) });                                                      // trolley hitched behind
    for (let s = 0; s <= plan.total + 1e-6; s += 0.3) { const p = pointAt(plan, s); claim.push({ s, box: box(p.x, p.y, p.heading) }); }
    const e = pointAt(plan, plan.total); const parkBoxes = [box(e.x, e.y, e.heading), ...(b.loaded ? [trolleyAt(e.x, e.y, e.heading)] : [])];
    claim.push(...parkBoxes.map((q) => ({ s: plan.total, box: q })));
    const bb = bounds(claim.map((c) => c.box));
    const near = (q: Box) => q.x > bb[0] - 2 && q.x < bb[2] + 2 && q.y > bb[1] - 2 && q.y < bb[3] + 2;
    for (const o of this.bots) {
      if (o === b) continue;
      if (this.boxes(o).filter(near).some((q) => claim.some((c) => boxesOverlap(c.box, q, RGAP)))) return null;            // somebody stands (or drives) there now
      const theirs = this.remaining(o).filter((c) => near(c.box)); if (!theirs.length) continue;
      const end = o.plan!.total - 1e-6;
      for (const c of claim) for (const q of theirs) {
        if (!boxesOverlap(c.box, q.box, RGAP)) continue;
        if (Math.cos(angleDiff(c.box.th, q.box.th)) <= SAME_WAY || parkBoxes.includes(c.box) || q.s >= end) return null;   // crossing, head-on, or one parks on the other's way
      }
    }
    return claim;
  }
  /** The part of a robot's reservation still ahead of (or under) it. */
  private remaining(o: Bot): Claim[] { return o.plan ? o.claim.filter((c) => c.s >= o.s - this.tail(o)) : []; }
  private release(b: Bot, zoneId: string) { this.zones.get(zoneId)?.occ.delete(b.id); b.holds.delete(zoneId); }
  private acquire(b: Bot, zoneId: string): boolean {
    const z = this.graph.nav.trafficZones.find((q) => q.id === zoneId)!; const st = this.zones.get(zoneId)!;
    if (!st.queue.includes(b.id)) st.queue.push(b.id);
    if (st.occ.size < z.capacity && st.queue[0] === b.id) { st.queue.shift(); st.occ.add(b.id); return true; }
    return false;
  }
  /** Robot body at a pose. */
  private robotBox(b: Bot, x: number, y: number, th: number): Box { const [L, W] = footprint(b.model); return { x, y, th, hl: L / 2, hw: W / 2 }; }
  trolleyPose(b: Bot) { return b.hitched ? b.trail.trolley(b.pos.x, b.pos.y, trolleyBack(b.model), TROLLEY.bar + TROLLEY.L / 2) : null; }
  /** Robot body plus its trolley while one is hitched. */
  private boxes(b: Bot): Box[] {
    const out = [this.robotBox(b, b.pos.x, b.pos.y, b.theta)]; const t = this.trolleyPose(b);
    if (t) out.push({ x: t.x, y: t.y, th: t.th, hl: TROLLEY.L / 2, hw: TROLLEY.W / 2 });
    return out;
  }
  /** Bodies of every robot (robot + trolley), for tests and debugging. */
  bodies() { return this.bots.map((b) => ({ id: b.id, boxes: this.boxes(b) })); }
  /** Is the next LOOK m of the path clear of the robot (or trolley) in front going the same way? (Crossing traffic is excluded by the reservations.) */
  private clearAhead(b: Bot): boolean {
    const plan = b.plan!; const hx = Math.cos(b.theta), hy = Math.sin(b.theta); const now = this.robotBox(b, b.pos.x, b.pos.y, b.theta);
    const obs = this.bots.filter((o) => o !== b && Math.hypot(o.pos.x - b.pos.x, o.pos.y - b.pos.y) < LOOK + 5).flatMap((o) => this.boxes(o))
      .filter((q) => (q.x - b.pos.x) * hx + (q.y - b.pos.y) * hy > 0 && !boxesOverlap(now, q, GAP));   // in front of us; never freeze on something we already touch
    if (!obs.length) return true;
    for (let d = STEP; d <= LOOK + 1e-6 && b.s + d <= plan.total + STEP; d += STEP) {
      const p = pointAt(plan, Math.min(b.s + d, plan.total)); const box = this.robotBox(b, p.x, p.y, p.heading);
      if (obs.some((q) => boxesOverlap(box, q, GAP))) return false;
    }
    return true;
  }
  step(dt: number) { this.time += dt; for (const b of this.bots) this.stepBot(b, dt); }
  private stepBot(b: Bot, dt: number) {
    b.speed = 0;
    if (b.state === 'blocked') { if (this.time >= b.blockedUntil) b.state = 'moving'; return; }
    if (b.state === 'idle' || b.state === 'working' || b.state === 'charging') {
      b.timer -= dt; if (b.state === 'charging') b.battery = Math.min(100, b.battery + dt * 6);
      if (b.timer <= 0 && !(b.state === 'charging' && b.battery < 90)) { if (!this.planRoute(b)) b.timer = 1; }
      return;
    }
    const plan = b.plan!; const here = pointAt(plan, Math.min(b.s + 0.05, plan.total));
    const dth = angleDiff(b.theta, here.heading);
    if (Math.abs(dth) > (b.s < 0.01 ? 0.02 : SPIN)) { b.theta += Math.max(-SPIN_RATE * dt, Math.min(SPIN_RATE * dt, dth)); b.state = b.waitingZone ? 'waiting' : 'moving'; return; }   // turn in place (reserved); at the start face the path exactly before driving off
    if (b.loaded && !b.hitched) { b.trail = new Trail(b.pos.x, b.pos.y, here.heading, trolleyBack(b.model) + 2); b.hitched = true; }   // facing the way out: hitch the trolley straight behind (reserved)
    if (!this.clearAhead(b)) { b.state = 'waiting'; b.waitReason = 'headway'; b.waitingZone = null; return; }
    let limit = plan.total; const e = b.entries[b.entryIdx];
    if (e) {
      const hold = Math.max(0, e.s - HOLD);
      if (b.s >= hold - 1e-3) {
        if (this.acquire(b, e.zoneId)) { b.holds.set(e.zoneId, e.exitS + this.tail(b)); b.entryIdx++; }
        else { b.s = Math.min(b.s, hold); b.state = 'waiting'; b.waitReason = 'traffic'; b.waitingZone = e.zoneId; return; }
      } else limit = Math.min(limit, hold);
    }
    b.state = 'moving'; b.waitReason = null; b.waitingZone = null;
    const bend = Math.abs(angleDiff(here.heading, pointAt(plan, Math.min(b.s + 0.8, plan.total)).heading));   // slow down through tight bends
    const v = bend > 0.4 ? V_CURVE : V;
    const before = b.s; b.s = Math.min(b.s + v * dt, limit); b.speed = b.s - before > 1e-6 ? v : 0;
    const p = pointAt(plan, b.s); b.pos = { x: p.x, y: p.y }; b.trail.push(p.x, p.y); b.lane = p.lane;
    b.theta += angleDiff(b.theta, p.heading);                  // the path is smooth, so the robot simply faces along it
    for (const [zid, until] of [...b.holds]) if (b.s > until) this.release(b, zid);   // body and trolley are out: let the next robot in
    b.battery = Math.max(0, b.battery - dt * 0.05); if (b.task) b.task.progress = Math.min(1, b.s / Math.max(plan.total, 1));
    if (b.s >= plan.total - 1e-3) {
      for (const zid of [...b.holds.keys()]) this.release(b, zid);
      const st = this.graph.station(b.dest!)!; b.node = st.nodeId; b.stationId = st.id; b.dest = null; b.plan = null; b.speed = 0; b.claim = [];
      const type = b.task?.type; const charge = type === 'charge'; b.state = charge ? 'charging' : 'working'; b.timer = charge ? 3 : 3 + this.rand() * 4; if (b.task) b.task.progress = 1;
      if (type === 'pickup') { b.loaded = true; b.payload = this.cargo(); }   // goods loaded here; the trolley is hitched when it sets off
      if (type === 'deliver') b.loaded = false;                                 // unloads here; the trolley stays when it leaves
      return;
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
      const t = this.trolleyPose(b);
      return { id: b.id, model: b.model, fleetId: b.fleetId, siteId: this.siteId, pose: { x: b.pos.x, y: b.pos.y, theta: Math.atan2(Math.sin(b.theta), Math.cos(b.theta)) }, speed: b.speed, state: b.state, battery: Math.round(b.battery),
        payload: b.payload, trailer: t ? { x: t.x, y: t.y, theta: t.th } : null, task: b.task, path: moving ? [b.pos, ...b.plan!.pts.filter((_, i) => b.plan!.cum[i] > b.s)] : [], laneId: b.lane, traffic, waitReason: b.waitReason,
        atStation: b.stationId && (b.state === 'working' || b.state === 'charging' || b.state === 'idle') ? b.stationId : null, alerts, ts };
    });
  }
}

function bounds(bs: Box[]): [number, number, number, number] {
  return bs.reduce<[number, number, number, number]>((m, q) => [Math.min(m[0], q.x), Math.min(m[1], q.y), Math.max(m[2], q.x), Math.max(m[3], q.y)], [Infinity, Infinity, -Infinity, -Infinity]);
}
