import { Badge } from '@/components/base/badges/badges';
import { Table } from '@/components/application/table/table';
import { nameOf } from '../model/validate';
import type { Device, DeviceKind } from '../model/types';
import { StatusBadge } from './StatusBadge';

/** The list table shared by Robots and Hardware: name + picture, type badge, assigned fleet, status. Rows open the detail page. */
export function DeviceTable({ kind, rows, onOpen }: { kind: DeviceKind; rows: Device[]; onOpen(d: Device): void }) {
  return (
    <Table aria-label={kind.plural} size="sm" className="min-w-[640px]">
      <Table.Header>
        <Table.Head id="name" isRowHeader label={kind.columns.name.toUpperCase()} className="px-4" />
        <Table.Head id="type" label={kind.columns.type.toUpperCase()} className="px-4" />
        <Table.Head id="fleet" label="ASSIGNED FLEET" className="px-4" />
        <Table.Head id="status" label="STATUS" className="w-32 px-4" />
      </Table.Header>
      <Table.Body>
        {rows.map((d) => (
          <Table.Row key={nameOf(d)} id={nameOf(d)} onAction={() => onOpen(d)} className="h-auto cursor-pointer even:bg-secondary">
            <Table.Cell className="px-4 py-3"><div className="flex items-center gap-3">{kind.thumb(d)}<span className="text-sm font-bold whitespace-nowrap text-primary">{nameOf(d)}</span></div></Table.Cell>
            <Table.Cell className="px-4 py-3"><Badge size="md" type="pill-color" color="gray">{kind.typeOf(d)}</Badge></Table.Cell>
            <Table.Cell className="px-4 py-3">{d.values.fleet || <span className="text-quaternary">Unassigned</span>}</Table.Cell>
            <Table.Cell className="px-4 py-3"><StatusBadge status={d.status} /></Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
}
