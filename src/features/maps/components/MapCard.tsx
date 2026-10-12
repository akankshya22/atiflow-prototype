import { Badge } from '@/components/base/badges/badges';
import { copy } from '../copy';
import { routingName } from '../model/routing';
import type { FleetMap } from '../model/types';

/** One map: preview, version + routing chip, name, the fleets that run on it and its station count. */
export function MapCard({ map, fleets }: { map: FleetMap; fleets: string[] }) {
  const row = (label: string, value: string, muted?: boolean) => (
    <div className="flex items-baseline justify-between gap-4 text-sm"><span className="text-xs tracking-wide text-tertiary uppercase">{label}</span><span className={muted ? 'text-quaternary' : 'text-right font-medium text-primary'}>{value}</span></div>
  );
  return (
    <article className="overflow-hidden rounded-xl border border-secondary bg-primary shadow-xs" aria-label={map.name}>
      <div className="relative h-44 bg-secondary">
        <img src={map.thumbnail} alt="" className="size-full object-cover" />
        <span className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/70 py-1 pr-3 pl-1 text-xs font-medium text-white">
          <Badge size="sm" type="pill-color" color="brand">{copy.card.version(map.version)}</Badge>{routingName(map.version)}
        </span>
      </div>
      <div className="flex flex-col gap-2 p-4">
        <h2 className="truncate text-lg font-semibold text-primary" title={map.name}>{map.name}</h2>
        {fleets.length ? row(copy.card.fleet, fleets.join(', ')) : row(copy.card.fleet, copy.card.unassigned, true)}
        {row(copy.card.stations, copy.card.stationCount(map.stations.length))}
      </div>
    </article>
  );
}
