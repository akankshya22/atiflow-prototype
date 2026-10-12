import { useEffect, useRef, useState } from 'react';
import { store, useApp } from '@/core/store';
import { handle } from '@/ui/engineHandle';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Send01, SearchLg, Stars02 } from '@untitledui/icons';
import { locateHits, type LocateHit } from './locate';

/** Fly the map to a robot or station and select it (opens its card). */
export function locate(h: LocateHit) {
  const e = handle.engine; if (!e) return;
  if (h.kind === 'robot') e.focusRobot(h.id);
  else { store.getState().selectStation(h.id); e.focusStation(h.id); }
}

/** Bottom search bar of the Live Floor: type a robot or station ID, pick a suggestion (or press Enter / Send) and the map flies there. */
export function LocateSearch() {
  const robots = useApp((s) => s.robots), nav = useApp((s) => s.nav);
  const [q, setQ] = useState(''); const [open, setOpen] = useState(false); const [active, setActive] = useState(0); const auto = useRef('');
  const hits = locateHits(q, Object.values(robots), nav?.stations ?? []);
  const go = (h: LocateHit | undefined) => { if (!h) return; locate(h); setQ(h.id); setOpen(false); auto.current = h.id.toLowerCase(); };
  // typing a complete ID locates it straight away
  useEffect(() => { const s = q.trim().toLowerCase(); const exact = hits.find((h) => h.id.toLowerCase() === s); if (exact && auto.current !== s) go(exact); if (!exact) auto.current = ''; });   // eslint-disable-line react-hooks/exhaustive-deps
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(hits[active] ?? hits[0]); }
    else if (e.key === 'Escape') setOpen(false);
  };
  return (
    <div className="float cmd" onKeyDown={onKey} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <span className="ai"><Stars02 className="size-4" /></span>
      <Input size="sm" icon={SearchLg} className="flex-1" wrapperClassName="shadow-none ring-0 bg-transparent" placeholder="Search Robots or Stations by ID" aria-label="Search Robots or Stations by ID"
        value={q} onChange={(v) => { setQ(v); setOpen(true); setActive(0); }} onFocus={() => setOpen(true)} />
      <Button size="sm" color="primary" iconLeading={Send01} aria-label="Locate on map" onPress={() => go(hits[active] ?? hits[0])} />
      {open && q.trim() && (
        <div className="loc-pop" role="listbox" aria-label="Robots and stations">
          {hits.length ? hits.map((h, i) => (
            <button key={h.kind + h.id} type="button" role="option" aria-selected={i === active} className={i === active ? 'on' : ''} onMouseEnter={() => setActive(i)} onClick={() => go(h)}>
              <i className="dot" style={{ background: h.color }} /><b>{h.id}</b><span>{h.sub}</span><em>{h.kind === 'robot' ? 'Robot' : 'Station'}</em>
            </button>
          )) : <div className="none">No robot or station matches “{q.trim()}”</div>}
        </div>
      )}
    </div>
  );
}
