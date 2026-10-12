import { useState } from 'react';
import { Button } from '@/components/base/buttons/button';
import { CloseButton } from '@/components/base/buttons/close-button';
import { FeaturedIcon } from '@/components/foundations/featured-icon/featured-icon';
import { Dialog, Modal, ModalOverlay } from '@/components/application/modals/modal';
import { useWorkflow } from '@/features/workflow-builder/model/store';
import { notify } from '@/ui/toast';
import { deviceStore, useDevices } from '../model/store';
import { blankValues, validateNew } from '../model/validate';
import type { DeviceKind, FieldValue } from '../model/types';
import { DeviceField } from './DeviceField';

interface Props { kind: DeviceKind; isOpen: boolean; onOpenChange(o: boolean): void; preset?: Record<string, FieldValue> }

function Form({ kind, preset, close }: { kind: DeviceKind; preset?: Record<string, FieldValue>; close(): void }) {
  const existing = useDevices((s) => s[kind.id]); const fleets = useWorkflow((s) => Object.keys(s.fleets).join('|')).split('|');
  const [values, setValues] = useState(() => blankValues(kind, preset)); const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (key: string) => (v: FieldValue) => { setValues((o) => ({ ...o, [key]: v })); setErrors((e) => ({ ...e, [key]: '' })); };
  const submit = () => {
    const clean = { ...values, name: String(values.name).trim(), hardwareId: String(values.hardwareId).trim() };
    const problems = validateNew(kind, clean, existing); setErrors(problems); if (Object.keys(problems).length) return;
    deviceStore.getState().add(kind.id, clean); close();
    notify.success(`${clean.name} added`, 'It stays Offline until it connects.', 'device-added');
  };
  const fields = kind.fields.filter((f) => f.modal); const preview = kind.preview(values);
  // consecutive 'half' fields share a row
  const rows: (typeof fields)[] = []; fields.forEach((f) => { const last = rows[rows.length - 1]; if (f.modal === 'half' && last?.[0].modal === 'half' && last.length < 2) last.push(f); else rows.push([f]); });
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
      <div className="relative border-b border-secondary px-6 pt-6 pb-5">
        <FeaturedIcon icon={kind.icon} color="gray" theme="modern" size="lg" className="mb-4 sm:float-left sm:mr-4 sm:mb-0" />
        <h2 className="text-md font-semibold text-primary">{kind.addLabel}</h2><p className="text-sm text-tertiary">{kind.addSubtitle}</p>
        <CloseButton className="absolute top-4 right-4" size="sm" />
      </div>
      <div className="flex gap-6 px-8 py-6">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {rows.map((r) => <div key={r[0].key} className={r.length > 1 ? 'grid grid-cols-2 gap-4' : undefined}>{r.map((f) => <DeviceField key={f.key} def={f} value={values[f.key]} onChange={set(f.key)} error={errors[f.key]} fleets={fleets} showTag />)}</div>)}
        </div>
        <div className="hidden w-[200px] shrink-0 flex-col items-center gap-4 sm:flex" aria-label="Preview">
          {preview.heading && <p className="text-xs font-semibold text-secondary">{preview.heading}</p>}
          <div className="grid size-[180px] place-items-center rounded-xl border border-primary bg-secondary p-4">{preview.image}</div>
          <p className="text-xs font-semibold text-secondary">{preview.caption}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-secondary px-6 py-6">
        <Button type="button" color="secondary" size="lg" onPress={close}>Cancel</Button>
        <Button type="submit" color="primary" size="lg">{kind.addLabel}</Button>
      </div>
    </form>
  );
}

/** "Add Robot" / "Add Hardware" dialog: header, form column, live preview column, actions. Everything comes from the DeviceKind. */
export function AddDeviceModal({ kind, isOpen, onOpenChange, preset }: Props) {
  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={onOpenChange} isDismissable>
      <Modal className="max-w-[640px]"><Dialog aria-label={kind.addLabel}><Form kind={kind} preset={preset} close={() => onOpenChange(false)} /></Dialog></Modal>
    </ModalOverlay>
  );
}
