import { useEffect, useRef, useState } from 'react';
import { store, useApp } from '@/core/store';
import { Engine } from '@/engine/Engine';
import { MockSimulator } from '@/adapters/mock';
import type { NavGraph, SiteLayout, TelemetryAdapter } from '@/core/types';
import { AppShell } from '@/shell/AppShell';
import { handle } from '@/ui/engineHandle';
import { CameraModes, ZoomControl, FleetList, RobotPanel, StationPanel, MapLegend } from '@/ui/Panels';
import { Button } from '@/components/base/buttons/button';
import { ButtonUtility } from '@/components/base/buttons/button-utility';
import { Input } from '@/components/base/input/input';
import { Select } from '@/components/base/select/select';
import { WalkPad } from '@/ui/WalkPad'; import { useCoarse } from '@/ui/useCoarse';
import { Send01, SearchLg, Stars02, XClose } from '@untitledui/icons';
import { liveHits, useLiveNav } from './liveNav';

const SITE = new URLSearchParams(location.search).get('site') ?? 'ecc';

/** Supervisor home: the 3D live floor. Content only; chrome comes from AppShell. */
export function LiveFloorPage() {
  const holder = useRef<HTMLDivElement>(null); const [view, setView] = useState({ x: 0, y: 0, yaw: 0, zoomPct: 100 }); const [ready, setReady] = useState(false); const [fleetOpen, setFleetOpen] = useState(() => window.innerWidth > 1100);
  const fleets = useApp((s) => s.fleets), fleetId = useApp((s) => s.fleetId), mode = useApp((s) => s.cameraMode), site = useApp((s) => s.site), zoneId = useApp((s) => s.activeZoneId), q = useApp((s) => s.query);
  useEffect(() => {
    let adapter: TelemetryAdapter | null = null; let dead = false; const eng = new Engine(holder.current!); handle.engine = eng; eng.onView = setView;
    (async () => {
      const [s, n] = await Promise.all([fetch(`/sites/${SITE}/site.json`).then((r) => r.json() as Promise<SiteLayout>), fetch(`/sites/${SITE}/nav.json`).then((r) => r.json() as Promise<NavGraph>)]);
      if (dead) return;
      store.getState().setSite(s, n); eng.load(s, n); setReady(true);
      adapter = new MockSimulator(n, s.siteId);
      adapter.onTelemetry((b) => { store.getState().ingest(b); eng.updateRobots(b); }); adapter.connect(); if (import.meta.env.DEV) Object.assign(window, { __adapter: adapter });  // dev-only: lets tests inject faults
    })();
    return () => { dead = true; adapter?.disconnect(); eng.dispose(); handle.engine = null;
      store.setState({ selectedId: null, selectedStationId: null, activeZoneId: null, cameraMode: 'orbit', navSel: 'live', fleetId: 'all', query: '', robots: {}, traffic: {}, events: [] }); };   // clean slate for the next sign-in
  }, []);
  useEffect(() => { handle.engine?.applyFilter(fleetId, q); }, [fleetId, q]);
  const sel = useApp((s) => s.selectedId); const selStation = useApp((s) => s.selectedStationId);
  useEffect(() => { const f = () => handle.engine?.setInset(fleetOpen && window.innerWidth > 720 ? 300 : 0); f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, [fleetOpen, ready]);
  const coarse = useCoarse();
  const zone = site?.zones.find((z) => z.id === zoneId);
  return (
    <AppShell useNavModel={useLiveNav} getHits={liveHits} searchPlaceholder="Search robots, stations, zones…">
      <div className="content">
        <div className="title-block"><div><h1>Live Floor</h1><p>Track every robot and its activity in real time</p></div>
          {/* Header action slot (top-right of the title block, same row as "Live Floor"). Empty on purpose: Replay + Dispatch Task were removed. See CLAUDE.md section 13. */}
          <div className="actions" /></div>
        <div className="builder">
          <div className="bh"><span className="ic">▦</span><h2>Live View</h2><div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>Fleet -</span>
            <Select size="sm" aria-label="Fleet" className="fleet-select" selectedKey={fleetId} onSelectionChange={(k) => store.getState().setFleet(String(k))}
              items={[{ id: 'all', label: 'All fleets' }, ...fleets.map((f) => ({ id: f.id, label: f.name }))]}>{(item) => <Select.Item {...item} />}</Select></div>
          <div className={'canvas' + (sel || selStation ? ' has-sel' : '')}><div className="gl" ref={holder} />{!ready && <div className="loading">Loading site…</div>}
            <CameraModes fleetOpen={fleetOpen} onFleet={() => setFleetOpen((o) => !o)} />{fleetOpen && <FleetList />}<RobotPanel /><StationPanel />{!sel && !selStation && <MapLegend />}
            {zone && <div className="float zonebar"><i className="dot" style={{ background: zone.color }} />{zone.name}<ButtonUtility size="xs" color="tertiary" icon={XClose} tooltip="Back to whole floor" onPress={() => handle.engine?.home()} /></div>}
            {mode === 'walk' && <div className="float hint">{coarse ? 'Left stick: move (push far to run) · Drag to look' : 'WASD move · Mouse look · Shift run · Esc exit'}</div>}<WalkPad />
            <div className="float cmd"><span className="ai"><Stars02 className="size-4" /></span>
              <Input size="sm" icon={SearchLg} className="flex-1" wrapperClassName="shadow-none ring-0 bg-transparent" placeholder="Search robots by ID…" aria-label="Search robots by ID" value={q} onChange={(v) => store.getState().setQuery(v)} />
              <Button size="sm" color="primary" iconLeading={Send01} aria-label="Search" /></div>
            <ZoomControl pct={view.zoomPct} />
          </div></div>
      </div>
    </AppShell>
  );
}
