import type { Selection } from 'react-aria-components';
import { Badge } from '@/components/base/badges/badges';
import { Table } from '@/components/application/table/table';
import { statusOf } from '../model/rules';
import type { MaterialDraft } from '../model/types';

interface Props {
  rows: MaterialDraft[];
  /** Codes (lower case) already in the master list: shown checked, locked, badged "Added". */
  added: Set<string>;
  /** The user's picks (codes). Locked rows are never part of it. */
  selected: Set<string>;
  onChange(next: Set<string>): void;
  /** Status column ("Available" / "Added"): only once a list exists (add more, CSV review). */
  showStatus?: boolean;
  label: string;
}

/**
 * Selectable material table used by "Import from API", "Add more from API" and the CSV "Review import" step. The header checkbox
 * selects every row currently listed (annotation: "Global checkbox selects all results"); rows already added stay ticked and disabled.
 */
export function PickTable({ rows, added, selected, onChange, showStatus, label }: Props) {
  const locked = rows.filter((r) => statusOf(r.code, added) === 'added').map((r) => r.code);
  const onSel = (keys: Selection) => {
    const lockedSet = new Set(locked);
    const picked = keys === 'all' ? rows.map((r) => r.code) : [...keys].map(String);
    onChange(new Set(picked.filter((c) => !lockedSet.has(c))));
  };
  return (
    <div className="max-h-[392px] overflow-y-auto rounded-xl ring-1 ring-secondary" data-testid="pick-table">
      <Table aria-label={label} size="sm" selectionMode="multiple" selectionBehavior="toggle" disabledBehavior="selection"
        selectedKeys={new Set([...selected, ...locked])} disabledKeys={locked} onSelectionChange={onSel} className="min-w-[520px]">
        <Table.Header className="sticky top-0 z-10">
          <Table.Head id="name" isRowHeader label="Material" className="px-3" />
          <Table.Head id="code" label="Material code" className="w-36 px-3" />
          <Table.Head id="group" label="Material group" className="px-3" />
          {showStatus ? <Table.Head id="status" label="Status" className="w-28 px-3" /> : null}
        </Table.Header>
        <Table.Body items={rows.map((r) => ({ ...r, id: r.code }))}>
          {(r) => {
            const isAdded = statusOf(r.code, added) === 'added';
            return (
              <Table.Row id={r.code} className="h-16 even:bg-secondary">
                <Table.Cell className="px-3 font-medium whitespace-nowrap text-primary">{r.name}</Table.Cell>
                <Table.Cell className="px-3 font-medium whitespace-nowrap text-primary">{r.code}</Table.Cell>
                <Table.Cell className="px-3 whitespace-nowrap">{r.group}</Table.Cell>
                {showStatus ? <Table.Cell className="px-3">{isAdded ? <Badge size="sm" type="pill-color" color="success">Added</Badge> : <Badge size="sm" type="pill-color" color="gray">Available</Badge>}</Table.Cell> : null}
              </Table.Row>
            );
          }}
        </Table.Body>
      </Table>
    </div>
  );
}
