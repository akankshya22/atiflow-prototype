import { describe, expect, it } from 'vitest';
import { fetchCatalog, filterCatalog } from '../src/features/master-data/model/catalog';
import { parseMaterialsCsv, splitCsv, templateCsv } from '../src/features/master-data/model/csv';
import { appendNew, codeSet, formatCount, relativeTime, statusOf, validateMaterial } from '../src/features/master-data/model/rules';
import { materialStore } from '../src/features/master-data/model/store';
import type { Material } from '../src/features/master-data/model/types';

const mat = (code: string, name = code): Material => ({ code, name, group: 'Packaging', unit: 'pcs', source: 'api', updatedAt: 0 });

describe('API catalog (Import from API)', () => {
  it('starts with the Figma rows and has unique codes', () => {
    const c = fetchCatalog();
    expect(c.slice(0, 6).map((r) => r.code)).toEqual(['DCP-1001', 'DCP-1002', 'DCP-1003', 'DCP-1004', 'DCP-1005', 'DCP-1006']);
    expect(new Set(c.map((r) => r.code)).size).toBe(c.length);
  });
  it('prefix "DCP" lists every code starting with DCP, ignoring case', () => {
    expect(filterCatalog(fetchCatalog(), '', 'dcp').map((r) => r.name)).toEqual(['Drive Chain Pin 8mm', 'Drive Chain Plate 12mm', 'Chain Sprocket 24T', 'DC Power Cable 2m', 'Drive Coupling Pad', 'Dust Cover Panel']);
  });
  it('search matches name, code or group and combines with the prefix', () => {
    expect(filterCatalog(fetchCatalog(), 'sprocket', '').map((r) => r.code)).toEqual(['DCP-1003']);
    expect(filterCatalog(fetchCatalog(), 'electrical', 'DCP').map((r) => r.code)).toEqual(['DCP-1004']);
  });
});

describe('list rules', () => {
  it('appends only new codes and leaves existing materials untouched', () => {
    const list = [mat('DCP-1001', 'Original name')];
    const next = appendNew(list, [{ code: 'dcp-1001', name: 'Changed', group: 'x', unit: 'pcs' }, { code: 'MAT-1001', name: 'Steel Bracket 40mm', group: 'Fasteners & Fixings', unit: 'pcs' }], 'csv', 5);
    expect(next.map((m) => m.code)).toEqual(['DCP-1001', 'MAT-1001']);
    expect(next[0].name).toBe('Original name'); expect(next[1]).toMatchObject({ source: 'csv', updatedAt: 5 });
  });
  it('already-added rows are "added", the rest "available"', () => {
    const added = codeSet([mat('DCP-1001')]);
    expect(statusOf('dcp-1001', added)).toBe('added'); expect(statusOf('MAT-1004', added)).toBe('available');
  });
  it('manual form: name and code required, code unique ignoring case (except the one being edited)', () => {
    expect(Object.keys(validateMaterial({ name: ' ', code: '' }, []))).toEqual(['name', 'code']);
    expect(validateMaterial({ name: 'X', code: 'mat-1001' }, [mat('MAT-1001')]).code).toMatch(/already exists/);
    expect(validateMaterial({ name: 'X', code: 'MAT-1001' }, [mat('MAT-1001')], 'MAT-1001')).toEqual({});
  });
  it('formats counts like the design and relative times like the table', () => {
    expect(formatCount(128872)).toBe('1,28,872');
    const now = 10 * 86_400_000;
    expect([0, 5 * 60_000, 3_600_000, 86_400_000, 3 * 86_400_000].map((ago) => relativeTime(now - ago, now))).toEqual(['Just now', '5 mins ago', '1 hour ago', 'Yesterday', '3 days ago']);
  });
});

describe('CSV import', () => {
  it('splits quoted fields, escaped quotes and CRLF', () => {
    expect(splitCsv('a,"b, c","d ""e"""\r\n\r\n1,2,3\n')).toEqual([['a', 'b, c', 'd "e"'], ['1', '2', '3']]);
  });
  it('the downloadable template parses back to 24 rows (the Figma example: 24 rows, 2 already added)', () => {
    const r = parseMaterialsCsv(templateCsv()); if (!r.ok) throw new Error(r.reason);
    expect(r.rows).toHaveLength(24);
    const added = codeSet([mat('DCP-1001'), mat('DCP-1002')]);
    expect(r.rows.filter((x) => statusOf(x.code, added) === 'available')).toHaveLength(22);
  });
  it('accepts header aliases, fills defaults, skips incomplete and duplicate rows', () => {
    const r = parseMaterialsCsv('Code,Name,UOM\nA-1,Alpha,kg\nA-1,Dup,kg\n,No code,\nB-2,Beta,');
    expect(r).toEqual({ ok: true, skipped: 2, rows: [{ code: 'A-1', name: 'Alpha', group: 'Ungrouped', unit: 'kg' }, { code: 'B-2', name: 'Beta', group: 'Ungrouped', unit: 'pcs' }] });
  });
  it('a file without name and code columns is an unsupported format; a header-only file is empty', () => {
    expect(parseMaterialsCsv('foo,bar\n1,2')).toEqual({ ok: false, reason: 'format' });
    expect(parseMaterialsCsv('material_name,material_code\n')).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('store', () => {
  it('addMany reports how many were new; a CSV import appends rows over time and can be cancelled', async () => {
    const s = materialStore.getState();
    expect(s.addMany([{ code: 'T-1', name: 'One', group: 'g', unit: 'pcs' }], 'manual')).toBe(1);
    expect(materialStore.getState().addMany([{ code: 't-1', name: 'Again', group: 'g', unit: 'pcs' }], 'api')).toBe(0);
    const rows = ['T-2', 'T-3', 'T-4'].map((code) => ({ code, name: code, group: 'g', unit: 'pcs' }));
    let done = -1;
    materialStore.getState().startImport('f.csv', rows, (n) => { done = n; });
    await new Promise((r) => setTimeout(r, 900));
    expect(done).toBe(3); expect(materialStore.getState().job).toBeNull();
    expect(materialStore.getState().materials.map((m) => m.code)).toEqual(['T-1', 'T-2', 'T-3', 'T-4']);
    materialStore.getState().startImport('g.csv', [{ code: 'T-5', name: 'x', group: 'g', unit: 'pcs' }, { code: 'T-6', name: 'y', group: 'g', unit: 'pcs' }], () => {});
    expect(materialStore.getState().cancelImport()).toBe(0); expect(materialStore.getState().job).toBeNull();
  });
});
