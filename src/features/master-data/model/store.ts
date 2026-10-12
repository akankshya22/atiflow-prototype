import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { appendNew } from './rules';
import type { Material, MaterialDraft } from './types';

const KEY = 'atiflow.materials.v1';
/** Rows written per tick of a CSV import, and the tick length: 22 rows take ~2.6 s, long enough to see the progress modal. */
const BATCH = 1; const TICK_MS = 120;

export interface ImportJob { file: string; total: number; done: number; pending: MaterialDraft[] }
export interface MaterialState {
  materials: Material[];
  /** CSV import in progress (null when idle). It keeps running when its modal is closed ("Run in background"). */
  job: ImportJob | null;
  /** Append rows whose code is new; returns how many were added. */
  addMany(rows: MaterialDraft[], source: Material['source']): number;
  /** Edit name / code / group / unit of one material (no delete: materials may already be used in workflows). */
  update(code: string, patch: Partial<MaterialDraft>): void;
  startImport(file: string, rows: MaterialDraft[], onDone: (imported: number) => void): void;
  cancelImport(): number;
}

function load(): Material[] {
  try { const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (Array.isArray(raw)) return raw; } catch { /* fall through */ }
  return [];   // first use: empty, the flow starts with "Add materials"
}

let ticker: ReturnType<typeof setInterval> | undefined;
export const materialStore = createStore<MaterialState>((set, get) => ({
  materials: load(),
  job: null,
  addMany: (rows, source) => { const before = get().materials; const next = appendNew(before, rows, source, Date.now()); set({ materials: next }); return next.length - before.length; },
  update: (code, patch) => set({ materials: get().materials.map((m) => (m.code === code ? { ...m, ...patch, updatedAt: Date.now() } : m)) }),
  startImport: (file, rows, onDone) => {
    clearInterval(ticker);
    set({ job: { file, total: rows.length, done: 0, pending: rows } });
    const startedAt = Date.now();   // one timestamp for the whole file, so its rows stay together and in file order
    ticker = setInterval(() => {
      const job = get().job; if (!job) { clearInterval(ticker); return; }
      const batch = job.pending.slice(0, BATCH);
      set({ materials: appendNew(get().materials, batch, 'csv', startedAt), job: { ...job, done: job.done + batch.length, pending: job.pending.slice(BATCH) } });
      if (job.pending.length <= BATCH) { clearInterval(ticker); const n = job.total; setTimeout(() => { set({ job: null }); onDone(n); }, 300); }
    }, TICK_MS);
  },
  /** Stops the import; rows already written stay in the list. Returns how many were imported. */
  cancelImport: () => { clearInterval(ticker); const done = get().job?.done ?? 0; set({ job: null }); return done; },
}));
export const useMaterials = <T,>(sel: (s: MaterialState) => T) => useStore(materialStore, sel);

let timer: ReturnType<typeof setTimeout> | undefined;
materialStore.subscribe((s, p) => {
  if (s.materials === p.materials) return;
  clearTimeout(timer); timer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(s.materials)); } catch { /* no storage (tests / private mode) */ } }, 250);
});
