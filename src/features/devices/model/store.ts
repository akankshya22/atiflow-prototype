import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { KINDS } from './kinds';
import { nameOf } from './validate';
import type { Device, DeviceKindId, FieldValue } from './types';

const KEY = 'atiflow.devices.v2';
type Lists = Record<DeviceKindId, Device[]>;
export interface DeviceState extends Lists {
  add(kind: DeviceKindId, values: Record<string, FieldValue>): void;
  update(kind: DeviceKindId, name: string, values: Record<string, FieldValue>): void;
  remove(kind: DeviceKindId, name: string): void;
  /** The fleet was renamed: robots and hardware keep their assignment. */
  renameFleet(from: string, to: string): void;
}

const seed = (): Lists => ({ robot: KINDS.robot.seed, hardware: KINDS.hardware.seed });
function load(): Lists {
  try { const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (Array.isArray(raw?.robot) && Array.isArray(raw?.hardware)) return raw; } catch { /* fall through */ }
  return seed();
}

export const deviceStore = createStore<DeviceState>((set, get) => ({
  ...load(),
  // new records start Offline: they have not connected yet
  add: (kind, values) => set({ [kind]: [...get()[kind], { status: 'offline', values }] } as Partial<Lists>),
  update: (kind, name, values) => set({ [kind]: get()[kind].map((d) => (nameOf(d) === name ? { ...d, values: { ...d.values, ...values } } : d)) } as Partial<Lists>),
  renameFleet: (from, to) => set(Object.fromEntries((['robot', 'hardware'] as const).map((k) => [k, get()[k].map((d) => (d.values.fleet === from ? { ...d, values: { ...d.values, fleet: to } } : d))]))),
  remove: (kind, name) => set({ [kind]: get()[kind].filter((d) => nameOf(d) !== name) } as Partial<Lists>),
}));
export const useDevices = <T,>(sel: (s: DeviceState) => T) => useStore(deviceStore, sel);

let timer: ReturnType<typeof setTimeout> | undefined;
deviceStore.subscribe((s, p) => {
  if (s.robot === p.robot && s.hardware === p.hardware) return;
  clearTimeout(timer); timer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify({ robot: s.robot, hardware: s.hardware })); } catch { /* no storage (tests / private mode) */ } }, 250);
});
