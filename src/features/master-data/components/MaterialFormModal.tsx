import { useState } from 'react';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Select } from '@/components/base/select/select';
import { notify } from '@/ui/toast';
import { GROUPS, UNITS } from '../model/catalog';
import { validateMaterial } from '../model/rules';
import { materialStore, useMaterials } from '../model/store';
import type { Material } from '../model/types';
import { MdModal } from './MdModal';

interface Props { isOpen: boolean; onOpenChange(o: boolean): void; editing?: Material; onBack?(): void }
const opts = (list: readonly string[]) => list.map((x) => ({ id: x, label: x }));

/**
 * "Add material" (Figma 642:59788: name + code) and, from the row pencil, "Edit material". Group and unit are extra fields the
 * table needs; the code is fixed once added because workflows refer to it.
 */
function Body({ editing, close, onBack }: { editing?: Material; close(): void; onBack?(): void }) {
  const list = useMaterials((s) => s.materials);
  const [name, setName] = useState(editing?.name ?? ''); const [code, setCode] = useState(editing?.code ?? '');
  const [group, setGroup] = useState(editing?.group ?? GROUPS[0]); const [unit, setUnit] = useState(editing?.unit ?? UNITS[0]);
  const [errors, setErrors] = useState<ReturnType<typeof validateMaterial>>({});
  const submit = () => {
    const e = validateMaterial({ name, code }, list, editing?.code); setErrors(e); if (Object.keys(e).length) return;
    if (editing) { materialStore.getState().update(editing.code, { name: name.trim(), group, unit }); notify.success('Material updated', `${name.trim()} was saved.`, 'material-saved'); }
    else { materialStore.getState().addMany([{ name, code, group, unit }], 'manual'); notify.success('New Material Added', 'New Material was added successfully', 'material-added'); }
    close();
  };
  return (
    <MdModal isOpen onOpenChange={(o) => !o && close()} onSubmit={submit} title={editing ? 'Edit material' : 'Add material'}
      subtitle={editing ? `Update the details of ${editing.code}.` : 'Enter the details for a single material.'}
      actions={<><Button type="button" color="secondary" size="lg" onPress={onBack ?? close}>{onBack ? 'Back' : 'Cancel'}</Button><Button type="submit" color="primary" size="lg">{editing ? 'Save changes' : 'Add material'}</Button></>}>
      <Input label="Material name" placeholder="e.g. Steel Bracket 40mm" value={name} onChange={(v) => { setName(v); setErrors((o) => ({ ...o, name: undefined })); }} isInvalid={!!errors.name} hint={errors.name} autoFocus />
      <Input label="Material code" placeholder="MAT001" value={code} isDisabled={!!editing} onChange={(v) => { setCode(v); setErrors((o) => ({ ...o, code: undefined })); }} isInvalid={!!errors.code} hint={errors.code} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Material group" selectedKey={group} items={opts([...new Set([...GROUPS, group])])} onSelectionChange={(k) => setGroup(String(k))}>{(i) => <Select.Item {...i} />}</Select>
        <Select label="Unit" selectedKey={unit} items={opts([...new Set([...UNITS, unit])])} onSelectionChange={(k) => setUnit(String(k))}>{(i) => <Select.Item {...i} />}</Select>
      </div>
    </MdModal>
  );
}

export function MaterialFormModal({ isOpen, onOpenChange, editing, onBack }: Props) {
  return isOpen ? <Body editing={editing} close={() => onOpenChange(false)} onBack={onBack} /> : null;
}
