import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Map01, PlusSquare } from '@untitledui/icons';
import { Button } from '@/components/base/buttons/button';
import { ProgressBar } from '@/components/base/progress-indicators/progress-indicators';
import { Select } from '@/components/base/select/select';
import { Table } from '@/components/application/table/table';
import { AppShell } from '@/shell/AppShell';
import { notify } from '@/ui/toast';
import { FLEETS, MODELS, STATUS, fleetName, type Status } from './model/data';
import { counts, statusOf } from './model/sim';
import { liveStore, sim, useLive, useLiveSim } from './model/store';
import { MODEL_IMG, StatusBadge } from './components/bits';
import { LIVE_PATH, supervisorHits, useSupervisorNav } from './supervisorNav';
import './live-view.css';

const battClass = (b: number) => (b < 25 ? 'bg-fg-error-primary' : b < 50 ? 'bg-fg-warning-primary' : 'bg-fg-success-primary');
const BAR: Status[] = ['moving', 'working', 'waiting', 'charging', 'error'];

/** Fleets overview: KPIs, one card per fleet (Sherpas, live utilisation) and the Sherpa table. Rows and "View on map" open the Live view. */
export function FleetsPage() {
  useLiveSim(); useLive((s) => s.tick); const navigate = useNavigate(); const [filter, setFilter] = useState('all');
  const st = liveStore.getState(); const all = sim.robots; const c = counts(all);
  const online = all.filter((o) => o.state !== 'error').length; const avgB = Math.round(all.reduce((a, o) => a + o.batt, 0) / all.length);
  const err = all.find((o) => o.state === 'error');
  const kpis = [
    { l: 'Sherpas online', v: <>{online}<span className="lv-kpi-of"> / {all.length}</span></>, s: `${c.moving} moving · ${c.working} at stations` },
    { l: 'Trips completed today', v: all.reduce((a, o) => a + o.trips, 0), s: 'Across both fleets' },
    { l: 'Average battery', v: `${avgB}%`, s: `${all.filter((o) => o.batt < 40).length} below 40%` },
    { l: 'Open alerts', v: c.error, s: err ? `${err.id} needs attention` : 'All clear' },
  ];
  const openOnMap = (fleet: string, id?: string) => { st.setFleet(fleet); if (id) st.select(id); navigate(LIVE_PATH); };
  const rows = all.filter((o) => filter === 'all' || o.fleet === filter);
  return (
    <AppShell useNavModel={useSupervisorNav} getHits={supervisorHits} searchPlaceholder="Search Sherpas, stations, zones…">
      <div className="content lv-fleets">
        <div className="title-block"><div><h1>Fleets</h1><p>Sherpa fleets running on the ECC plant floor</p></div>
          <div className="actions"><Button size="sm" color="primary" iconLeading={Map01} onPress={() => navigate(LIVE_PATH)}>Open live view</Button></div></div>
        <div className="lv-scroll">
          <div className="lv-kpis">{kpis.map((k) => <div key={k.l} className="lv-card lv-kpi"><small>{k.l}</small><b>{k.v}</b><span>{k.s}</span></div>)}</div>
          <div className="lv-fleet-grid">
            {FLEETS.map((f) => {
              const rs = all.filter((o) => o.fleet === f.id); const fc = counts(rs); const util = Math.round(((fc.moving + fc.working) / rs.length) * 100);
              return <div key={f.id} className="lv-card lv-fleet">
                <div className="lv-fleet-head"><span className="lv-hash">#</span><div><b>{f.name}</b><small>{f.desc}</small></div></div>
                <div className="lv-fleet-robots">{rs.map((o) => <button key={o.id} className="lv-chip" onClick={() => openOnMap(f.id, o.id)}><img src={MODEL_IMG[o.model]} alt="" /><i style={{ background: STATUS[statusOf(o)].color }} />{o.id}</button>)}</div>
                <div className="lv-util"><div className="lv-util-row"><span>Utilisation right now</span><b>{util}%</b></div>
                  <div className="lv-bar">{BAR.map((k) => fc[k] ? <span key={k} style={{ width: `${(fc[k] / rs.length) * 100}%`, background: STATUS[k].color }} /> : null)}</div>
                  <div className="lv-util-row"><span>{rs.filter((o) => o.model === '10k').length} × Sherpa 10K · {rs.filter((o) => o.model === 'xt').length} × XT Lite</span><span>{rs.reduce((a, o) => a + o.trips, 0)} trips today</span></div></div>
                <div className="lv-fleet-foot"><Button size="sm" color="secondary" iconLeading={Map01} onPress={() => openOnMap(f.id)}>View on map</Button></div>
              </div>;
            })}
            <button className="lv-card lv-new-fleet" onClick={() => notify.info("Creating fleets isn't part of this prototype", 'Fleets are set up by a configurator.', 'soon')}>
              <PlusSquare className="size-6" /><b>Create new fleet</b><small>Group Sherpas by area or mission</small></button>
          </div>
          <div className="lv-card lv-table-card">
            <div className="lv-section-head"><div><b>Sherpas</b><small>Live status from the fleet manager. Select a row to find it on the map.</small></div>
              <Select size="sm" aria-label="Filter by fleet" className="fleet-select" selectedKey={filter} onSelectionChange={(k) => setFilter(String(k))}
                items={[{ id: 'all', label: 'All fleets' }, ...FLEETS.map((f) => ({ id: f.id, label: f.name }))]}>{(i) => <Select.Item {...i} />}</Select></div>
            <div className="lv-table">
              <Table aria-label="Sherpas" size="sm" className="min-w-[820px]">
                <Table.Header>
                  <Table.Head id="id" isRowHeader label="SHERPA" className="px-4" /><Table.Head id="fleet" label="FLEET" className="px-4" /><Table.Head id="status" label="STATUS" className="px-4" />
                  <Table.Head id="act" label="CURRENT ACTION" className="px-4" /><Table.Head id="batt" label="BATTERY" className="px-4" /><Table.Head id="loc" label="LOCATION" className="px-4" /><Table.Head id="trips" label="TRIPS TODAY" className="px-4" />
                </Table.Header>
                <Table.Body>{rows.map((o) => (
                  <Table.Row key={o.id} id={o.id} onAction={() => openOnMap('all', o.id)} className="h-auto cursor-pointer even:bg-secondary">
                    <Table.Cell className="px-4 py-3"><div className="flex items-center gap-3"><img className="lv-row-img" src={MODEL_IMG[o.model]} alt="" /><div className="whitespace-nowrap"><b className="block text-sm text-primary">{o.id}</b><small className="text-xs text-tertiary">{MODELS[o.model].name}</small></div></div></Table.Cell>
                    <Table.Cell className="px-4 py-3 whitespace-nowrap">{fleetName(o.fleet)}</Table.Cell>
                    <Table.Cell className="px-4 py-3"><StatusBadge status={statusOf(o)} /></Table.Cell>
                    <Table.Cell className="px-4 py-3 min-w-[220px]">{o.pausedByUser ? 'Paused by operator' : o.action}</Table.Cell>
                    <Table.Cell className="px-4 py-3"><div className="flex items-center gap-2"><ProgressBar className="h-1.5 w-16" progressClassName={battClass(o.batt)} value={o.batt} /><span className="tabular-nums">{Math.round(o.batt)}%</span></div></Table.Cell>
                    <Table.Cell className="px-4 py-3 whitespace-nowrap">{sim.locationOf(o)}</Table.Cell>
                    <Table.Cell className="px-4 py-3 tabular-nums">{o.trips}</Table.Cell>
                  </Table.Row>))}
                </Table.Body>
              </Table>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
