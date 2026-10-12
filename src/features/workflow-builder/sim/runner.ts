import { wfStore, SIM_IDLE } from '../model/store';
import type { WfNode } from '../model/types';
import { HOME, STATION_POINTS, pointOnPoly, polyLength, route, toPath, type Pt } from './geometry';

/** High-frequency robot frames bypass React state: the map subscribes directly. */
export type Frame = { type: 'robot'; p: Pt; ang: number } | { type: 'trail'; done: string; cur: string } | { type: 'reset' };
const listeners = new Set<(f: Frame) => void>();
export const simBus = { on(fn: (f: Frame) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }, emit(f: Frame) { listeners.forEach((l) => l(f)); } };

const CANCEL = Symbol('cancel'); let token = 0; let robotAt: Pt = { ...HOME }; let trailDone = '';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const numOf = (v: string) => (String(v).match(/(\d{3})/) || [])[1];
const secsOf = (t: string) => String(t).split(':').reduce((a, x) => a * 60 + (+x || 0), 0);
const fmt = (s: number) => [Math.floor(s / 3600), Math.floor(s / 60) % 60, Math.floor(s) % 60].map((x) => String(x).padStart(2, '0')).join(':');
const S = () => wfStore.getState();

export function stopSimulation() { token++; S().setSim({ ...SIM_IDLE }); simBus.emit({ type: 'reset' }); }

async function drive(to: Pt, tok: number) {
  const pts = route(robotAt, to); if (pts.length === 2 && Math.hypot(pts[0].x - to.x, pts[0].y - to.y) < 1) return;
  const len = polyLength(pts), dur = Math.max(700, len / 0.32), reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  await new Promise<void>((res, rej) => {
    let t0: number | null = null;
    const step = (ts: number) => {
      if (tok !== token) return rej(CANCEL); if (t0 === null) t0 = ts;
      const k = reduce ? 1 : Math.min(1, (ts - t0) / dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const { p, ang } = pointOnPoly(pts, e * len); simBus.emit({ type: 'robot', p, ang: e < 1 ? ang : 0 }); simBus.emit({ type: 'trail', done: trailDone, cur: toPath(pts) });
      if (k < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
  trailDone += ' ' + toPath(pts); simBus.emit({ type: 'trail', done: trailDone, cur: '' }); robotAt = { ...to };
}
async function pause(ms: number, tok: number) { await sleep(ms); if (tok !== token) throw CANCEL; }

/** Walks the workflow exactly as built: Start -> Material (sets quantity) -> If Logic (evaluates, takes TRUE/OTHERWISE) -> Stations (robot drives) -> Container/Wait/Confirm (pause) -> End. */
export async function runSimulation(nodes: WfNode[]) {
  stopSimulation(); const tok = token; robotAt = { ...HOME }; trailDone = '';
  S().setSim({ ...SIM_IDLE, status: 'running' }); simBus.emit({ type: 'reset' }); simBus.emit({ type: 'robot', p: HOME, ang: 0 });
  const qty: Record<string, number> = {}; let done = 0;
  const total = nodes.length + Math.max(0, ...nodes.filter((n) => n.br).map((n) => Math.max(n.br!.t.length, n.br!.o.length)));
  const say = (step: string) => S().setSim({ step });
  const mark = (id: string) => { done++; S().setSim({ visited: [...S().sim.visited, id], progress: Math.min(100, (done / total) * 100) }); };
  async function visit(n: WfNode): Promise<void> {
    if (tok !== token) throw CANCEL; S().setSim({ currentId: n.id }); const f = n.f as Record<string, any>;
    switch (n.t) {
      case 'start': say(`Start: ${f.trigger} trigger, ${f.robot}, ${f.request}`); await pause(900, tok); break;
      case 'material': { const q = f.fromTablet ? 5 + Math.floor(Math.random() * 16) : +f.qty || 0; qty[f.code] = (qty[f.code] || 0) + q;
        say(f.fromTablet ? `Material: operator entered ${q} × ${f.code} on the tablet` : `Material: ${q} × ${f.code}`); await pause(1000, tok); break; }
      case 'logic': { const have = qty[f.material] || 0, lim = +f.qty || 0;
        const ok = ({ 'Greater than': have > lim, 'Less than': have < lim, 'Equal to': have === lim, 'Not equal to': have !== lim } as Record<string, boolean>)[f.cond];
        const b = ok ? 't' : 'o'; S().setSim({ taken: { ...S().sim.taken, [n.id]: b } });
        say(`If ${f.material} quantity ${have} is ${String(f.cond).toLowerCase()} ${lim}: ${ok ? 'TRUE' : 'OTHERWISE'} branch`); await pause(1500, tok); mark(n.id);
        for (const x of n.br![b]) await visit(x); return; }
      case 'station': { const list: string[] = Array.isArray(f.station) ? f.station : [f.station];
        for (const st of list) {
          const num = numOf(st), pt = STATION_POINTS[num]; S().setSim({ hlStation: num });
          if (!pt) { say(`${st} isn't on this map, skipping it`); await pause(1100, tok); continue; }
          say(`${f.action === 'Pick Up' ? 'Driving to pick up at' : 'Driving to drop off at'} ${st}`); await drive(pt, tok);
          say(`${f.action === 'Pick Up' ? 'Picked up at' : 'Dropped off at'} ${st}`); await pause(700, tok);
        }
        S().setSim({ hlStation: null }); break; }
      case 'container': say('Picking an empty container here, no scan needed'); await pause(1100, tok); break;
      case 'wait': { const secs = secsOf(f.time), dur = Math.min(4000, Math.max(900, secs * 25)), t0 = performance.now();
        while (performance.now() - t0 < dur) { say(`Waiting ${fmt(secs * (1 - (performance.now() - t0) / dur))}`); await pause(100, tok); } break; }
      case 'confirm': say(`Waiting for confirmation: ${f.op}`); await pause(1100, tok); say(`${f.op} confirmed`); await pause(500, tok); break;
      case 'end': say('End node: workflow stops'); await pause(700, tok); break;
    }
    mark(n.id);
  }
  try {
    for (const n of nodes) await visit(n);
    if (tok !== token) return; token++; S().setSim({ status: 'done', step: '', currentId: null, progress: 100 });
  } catch (e) { if (e !== CANCEL) throw e; }
}
