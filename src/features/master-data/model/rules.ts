import type { ImportStatus, Material, MaterialDraft } from './types';

const key = (code: string) => code.trim().toLowerCase();
export const codeSet = (list: Pick<Material, 'code'>[]) => new Set(list.map((m) => key(m.code)));

/** "Added" = the code is already in the master list (checked + locked in the pickers), otherwise "Available". */
export const statusOf = (code: string, added: Set<string>): ImportStatus => (added.has(key(code)) ? 'added' : 'available');

/**
 * Append-only merge (annotations: "Newly added materials are appended to the primary list; existing materials remain untouched").
 * Rows whose code is already present (ignoring case) are dropped, so an import can never overwrite or duplicate a material.
 */
export function appendNew(list: Material[], rows: MaterialDraft[], source: Material['source'], now: number): Material[] {
  const have = codeSet(list); const add: Material[] = [];
  for (const r of rows) { const k = key(r.code); if (!k || have.has(k)) continue; have.add(k); add.push({ ...r, code: r.code.trim(), name: r.name.trim(), source, updatedAt: now }); }
  return add.length ? [...list, ...add] : list;
}

/** Manual "Add material" / edit form. `editing` = the code being edited (its own code doesn't count as a duplicate). */
export function validateMaterial(d: Pick<MaterialDraft, 'name' | 'code'>, list: Material[], editing?: string): Partial<Record<'name' | 'code', string>> {
  const e: Partial<Record<'name' | 'code', string>> = {};
  if (!d.name.trim()) e.name = 'Material name is required';
  if (!d.code.trim()) e.code = 'Material code is required';
  else if (key(d.code) !== key(editing ?? '') && codeSet(list).has(key(d.code))) e.code = `Material code "${d.code.trim()}" already exists`;
  return e;
}

/** "Showing 1,28,872 materials": the design uses Indian digit grouping. */
export const formatCount = (n: number) => n.toLocaleString('en-IN');

/** "Last Updated" column: Just now / 5 mins ago / 1 hour ago / Yesterday / 3 days ago / 12 Oct 2026. */
export function relativeTime(then: number, now: number): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 60) return 'Just now';
  const m = Math.round(s / 60); if (m < 60) return m === 1 ? '1 min ago' : `${m} mins ago`;
  const h = Math.round(m / 60); if (h < 24) return h === 1 ? '1 hour ago' : `${h} hours ago`;
  const d = Math.round(h / 24); if (d === 1) return 'Yesterday'; if (d < 7) return `${d} days ago`;
  return new Date(then).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
