/** Robot and trolley footprints (metres) shared by the simulator, the rule tests and the 3D renderer, so "does not touch" means the same thing everywhere. */
export const FOOTPRINTS: Record<string, [number, number]> = { 'sherpa-xt-lite': [1.2, 0.85], 'sherpa-tug': [1.45, 0.9] };
export const footprint = (model: string): [number, number] => FOOTPRINTS[model] ?? FOOTPRINTS['sherpa-xt-lite'];

/** Towed material trolley: body length / width, gap between robot rear and trolley front (tow bar). */
export const TROLLEY = { L: 1.1, W: 0.78, bar: 0.4 };
/** Distance from the robot centre back to the trolley centre, measured along the path the robot drove. */
export const trolleyBack = (model: string) => footprint(model)[0] / 2 + TROLLEY.bar + TROLLEY.L / 2;

/** Oriented box: centre, heading (rad), half length along heading, half width. */
export interface Box { x: number; y: number; th: number; hl: number; hw: number }

/** Separating-axis test for two oriented boxes, each grown by `margin` on every side. */
export function boxesOverlap(a: Box, b: Box, margin = 0): boolean {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.hypot(dx, dy) > Math.hypot(a.hl, a.hw) + Math.hypot(b.hl, b.hw) + 2 * margin) return false;
  const axes = [a.th, a.th + Math.PI / 2, b.th, b.th + Math.PI / 2];
  for (const t of axes) {
    const ux = Math.cos(t), uy = Math.sin(t);
    const r = (q: Box) => (q.hl + margin) * Math.abs(Math.cos(q.th) * ux + Math.sin(q.th) * uy) + (q.hw + margin) * Math.abs(-Math.sin(q.th) * ux + Math.cos(q.th) * uy);
    if (Math.abs(dx * ux + dy * uy) > r(a) + r(b)) return false;
  }
  return true;
}

/** Recent positions of a robot (newest last), used to place a towed trolley on the path the robot actually drove. */
export class Trail {
  private pts: { x: number; y: number }[] = [];
  constructor(x: number, y: number, theta: number, back = 4) { this.pts = [{ x: x - Math.cos(theta) * back, y: y - Math.sin(theta) * back }, { x, y }]; }
  push(x: number, y: number) {
    const l = this.pts[this.pts.length - 1]; if (Math.hypot(x - l.x, y - l.y) < 0.05) return;
    this.pts.push({ x, y }); if (this.pts.length > 160) this.pts.splice(0, this.pts.length - 160);
  }
  /** Point `d` metres back along the trail from (x, y). */
  back(x: number, y: number, d: number): { x: number; y: number } {
    let px = x, py = y, left = d;
    for (let i = this.pts.length - 1; i >= 0; i--) {
      const q = this.pts[i], L = Math.hypot(px - q.x, py - q.y);
      if (L >= left && L > 1e-6) { const k = left / L; return { x: px + (q.x - px) * k, y: py + (q.y - py) * k }; }
      left -= L; px = q.x; py = q.y;
    }
    const f = this.pts[0], s = this.pts[1] ?? { x, y }, th = Math.atan2(s.y - f.y, s.x - f.x) || 0;
    return { x: px - Math.cos(th) * left, y: py - Math.sin(th) * left };
  }
  /** Trolley pose for a robot at (x, y): centre `d` back along the trail, facing the hitch point. */
  trolley(x: number, y: number, d: number, hitch: number): { x: number; y: number; th: number } {
    const c = this.back(x, y, d), h = this.back(x, y, Math.max(0, d - hitch));
    return { x: c.x, y: c.y, th: Math.atan2(h.y - c.y, h.x - c.x) };
  }
}
