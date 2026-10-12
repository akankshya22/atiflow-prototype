import { useState } from 'react';
import { LayersThree01 } from '@untitledui/icons';
import { ModalShell } from '@/components/modal/ModalShell';
import { notify } from '@/ui/toast';
import { copy } from '../copy';
import { groupFields } from '../model/fields';
import { validateGroup } from '../model/logic';
import { masterDataStore, useMasterData } from '../model/store';
import type { MaterialGroup } from '../model/types';
import { FieldStack } from './MaterialForm';

function Body({ group, onOpenChange }: { group: MaterialGroup | 'new'; onOpenChange(o: boolean): void }) {
  const groups = useMasterData((s) => s.groups); const editing = group === 'new' ? undefined : group; const f = groupFields();
  const [v, setV] = useState({ name: editing?.name ?? '', prefix: editing?.prefix ?? '' }); const [errors, setErrors] = useState<Record<string, string>>({});
  const save = () => {
    const e = validateGroup(v, groups, editing?.id); setErrors(e); if (Object.keys(e).length) return;
    if (editing) { masterDataStore.getState().updateGroup(editing.id, v); notify.success(copy.groups.updated, undefined, 'group-saved'); }
    else { masterDataStore.getState().createGroup(v.name, v.prefix); const c = copy.groups.created(v.name.trim()); notify.success(c.title, c.body, 'group-saved'); }
    onOpenChange(false);
  };
  const t = copy.groups.form;
  return (
    <ModalShell isOpen onOpenChange={onOpenChange} icon={LayersThree01} title={editing ? t.editTitle : t.createTitle} subtitle={editing ? undefined : t.createSubtitle}
      secondary={{ label: t.cancel, onPress: () => onOpenChange(false) }} primary={{ label: editing ? t.save : t.create }} onSubmit={save}>
      <FieldStack fields={[f.name, f.prefix]} values={v} errors={errors} onChange={(k, val) => { setV((o) => ({ ...o, [k]: val })); setErrors((o) => ({ ...o, [k]: '' })); }} />
    </ModalShell>
  );
}
/** Create (`'new'`) or edit a station group. Mounted only while open, so it always starts from the group's current values. */
export const GroupFormModal = ({ group, onOpenChange }: { group: MaterialGroup | 'new' | null; onOpenChange(o: boolean): void }) => (group ? <Body key={group === 'new' ? 'new' : group.id} group={group} onOpenChange={onOpenChange} /> : null);
