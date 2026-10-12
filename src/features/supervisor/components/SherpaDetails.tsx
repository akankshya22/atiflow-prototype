import { ProgressBar } from '@/components/base/progress-indicators/progress-indicators';
import { useAuth } from '@/features/auth/authStore';
import { InfoPanel } from '@/ui/InfoPanel';
import { M_PER_U, MODELS, STATUS, fleetName } from '../model/data';
import { statusOf } from '../model/sim';
import { liveStore, robotById, sim, useLive } from '../model/store';
import { Battery, MODEL_IMG } from './bits';

const refresh = () => liveStore.setState((x) => ({ tick: x.tick + 1 }));

/** Selected Sherpa: the shared InfoPanel card with picture, current action + progress, stats, mission stops and actions. */
export function SherpaDetails() {
  useLive((s) => s.tick); const id = useLive((s) => s.selectedId), follow = useLive((s) => s.follow); const who = useAuth((s) => s.user?.name ?? 'Supervisor');
  const o = robotById(id); if (!o) return null;
  const st = liveStore.getState(); const s = statusOf(o); const cur = o.stopIdx % o.stops.length; const paused = o.pausedByUser;
  return <InfoPanel title={o.id} subtitle={`${MODELS[o.model].name} · ${fleetName(o.fleet)}`} pill={{ label: STATUS[s].label, tone: STATUS[s].tone }}
    onClose={() => st.select(null)}
    lead={<>
      <div className="lv-hero"><img src={MODEL_IMG[o.model]} alt={MODELS[o.model].name} /></div>
      <div className="lv-now"><div className="lv-now-h"><small>Current action</small><span className="lv-mono">x {(o.x * M_PER_U).toFixed(1)} · y {(o.y * M_PER_U).toFixed(1)} m</span></div><b>{paused ? 'Paused by operator' : o.action}</b><span>{paused ? 'Resume to continue the mission' : o.sub}</span>
        <ProgressBar className="mt-2 h-1.5" value={Math.round(sim.legProgress(o) * 100)} /></div>
    </>}
    stats={[
      { label: 'Battery', value: <Battery pct={o.batt} /> }, { label: 'Speed', value: `${(o.speedNow * M_PER_U * 0.62).toFixed(1)} m/s` },
      { label: 'Payload', value: o.loaded ? o.load ?? 'Loaded' : 'Empty' }, { label: 'Location', value: sim.locationOf(o) },
      { label: 'Trips today', value: o.trips }, { label: 'Distance today', value: `${o.odo.toFixed(1)} km` },
    ]}
    actions={[
      { label: follow ? 'Following' : 'Follow', onClick: () => st.setFollow(!follow) },
      o.state === 'error' ? { label: 'Clear and resume', onClick: () => { sim.clearError(o); refresh(); } }
        : { label: paused ? 'Resume' : 'Pause Sherpa', onClick: () => { sim.togglePause(o, who); refresh(); } },
    ]}>
    <div className="list-title">Mission · {o.stops.length} stops</div>
    <div className="lv-steps">{o.stops.map((p, i) => <div key={i} className={'lv-step' + (i === cur ? ' cur' : i < cur ? ' done' : '')}><i />
      <span>{p.kind === 'pickup' ? 'Pick up' : p.kind === 'drop' ? 'Drop off' : 'Charge'} at <b>{p.name}</b></span><small>{p.dwell}s</small></div>)}</div>
  </InfoPanel>;
}
