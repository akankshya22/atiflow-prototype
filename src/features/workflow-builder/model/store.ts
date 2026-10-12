import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { notify } from '@/ui/toast';
import { createNode, syncIds } from './factory';
import { applySteps, parsePrompt } from './parsePrompt';
import { newFleetWorkflow, seedFleets } from './seed';
import { insertNode, locate, moveNode, removeNode, updateField, type Problem } from './tree';
import { publishProblem } from './validate';
import type { FieldValue, Fleets, ListKey, NodeTypeId, WfNode } from './types';

const KEY = 'atiflow.workflows.v1';
export interface SimState { status: 'idle' | 'running' | 'done'; step: string; progress: number; currentId: string | null; taken: Record<string, 't' | 'o'>; visited: string[]; hlStation: string | null }
export const SIM_IDLE: SimState = { status: 'idle', step: '', progress: 0, currentId: null, taken: {}, visited: [], hlStation: null };
interface History { undo: string[]; redo: string[] }

export interface WfState {
  fleets: Fleets; current: string; selected: string | null; justAdded: string | null; hist: Record<string, History>; sim: SimState;
  nodes(): WfNode[];
  select(id: string | null): void;
  switchFleet(name: string): void; createFleet(name: string): boolean;
  addNode(t: NodeTypeId | 'aiot', key?: ListKey, at?: number): void;
  removeNode(id: string): void; moveNode(id: string, key: ListKey, at: number): void;
  setField(id: string, key: string, value: FieldValue, idx?: number): void;
  addMulti(id: string, key: string, options: string[]): void;
  undo(): void; redo(): void;
  buildFromPrompt(text: string): boolean; publish(): void;
  setSim(patch: Partial<SimState>): void;
}

function load(): { fleets: Fleets; current: string } {
  try { const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (raw?.fleets && raw.current in raw.fleets) { Object.values(raw.fleets as Fleets).forEach((f) => syncIds(f.nodes)); return raw; } } catch { /* fall through */ }
  const fleets = seedFleets(); return { fleets, current: 'Line Side Fleet' };
}
const boot = load();

export const wfStore = createStore<WfState>((set, get) => {
  const problem = (p: Problem | undefined) => { if (p) notify.warning(p.title, p.body || undefined, 'wf-problem'); return !!p; };
  /** Apply an edit to the current fleet's nodes and record undo history. No-op edits are ignored. */
  const commit = (next: WfNode[]) => {
    const { fleets, current, hist } = get(); const before = JSON.stringify(fleets[current].nodes); if (JSON.stringify(next) === before) return false;
    const h = hist[current] ?? { undo: [], redo: [] };
    set({ fleets: { ...fleets, [current]: { ...fleets[current], nodes: next } }, hist: { ...hist, [current]: { undo: [...h.undo, before].slice(-100), redo: [] } } }); return true;
  };
  return {
    fleets: boot.fleets, current: boot.current, selected: null, justAdded: null, hist: {}, sim: SIM_IDLE,
    nodes: () => get().fleets[get().current].nodes,
    select: (selected) => set({ selected }),
    switchFleet: (name) => set({ current: name, selected: null, sim: SIM_IDLE }),
    createFleet(name) {
      let n = name.trim();
      if (!n) { notify.warning('Give the fleet a name first.', 'For example: Warehouse Fleet', 'fleet-name'); return false; }
      if (!/fleet$/i.test(n)) n += ' Fleet';
      if (Object.keys(get().fleets).some((k) => k.toLowerCase() === n.toLowerCase())) { notify.warning(`${n} already exists.`, 'Pick a different name.', 'fleet-name'); return false; }   // names are unique ignoring case
      set({ fleets: { ...get().fleets, [n]: newFleetWorkflow() }, current: n, selected: null, sim: SIM_IDLE });
      notify.success(`${n} created`, 'Drag nodes from the palette, or describe the workflow to Ati AI.', 'fleet-created'); return true;
    },
    addNode(t, key = 'main', at) {
      if (t === 'aiot') { problem({ title: 'AIoT has no node card in the Figma file yet', body: 'Only the palette tile is designed, so it can’t be added to the canvas.' }); return; }
      const node = createNode(t, t === 'station' && key !== 'main' ? { station: ['S101'] } : undefined);
      const r = insertNode(get().nodes(), node, key, at); if (problem(r.problem)) return;
      commit(r.nodes); set({ selected: node.id, justAdded: node.id });
    },
    removeNode(id) { const r = removeNode(get().nodes(), id); if (problem(r.problem)) return; commit(r.nodes); if (get().selected === id) set({ selected: null }); },
    moveNode(id, key, at) { const r = moveNode(get().nodes(), id, key, at); if (problem(r.problem)) return; commit(r.nodes); },
    setField(id, key, value, idx) { commit(updateField(get().nodes(), id, key, value, idx)); set({ selected: id }); },
    addMulti(id, key, options) {
      const n = locate(get().nodes(), id)?.node; if (!n) return; const cur = n.f[key]; const vals = Array.isArray(cur) ? cur : [cur as string];
      const next = options.find((o) => !vals.includes(o)); if (!next) { notify.warning('Every option is already added.', '', 'wf-problem'); return; }
      commit(updateField(get().nodes(), id, key, [...vals, next]));
    },
    undo() { const { current, hist, fleets } = get(); const h = hist[current]; const s = h?.undo.at(-1); if (!h || s === undefined) return;
      set({ fleets: { ...fleets, [current]: { ...fleets[current], nodes: JSON.parse(s) } }, hist: { ...hist, [current]: { undo: h.undo.slice(0, -1), redo: [...h.redo, JSON.stringify(fleets[current].nodes)] } }, selected: null }); },
    redo() { const { current, hist, fleets } = get(); const h = hist[current]; const s = h?.redo.at(-1); if (!h || s === undefined) return;
      set({ fleets: { ...fleets, [current]: { ...fleets[current], nodes: JSON.parse(s) } }, hist: { ...hist, [current]: { redo: h.redo.slice(0, -1), undo: [...h.undo, JSON.stringify(fleets[current].nodes)] } }, selected: null }); },
    buildFromPrompt(text) {
      const steps = parsePrompt(text);
      if (!steps.length) { notify.error('Ati AI couldn’t find any steps', 'Try: “material 003, if quantity greater than 10 go to S103, otherwise S102, confirm, drop at STA-104”', 'ai'); return false; }
      commit(applySteps(get().nodes(), steps)); set({ justAdded: steps[0].id });
      notify.success(`Built ${steps.length} step${steps.length > 1 ? 's' : ''} from your description`, 'Use the back arrow at the top to undo.', 'ai'); return true;
    },
    publish() {
      const p = publishProblem(get().nodes()); if (p) { notify.warning(p.title, p.body, 'publish'); return; }
      notify.success(`Workflow published to ${get().current}`, `${get().nodes().length} nodes are live. Use Simulate to watch a test run on the map.`, 'publish');
    },
    setSim: (patch) => set({ sim: { ...get().sim, ...patch } }),
  };
});
export const useWorkflow = <T,>(sel: (s: WfState) => T) => useStore(wfStore, sel);

// persist workflows (not history/sim) shortly after any change
let timer: ReturnType<typeof setTimeout> | undefined;
wfStore.subscribe((s, p) => { if (s.fleets === p.fleets && s.current === p.current) return; clearTimeout(timer); timer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify({ fleets: s.fleets, current: s.current })); } catch { /* no storage (tests / private mode) */ } }, 250); });

if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { __wf: wfStore });   // dev-only handle for console testing
