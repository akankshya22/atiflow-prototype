import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Map01, Minus } from '@untitledui/icons';
import { ButtonUtility } from '@/components/base/buttons/button-utility';
import { locate } from '../model/tree';
import { selectNodes, useWorkflow, wfStore } from '../model/store';
import { HOME, MAP_H, MAP_W, ROBOT_SIZE, STATION_LABELS } from '../sim/geometry';
import { simBus } from '../sim/runner';
import { MapStatic } from '../assets/MapStatic';
import floor from '../assets/map-floor.png';
import robotImg from '../assets/robot.png';

const HEAD_H = 51, FOOT_H = 36;
const stationNums = (id: string | null) => { if (!id) return [] as string[]; const n = locate(wfStore.getState().nodes(), id)?.node; if (!n) return []; const v = n.t === 'station' || n.t === 'logic' ? n.f.station : null;
  return (Array.isArray(v) ? v : v ? [v as string] : []).map((x) => (String(x).match(/(\d{3})/) || [])[1]).filter(Boolean); };

/** Station map. `float`: draggable card inside the canvas. `docked`: full-height column beside the builder while a simulation runs. */
export function MapPreview({ mode, canvasRef, onClose }: { mode: 'float' | 'docked'; canvasRef?: RefObject<HTMLDivElement | null>; onClose: () => void }) {
  const card = useRef<HTMLDivElement>(null); const body = useRef<HTMLDivElement>(null); const robot = useRef<HTMLDivElement>(null);
  const trailDone = useRef<SVGPathElement>(null); const trailCur = useRef<SVGPathElement>(null); const [moved, setMoved] = useState<{ x: number; y: number } | null>(null);
  const sim = useWorkflow((s) => s.sim); const selected = useWorkflow((s) => s.selected); const nodes = useWorkflow(selectNodes);
  const hl = useMemo(() => (sim.hlStation ? [sim.hlStation] : stationNums(selected)), [sim.hlStation, selected, nodes]);   // eslint-disable-line react-hooks/exhaustive-deps
  const running = sim.status === 'running';

  // fit the 398x767 map into whatever size the card has
  const fit = () => {
    const c = card.current, b = body.current; if (!c || !b) return;
    if (mode === 'float') { const cv = canvasRef?.current; const availH = (cv?.clientHeight ?? 640) - 96, availW = (cv?.clientWidth ?? 440) - 32; const w = Math.max(220, Math.min(398, availW)), h = Math.max(260, Math.min(587, availH));
      const sc = Math.max(0.25, Math.min((h - HEAD_H - 8) / MAP_H, (w - 16) / MAP_W)); c.style.width = w + 'px'; c.style.height = h + 'px'; b.style.transform = `scale(${sc})`; b.style.left = (w - MAP_W * sc) / 2 + 'px'; b.style.top = HEAD_H + 'px'; }
    else { const w = c.clientWidth, h = c.clientHeight - HEAD_H - FOOT_H; const sc = Math.max(0.3, Math.min(h / MAP_H, (w - 16) / MAP_W)); b.style.transform = `scale(${sc})`; b.style.left = (w - MAP_W * sc) / 2 + 'px'; b.style.top = HEAD_H + Math.max(0, (h - MAP_H * sc) / 2) + 'px'; }
  };
  useLayoutEffect(fit); useEffect(() => { const ro = new ResizeObserver(fit); card.current && ro.observe(card.current); canvasRef?.current && ro.observe(canvasRef.current); return () => ro.disconnect(); });  // eslint-disable-line react-hooks/exhaustive-deps

  // robot + trail frames come straight from the simulator (no React re-render per frame)
  useEffect(() => simBus.on((f) => {
    if (f.type === 'robot' && robot.current) { robot.current.style.left = f.p.x - ROBOT_SIZE.w / 2 + 'px'; robot.current.style.top = f.p.y - ROBOT_SIZE.h / 2 + 'px'; robot.current.style.transform = `rotate(${f.ang}deg)`; }
    else if (f.type === 'trail') { trailDone.current?.setAttribute('d', f.done); trailCur.current?.setAttribute('d', f.cur); }
    else if (f.type === 'reset') { trailDone.current?.setAttribute('d', ''); trailCur.current?.setAttribute('d', ''); if (robot.current) { robot.current.style.left = HOME.x - ROBOT_SIZE.w / 2 + 'px'; robot.current.style.top = HOME.y - ROBOT_SIZE.h / 2 + 'px'; robot.current.style.transform = ''; } }
  }), []);

  // drag the floating card by its header (mouse + touch)
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const onDown = (e: React.PointerEvent) => { if (mode !== 'float' || (e.target as HTMLElement).closest('button')) return; const r = card.current!.getBoundingClientRect(), c = canvasRef!.current!.getBoundingClientRect(); drag.current = { dx: e.clientX - r.left + c.left, dy: e.clientY - r.top + c.top }; e.currentTarget.setPointerCapture(e.pointerId); card.current!.classList.add('moving'); };
  const onMove = (e: React.PointerEvent) => { const d = drag.current, c = canvasRef?.current; if (!d || !c) return; const cw = c.clientWidth, ch = c.clientHeight, el = card.current!;
    setMoved({ x: Math.max(4, Math.min(e.clientX - d.dx, cw - el.offsetWidth - 4)), y: Math.max(4, Math.min(e.clientY - d.dy, ch - el.offsetHeight - 4)) }); };
  const onUp = () => { drag.current = null; card.current?.classList.remove('moving'); };

  return (
    <div ref={card} className={`wf-map ${mode}`} data-no-pan role="region" aria-label="Map preview" style={mode === 'float' && moved ? { left: moved.x, top: moved.y, right: 'auto' } : mode === 'docked' ? { width: 'clamp(260px, 28vw, 398px)' } : undefined}>
      <div className="wf-map-floor" style={{ backgroundImage: `url(${floor})` }} />
      <div className="wf-map-head" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <Map01 className="size-4 text-fg-tertiary" />Map Preview
        {running && <span className="ml-auto flex items-center gap-1.5 text-[11px] font-medium text-quaternary"><i className="size-1.5 rounded-full bg-[#22c55e]" />Running</span>}
        <ButtonUtility className={running ? '' : 'ml-auto'} size="xs" color="tertiary" icon={Minus} tooltip={mode === 'docked' ? 'Stop simulation and close' : 'Minimize map preview'} onPress={onClose} />
      </div>
      <div className="wf-map-body" ref={body}>
        <MapStatic />
        {STATION_LABELS.map(([num, l, t, w]) => <span key={num} className={'wf-slabel' + (hl.includes(num) ? ' hl' : '')} data-sta={num} style={{ left: l, top: t, width: w }}>S{num}</span>)}
        <svg className="absolute" style={{ left: 0, top: 0, overflow: 'visible' }} width={MAP_W} height={MAP_H} aria-hidden="true">
          <path ref={trailDone} d="" stroke="#4DC3BA" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity=".85" />
          <path ref={trailCur} d="" stroke="#4DC3BA" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5 5" fill="none" opacity=".6" />
        </svg>
        <div className="wf-robot" ref={robot} style={{ left: HOME.x - ROBOT_SIZE.w / 2, top: HOME.y - ROBOT_SIZE.h / 2, backgroundImage: `url(${robotImg})` }} />
        <div className="wf-robot red" style={{ left: 334.2, top: 271, backgroundImage: `url(${robotImg})` }} />
      </div>
      {mode === 'docked' && <div className="wf-map-foot" aria-live="polite">{sim.step}</div>}
    </div>
  );
}

/** Collapsed map: a small card (Figma "Map Preview (mini)") that opens the full preview. */
export function MapMini({ onOpen }: { onOpen: () => void }) {
  return (
    <button className="wf-mini" data-no-pan aria-label="Open map preview" title="Open map preview" onClick={onOpen}>
      <span className="wf-map-floor" style={{ backgroundImage: `url(${floor})` }} />
      <span className="head"><Map01 className="size-4 text-fg-tertiary" />Map Preview</span>
    </button>
  );
}
