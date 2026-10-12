import { useEffect, useState } from 'react';
import { Edit01 } from '@untitledui/icons';
import { ButtonUtility } from '@/components/base/buttons/button-utility';
import { Table } from '@/components/application/table/table';
import { relativeTime } from '../model/rules';
import type { Material } from '../model/types';

/** Re-render every 30 s so "Just now" turns into "1 min ago" while the page is open. */
function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

/**
 * The primary material list (Figma 642:59143): material name with its code underneath, group, last updated, edit pencil.
 * Newest first, so freshly imported rows are on top. No delete action on purpose (annotation: they may be used in workflows).
 */
export function MaterialsTable({ rows, onEdit }: { rows: Material[]; onEdit(m: Material): void }) {
  const now = useNow();
  return (
    <Table aria-label="Materials" size="sm" className="min-w-[620px]">
      <Table.Header className="sticky top-0 z-10">
        <Table.Head id="name" isRowHeader label="Material" className="px-6" />
        <Table.Head id="group" label="Material Group" tooltip="The category a material belongs to, from your ERP or CSV file." className="w-56 px-4" />
        <Table.Head id="updated" label="Last Updated" className="w-40 px-4" />
        <Table.Head id="actions" className="w-16 px-4" />
      </Table.Header>
      <Table.Body items={rows.map((m) => ({ ...m, id: m.code }))}>
        {(m) => (
          <Table.Row id={m.code} className="h-[72px] even:bg-secondary">
            <Table.Cell className="px-6"><p className="font-medium whitespace-nowrap text-primary">{m.name}</p><p className="text-tertiary">{m.code}</p></Table.Cell>
            <Table.Cell className="px-4 whitespace-nowrap">{m.group}</Table.Cell>
            <Table.Cell className="px-4 whitespace-nowrap">{relativeTime(m.updatedAt, now)}</Table.Cell>
            <Table.Cell className="px-4"><ButtonUtility icon={Edit01} tooltip={`Edit ${m.name}`} color="tertiary" size="xs" onPress={() => onEdit(m)} /></Table.Cell>
          </Table.Row>
        )}
      </Table.Body>
    </Table>
  );
}
