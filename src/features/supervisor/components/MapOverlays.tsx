import { useState } from 'react';
import { Cube01, Edit05, Eye, EyeOff, LayersThree01, List, Map01, Square, Trash01, XClose } from '@untitledui/icons';
import { Button } from '@/components/base/buttons/button';
import { ButtonUtility } from '@/components/base/buttons/button-utility';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { Input } from '@/components/base/input/input';
import { Select } from '@/components/base/select/select';
import { Toggle } from '@/components/base/toggle/toggle';
import { Tabs } from '@/components/application/tabs/tabs';
import { ZoomBar } from '@/ui/ZoomBar';
import { notify } from '@/ui/toast';
import { MODELS, STATUS, ZONE_TYPES, type ZoneType } from '../model/data';
import { statusOf } from '../model/sim';
import { LAYERS, liveStore, sim, useLive, type Panel, type ViewMode } from '../model/store';
import type { LiveMap } from '../engine/LiveMap';
import { Battery, SherpaThumb } from './bits';

/** Top-left: view mode (2D / 2.5D / 3D) and the panel switch (Sherpas / Layers / Zones). */
export function MapToolbar() {
  const mode = useLive((s) => s.mode), panel = useLive((s) => s.panel); const st = liveStore.getState();
  return <div className="float modes lv-toolbar">
    <ButtonGroup size="sm" aria-label="View mode" selectedKeys={[mode]} disallowEmptySelection onSelectionChange={(k) => { const v = [...k][0] as ViewMode | undefined; if (v) st.setMode(v); }}>
      <ButtonGroupItem id="2d" iconLeading={Square}>2D</ButtonGroupItem>
      <ButtonGroupItem id="25d" iconLeading={Map01}>2.5D</ButtonGroupItem>
      <ButtonGroupItem id="3d" iconLeading={Cube01}>3D</ButtonGroupItem>
    </ButtonGroup>
    <ButtonGroup size="sm" aria-label="Map panels" selectedKeys={panel ? [panel] : []} onSelectionChange={(k) => st.setPanel(([...k][0] as Panel) ?? null)}>
      <ButtonGroupItem id="list" iconLeading={List}><span data-text>Sherpas</span></ButtonGroupItem>
      <ButtonGroupItem id="layers" iconLeading={LayersThree01}><span data-text>Layers</span></ButtonGroupItem>
      <ButtonGroupItem id="zones" iconLeading={Edit05}><span data-text>Zones</span></ButtonGroupItem>
    </ButtonGroup>
  </div>;
}

/** Left panel: the Sherpa list (live action, battery, status) and the activity feed. */
export function SherpaList() {
  useLive((s) => s.tick); const fleet = useLive((s) => s.fleetFilter), sel = useLive((s) => s.selectedId); const [tab, setTab] = useState('robots');
  const list = sim.robots.filter((o) => fleet === 'all' || o.fleet === fleet);
  const pick = (id: string) => { liveStore.getState().select(id); if (window.innerWidth < 900) liveStore.getState().setPanel(null); };
  return <div className="float lv-panel">
    <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(String(k))} className="px-3 pt-3">
      <Tabs.List type="button-border" size="sm" fullWidth aria-label="Sherpa panel" items={[{ id: 'robots', label: 'Sherpas', badge: list.length }, { id: 'feed', label: 'Activity' }]} />
    </Tabs>
    {tab === 'robots'
      ? <div className="lv-list">{list.map((o) => { const s = statusOf(o); return (
        <button key={o.id} className={'lv-rcard' + (sel === o.id ? ' sel' : '')} aria-pressed={sel === o.id} onClick={() => pick(o.id)}>
          <SherpaThumb model={o.model} status={s} />
          <span className="t"><span className="top"><b>{o.id}</b><small>{MODELS[o.model].name}</small></span>
            <span className="act">{o.pausedByUser ? 'Paused by operator' : o.action}</span>
            <span className="meta"><Battery pct={o.batt} /><span>{STATUS[s].label}</span></span></span>
        </button>); })}</div>
      : <div className="lv-list lv-feed">{sim.events.length ? sim.events.map((e, i) => <div key={i}><time>{e.t}</time><span><b>{e.id}</b> {e.text}</span></div>)
        : <p className="lv-muted">Pick-ups, drop-offs and alerts appear here as they happen.</p>}</div>}
  </div>;
}

export function LayersPanel() {
  const layers = useLive((s) => s.layers), op = useLive((s) => s.cadOpacity); const st = liveStore.getState();
  return <div className="float lv-panel lv-pop">
    <div className="lv-pop-h">Map layers</div>
    <div className="lv-pop-body">{LAYERS.map((l) => <div key={l.k} className="lv-layer">
      <Toggle size="sm" isSelected={layers[l.k]} onChange={() => st.toggleLayer(l.k)} label={l.name} hint={l.desc} />
      {l.k === 'cad' && <label className="lv-slider">Opacity<input type="range" min={0.1} max={1} step={0.05} value={op} aria-label="CAD layout opacity" onChange={(e) => st.setCadOpacity(+e.target.value)} /></label>}
    </div>)}</div>
  </div>;
}

/** Zones: list grouped by type (show/hide per type, delete zones you drew) and "Define a zone" -> draw on the map. */
export function ZonesPanel() {
  const zones = useLive((s) => s.zones), vis = useLive((s) => s.zoneVis); const st = liveStore.getState();
  const [type, setType] = useState<ZoneType>('traffic'); const [name, setName] = useState('');
  const byType = Object.entries(ZONE_TYPES).map(([k, t]) => ({ k: k as ZoneType, t, zs: zones.filter((z) => z.type === k) })).filter((g) => g.zs.length);
  const draw = () => { const n = zones.filter((z) => z.type === type).length + 1; st.startDraw(type, name.trim() || `${ZONE_TYPES[type].label} ${n}`); setName(''); };
  return <div className="float lv-panel lv-pop">
    <div className="lv-pop-h">Zones <small>{zones.length} defined</small></div>
    <div className="lv-pop-body">
      {byType.map(({ k, t, zs }) => <div key={k}>
        <div className="lv-zone"><i className="lv-sw" style={{ background: t.color }} /><span className="t"><b>{t.label}</b><small>{t.desc} · {zs.length}</small></span>
          <ButtonUtility size="xs" color="tertiary" icon={vis[k] ? Eye : EyeOff} tooltip={vis[k] ? `Hide ${t.label}` : `Show ${t.label}`} onPress={() => st.toggleZoneType(k)} /></div>
        {zs.map((z) => <div key={z.id} className="lv-zone sub"><span className="t">{z.name}<small className="lv-mono">{z.id}{z.custom ? ' · drawn by you' : ''}</small></span>
          {z.custom && <ButtonUtility size="xs" color="tertiary" icon={Trash01} tooltip={`Delete ${z.name}`} onPress={() => { st.removeZone(z.id); notify.success(`Deleted ${z.name}`); }} />}</div>)}
      </div>)}
      <div className="lv-sep" />
      <div className="lv-pop-h">Define a zone</div>
      <form className="lv-zone-form" onSubmit={(e) => { e.preventDefault(); draw(); }}>
        <Select size="sm" label="Zone type" selectedKey={type} onSelectionChange={(k) => setType(k as ZoneType)} items={Object.entries(ZONE_TYPES).map(([id, t]) => ({ id, label: t.label }))}>{(i) => <Select.Item {...i} />}</Select>
        <Input size="sm" label="Name" placeholder="e.g. Traffic zone · Dock 3" value={name} onChange={setName} />
        <Button type="submit" size="sm" color="primary" iconLeading={Edit05}>Draw on map</Button>
      </form>
      <p className="lv-muted">Sherpas obey zones as soon as you draw them: traffic zones let one Sherpa through at a time, slow zones cut speed, and no-go zones block entry.</p>
    </div>
  </div>;
}

export function DrawBanner() {
  const d = useLive((s) => s.drawing); if (!d) return null;
  return <div className="float lv-draw"><Edit05 className="size-4" /><span>Drag on the map to draw “{d.name}”</span><Button size="sm" color="secondary" iconLeading={XClose} onPress={() => liveStore.getState().cancelDraw()}>Cancel</Button></div>;
}

export function ZoneLegend() {
  const zones = useLive((s) => s.zones); const used = [...new Set(zones.map((z) => z.type))];
  return <div className="float lv-legend">{used.map((k) => <span key={k}><i style={{ background: ZONE_TYPES[k].color }} />{ZONE_TYPES[k].label}</span>)}<span className="lv-muted">1 grid = 3 m</span></div>;
}

/** Bottom-right: simulation speed, compass (reset north) and zoom (click the % to fit the floor). */
export function MapControls({ map, zoomPct, azimuth }: { map: LiveMap | null; zoomPct: number; azimuth: number }) {
  const speed = useLive((s) => s.speed);
  return <div className="lv-br">
    <div className="float lv-speed"><small>Sim</small>
      <ButtonGroup size="sm" aria-label="Simulation speed" selectedKeys={[String(speed)]} disallowEmptySelection onSelectionChange={(k) => { const v = [...k][0]; if (v) liveStore.getState().setSpeed(Number(v) as 1 | 2 | 5); }}>
        <ButtonGroupItem id="1">1×</ButtonGroupItem><ButtonGroupItem id="2">2×</ButtonGroupItem><ButtonGroupItem id="5">5×</ButtonGroupItem>
      </ButtonGroup></div>
    <div className="float lv-compass"><ButtonUtility size="xs" color="tertiary" tooltip="Reset north" icon={<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden style={{ transform: `rotate(${azimuth}rad)` }}><path d="M12 3l3.5 9h-7z" fill="#f04438" /><path d="M12 21l-3.5-9h7z" fill="#98a2b3" /></svg>} onPress={() => map?.north()} /></div>
    <ZoomBar pct={zoomPct} onIn={() => map?.zoomBy(1 / 1.4)} onOut={() => map?.zoomBy(1.4)} onReset={() => map?.fit()} />
  </div>;
}
