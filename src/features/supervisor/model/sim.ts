/**
 * Mock fleet simulation for the supervisor Live view (pure TS, deterministic, no DOM/Three).
 * Sherpas drive closed mission loops, dwell at stops, obey zones (slow = 45 % speed, no-go = hard stop,
 * traffic = one Sherpa at a time) and yield to each other with a give-way timeout that prevents gridlock.
 * The 3D map and the React panels only read `FleetSim.robots`; swap this class for a live adapter later.
 */
import { M_PER_U, MOVE_SPEED, ROBOTS, START_AT, type ModelId, type RobotDef, type Status, type Stop, type Zone, type ZoneType } from './data';

interface Pt { x: number; y: number; stop?: Stop }
interface Seg { a: Pt; b: Pt; len: number; start: number }
export interface RouteStop extends Stop { i: number; s: number }

export interface SimRobot {
  id: string; model: ModelId; fleet: string; cart: boolean;
  batt: number; state: Exclude<Status, 'paused'>; pausedByUser: boolean; error: string | null;
  /** Distance along the loop, current position (drawing units) and heading (radians, 0 = +x). */
  s: number; x: number; y: number; heading: number; speedNow: number;
  action: string; sub: string; loaded: boolean; load: string | null;
  dwell: number; stopIdx: number; trips: number; odo: number;
  waitT: number; grace: number; holds: Set<string>;
  pts: Pt[]; seg: Seg[]; len: number; stops: RouteStop[];
}
export interface SimEvent { t: string; id: string; text: string }

const inRect = (x: number, y: number, r: Zone['r']) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];
export const statusOf = (o: SimRobot): Status => (o.pausedByUser ? 'paused' : o.state);
export const nextStop = (o: SimRobot) => o.stops[o.stopIdx % o.stops.length];
export function distToStop(o: SimRobot) { let d = nextStop(o).s - o.s; if (d < 0) d += o.len; return d; }

/** Point + unit direction at distance `s` along the loop (wraps). */
export function posAt(o: Pick<SimRobot, 'seg' | 'len'>, s: number) {
  s = ((s % o.len) + o.len) % o.len;
  const last = o.seg[o.seg.length - 1];
  const sg = o.seg.find((g) => s <= g.start + g.len) ?? last;
  const t = sg.len ? Math.min(1, (s - sg.start) / sg.len) : 0; const n = sg.len || 1;
  return { x: sg.a.x + (sg.b.x - sg.a.x) * t, y: sg.a.y + (sg.b.y - sg.a.y) * t, dx: (sg.b.x - sg.a.x) / n, dy: (sg.b.y - sg.a.y) / n };
}

function prepare(def: RobotDef, idx: number): SimRobot {
  const pts: Pt[] = def.route.map((p) => ({ x: p[0], y: p[1], stop: p[2]?.stop }));
  const seg: Seg[] = []; let len = 0;
  pts.forEach((a, i) => { const b = pts[(i + 1) % pts.length]; const l = Math.hypot(b.x - a.x, b.y - a.y); seg.push({ a, b, len: l, start: len }); len += l; });
  const stops = pts.flatMap((p, i) => (p.stop ? [{ ...p.stop, i, s: seg[i].start }] : []));
  const o: SimRobot = {
    id: def.id, model: def.model, fleet: def.fleet, cart: !!def.cart, batt: def.batt, state: 'moving', pausedByUser: false, error: def.error ?? null,
    s: len * (START_AT[idx] ?? 0), x: 0, y: 0, heading: 0, speedNow: 0, action: '', sub: '', loaded: false, load: null,
    dwell: 0, stopIdx: 0, trips: Math.floor(4 + idx * 2.3), odo: Math.round(3.2 + idx * 1.7 * 10) / 10, waitT: 0, grace: 0, holds: new Set(), pts, seg, len, stops,
  };
  o.stopIdx = Math.max(0, stops.findIndex((st) => st.s >= o.s));
  if (def.error) { o.state = 'error'; o.action = def.error; o.sub = 'Operator assistance requested'; }
  if (stops[0]?.kind === 'charge' && START_AT[idx] === 0) { o.stopIdx = 0; o.dwell = 14; o.state = 'charging'; }   // starts docked
  const p = posAt(o, o.s); o.x = p.x; o.y = p.y; o.heading = Math.atan2(p.dy, p.dx);
  const prev = [...stops].reverse().find((st) => st.s <= o.s) ?? stops[stops.length - 1];
  o.loaded = prev.kind === 'pickup'; o.load = o.loaded ? prev.load ?? null : null;
  return o;
}

const clock = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

export class FleetSim {
  robots: SimRobot[]; events: SimEvent[] = []; trips = 0; paused = false;
  constructor(public zones: () => Zone[], defs: RobotDef[] = ROBOTS) { this.robots = defs.map(prepare); }

  zonesAt(x: number, y: number, types?: ZoneType[]) { return this.zones().filter((z) => (!types || types.includes(z.type)) && inRect(x, y, z.r)); }
  log(o: SimRobot, text: string) { this.events.unshift({ t: clock(), id: o.id, text }); this.events.length = Math.min(this.events.length, 60); }

  /** Advance the simulation by `dt` seconds (callers sub-step large dt; keep dt <= 0.05). */
  step(dt: number) {
    for (const o of this.robots) {
      if (o.state === 'error' || o.pausedByUser || this.paused) { o.speedNow = 0; continue; }
      const st = nextStop(o);
      if (o.dwell > 0) {
        o.dwell -= dt;
        if (st.kind === 'charge') { o.batt = Math.min(100, o.batt + dt * 1.2); o.state = 'charging'; o.action = `${st.verb} ${st.name}`; o.sub = `Battery ${Math.round(o.batt)}% · leaving in ${Math.max(0, Math.ceil(o.dwell))} s`; }
        else { o.state = 'working'; o.action = `${st.verb} ${st.name}`; o.sub = st.kind === 'drop' ? 'Releasing load' : 'Loading'; }
        if (o.dwell <= 0) {
          if (st.kind === 'pickup') { o.loaded = true; o.load = st.load ?? null; this.log(o, `picked up ${st.load} at ${st.name}`); }
          else if (st.kind === 'drop') { o.loaded = false; o.load = null; o.trips++; this.trips++; this.log(o, `dropped off at ${st.name}`); }
          else this.log(o, `finished charging at ${Math.round(o.batt)}%`);
          o.stopIdx = (o.stopIdx + 1) % o.stops.length;
        }
        o.speedNow = 0; continue;
      }
      const d = distToStop(o);
      const v = MOVE_SPEED * (this.zonesAt(o.x, o.y, ['slow']).length ? 0.45 : 1);
      const ahead = posAt(o, o.s + Math.min(d, 3.2));                         // look ahead for zones and other Sherpas
      let block: { why: string; hard?: boolean } | null = null;
      const nogo = this.zonesAt(ahead.x, ahead.y, ['restricted']);
      if (nogo.length) block = { why: `Path blocked by ${nogo[0].name}`, hard: true };
      if (!block) for (const z of this.zonesAt(ahead.x, ahead.y, ['traffic'])) {
        if (o.holds.has(z.id)) continue;
        const holder = this.robots.find((q) => q !== o && q.holds.has(z.id));
        if (holder) { block = { why: `Waiting at ${z.name} · ${holder.id} crossing` }; break; }
      }
      if (!block) for (const q of this.robots) {
        if (q === o) continue; const dx = q.x - o.x, dy = q.y - o.y;
        const fwd = dx * Math.cos(o.heading) + dy * Math.sin(o.heading), lat = Math.abs(-dx * Math.sin(o.heading) + dy * Math.cos(o.heading));
        if (fwd > 0 && fwd < 6.5 && lat < 2) { block = { why: `Yielding to ${q.id}` }; break; }
      }
      if (o.grace > 0) { o.grace -= dt; if (block && !block.hard) block = null; }
      if (block && !block.hard && o.waitT > 4) { block = null; o.grace = 2.5; }   // give-way timeout prevents gridlock
      if (block) { o.state = 'waiting'; o.action = block.why; o.sub = `Next stop ${st.name}`; o.waitT += dt; o.speedNow = 0; continue; }
      o.waitT = 0;
      const ds = Math.min(d, v * dt); o.s = (o.s + ds) % o.len; o.speedNow = v;
      o.batt = Math.max(5, o.batt - dt * 0.012); o.odo += (ds * M_PER_U) / 1000;
      const p = posAt(o, o.s); o.x = p.x; o.y = p.y; o.heading = Math.atan2(p.dy, p.dx);
      const holds = new Set(this.zonesAt(o.x, o.y, ['traffic']).map((z) => z.id)); this.zonesAt(ahead.x, ahead.y, ['traffic']).forEach((z) => holds.add(z.id)); o.holds = holds;
      o.state = 'moving';
      o.action = st.kind === 'drop' ? `Delivering to ${st.name}` : st.kind === 'charge' ? `Returning to ${st.name} to charge` : `Heading to ${st.name} for pick-up`;
      o.sub = `${Math.round(distToStop(o) * M_PER_U)} m to go${this.zonesAt(o.x, o.y, ['slow']).length ? ' · slow zone' : ''}`;
      if (distToStop(o) < 0.05) o.dwell = st.dwell;
    }
  }

  /** Progress (0..1) through the current leg or dwell, for the details panel. */
  legProgress(o: SimRobot) {
    const st = nextStop(o); const prev = o.stops[(o.stopIdx - 1 + o.stops.length) % o.stops.length];
    let leg = st.s - prev.s; if (leg <= 0) leg += o.len;
    const p = o.dwell > 0 ? 1 - o.dwell / st.dwell : 1 - distToStop(o) / leg; return Math.max(0, Math.min(1, p));
  }

  locationOf(o: SimRobot) {
    const z = this.zonesAt(o.x, o.y).filter((q) => q.type !== 'slow')[0] ?? this.zonesAt(o.x, o.y)[0];
    if (z) return z.name;
    if (o.x > 336 && o.x < 445 && o.y > 162 && o.y < 382) return 'Clean room';
    if (o.x < 330 && o.y > 204 && o.y < 366) return 'Warehouse hall';
    return 'Logistics gangway';
  }

  setPaused(on: boolean) {
    this.paused = on;
    if (on) this.robots.forEach((o) => { if (o.state !== 'error') { o.state = 'waiting'; o.action = 'Fleet paused by operator'; o.sub = 'Resume the fleet to continue'; } });
  }
  togglePause(o: SimRobot, by: string) { o.pausedByUser = !o.pausedByUser; this.log(o, o.pausedByUser ? `paused by ${by}` : `resumed by ${by}`); }
  clearError(o: SimRobot) { o.state = 'moving'; o.error = null; this.log(o, 'obstacle cleared, resuming mission'); }
}

export function counts(list: SimRobot[]) {
  const c: Record<Status, number> = { moving: 0, working: 0, waiting: 0, charging: 0, error: 0, paused: 0 };
  list.forEach((o) => c[statusOf(o)]++); return c;
}
