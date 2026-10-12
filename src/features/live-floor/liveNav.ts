import { store, useApp } from '@/core/store';
import { handle } from '@/ui/engineHandle';
import master from '@/ui/icons/master-data.svg'; import fleetI from '@/ui/icons/fleet.svg'; 
import bell from '@/ui/icons/bell.svg'; import gear from '@/ui/icons/settings.svg';
import { notify } from '@/ui/toast';
import type { NavModel, SearchHit } from '@/shell/types';

const soon = (name: string) => () => notify.info(`${name} isn't part of this prototype`, 'The supervisor view covers the Live Floor.', 'soon');

/** Sidebar content for the supervisor's Live Floor. Sidebar selection (`navSel`) is separate from the map filter (`fleetId`). */
export function useLiveNav(): NavModel {
  const fleets = useApp((s) => s.fleets), navSel = useApp((s) => s.navSel), robots = useApp((s) => s.robots), events = useApp((s) => s.events);
  const st = store.getState(); const alerts = events.filter((e) => e.level !== 'info').length;
  const pick = (sel: string, fleet: string) => () => { st.setNav(sel); st.setFleet(fleet); };
  return {
    groups: [
      { id: 'ops', label: 'Operations', items: [{ id: 'live', label: 'Live Floor', icon: master, active: navSel === 'live', onSelect: pick('live', 'all') }] },
      { id: 'fleets', label: 'Fleets', items: [
        { id: 'all', label: 'All fleets', icon: fleetI, active: navSel === 'fleet:all', onSelect: pick('fleet:all', 'all') },
        ...fleets.map((f) => ({ id: f.id, label: `${f.name} (${Object.values(robots).filter((r) => r.fleetId === f.id).length})`, icon: fleetI, active: navSel === 'fleet:' + f.id, onSelect: pick('fleet:' + f.id, f.id) })),
      ] },
    ],
    footerItems: [{ id: 'notif', label: 'Notifications', icon: bell, badge: alerts, onSelect: soon('Notifications') }, { id: 'settings', label: 'Settings', icon: gear, onSelect: soon('Settings') }],
  };
}

export function liveHits(q: string): SearchHit[] {
  const ql = q.toLowerCase(); const { robots, site, nav } = store.getState();
  return [
    ...Object.values(robots).filter((r) => r.id.toLowerCase().includes(ql)).slice(0, 5).map((r) => ({ kind: 'Robot', title: r.id, sub: r.state, go: () => handle.engine?.focusRobot(r.id) })),
    ...(site?.zones.filter((z) => z.active && z.name.toLowerCase().includes(ql)).map((z) => ({ kind: 'Zone', title: z.name, sub: z.kind, go: () => handle.engine?.focusZone(z.id) })) ?? []),
    ...(nav?.stations.filter((s) => (s.id + ' ' + s.name).toLowerCase().includes(ql)).slice(0, 6).map((s) => ({ kind: 'Station', title: `${s.id} · ${s.name}`, sub: s.type, go: () => store.getState().selectStation(s.id) })) ?? []),
  ];
}
