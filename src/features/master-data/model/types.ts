/** One material in the master data (the "primary material list" the Workflow Builder picks from). `code` is the unique key. */
export interface Material {
  code: string;
  name: string;
  group: string;
  unit: string;
  /** Where it came from: the ERP/inventory API, a CSV upload or the manual form. */
  source: 'api' | 'csv' | 'manual';
  /** Epoch ms of the last change, shown as "Last Updated". */
  updatedAt: number;
}

/** A row offered for import (API catalog or a parsed CSV row) before it becomes a Material. */
export type MaterialDraft = Pick<Material, 'code' | 'name' | 'group' | 'unit'>;

/** Import rows are either new ("Available") or already in the list ("Added": checked, locked, can't be unticked). */
export type ImportStatus = 'available' | 'added';
