import { useEffect } from 'react';
import { Button } from '@/components/base/buttons/button';
import { ProgressBar } from '@/components/base/progress-indicators/progress-indicators';
import { notify } from '@/ui/toast';
import { materialStore, useMaterials } from '../model/store';
import { MdModal } from './MdModal';

/**
 * "Importing materials" (Figma 642:60012, marked optional): live progress of the running CSV import. Closing it or
 * "Run in background" only hides it; "Cancel import" stops the job and keeps the rows already written.
 */
export function ImportProgressModal({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange(o: boolean): void }) {
  const job = useMaterials((s) => s.job);
  useEffect(() => { if (isOpen && !job) onOpenChange(false); }, [isOpen, job, onOpenChange]);
  if (!isOpen || !job) return null;
  const pct = Math.round((job.done / job.total) * 100);
  const cancel = () => { const done = materialStore.getState().cancelImport(); onOpenChange(false); notify.info('Import cancelled', `${done} of ${job.total} materials were imported.`, 'csv-cancelled'); };
  return (
    <MdModal isOpen onOpenChange={onOpenChange} title="Importing materials"
      subtitle={`Adding ${job.total} materials from ${job.file}. You can close this window, the import keeps running.`}
      actions={<><Button color="secondary" size="lg" onPress={cancel}>Cancel import</Button><Button color="primary" size="lg" onPress={() => onOpenChange(false)}>Run in background</Button></>}>
      <div className="flex flex-col gap-3">
        <ProgressBar value={pct} labelPosition="right" />
        <p className="text-sm text-tertiary" aria-live="polite">{job.done} of {job.total} materials imported</p>
      </div>
    </MdModal>
  );
}
