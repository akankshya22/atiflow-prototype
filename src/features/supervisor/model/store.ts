import { useEffect } from 'react';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { BASE_ZONES, ZONE_TYPES, type Zone, type ZoneType } from './data';
import { FleetSim } from './sim';

/** Map layers a supervisor can toggle (order = Layers popover order). */
export const LAYERS = [
  { k: 'cad', name: 'CAD layout', desc: 'AMR ECC layout drawing' },
  { k: 'pcA', name: 'Point cloud · 2D LiDAR', desc: 'Floor scan at 0.3 m, 225k points' },
  { k: 'pcB', name: 'Point cloud · 3D LiDAR', desc: 'Full-height scan, coloured by height' },
  { k: 'zones', name: 'Zones', desc: 'Traffic, staging, charging, no-go' },
  { k: 'stations', name: 'Stations', desc: 'Pick-up and drop-off points' },
  { k: 'routes', name: 'Planned routes', desc: 'Each Sherpa’s mission loop' },
  { k: 'machines', name: 'Production lines', desc: 'CC, MI and SMT lines in 3D' },
  { k: 'structures', name: 'Walls and pillars', desc: 'Clean room glass and hall columns' },
  { k: 'labels', name: 'Labels', desc: 'Sherpa tags and zone names' },
] as const;
export type LayerKey = (typeof LAYERS)[number]['k'];
export type ViewMode = '2d' | '25d' | '3d';
export type Panel = 'list' | 'layers' | 'zones' | null;

const KEY = 'atiflow.live.';
const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(KEY + k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch { /* private mode */ } };

const DEFAULT_LAYERS: Record<LayerKey, boolean> = { cad: true, pcA: false, pcB: false, zones: true, stations: true, routes: true, machines: true, structures: true, labels: true };

export interface LiveState {
  /** Bumped ~4x a second so panels re-read the (mutable) simulation. */
  tick: number;
  selectedId: string | null; follow: boolean; fleetFilter: string;
  mode: ViewMode; speed: 1 | 2 | 5; panel: Panel;
  zones: Zone[]; zoneVis: Record<ZoneType, boolean>;
  layers: Record<LayerKey, boolean>; cadOpacity: number;
  /** A zone being drawn on the map (set by the Zones popover, cleared by the map). */
  drawing: { type: ZoneType; name: string } | null;
  /** A point the map should fly to once it is ready (search hits, "View on map"). Consumed by the Live view. */
  focus: { x: number; y: number; dist: number } | null;
  select(id: string | null): void; setFollow(on: boolean): void; setFleet(id: string): void;
  setMode(m: ViewMode): void; setSpeed(s: 1 | 2 | 5): void; setPanel(p: Panel): void;
  toggleLayer(k: LayerKey): void; setCadOpacity(v: number): void; toggleZoneType(t: ZoneType): void;
  startDraw(type: ZoneType, name: string): void; cancelDraw(): void;
  addZone(type: ZoneType, name: string, r: Zone['r']): Zone; removeZone(id: string): void;
  focusOn(x: number, y: number, dist: number): void;
}

export const liveStore = createStore<LiveState>((set, get) => {
  const persistZones = (zones: Zone[]) => save('zones', zones.filter((z) => z.custom));
  return {
    tick: 0, selectedId: null, follow: false, fleetFilter: 'all',
    mode: load<ViewMode>('mode', '3d'), speed: load<1 | 2 | 5>('speed', 1), panel: typeof window !== 'undefined' && window.innerWidth < 900 ? null : 'list',
    zones: [...BASE_ZONES.map((z) => ({ ...z })), ...load<Zone[]>('zones', [])],
    zoneVis: load('zoneVis', Object.fromEntries(Object.keys(ZONE_TYPES).map((k) => [k, true])) as Record<ZoneType, boolean>),
    layers: { ...DEFAULT_LAYERS, ...load<Partial<Record<LayerKey, boolean>>>('layers', {}) }, cadOpacity: load('cadOpacity', 0.9),
    drawing: null, focus: null,
    focusOn: (x, y, dist) => set({ focus: { x, y, dist } }),
    select: (id) => set({ selectedId: id, follow: false }),
    setFollow: (follow) => set({ follow }),
    setFleet: (fleetFilter) => { const sel = get().selectedId; const o = sel ? sim.robots.find((r) => r.id === sel) : null; set({ fleetFilter, selectedId: o && fleetFilter !== 'all' && o.fleet !== fleetFilter ? null : sel }); },
    setMode: (mode) => { save('mode', mode); set({ mode }); },
    setSpeed: (speed) => { save('speed', speed); set({ speed }); },
    setPanel: (panel) => set({ panel }),
    toggleLayer: (k) => { const layers = { ...get().layers, [k]: !get().layers[k] }; save('layers', layers); set({ layers }); },
    setCadOpacity: (cadOpacity) => { save('cadOpacity', cadOpacity); set({ cadOpacity }); },
    toggleZoneType: (t) => { const zoneVis = { ...get().zoneVis, [t]: !get().zoneVis[t] }; save('zoneVis', zoneVis); set({ zoneVis }); },
    startDraw: (type, name) => set({ drawing: { type, name }, panel: null }),
    cancelDraw: () => set({ drawing: null }),
    addZone: (type, name, r) => {
      const pre = ZONE_TYPES[type].prefix; let i = 1; const zones = get().zones;
      while (zones.some((z) => z.id === `${pre}-${String(i).padStart(2, '0')}`)) i++;
      const z: Zone = { id: `${pre}-${String(i).padStart(2, '0')}`, type, name, r: r.map((v) => Math.round(v * 10) / 10) as Zone['r'], custom: true };
      const next = [...zones, z]; persistZones(next); set({ zones: next, drawing: null }); return z;
    },
    removeZone: (id) => { const next = get().zones.filter((z) => z.id !== id); persistZones(next); set({ zones: next }); },
  };
});
export const useLive = <T,>(sel: (s: LiveState) => T) => useStore(liveStore, sel);

/** The one simulation shared by the Live view and Fleets pages (zones come from the store, so drawn zones apply at once). */
export const sim = new FleetSim(() => liveStore.getState().zones);
sim.log(sim.robots.find((r) => r.id === 'SH-10K-04')!, 'raised an alert: obstacle detected near hall column C7');
sim.log(sim.robots.find((r) => r.id === 'XT-LITE-03')!, 'docked at CHG-01 to charge');
export const robotById = (id: string | null) => (id ? sim.robots.find((r) => r.id === id) ?? null : null);

/** Runs the simulation while any supervisor page is mounted (a short grace keeps it running across Live view <-> Fleets navigation). */
let users = 0, raf = 0, stopT: ReturnType<typeof setTimeout> | undefined;
function run() {
  let last = performance.now(), ui = 0;
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const sdt = dt * liveStore.getState().speed; const n = Math.ceil(sdt / 0.05);
    for (let i = 0; i < n; i++) sim.step(sdt / n);
    ui += dt; if (ui > 0.25) { ui = 0; liveStore.setState((s) => ({ tick: s.tick + 1 })); }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}
export function useLiveSim() {
  useEffect(() => {
    clearTimeout(stopT); if (users++ === 0 && !raf) run();
    return () => { if (--users === 0) stopT = setTimeout(() => { cancelAnimationFrame(raf); raf = 0; }, 1000); };
  }, []);
}
