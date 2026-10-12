import { useLocation, useNavigate } from 'react-router-dom';
import { notify } from '@/ui/toast';
import type { NavModel, SearchHit } from '@/shell/types';
import mapsI from '@/ui/icons/maps.svg'; import fleetI from '@/ui/icons/fleet.svg'; import bellI from '@/ui/icons/bell.svg'; import gearI from '@/ui/icons/settings.svg';
import { FLEETS, STATIONS, stationPadY } from './model/data';
import { liveStore, sim, useLive } from './model/store';

export const LIVE_PATH = '/live';
export const FLEETS_PATH = '/live/fleets';
const soon = (name: string) => () => notify.info(`${name} isn't part of this prototype`, 'This prototype covers Live view and Fleets for supervisors.', 'soon');

/** Supervisor sidebar: Operations > Live view, then Fleets. The highlight follows the URL. */
export function useSupervisorNav(): NavModel {
  const { pathname } = useLocation(); const navigate = useNavigate(); useLive((s) => s.tick);
  const alerts = sim.robots.filter((o) => o.state === 'error').length;
  return {
    groups: [{ id: 'ops', label: 'Operations', items: [
      { id: 'live', label: 'Live view', icon: mapsI, active: pathname === LIVE_PATH, onSelect: () => navigate(LIVE_PATH) },
      { id: 'fleets', label: 'Fleets', icon: fleetI, badge: FLEETS.length, active: pathname === FLEETS_PATH, onSelect: () => navigate(FLEETS_PATH) },
    ] }],
    footerItems: [{ id: 'notif', label: 'Notifications', icon: bellI, badge: alerts, onSelect: soon('Notifications') }, { id: 'settings', label: 'Settings', icon: gearI, onSelect: soon('Settings') }],
  };
}

/** Top-bar search: Sherpas (select), zones and stations (fly the map there). Every hit opens the Live view. */
export function supervisorHits(q: string): SearchHit[] {
  const ql = q.toLowerCase().replace('-', ''); const st = liveStore.getState(); const m = (s: string) => s.toLowerCase().replace('-', '').includes(ql);
  return [
    ...sim.robots.filter((o) => m(o.id)).map((o) => ({ kind: 'Sherpa', title: o.id, sub: o.action, to: LIVE_PATH, go: () => { st.setFleet('all'); st.select(o.id); } })),
    ...st.zones.filter((z) => m(z.name) || m(z.id)).slice(0, 5).map((z) => ({ kind: 'Zone', title: z.name, sub: z.id, to: LIVE_PATH, go: () => st.focusOn((z.r[0] + z.r[2]) / 2, (z.r[1] + z.r[3]) / 2, 90) })),
    ...Object.entries(STATIONS).filter(([k]) => m(k)).slice(0, 5).map(([k, s]) => ({ kind: 'Station', title: k, to: LIVE_PATH, go: () => st.focusOn(s.x, stationPadY(s), 60) })),
  ];
}
