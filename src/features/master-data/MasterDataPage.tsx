import { useMemo, useState } from 'react';
import { Dataflow03, PackagePlus, Plus, SearchLg, Server01, Settings01 } from '@untitledui/icons';
import { Tabs } from '@/components/application/tabs/tabs';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { ProgressBarBase } from '@/components/base/progress-indicators/progress-indicators';
import { Select } from '@/components/base/select/select';
import { FeaturedIcon } from '@/components/foundations/featured-icon/featured-icon';
import { AppShell } from '@/shell/AppShell';
import { configuratorHits, useConfiguratorNav } from '@/features/configurator/configuratorNav';
import { useMaterials } from './model/store';
import type { Material } from './model/types';
import { AddOptionsModal, type AddMethod } from './components/AddOptionsModal';
import { ApiImportModal } from './components/ApiImportModal';
import { CsvImportModal } from './components/CsvImportModal';
import { ImportProgressModal } from './components/ImportProgressModal';
import { MaterialFormModal } from './components/MaterialFormModal';
import { MaterialsTable } from './components/MaterialsTable';
import './master-data.css';

type Open = null | 'options' | AddMethod | 'progress' | { edit: Material };
const ALL_GROUPS = 'All groups'; const ALL_UNITS = 'All units';

/** First use: nothing imported yet. */
function EmptyState({ onAdd }: { onAdd(): void }) {
  return (
    <div className="m-auto flex max-w-[440px] flex-col items-center gap-4 px-6 py-12 text-center" data-testid="md-empty">
      <FeaturedIcon icon={PackagePlus} color="gray" theme="modern" size="xl" />
      <div><h2 className="text-lg font-semibold text-primary">No materials yet</h2>
        <p className="text-sm text-tertiary">Build the material list your workflows use: sync it from your ERP or inventory API, upload a CSV file, or add materials one at a time.</p></div>
      <Button size="md" color="primary" iconLeading={Plus} onPress={onAdd}>Add materials</Button>
    </div>
  );
}

/** A CSV import that was sent to the background: a slim progress strip above the list; clicking it reopens the progress dialog. */
function BackgroundImport({ onOpen }: { onOpen(): void }) {
  const job = useMaterials((s) => s.job); if (!job) return null;
  return (
    <button type="button" onClick={onOpen} className="flex cursor-pointer items-center gap-3 rounded-lg bg-secondary px-4 py-2 text-left text-sm text-tertiary ring-1 ring-secondary ring-inset" data-testid="md-bg-import">
      <span className="shrink-0 font-medium text-secondary">Importing {job.file}</span>
      <ProgressBarBase value={job.done} max={job.total} className="flex-1" />
      <span className="shrink-0 tabular-nums">{job.done} of {job.total}</span>
    </button>
  );
}

/**
 * Configurator > Build > Master Data (Figma section 642:57051 "Import Material flow for Configurator"). Page layout is the same as
 * Robots / Hardware (title block + one card); Figma is the content reference. Adding materials: Add Material -> chooser ->
 * Import from API | Import from CSV (upload, review, background import) | manual form. "Add more from API" skips the chooser.
 */
export function MasterDataPage() {
  const materials = useMaterials((s) => s.materials);
  const [open, setOpen] = useState<Open>(null);
  const [tab, setTab] = useState('materials'); const [sub, setSub] = useState('materials');
  const [q, setQ] = useState(''); const [group, setGroup] = useState(ALL_GROUPS); const [unit, setUnit] = useState(ALL_UNITS);
  const close = (o: boolean) => { if (!o) setOpen(null); };

  const groups = useMemo(() => [ALL_GROUPS, ...new Set(materials.map((m) => m.group))], [materials]);
  const units = useMemo(() => [ALL_UNITS, ...new Set(materials.map((m) => m.unit))], [materials]);
  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return materials.filter((m) => (group === ALL_GROUPS || m.group === group) && (unit === ALL_UNITS || m.unit === unit) && (!ql || `${m.code} ${m.name} ${m.group}`.toLowerCase().includes(ql)))
      .map((m, i) => ({ m, i })).sort((a, b) => b.m.updatedAt - a.m.updatedAt || a.i - b.i).map((x) => x.m);
  }, [materials, q, group, unit]);
  const has = materials.length > 0;

  return (
    <AppShell useNavModel={useConfiguratorNav} getHits={configuratorHits} searchPlaceholder="Search live operations, fleets, trips, analytics...">
      <div className="content">
        <div className="title-block"><div><h1>Master Data</h1><p>Manage the materials your workflow builder uses.</p></div>
          <div className="actions">
            {has && <span className="md-more"><Button size="sm" color="secondary" iconLeading={Dataflow03} onPress={() => setOpen('api')}>Add more from API</Button></span>}
            <Button size="sm" color="primary" iconLeading={Plus} onPress={() => setOpen('options')}>Add Material</Button>
          </div></div>
        <div className="builder md-card">
          <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(String(k))} className="px-4 pt-4 sm:px-6">
            <Tabs.List type="underline" size="md" fullWidth aria-label="Master data sections" items={[{ id: 'materials', label: 'Materials', icon: Server01 }, { id: 'staging', label: 'Staging Area', icon: Settings01 }]} />
          </Tabs>
          {tab === 'staging' ? <p className="md-placeholder">Staging Area isn’t part of this prototype yet.</p> : (
            <div className="md-body">
              <Tabs selectedKey={sub} onSelectionChange={(k) => setSub(String(k))} className="self-start">
                <Tabs.List type="button-border" size="sm" aria-label="Material lists" items={[{ id: 'materials', label: 'Materials' }, { id: 'goods', label: 'Station Goods' }]} />
              </Tabs>
              {sub === 'goods' ? <p className="md-placeholder">Station Goods isn’t part of this prototype yet.</p> : !has ? <EmptyState onAdd={() => setOpen('options')} /> : (
                <>
                  <p className="text-sm text-tertiary">Only materials selected from the material list are shown here. Materials can’t be deleted once added, as they may be used in workflows.</p>
                  <BackgroundImport onOpen={() => setOpen('progress')} />
                  <div className="md-toolbar">
                    <Input size="sm" icon={SearchLg} aria-label="Search materials" placeholder="Search materials by code, name, or group..." value={q} onChange={setQ} className="md-search" />
                    <Select size="sm" aria-label="Material group" selectedKey={group} items={groups.map((g) => ({ id: g, label: g === ALL_GROUPS ? 'Group: All groups' : g }))} onSelectionChange={(k) => setGroup(String(k))} className="md-filter">{(i) => <Select.Item {...i} />}</Select>
                    <Select size="sm" aria-label="Unit" selectedKey={unit} items={units.map((u) => ({ id: u, label: u === ALL_UNITS ? 'Unit: All units' : u }))} onSelectionChange={(k) => setUnit(String(k))} className="md-filter">{(i) => <Select.Item {...i} />}</Select>
                  </div>
                  {rows.length ? <div className="md-table"><MaterialsTable rows={rows} onEdit={(m) => setOpen({ edit: m })} /></div>
                    : <p className="md-placeholder">No materials match these filters.</p>}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <AddOptionsModal isOpen={open === 'options'} onOpenChange={close} onChoose={setOpen} />
      <ApiImportModal isOpen={open === 'api'} onOpenChange={close} />
      <CsvImportModal isOpen={open === 'csv'} onOpenChange={close} onBack={() => setOpen('options')} onImporting={() => setOpen('progress')} />
      <ImportProgressModal isOpen={open === 'progress'} onOpenChange={close} />
      <MaterialFormModal isOpen={open === 'manual'} onOpenChange={close} onBack={() => setOpen('options')} />
      <MaterialFormModal isOpen={typeof open === 'object' && open !== null} editing={typeof open === 'object' && open ? open.edit : undefined} onOpenChange={close} />
    </AppShell>
  );
}
