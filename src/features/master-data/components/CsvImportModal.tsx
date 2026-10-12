import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, Download01, Trash01, UploadCloud02 } from '@untitledui/icons';
import { Button } from '@/components/base/buttons/button';
import { ButtonUtility } from '@/components/base/buttons/button-utility';
import { ProgressBar } from '@/components/base/progress-indicators/progress-indicators';
import { FeaturedIcon } from '@/components/foundations/featured-icon/featured-icon';
import { notify } from '@/ui/toast';
import { cx } from '@/utils/cx';
import { isCsvFile, MAX_CSV_BYTES, parseMaterialsCsv, TEMPLATE_NAME, templateCsv } from '../model/csv';
import { codeSet, statusOf } from '../model/rules';
import { materialStore, useMaterials } from '../model/store';
import type { MaterialDraft } from '../model/types';
import { MdModal } from './MdModal';
import { PickTable } from './PickTable';

interface Props { isOpen: boolean; onOpenChange(o: boolean): void; onBack(): void; onImporting(): void }
type Upload =
  | { state: 'empty' }
  | { state: 'reading'; file: File; pct: number }
  | { state: 'done'; file: File; rows: MaterialDraft[] }
  | { state: 'error'; file: File; reason: 'format' | 'empty' | 'size' };

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;
const ERRORS = {
  format: { title: 'Unsupported File Format', text: 'This file is currently in a format that’s not compatible with AtiFlow. Please use the template and upload updated file again.' },
  empty: { title: 'No materials found', text: 'The file has no rows with both a material name and a material code. Please use the template and upload updated file again.' },
  size: { title: 'File is too large', text: 'CSV files can be up to 10 MB. Split the file and upload each part.' },
};

export function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([templateCsv()], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: TEMPLATE_NAME }); a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Dashed drop area: click to pick a file or drop one (Figma 642:60100). */
function DropZone({ onFile }: { onFile(f: File): void }) {
  const input = useRef<HTMLInputElement>(null); const [over, setOver] = useState(false);
  return (
    <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
      className={cx('flex flex-col items-center gap-3 rounded-xl px-6 py-4 text-center ring-1 ring-secondary transition ring-inset', over && 'bg-secondary ring-2 ring-brand')}
      data-testid="csv-dropzone">
      <FeaturedIcon icon={UploadCloud02} color="gray" theme="modern" size="md" />
      <div className="flex flex-col gap-1">
        <p className="text-sm text-tertiary">
          <button type="button" className="cursor-pointer font-semibold text-brand-secondary hover:text-brand-secondary_hover" onClick={() => input.current?.click()}>Click to upload</button> or drag and drop
        </p>
        <p className="text-xs text-tertiary">CSV only (max. 10 MB) · <button type="button" className="cursor-pointer underline-offset-2 hover:underline" onClick={downloadTemplate}>Download template</button></p>
      </div>
      <input ref={input} type="file" accept=".csv,text/csv,.xlsx" className="hidden" aria-label="Upload CSV file"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
    </div>
  );
}

function FileRow({ up, onRemove }: { up: Extract<Upload, { state: 'reading' | 'done' }>; onRemove(): void }) {
  const pct = up.state === 'done' ? 100 : up.pct;
  return (
    <div className="flex items-start gap-3 rounded-xl p-4 ring-1 ring-secondary ring-inset" data-testid="csv-file">
      <div className="relative mt-0.5 h-10 w-8 shrink-0 rounded-sm bg-primary ring-1 ring-primary">
        <span className="absolute bottom-1.5 -left-1.5 rounded-xs bg-success-solid px-1 text-[10px] font-bold text-white">CSV</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-secondary">{up.file.name}</p>
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-tertiary">
          <span>{kb((up.file.size * pct) / 100)} of {kb(up.file.size)}{up.state === 'done' && ` · ${up.rows.length} rows found`}</span>
          {up.state === 'done' && <><span className="h-3 w-px bg-border-primary" /><span className="flex items-center gap-1 font-medium text-success-primary"><CheckCircle className="size-4" />Complete</span></>}
        </p>
        <div className="mt-1"><ProgressBar value={pct} labelPosition="right" /></div>
      </div>
      <ButtonUtility icon={Trash01} tooltip="Remove file" color="tertiary" size="xs" onPress={onRemove} />
    </div>
  );
}

function ErrorBox({ reason }: { reason: keyof typeof ERRORS }) {
  return (
    <div className="flex flex-col gap-4">
      <div role="alert" className="flex items-start gap-3 rounded-xl p-4 ring-1 ring-primary ring-inset">
        <FeaturedIcon icon={AlertCircle} color="error" theme="outline" size="sm" />
        <div><p className="text-sm font-semibold text-secondary">{ERRORS[reason].title}</p><p className="text-sm text-tertiary">{ERRORS[reason].text}</p></div>
      </div>
      <Button color="link-color" size="sm" iconLeading={Download01} className="self-start" onPress={downloadTemplate}>Download Template</Button>
    </div>
  );
}

/**
 * Import from CSV: Step 1 upload (empty / reading with progress / complete / unsupported file), Step 2 review the rows with
 * Available / Added status, then hands over to the background import (ImportProgressModal) and closes.
 */
function Body({ close, onBack, onImporting }: { close(): void; onBack(): void; onImporting(): void }) {
  const [up, setUp] = useState<Upload>({ state: 'empty' }); const [step, setStep] = useState<'upload' | 'review'>('upload');
  const materials = useMaterials((s) => s.materials); const added = useMemo(() => codeSet(materials), [materials]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  useEffect(() => () => clearInterval(timer.current), []);

  const read = (file: File) => {
    clearInterval(timer.current);
    if (!isCsvFile(file.name)) return setUp({ state: 'error', file, reason: 'format' });
    if (file.size > MAX_CSV_BYTES) return setUp({ state: 'error', file, reason: 'size' });
    setUp({ state: 'reading', file, pct: 0 });
    file.text().then((text) => {
      const result = parseMaterialsCsv(text);
      let pct = 0;   // the file is local, so the "upload" is a short animation before showing the parse result
      timer.current = setInterval(() => {
        pct = Math.min(100, pct + 12);
        if (pct < 100) return setUp({ state: 'reading', file, pct });
        clearInterval(timer.current);
        if (!result.ok) return setUp({ state: 'error', file, reason: result.reason });
        setUp({ state: 'done', file, rows: result.rows });
        setSelected(new Set(result.rows.filter((r) => statusOf(r.code, codeSet(materialStore.getState().materials)) === 'available').map((r) => r.code)));
      }, 90);
    }, () => setUp({ state: 'error', file, reason: 'format' }));
  };

  if (step === 'review' && up.state === 'done') {
    const n = selected.size;
    const start = () => {
      const rows = up.rows.filter((r) => selected.has(r.code));
      materialStore.getState().startImport(up.file.name, rows, (count) => notify.success(`${count} materials imported`, undefined, 'csv-imported'));
      onImporting();
    };
    return (
      <MdModal isOpen wide onOpenChange={(o) => !o && close()} title="Review import" subtitle={`Step 2 of 2 · ${up.rows.length} rows found in ${up.file.name}.`}
        actions={<><Button color="secondary" size="lg" onPress={() => setStep('upload')}>Back</Button><Button color="primary" size="lg" isDisabled={!n} onPress={start}>{`Import ${n} material${n === 1 ? '' : 's'}`}</Button></>}>
        <PickTable label="Materials in the file" rows={up.rows} added={added} selected={selected} onChange={setSelected} showStatus />
      </MdModal>
    );
  }
  return (
    <MdModal isOpen onOpenChange={(o) => !o && close()} title="Import from CSV file"
      subtitle={up.state === 'empty' ? 'Step 1 of 2 · Upload a CSV file with one material per row.' : 'Step 1 of 2 · Upload a CSV file'}
      actions={<><Button color="secondary" size="lg" onPress={onBack}>Back</Button><Button color="primary" size="lg" isDisabled={up.state !== 'done'} onPress={() => setStep('review')}>Continue</Button></>}>
      {up.state === 'empty' && <DropZone onFile={read} />}
      {(up.state === 'reading' || up.state === 'done') && <FileRow up={up} onRemove={() => { clearInterval(timer.current); setUp({ state: 'empty' }); }} />}
      {up.state === 'error' && <><ErrorBox reason={up.reason} /><DropZone onFile={read} /></>}
    </MdModal>
  );
}

export function CsvImportModal({ isOpen, onOpenChange, onBack, onImporting }: Props) {
  return isOpen ? <Body close={() => onOpenChange(false)} onBack={onBack} onImporting={onImporting} /> : null;
}
