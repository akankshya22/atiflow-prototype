import { useEffect, useRef, useState } from 'react';
import { Map01, PauseCircle, Play } from '@untitledui/icons';
import { BadgeWithDot } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Select } from '@/components/base/select/select';
import { AppShell } from '@/shell/AppShell';
import { notify } from '@/ui/toast';
import { FLEETS, M_PER_U, STATUS, type Status } from './model/data';
import { counts } from './model/sim';
import { liveStore, sim, useLive, useLiveSim } from './model/store';
import { LiveMap } from './engine/LiveMap';
import { DrawBanner, LayersPanel, MapControls, MapToolbar, SherpaList, ZoneLegend, ZonesPanel } from './components/MapOverlays';
import { SherpaDetails } from './components/SherpaDetails';
import { supervisorHits, useSupervisorNav } from './supervisorNav';
import './live-view.css';

/** Status chips in the card header (filtered by fleet) plus trips this session. */
function StatChips() {
  useLive((s) => s.tick); const fleet = useLive((s) => s.fleetFilter);
  const c = counts(sim.robots.filter((o) => fleet === 'all' || o.fleet === fleet));
  return <div className="lv-chips">
    {(['moving', 'working', 'waiting', 'charging', 'error'] as Status[]).filter((k) => c[k] || k === 'moving').map((k) => <BadgeWithDot key={k} size="sm" type="pill-color" color={STATUS[k].tone}>{c[k]} {STATUS[k].label.toLowerCase()}</BadgeWithDot>)}
    <BadgeWithDot size="sm" type="pill-color" color="gray">{sim.trips} {sim.trips === 1 ? 'trip' : 'trips'} this session</BadgeWithDot>
  </div>;
}

/** Supervisor home: live 3D / 2.5D / 2D map of the ECC plant with every Sherpa, zones, layers and the Sherpa list. */
export function LiveViewPage() {
  useLiveSim();
  const host = useRef<HTMLDivElement>(null), labels = useRef<HTMLDivElement>(null); const [map, setMap] = useState<LiveMap | null>(null);
  const [loaded, setLoaded] = useState<boolean | null>(null); const [view, setView] = useState({ zoomPct: 100, azimuth: 0 }); const [paused, setPaused] = useState(sim.paused);
  const s = {
    zones: useLive((x) => x.zones), zoneVis: useLive((x) => x.zoneVis), layers: useLive((x) => x.layers), cadOpacity: useLive((x) => x.cadOpacity),
    fleetFilter: useLive((x) => x.fleetFilter), selectedId: useLive((x) => x.selectedId), follow: useLive((x) => x.follow), drawing: useLive((x) => x.drawing),
    mode: useLive((x) => x.mode), focus: useLive((x) => x.focus), panel: useLive((x) => x.panel),
  };

  useEffect(() => {
    const st = liveStore.getState();
    const m = new LiveMap(host.current!, labels.current!, () => sim.robots, {
      onPick: (id) => liveStore.getState().select(id), onView: setView, onLoaded: setLoaded,
      onDrawn: (r) => { const d = liveStore.getState().drawing; if (!d) return; const z = liveStore.getState().addZone(d.type, d.name, r); notify.success(`Saved ${z.name}`, `${Math.round((r[2] - r[0]) * M_PER_U)} × ${Math.round((r[3] - r[1]) * M_PER_U)} m`); },
      onFollowBreak: () => liveStore.getState().setFollow(false), onNotice: (msg) => notify.info(msg, undefined, 'pointclouds'),
    });
    m.setZones(st.zones, st.zoneVis); m.setLayers(st.layers, st.cadOpacity); m.setFleetFilter(st.fleetFilter); m.home(st.mode);
    setMap(m); if (import.meta.env.DEV) Object.assign(window, { __liveMap: m, __liveSim: sim, __liveStore: liveStore });
    return () => { m.dispose(); setMap(null); liveStore.getState().cancelDraw(); };
  }, []);
  // store -> map (each effect mirrors one piece of state)
  useEffect(() => { map?.setZones(s.zones, s.zoneVis); }, [map, s.zones, s.zoneVis]);
  useEffect(() => { map?.setLayers(s.layers, s.cadOpacity); }, [map, s.layers, s.cadOpacity]);
  useEffect(() => { map?.setFleetFilter(s.fleetFilter); }, [map, s.fleetFilter]);
  useEffect(() => { map?.setSelected(s.selectedId); }, [map, s.selectedId]);
  useEffect(() => { map?.setFollow(s.follow); }, [map, s.follow]);
  useEffect(() => { map?.setDrawing(s.drawing?.type ?? null); }, [map, s.drawing]);
  const firstMode = useRef(true);
  useEffect(() => { if (!map) return; if (firstMode.current) { firstMode.current = false; return; } map.setMode(s.mode); }, [map, s.mode]);
  useEffect(() => { if (map && s.focus) { map.focusPoint(s.focus.x, s.focus.y, s.focus.dist); liveStore.setState({ focus: null }); } }, [map, s.focus]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,select,textarea,[role=listbox]')) return;
      if (e.key === '+' || e.key === '=') map?.zoomBy(1 / 1.3); if (e.key === '-') map?.zoomBy(1.3);
      if (e.key === 'Escape') { const st = liveStore.getState(); if (st.drawing) st.cancelDraw(); else st.select(null); }
    };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, [map]);

  const togglePause = () => { const on = !sim.paused; sim.setPaused(on); setPaused(on); notify.info(on ? 'All Sherpas paused' : 'Fleet resumed', undefined, 'pause-fleet'); };
  return (
    <AppShell useNavModel={useSupervisorNav} getHits={supervisorHits} searchPlaceholder="Search Sherpas, stations, zones…">
      <div className="content">
        <div className="title-block"><div><h1>Live view</h1><p>ECC plant, ground floor · Sherpa positions update in real time</p></div>
          <div className="actions"><Button size="sm" color="secondary" iconLeading={paused ? Play : PauseCircle} onPress={togglePause}>{paused ? 'Resume fleet' : 'Pause fleet'}</Button></div></div>
        <div className="builder">
          <div className="bh"><Map01 className="ic size-4" /><h2>ECC layout · Floor 0</h2><BadgeWithDot size="sm" type="pill-color" color="success" className="lv-live">Live</BadgeWithDot>
            <div style={{ flex: 1 }} /><StatChips />
            <span className="lv-fleet-lbl" style={{ fontSize: 12, fontWeight: 600 }}>Fleet -</span>
            <Select size="sm" aria-label="Fleet" className="fleet-select" selectedKey={s.fleetFilter} onSelectionChange={(k) => liveStore.getState().setFleet(String(k))}
              items={[{ id: 'all', label: 'All fleets' }, ...FLEETS.map((f) => ({ id: f.id, label: f.name }))]}>{(item) => <Select.Item {...item} />}</Select></div>
          <div className={'canvas lv-canvas' + (s.drawing ? ' drawing' : '') + (s.selectedId ? ' has-sel' : '')}>
            <div className="gl" ref={host} /><div className="lv-labels" ref={labels} />
            {loaded !== true && <div className="loading lv-loading">{loaded === false ? 'Floor map could not load' : 'Loading floor map…'}</div>}
            <MapToolbar />
            {s.panel === 'list' && <SherpaList />}{s.panel === 'layers' && <LayersPanel />}{s.panel === 'zones' && <ZonesPanel />}
            <DrawBanner /><SherpaDetails /><ZoneLegend />
            <MapControls map={map} zoomPct={view.zoomPct} azimuth={view.azimuth} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
