import { useState } from 'react';
import type { FC } from 'react';
import { Radio, RadioGroup } from 'react-aria-components';
import { Dataflow03, Edit01, UploadCloud01 } from '@untitledui/icons';
import { Button } from '@/components/base/buttons/button';
import { FeaturedIcon } from '@/components/foundations/featured-icon/featured-icon';
import { cx } from '@/utils/cx';
import { MdModal } from './MdModal';

export type AddMethod = 'api' | 'csv' | 'manual';
const OPTIONS: { id: AddMethod; icon: FC<{ className?: string }>; title: string; text: string }[] = [
  { id: 'api', icon: Dataflow03, title: 'Import from API', text: 'Sync materials directly from your ERP or inventory system.' },
  { id: 'csv', icon: UploadCloud01, title: 'Import from CSV file', text: 'Upload a CSV file to add multiple materials at once.' },
  { id: 'manual', icon: Edit01, title: 'Enter material details manually', text: 'Add a single material by filling in its details.' },
];

/** "Add materials" chooser (Figma 642:59701): three radio cards, Continue opens the chosen flow. */
export function AddOptionsModal({ isOpen, onOpenChange, onChoose }: { isOpen: boolean; onOpenChange(o: boolean): void; onChoose(m: AddMethod): void }) {
  const [method, setMethod] = useState<AddMethod>('api');
  return (
    <MdModal isOpen={isOpen} onOpenChange={onOpenChange} title="Add materials" subtitle="Choose how you'd like to add materials to your master data."
      actions={<><Button color="secondary" size="lg" onPress={() => onOpenChange(false)}>Cancel</Button><Button color="primary" size="lg" onPress={() => onChoose(method)}>Continue</Button></>}>
      <RadioGroup aria-label="How to add materials" value={method} onChange={(v) => setMethod(v as AddMethod)} className="flex flex-col gap-3">
        {OPTIONS.map((o) => (
          <Radio key={o.id} value={o.id}
            className={({ isSelected, isFocusVisible }) => cx('flex cursor-pointer items-start gap-3 rounded-xl bg-primary p-4 ring-1 ring-secondary transition ring-inset', isSelected && 'ring-2 ring-brand', isFocusVisible && 'outline-2 outline-offset-2 outline-focus-ring')}>
            {({ isSelected }) => (
              <>
                <FeaturedIcon icon={o.icon} color="gray" theme="modern" size="sm" />
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-secondary">{o.title}</span><span className="block text-sm text-tertiary">{o.text}</span></span>
                <span className={cx('mt-0.5 grid size-4 shrink-0 place-items-center rounded-full ring-1 ring-primary ring-inset', isSelected && 'bg-brand-solid ring-0')}>{isSelected && <span className="size-1.5 rounded-full bg-white" />}</span>
              </>
            )}
          </Radio>
        ))}
      </RadioGroup>
    </MdModal>
  );
}
