import type { FC, ReactNode } from 'react';

export type DeviceKindId = 'robot' | 'hardware';
export type FieldValue = string | string[];
export type DeviceStatus = 'online' | 'offline';

/** One stored robot / hardware record. `values` is keyed by FieldDef.key; `values.name` is the unique name, `values.fleet` the fleet ('' = unassigned). */
export interface Device { status: DeviceStatus; values: Record<string, FieldValue> }

/** One form field. The Add modal and the detail page both render from the same list, so a field is declared exactly once per device kind. */
export interface FieldDef {
  key: string; label: string;
  control: 'text' | 'secret' | 'select' | 'checks' | 'fleet';
  options?: string[]; placeholder?: string;
  required?: boolean; unique?: boolean;
  /** Small badge beside the label, e.g. "Ati Exclusive". */
  tag?: string;
  /** Add modal: omitted = not asked, 'half' = two per row. */
  modal?: 'full' | 'half';
  /** Detail page: omitted = not shown. */
  detail?: boolean | { label?: string; display?: 'text' | 'badge' | 'badges'; editable?: boolean };
  /** Position in the detail grid (lower first); fields without one keep declaration order after the ordered ones. */
  detailOrder?: number;
  /** Value used when the modal does not ask for it (new records). */
  initial?: FieldValue;
}

export interface EmptyStateDef { headline: string; description: string; hint?: string; prompt?: string; quickPicks?: { label: string; value: string; icon: FC<{ className?: string }> }[] }

/** Everything that differs between Robots and Hardware. Add another device kind (maps, chargers...) by adding one more entry in kinds.tsx. */
export interface DeviceKind {
  id: DeviceKindId;
  route: string;                                    // path segment under /configurator
  singular: string; plural: string;
  subtitle: string; addLabel: string; addSubtitle: string;
  columns: { name: string; type: string };
  detail: { heading: string; description: string; tabs?: string[] };
  fields: FieldDef[];
  icon: FC<{ className?: string }>;      // featured icon of the Add modal
  typeOf(d: Device): string;                        // text of the "type" column / badge
  headerBadges(d: Device): string[];                // neutral badges next to the big name on the detail page
  thumb(d: Device): ReactNode;                      // list-row picture
  illustration(d: Device): ReactNode;               // detail header picture
  preview(values: Record<string, FieldValue>): { heading?: string; image: ReactNode; caption: string };
  empty: EmptyStateDef; emptyIllustration: ReactNode;
  seed: Device[];
}
