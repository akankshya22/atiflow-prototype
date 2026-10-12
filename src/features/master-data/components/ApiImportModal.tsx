import { useMemo, useState } from 'react';
import { SearchLg } from '@untitledui/icons';
import { Button } from '@/components/base/buttons/button';
import { Input, InputBase } from '@/components/base/input/input';
import { InputGroup } from '@/components/base/input/input-group';
import { notify } from '@/ui/toast';
import { fetchCatalog, filterCatalog } from '../model/catalog';
import { codeSet, formatCount, statusOf } from '../model/rules';
import { materialStore, useMaterials } from '../model/store';
import { MdModal } from './MdModal';
import { PickTable } from './PickTable';

interface Props { isOpen: boolean; onOpenChange(o: boolean): void }

/**
 * "Import from API" (first time: builds the primary material list, Figma 642:59580 / 642:59465) and "Add more from API"
 * (list exists: adds a Status column, already-added rows are locked, Figma 642:59286). Which one shows depends on the list.
 */
function Body({ close }: { close(): void }) {
  const materials = useMaterials((s) => s.materials);
  const [first] = useState(() => materials.length === 0);   // freeze the mode while the dialog is open
  const added = useMemo(() => codeSet(materials), [materials]);
  const [q, setQ] = useState(''); const [prefix, setPrefix] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const catalog = fetchCatalog();
  const rows = useMemo(() => filterCatalog(catalog, q, prefix), [catalog, q, prefix]);
  const available = rows.filter((r) => statusOf(r.code, added) === 'available').length;
  const n = selected.size;

  const summary = first
    ? (prefix.trim() ? `${formatCount(rows.length)} materials with code starting “${prefix.trim().toUpperCase()}”` : `Showing ${formatCount(rows.length)} materials from the API`)
    : `${formatCount(available)} materials available to add`;
  const submit = () => {
    const picked = catalog.filter((r) => selected.has(r.code));
    const count = materialStore.getState().addMany(picked, 'api'); close();
    notify.success(first ? 'Material list created' : `${count} material${count === 1 ? '' : 's'} added`, first ? `${count} material${count === 1 ? '' : 's'} added from the API.` : undefined, 'materials-added');
  };
  const cta = first ? (n ? `Create material list (${n})` : 'Create material list') : `Add ${n} material${n === 1 ? '' : 's'}`;

  return (
    <MdModal isOpen onOpenChange={(o) => !o && close()} title={first ? 'Import from API' : 'Add more from API'}
      subtitle={first ? 'Select the materials to include in your primary material list.' : 'Select materials that aren’t in your list yet. Materials already added are locked and can’t be removed.'}
      actions={<><Button color="secondary" size="lg" onPress={close}>Cancel</Button><Button color="primary" size="lg" isDisabled={!n} onPress={submit}>{cta}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-[1fr_232px]">
        <Input label="Search materials" icon={SearchLg} placeholder="Search by name, code, desc" value={q} onChange={setQ} autoFocus />
        <InputGroup label="Code prefix" value={prefix} onChange={setPrefix} leadingAddon={<InputGroup.Prefix className="whitespace-nowrap">Starts with</InputGroup.Prefix>}>
          <InputBase placeholder={first ? 'DCP' : 'e.g. DCP'} />
        </InputGroup>
      </div>
      <div className="-mt-1 flex items-center justify-between text-sm">
        <span className="text-tertiary" aria-live="polite">{summary}</span>
        <span className="font-semibold text-secondary">{n} selected</span>
      </div>
      {rows.length ? <PickTable label="API materials" rows={rows} added={added} selected={selected} onChange={setSelected} showStatus={!first} />
        : <p className="rounded-xl p-8 text-center text-sm text-tertiary ring-1 ring-secondary">No materials match. Try another name or code prefix.</p>}
    </MdModal>
  );
}

export function ApiImportModal({ isOpen, onOpenChange }: Props) {
  return isOpen ? <Body close={() => onOpenChange(false)} /> : null;
}
