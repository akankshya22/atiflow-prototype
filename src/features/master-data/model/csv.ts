import { fetchCatalog } from './catalog';
import type { MaterialDraft } from './types';

export const MAX_CSV_BYTES = 10 * 1024 * 1024;
export const TEMPLATE_NAME = 'materials_template.csv';
const COLUMNS = ['material_name', 'material_code', 'material_group', 'unit'] as const;

/** Header aliases -> field. Headers are compared without case, spaces or punctuation ("Material Code" = "material_code" = "code"). */
const ALIASES: Record<string, keyof MaterialDraft> = {
  materialname: 'name', name: 'name', material: 'name', description: 'name',
  materialcode: 'code', code: 'code', sku: 'code', partno: 'code', partnumber: 'code',
  materialgroup: 'group', group: 'group', category: 'group',
  unit: 'unit', uom: 'unit', units: 'unit',
};
const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

/** RFC 4180-ish: commas, CRLF/LF, double-quoted fields with "" escapes. Blank lines are dropped. */
export function splitCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

export type CsvResult =
  | { ok: true; rows: MaterialDraft[]; skipped: number }
  | { ok: false; reason: 'format' | 'empty' | 'size' };

/** Turns an uploaded file's text into material rows. Needs a name and a code column; later duplicates of a code are skipped. */
export function parseMaterialsCsv(text: string): CsvResult {
  const [header, ...body] = splitCsv(text);
  if (!header) return { ok: false, reason: 'empty' };
  const cols = header.map((h) => ALIASES[norm(h)]);
  if (!cols.includes('name') || !cols.includes('code')) return { ok: false, reason: 'format' };
  const seen = new Set<string>(); const rows: MaterialDraft[] = []; let skipped = 0;
  for (const r of body) {
    const d: MaterialDraft = { code: '', name: '', group: '', unit: '' };
    cols.forEach((k, i) => { if (k && !d[k]) d[k] = (r[i] ?? '').trim(); });
    const key = d.code.toLowerCase();
    if (!d.code || !d.name || seen.has(key)) { skipped++; continue; }
    seen.add(key); rows.push({ ...d, group: d.group || 'Ungrouped', unit: d.unit || 'pcs' });
  }
  return rows.length ? { ok: true, rows, skipped } : { ok: false, reason: 'empty' };
}

/** Which uploads we try to read. XLSX needs a spreadsheet parser the prototype does not ship, so it gets the "unsupported" state. */
export const isCsvFile = (name: string) => /\.csv$/i.test(name);

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
/** "Download template": the header row plus 24 sample rows from the API catalog (two of them, DCP-1001/1002, are often already added). */
export function templateCsv(): string {
  const sample = fetchCatalog().filter((r) => !r.code.startsWith('DCP') || r.code <= 'DCP-1002').slice(0, 24);
  const ordered = [...sample.filter((r) => r.code.startsWith('MAT')), ...sample.filter((r) => !r.code.startsWith('MAT'))];
  return [COLUMNS.join(','), ...ordered.map((r) => [r.name, r.code, r.group, r.unit].map(esc).join(','))].join('\n') + '\n';
}
