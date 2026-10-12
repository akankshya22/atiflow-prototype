/** Station map geometry (reference map, 398 x 767 box). Add stations / lanes here to extend the map. */
export interface Pt { x: number; y: number }
export const MAP_W = 398, MAP_H = 767;
export const ROBOT_SIZE = { w: 20.99, h: 40.27 };           // sprite offsets (the PNG has a baked-in shadow)
export const HOME: Pt = { x: 230.2, y: 527.2 };
export const LANE_Y = 470;
export const STATION_POINTS: Record<string, Pt> = { '100': { x: 196.7, y: 656.7 }, '101': { x: 52, y: 322 }, '102': { x: 52, y: 133 }, '103': { x: 345, y: 105 }, '104': { x: 345, y: 388 } };
/** Station label boxes on the map: [number, left, top, width|undefined]. */
export const STATION_LABELS: [string, number, number, number?][] = [['101', 57.54, 310, 26.18], ['100', 184, 617, 27.92], ['102', 57.54, 121.6, 27.05], ['104', 352.55, 376], ['103', 352.55, 93.65]];

export function route(from: Pt, to: Pt): Pt[] {
  return Math.abs(from.x - to.x) < 1 ? [from, to] : [from, { x: from.x, y: LANE_Y }, { x: to.x, y: LANE_Y }, to];
}
export const polyLength = (pts: Pt[]) => pts.reduce((a, p, i) => (i ? a + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0);
export function pointOnPoly(pts: Pt[], d: number): { p: Pt; ang: number } {
  let rem = d;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b.x - a.x, b.y - a.y);
    if (rem <= L || i === pts.length - 1) { const t = L ? Math.min(1, rem / L) : 1; return { p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, ang: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI - 90 }; }
    rem -= L;
  }
  return { p: pts[0], ang: 0 };
}
export const toPath = (pts: Pt[]) => 'M' + pts.map((o) => `${o.x} ${o.y}`).join(' L');
