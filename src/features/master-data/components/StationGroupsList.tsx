import { useMemo, useState } from 'react';
import { Edit05, Plus, SearchLg, Trash01 } from '@untitledui/icons';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Select } from '@/components/base/select/select';
import { DataTable, type Column } from '@/components/data/DataTable';
import { RowMenu } from '@/components/data/RowMenu';
import { ConfirmDialog } from '@/components/modal/ConfirmDialog';
import { notify } from '@/ui/toast';
import { timeAgo } from '@/utils/timeAgo';
import { copy } from '../copy';
import { filterGroups, groupCount } from '../model/logic';
import { masterDataStore, useMasterData } from '../model/store';
import type { MaterialGroup } from '../model/types';
import { GroupFormModal } from './GroupFormModal';
import { SubTabs, type SubTab } from './SubTabs';

type Scope = 'all' | 'used' | 'empty';
/** Station Groups sub-tab: the material groups with how many materials each holds. Only empty groups can be deleted. */
export function StationGroupsList({ sub, onSub }: { sub: SubTab; onSub(v: SubTab): void }) {
  const groups = useMasterData((s) => s.groups); const materials = useMasterData((s) => s.materials);
  const [text, setText] = useState(''); const [scope, setScope] = useState<Scope>('all'); const [form, setForm] = useState<MaterialGroup | 'new' | null>(null); const [removing, setRemoving] = useState<MaterialGroup | null>(null);
  const rows = useMemo(() => filterGroups(groups, materials, { text, scope }), [groups, materials, text, scope]); const now = Date.now();
  const columns: Column<MaterialGroup>[] = [
    { id: 'group', header: copy.groups.columns.group, cell: (g) => <span className="text-sm font-medium text-primary">{g.name}</span> },
    { id: 'materials', header: copy.groups.columns.materials, headClassName: 'w-32', className: 'w-32', cell: (g) => groupCount(materials, g.id) },
    { id: 'updated', header: copy.groups.columns.updated, headClassName: 'w-40', className: 'w-40', cell: (g) => timeAgo(g.updatedAt, now, copy.time.justNow) },
    { id: 'menu', header: '', headClassName: 'w-12', className: 'w-12 text-right', cell: (g) => (
      <RowMenu label={copy.groups.rowMenu.label} onAction={(id) => (id === 'edit' ? setForm(g) : setRemoving(g))}
        items={[{ id: 'edit', label: copy.groups.rowMenu.rename, icon: Edit05 }, { id: 'delete', label: groupCount(materials, g.id) ? `${copy.groups.rowMenu.delete} (${copy.groups.rowMenu.deleteBlocked})` : copy.groups.rowMenu.delete, icon: Trash01, isDisabled: groupCount(materials, g.id) > 0 }]} />) },
  ];
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SubTabs value={sub} onChange={onSub} />
        <Button size="sm" color="primary" iconLeading={Plus} onPress={() => setForm('new')}>{copy.groups.create}</Button>
      </div>
      <p className="text-sm text-tertiary">{copy.groups.note}</p>
      <div className="flex flex-wrap gap-3">
        <Input className="min-w-60 flex-1" size="sm" icon={SearchLg} aria-label={copy.groups.searchPlaceholder} placeholder={copy.groups.searchPlaceholder} value={text} onChange={setText} />
        <Select size="sm" aria-label="Filter" className="w-[200px]" selectedKey={scope} onSelectionChange={(k) => setScope(k as Scope)}
          items={(Object.keys(copy.groups.scopes) as Scope[]).map((id) => ({ id, label: copy.groups.filter(copy.groups.scopes[id]) }))}>{(item) => <Select.Item {...item} />}</Select>
      </div>
      {rows.length === 0 ? <p className="p-10 text-center text-sm text-tertiary">{groups.length ? copy.groups.noMatch(text) : copy.groups.empty}</p>
        : <div className="min-h-0 overflow-auto rounded-xl border border-secondary"><DataTable label={copy.sub.groups} rows={rows} rowKey={(g) => g.id} columns={columns} minWidth={480} stickyHeader /></div>}
      <GroupFormModal group={form} onOpenChange={(o) => !o && setForm(null)} />
      <ConfirmDialog isOpen={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title={copy.groups.delete.title(removing?.name ?? '')} description={copy.groups.delete.body} confirmLabel={copy.groups.delete.confirm}
        onConfirm={() => { if (removing) { masterDataStore.getState().deleteGroup(removing.id); notify.success(copy.groups.deleted(removing.name), undefined, 'group-deleted'); } }} />
    </>
  );
}
