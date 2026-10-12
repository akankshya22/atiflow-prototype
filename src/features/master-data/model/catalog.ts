import type { MaterialDraft } from './types';

/**
 * Mock of the client's ERP / inventory API ("Import from API"). The rows Figma shows come first (DCP-100x, MAT-100x); the rest is
 * generated deterministically so search, prefix filter and select-all have realistic data. Swap `fetchCatalog` for the real API later.
 */
export const GROUPS = ['Fasteners & Fixings', 'Sub-Assemblies', 'Electrical', 'Consumables', 'Packaging', 'Raw Materials'] as const;
export const UNITS = ['pcs', 'kg', 'L', 'm', 'roll', 'box'] as const;

const FIGMA_ROWS: MaterialDraft[] = [
  { code: 'DCP-1001', name: 'Drive Chain Pin 8mm', group: 'Fasteners & Fixings', unit: 'pcs' },
  { code: 'DCP-1002', name: 'Drive Chain Plate 12mm', group: 'Sub-Assemblies', unit: 'pcs' },
  { code: 'DCP-1003', name: 'Chain Sprocket 24T', group: 'Sub-Assemblies', unit: 'pcs' },
  { code: 'DCP-1004', name: 'DC Power Cable 2m', group: 'Electrical', unit: 'pcs' },
  { code: 'DCP-1005', name: 'Drive Coupling Pad', group: 'Consumables', unit: 'pcs' },
  { code: 'DCP-1006', name: 'Dust Cover Panel', group: 'Packaging', unit: 'pcs' },
  { code: 'MAT-1001', name: 'Steel Bracket 40mm', group: 'Fasteners & Fixings', unit: 'pcs' },
  { code: 'MAT-1002', name: 'Hex Bolt M8×30', group: 'Fasteners & Fixings', unit: 'pcs' },
  { code: 'MAT-1003', name: 'Carton Box 600×400', group: 'Packaging', unit: 'pcs' },
  { code: 'MAT-1004', name: 'Engine Mount Assy', group: 'Sub-Assemblies', unit: 'pcs' },
  { code: 'MAT-1005', name: 'Hydraulic Oil ISO 46', group: 'Consumables', unit: 'L' },
  { code: 'MAT-1006', name: 'Wiring Harness WH-12', group: 'Electrical', unit: 'pcs' },
  { code: 'MAT-1007', name: 'Aluminium Sheet 2mm', group: 'Raw Materials', unit: 'kg' },
  { code: 'MAT-1008', name: 'Stretch Film 500mm', group: 'Packaging', unit: 'roll' },
];

/** prefix -> group, unit and name parts that are combined into many plausible items */
const FAMILIES: { prefix: string; group: (typeof GROUPS)[number]; unit: string; items: string[]; sizes: string[] }[] = [
  { prefix: 'FST', group: 'Fasteners & Fixings', unit: 'pcs', items: ['Hex Bolt', 'Socket Screw', 'Flat Washer', 'Spring Washer', 'Nyloc Nut', 'Rivet', 'Anchor Bolt'], sizes: ['M4', 'M5', 'M6', 'M8', 'M10', 'M12'] },
  { prefix: 'ELC', group: 'Electrical', unit: 'pcs', items: ['Proximity Sensor', 'Relay Module', 'Cable Gland', 'Terminal Block', 'Fuse', 'Contactor'], sizes: ['12V', '24V', '48V', '230V'] },
  { prefix: 'PKG', group: 'Packaging', unit: 'pcs', items: ['Carton Box', 'Foam Insert', 'Pallet Wrap', 'Label Roll', 'Tote Bin'], sizes: ['S', 'M', 'L', 'XL'] },
  { prefix: 'CON', group: 'Consumables', unit: 'L', items: ['Coolant', 'Grease', 'Cutting Oil', 'Cleaning Solvent', 'Thread Locker'], sizes: ['1L', '5L', '20L'] },
  { prefix: 'RAW', group: 'Raw Materials', unit: 'kg', items: ['Steel Rod', 'Copper Wire', 'ABS Pellets', 'Aluminium Bar', 'Brass Sheet'], sizes: ['6mm', '10mm', '16mm', '25mm'] },
  { prefix: 'SUB', group: 'Sub-Assemblies', unit: 'pcs', items: ['Motor Mount', 'Gearbox Housing', 'Caster Assy', 'Bumper Assy', 'Battery Tray'], sizes: ['A', 'B', 'C', 'D'] },
];

function generate(): MaterialDraft[] {
  const out = [...FIGMA_ROWS];
  for (const f of FAMILIES) {
    let n = 1001;
    for (const item of f.items) for (const size of f.sizes) out.push({ code: `${f.prefix}-${n++}`, name: `${item} ${size}`, group: f.group, unit: f.unit });
  }
  return out;
}

let cache: MaterialDraft[] | undefined;
/** The whole API catalog (sync in the prototype; a real adapter would page through the API). */
export const fetchCatalog = (): MaterialDraft[] => (cache ??= generate());

/**
 * Search box + "Code prefix / Starts with" filter of the API picker. Search matches name, code or group (Figma placeholder
 * "Search by name, code, desc"); the prefix matches the start of the code, ignoring case.
 */
export function filterCatalog(rows: MaterialDraft[], query: string, prefix: string): MaterialDraft[] {
  const q = query.trim().toLowerCase(); const p = prefix.trim().toLowerCase();
  return rows.filter((r) => (!p || r.code.toLowerCase().startsWith(p)) && (!q || `${r.name} ${r.code} ${r.group}`.toLowerCase().includes(q)));
}
