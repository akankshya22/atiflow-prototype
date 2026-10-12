/**
 * Three.js view of the supervisor Live view (ported from the supplied "AtiFlow Live View" prototype):
 * CAD floor texture, optional LiDAR point clouds, hall structures, production lines, zones, stations,
 * Sherpas (procedural 10K / XT Lite with tow carts) and planned routes, plus 2D / 2.5D / 3D camera modes,
 * picking, follow and zone drawing. React never touches Three: it calls these methods and gets callbacks.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CX, CY, M_PER_U, MAP, MODELS, STATIONS, STATUS, ZONE_TYPES, stationPadY, type Zone, type ZoneType } from '../model/data';
import { posAt, statusOf, type SimRobot } from '../model/sim';
import type { LayerKey, ViewMode } from '../model/store';
import mapUrl from '../assets/map.webp';
import xtTopUrl from '../assets/xtlite-top.webp';

const W = (x: number, y: number, h = 0) => new THREE.Vector3(x - CX, h, y - CY);
const K = 1.7;                  // display scale so Sherpas read at plant scale
const TILT25 = 0.82;            // ≈47° from straight down, the Google Maps tilt
const PI = Math.PI;

export interface LiveMapCallbacks {
  onPick(id: string): void;
  onView(v: { zoomPct: number; azimuth: number }): void;
  onLoaded(ok: boolean): void;
  /** Rectangle drawn while a zone draw is armed (drawing units). */
  onDrawn(r: Zone['r']): void;
  /** The user grabbed the camera while following a Sherpa. */
  onFollowBreak(): void;
  onNotice(msg: string): void;
}
interface RobotView { o: SimRobot; g: THREE.Group; cart: THREE.Group | null; ring: THREE.Mesh; glow: THREE.Mesh; sel: THREE.Mesh; beacon: THREE.MeshStandardMaterial; off: { x: number; y: number }; wx: number; wy: number; heading: number;
  label: HTMLDivElement; dot: HTMLElement; act: HTMLElement; route: { line: THREE.Line; mat: THREE.LineDashedMaterial } }
interface Label { el: HTMLDivElement; pos: THREE.Vector3; maxDist: number; type?: ZoneType }

function chamfer(L: number, Wd: number, c: number) {
  const s = new THREE.Shape(); const l = L / 2, w = Wd / 2;
  s.moveTo(-l + c, -w); s.lineTo(l - c, -w); s.lineTo(l, -w + c); s.lineTo(l, w - c); s.lineTo(l - c, w); s.lineTo(-l + c, w); s.lineTo(-l, w - c); s.lineTo(-l, -w + c); s.closePath(); return s;
}
function extrude(shape: THREE.Shape, depth: number, y: number, mat: THREE.Material) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }); g.rotateX(-PI / 2);
  const m = new THREE.Mesh(g, mat); m.position.y = y; m.castShadow = true; return m;
}
function stripeTex(color: string) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
  g.fillStyle = color; g.globalAlpha = 0.22; g.fillRect(0, 0, 64, 64); g.globalAlpha = 0.55; g.strokeStyle = color; g.lineWidth = 7;
  for (let i = -64; i < 128; i += 20) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function topTex10k() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 180; const g = c.getContext('2d')!;
  g.fillStyle = '#f2b705'; g.fillRect(0, 0, 256, 180); g.fillStyle = '#1b1d1e'; g.beginPath(); g.moveTo(70, 0); g.lineTo(186, 0); g.lineTo(166, 180); g.lineTo(90, 180); g.fill();
  g.fillStyle = '#3a3d3f'; g.fillRect(96, 22, 64, 34); g.fillStyle = '#e8ecec'; g.font = 'bold 22px Inter, sans-serif'; g.textAlign = 'center'; g.fillText('Ati', 128, 140);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** A zone: tinted (or hatched) floor plane, wire box and faint volume. Also used for the live preview while drawing. */
export function buildZone(z: Pick<Zone, 'type' | 'r'>) {
  const t = ZONE_TYPES[z.type]; const [x1, y1, x2, y2] = z.r; const w = x2 - x1, h = y2 - y1;
  const g = new THREE.Group();
  let mat: THREE.MeshBasicMaterial;
  if (z.type === 'traffic' || z.type === 'restricted') { const tx = stripeTex(t.color); tx.repeat.set(w / 4, h / 4); mat = new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false }); }
  else mat = new THREE.MeshBasicMaterial({ color: t.color, transparent: true, opacity: z.type === 'slow' ? 0.16 : 0.22, depthWrite: false });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-PI / 2), mat); plane.position.copy(W(x1 + w / 2, y1 + h / 2, 0.08)); plane.renderOrder = 2; g.add(plane);
  const ht = z.type === 'restricted' ? 2.2 : z.type === 'traffic' ? 1.2 : 0.5;
  const box = new THREE.BoxGeometry(w, ht, h);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: t.color, transparent: true, opacity: 0.9 })); edges.position.copy(W(x1 + w / 2, y1 + h / 2, ht / 2)); g.add(edges);
  const vol = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: t.color, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide })); vol.position.copy(edges.position); g.add(vol);
  g.userData.top = W(x1 + w / 2, y1 + h / 2, ht + 0.4);
  return g;
}

export class LiveMap {
  private renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  private scene = new THREE.Scene(); private camera = new THREE.PerspectiveCamera(38, 1, 0.5, 3000); private controls: OrbitControls;
  private groups: Record<'floor' | 'cad' | 'pcA' | 'pcB' | 'zones' | 'stations' | 'routes' | 'machines' | 'structures' | 'robots', THREE.Group>;
  private cadMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false });
  private robots: RobotView[] = []; private zoneLabels: Label[] = []; private stationLabels: Label[] = [];
  private mode: ViewMode = '3d'; private fitDist = 420; private tween: ((now: number) => void) | null = null;
  private selected: string | null = null; private follow = false; private fleet = 'all'; private labelsOn = true;
  private drawType: ZoneType | null = null; private drawStart: { x: number; y: number } | null = null; private drawMesh: THREE.Group | null = null; private drawRect: Zone['r'] | null = null;
  private downAt: { x: number; y: number } | null = null; private ray = new THREE.Raycaster(); private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private raf = 0; private last = performance.now(); private ro: ResizeObserver; private pc: 'none' | 'loading' | 'done' = 'none'; private lastView = '';
  private v3 = new THREE.Vector3();

  constructor(private host: HTMLElement, private labels: HTMLElement, private robotsSrc: () => SimRobot[], private cb: LiveMapCallbacks) {
    const r = this.renderer; r.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; host.prepend(r.domElement);
    this.scene.background = new THREE.Color('#0c1518'); this.scene.fog = new THREE.Fog('#0c1518', 700, 1400);
    const c = this.controls = new OrbitControls(this.camera, r.domElement);
    c.enableDamping = true; c.dampingFactor = 0.09; c.maxDistance = 900; c.minDistance = 12; c.zoomSpeed = 1.1; c.maxPolarAngle = 1.32;
    c.addEventListener('start', () => { this.tween = null; if (this.follow) { this.follow = false; cb.onFollowBreak(); } });
    // light intensities x PI: three r155+ dropped the implicit PI factor of the r147 original
    this.scene.add(new THREE.HemisphereLight('#cfe6ea', '#1a2226', 1.15 * PI));
    const sun = new THREE.DirectionalLight('#ffffff', 1.5 * PI); sun.position.set(-160, 260, 120); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -260, right: 260, top: 200, bottom: -200, near: 10, far: 700 }); sun.shadow.bias = -0.0008; this.scene.add(sun);
    this.groups = Object.fromEntries((['floor', 'cad', 'pcA', 'pcB', 'zones', 'stations', 'routes', 'machines', 'structures', 'robots'] as const).map((k) => { const g = new THREE.Group(); this.scene.add(g); return [k, g]; })) as LiveMap['groups'];
    this.buildFloor(); this.buildStructures(); this.buildMachines(); this.buildStations(); this.buildRobots();
    const el = r.domElement;
    el.addEventListener('pointerdown', this.onDown); el.addEventListener('pointermove', this.onMove); el.addEventListener('pointerup', this.onUp);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host); this.resize();
    this.camera.position.set(0, this.fitDist, 0.01); c.target.set(0, 0, 0); c.update();
    this.raf = requestAnimationFrame(this.loop);
  }

  /* ---------- scene ---------- */
  private buildFloor() {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(520, 360).rotateX(-PI / 2), new THREE.MeshStandardMaterial({ color: '#131e22', roughness: 0.95 }));
    floor.receiveShadow = true; floor.position.y = -0.05; this.groups.floor.add(floor);
    const grid = new THREE.GridHelper(520, 104, '#1d2b30', '#172327'); grid.position.y = -0.03; this.groups.floor.add(grid);
    const cad = new THREE.Mesh(new THREE.PlaneGeometry(MAP.x1 - MAP.x0, MAP.y1 - MAP.y0).rotateX(-PI / 2), this.cadMat);
    cad.position.copy(W((MAP.x0 + MAP.x1) / 2, (MAP.y0 + MAP.y1) / 2, 0.02)); cad.renderOrder = 1; this.groups.cad.add(cad);
    new THREE.TextureLoader().load(mapUrl, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = this.renderer.capabilities.getMaxAnisotropy(); this.cadMat.map = t; this.cadMat.needsUpdate = true; this.cb.onLoaded(true); }, undefined, () => this.cb.onLoaded(false));
  }
  /** Hall pillars, clean room glass partition (door gaps on the west side) and hall walls. */
  private buildStructures() {
    const G = this.groups.structures;
    const pm = new THREE.MeshStandardMaterial({ color: '#3a4a50', roughness: 0.7 }); const pg = new THREE.BoxGeometry(1.1, 9, 1.1);
    for (let k = 0; k < 13; k++) for (const y of [155, 203.5, 252, 301, 349]) { const x = 20 + 23.85 * k; if (x > 310) continue; const m = new THREE.Mesh(pg, pm); m.position.copy(W(x, y, 4.5)); m.castShadow = m.receiveShadow = true; G.add(m); }
    const glass = new THREE.MeshPhysicalMaterial({ color: '#9fdfe0', transparent: true, opacity: 0.11, roughness: 0.1, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
    const edge = new THREE.LineBasicMaterial({ color: '#5fb8b3', transparent: true, opacity: 0.5 });
    const wall = (x1: number, y1: number, x2: number, y2: number, h: number, mat: THREE.Material) => {
      const a = W(x1, y1), b = W(x2, y2); const m = new THREE.Mesh(new THREE.PlaneGeometry(a.distanceTo(b), h), mat);
      m.position.set((a.x + b.x) / 2, h / 2, (a.z + b.z) / 2); m.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x); G.add(m);
      G.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([W(x1, y1, h), W(x2, y2, h)]), edge));
    };
    wall(336, 162, 445, 162, 5, glass); wall(445, 162, 445, 382, 5, glass); wall(336, 382, 445, 382, 5, glass);
    wall(336, 162, 336, 253, 5, glass); wall(336, 262.6, 336, 319.5, 5, glass); wall(336, 329, 336, 382, 5, glass);
    const solid = new THREE.MeshStandardMaterial({ color: '#24343a', roughness: 0.8, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    wall(0, 204, 330, 204, 4, solid); wall(330, 204, 330, 253, 4, solid); wall(330, 262.6, 330, 319.5, 4, solid); wall(330, 332, 330, 366, 4, solid);
  }
  /** CC, MI and SMT production lines as low volumes, plus racks in the prep / THT area. */
  private buildMachines() {
    const G = this.groups.machines;
    const mk = (x: number, y1: number, y2: number, w: number, h: number, c: string) => {
      const g = new THREE.BoxGeometry(w, h, y2 - y1); const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.1, transparent: true, opacity: 0.8 }));
      m.position.copy(W(x, (y1 + y2) / 2, h / 2)); m.castShadow = m.receiveShadow = true; G.add(m);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: '#8fd3cf', transparent: true, opacity: 0.35 })); e.position.copy(m.position); G.add(e);
    };
    [360, 370.6, 382.5, 393.8, 401, 408.3, 415.5, 422.5].forEach((x) => mk(x, 198, 253, 2.6, 1.6, '#2c4a52'));
    [360, 367.5, 375, 383.1, 391.3, 398.1, 405, 411.9, 419.4].forEach((x) => mk(x, 264, 320, 2.4, 1.5, '#33505a'));
    [368.1, 374.4, 381.3, 386.9, 394.4, 400, 406.3, 412.5, 419.4].forEach((x) => mk(x, 330, 378, 2.6, 1.9, '#3b4f63'));
    [[431, 436, 234, 252], [438, 443, 234, 252], [431, 443, 276, 316]].forEach(([a, b, c, d]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(b - a, 2.4, d - c), new THREE.MeshStandardMaterial({ color: '#3d4b52', transparent: true, opacity: 0.55 })); m.position.copy(W((a + b) / 2, (c + d) / 2, 1.2)); G.add(m);
    });
  }
  private buildStations() {
    const padG = new THREE.CylinderGeometry(1.2, 1.2, 0.12, 24); const ringG = new THREE.RingGeometry(1.5, 1.8, 32).rotateX(-PI / 2);
    for (const [name, s] of Object.entries(STATIONS)) {
      const y = stationPadY(s); const c = s.kind === 'charge' ? '#17b26a' : s.kind === 'stage' ? '#2e90fa' : '#66cbc4';
      const pad = new THREE.Mesh(padG, new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.35 })); pad.position.copy(W(s.x, y, 0.08)); this.groups.stations.add(pad);
      const ring = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.6 })); ring.position.copy(W(s.x, y, 0.1)); this.groups.stations.add(ring);
      this.stationLabels.push({ el: this.label('lv-lbl-station', name), pos: W(s.x, y, 0.6), maxDist: 110 });
    }
  }
  private label(cls: string, text: string) { const el = document.createElement('div'); el.className = cls; el.textContent = text; this.labels.append(el); return el; }

  private buildRobots() {
    const yellow = new THREE.MeshStandardMaterial({ color: '#f2b705', roughness: 0.42, metalness: 0.15 }), yellowXT = new THREE.MeshStandardMaterial({ color: '#f6c22b', roughness: 0.45, metalness: 0.1 });
    const black = new THREE.MeshStandardMaterial({ color: '#17191a', roughness: 0.6 }), dark = new THREE.MeshStandardMaterial({ color: '#2a2e30', roughness: 0.5 });
    const xtTop = new THREE.TextureLoader().load(xtTopUrl, (t) => { t.colorSpace = THREE.SRGBColorSpace; }); const tex10k = topTex10k();
    for (const o of this.robotsSrc()) {
      const md = MODELS[o.model]; const g = new THREE.Group(); const body = new THREE.Group(); body.scale.setScalar(K); g.add(body);
      const { L, Wd, H } = md; const shell = o.model === 'xt' ? yellowXT : yellow;
      body.add(extrude(chamfer(L, Wd, 0.22), 0.32, 0.12, black)); body.add(extrude(chamfer(L - 0.06, Wd - 0.06, 0.2), H - 0.5, 0.44, shell)); body.add(extrude(chamfer(L - 0.5, Wd - 0.4, 0.25), 0.14, H - 0.06, shell));
      const topGeo = o.model === 'xt' ? new THREE.PlaneGeometry(Wd - 0.4, L - 0.5).rotateX(-PI / 2).rotateY(-PI / 2) : new THREE.PlaneGeometry(L - 0.5, Wd - 0.4).rotateX(-PI / 2);
      const top = new THREE.Mesh(topGeo, new THREE.MeshStandardMaterial({ map: o.model === 'xt' ? xtTop : tex10k, roughness: 0.5, transparent: true })); top.position.y = H + 0.085; body.add(top);
      const band = new THREE.Mesh(new THREE.BoxGeometry(L * 0.7, 0.08, Wd + 0.01), black); band.position.set(-0.05, H - 0.42, 0); body.add(band);
      const wg = new THREE.CylinderGeometry(0.24, 0.24, 0.16, 18).rotateX(PI / 2);
      [[L * 0.28, Wd / 2], [L * 0.28, -Wd / 2], [-L * 0.3, Wd / 2 - 0.05], [-L * 0.3, -Wd / 2 + 0.05]].forEach(([x, z]) => { const w = new THREE.Mesh(wg, black); w.position.set(x, 0.24, z); body.add(w); });
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 0.55, 6), dark); mast.position.set(L * 0.12, H + 0.38, 0); body.add(mast);
      const lidar = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.16, 16), new THREE.MeshStandardMaterial({ color: '#c9cfd1', metalness: 0.6, roughness: 0.3 })); lidar.position.set(L * 0.12, H + 0.72, 0); body.add(lidar);
      const beacon = new THREE.MeshStandardMaterial({ color: '#ff6a1a', emissive: '#ff5a00', emissiveIntensity: 1.2, roughness: 0.3 });
      const bm = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.18, 16), beacon); bm.position.set(L * 0.12, H + 0.89, 0); body.add(bm);
      const fl = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, Wd * 0.5), new THREE.MeshStandardMaterial({ color: '#bff', emissive: '#9ff', emissiveIntensity: 1.5 })); fl.position.set(L / 2 + 0.01, H - 0.25, 0); body.add(fl);
      const ring = new THREE.Mesh(new THREE.RingGeometry(L * K * 0.62, L * K * 0.7, 40).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ color: '#66cbc4', transparent: true, opacity: 0.85, depthWrite: false })); ring.position.y = 0.12; g.add(ring);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(L * K * 0.62, 40).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ color: '#66cbc4', transparent: true, opacity: 0.12, depthWrite: false })); glow.position.y = 0.11; g.add(glow);
      const sel = new THREE.Mesh(new THREE.RingGeometry(L * K * 0.85, L * K * 0.95, 48).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false })); sel.position.y = 0.13; sel.visible = false; g.add(sel);
      g.traverse((m) => { m.userData.robot = o.id; }); this.groups.robots.add(g);
      let cart: THREE.Group | null = null;
      if (o.cart) {
        cart = new THREE.Group(); const cb = new THREE.Group(); cb.scale.setScalar(K); cart.add(cb);
        const deck = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 1.5), new THREE.MeshStandardMaterial({ color: '#7d8a8f', metalness: 0.5, roughness: 0.4 })); deck.position.y = 0.42; deck.castShadow = true; cb.add(deck);
        const cg = new THREE.CylinderGeometry(0.12, 0.12, 0.1, 10).rotateX(PI / 2); [[0.85, 0.6], [0.85, -0.6], [-0.85, 0.6], [-0.85, -0.6]].forEach(([x, z]) => { const w = new THREE.Mesh(cg, black); w.position.set(x, 0.14, z); cb.add(w); });
        const post = new THREE.BoxGeometry(0.06, 0.9, 0.06); [[1.05, 0.7], [1.05, -0.7], [-1.05, 0.7], [-1.05, -0.7]].forEach(([x, z]) => { const p = new THREE.Mesh(post, dark); p.position.set(x, 0.9, z); cb.add(p); });
        const tow = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.08), dark); tow.position.set(1.5, 0.4, 0); cb.add(tow);
        const load = new THREE.Group(); const colors = ['#2e90fa', '#4fb3d9', '#2e90fa', '#66cbc4'];
        [[-0.5, 0.35], [0.5, 0.35], [-0.5, -0.35], [0.5, -0.35]].forEach(([x, z], i) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.55, 0.6), new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.7 })); b.position.set(x, 0.76, z); b.castShadow = true; load.add(b); });
        cb.add(load); cart.userData.load = load; cart.traverse((m) => { m.userData.robot = o.id; }); this.groups.robots.add(cart);
      }
      const pts = o.pts.map((p) => W(p.x, p.y, 0.18)); pts.push(pts[0].clone());
      const mat = new THREE.LineDashedMaterial({ color: o.model === 'xt' ? '#7ad7f0' : '#ffd166', dashSize: 2, gapSize: 1.6, transparent: true, opacity: 0.45 });
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat); line.computeLineDistances(); this.groups.routes.add(line);
      const label = document.createElement('div'); label.className = 'lv-lbl-robot'; label.innerHTML = '<i></i><span></span><em></em>'; label.querySelector('span')!.textContent = o.id;
      label.onclick = () => this.cb.onPick(o.id); this.labels.append(label);
      this.robots.push({ o, g, cart, ring, glow, sel, beacon, off: { x: 0, y: 0 }, wx: o.x, wy: o.y, heading: o.heading, label, dot: label.querySelector('i')!, act: label.querySelector('em')!, route: { line, mat } });
    }
  }

  /* ---------- public API ---------- */
  setZones(zones: Zone[], vis: Record<ZoneType, boolean>) {
    this.groups.zones.clear(); this.zoneLabels.forEach((l) => l.el.remove()); this.zoneLabels = [];
    for (const z of zones) {
      const g = buildZone(z); g.visible = vis[z.type] !== false; this.groups.zones.add(g);
      const el = this.label('lv-lbl-zone', z.name); el.style.background = ZONE_TYPES[z.type].color + 'cc'; if (z.type === 'traffic' || z.type === 'slow' || z.type === 'kitting') el.style.color = '#111';
      if (vis[z.type] !== false) this.zoneLabels.push({ el, pos: g.userData.top, maxDist: z.type === 'traffic' ? 170 : 260, type: z.type }); else el.style.display = 'none';
    }
  }
  setLayers(on: Record<LayerKey, boolean>, cadOpacity: number) {
    (Object.keys(this.groups) as (keyof LiveMap['groups'])[]).forEach((k) => { if (k in on) this.groups[k].visible = on[k as LayerKey]; });
    this.cadMat.opacity = cadOpacity * (on.pcA || on.pcB ? 0.55 : 1);
    this.labelsOn = on.labels; this.labels.style.display = on.labels ? '' : 'none';
    if ((on.pcA || on.pcB) && this.pc === 'none') void this.loadPointClouds();
  }
  setFleetFilter(id: string) {
    this.fleet = id;
    for (const r of this.robots) { const show = id === 'all' || r.o.fleet === id; r.g.visible = show; if (r.cart) r.cart.visible = show; r.route.line.visible = show; }
  }
  setSelected(id: string | null, focus = true) {
    this.selected = id; this.follow = false; const r = this.robots.find((x) => x.o.id === id);
    if (r && focus) this.setCam(this.polarFor(Math.min(this.controls.getPolarAngle(), 1.0) || 0.9), this.controls.getAzimuthalAngle(), Math.min(this.dist(), 120), W(r.wx, r.wy, 0), 700);
  }
  setFollow(on: boolean) {
    this.follow = on; const r = this.robots.find((x) => x.o.id === this.selected);
    if (on && r) this.setCam(this.polarFor(0.9), this.controls.getAzimuthalAngle(), Math.min(this.dist(), 90), W(r.wx, r.wy, 0), 600);
  }
  setMode(mode: ViewMode, animate = true) {
    const c = this.controls; this.mode = mode; c.minPolarAngle = 0; c.maxPolarAngle = 1.32; const d = this.dist();
    if (mode === '2d') {
      c.enableRotate = false; c.screenSpacePanning = true; c.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }; c.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
      this.setCam(0.0001, 0, d, null, animate ? 700 : 1);
    } else if (mode === '25d') {         // fixed tilt: drag pans the floor, right-drag or two fingers turn the map
      c.enableRotate = true; c.screenSpacePanning = false; c.minPolarAngle = c.maxPolarAngle = TILT25;
      c.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }; c.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
      this.setCam(TILT25, 0, d, null, animate ? 700 : 1);
    } else {
      c.enableRotate = true; c.screenSpacePanning = false; c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }; c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
      this.setCam(0.78, -0.3, d * 0.95, null, animate ? 800 : 1);
    }
  }
  /** First frame: fit the floor in the chosen mode without animation. */
  home(mode: ViewMode) {
    this.computeFit(); this.setMode(mode, false);
    if (mode === '3d') this.setCam(0.78, -0.3, this.fitDist, new THREE.Vector3(-30, 0, -8), 1); else this.setCam(this.polarFor(0.78), 0, this.fitDist * (mode === '25d' ? 0.95 : 1), new THREE.Vector3(0, 0, 0), 1);
  }
  zoomBy(f: number) { this.setCam(this.controls.getPolarAngle(), this.controls.getAzimuthalAngle(), THREE.MathUtils.clamp(this.dist() * f, this.controls.minDistance, this.controls.maxDistance), null, 350); }
  fit() { this.follow = false; this.computeFit(); this.setCam(this.polarFor(0.78), this.mode === '3d' ? -0.3 : 0, this.fitDist * (this.mode === '25d' ? 0.95 : 1), new THREE.Vector3(0, 0, 0), 700); }
  north() { this.setCam(this.controls.getPolarAngle(), 0, this.dist(), null, 500); }
  focusPoint(x: number, y: number, dist: number) { this.setCam(this.controls.getPolarAngle(), this.controls.getAzimuthalAngle(), dist, W(x, y), 700); }
  /** Arm or disarm zone drawing (drag a rectangle on the floor). */
  setDrawing(type: ZoneType | null) {
    if (this.drawMesh) this.scene.remove(this.drawMesh);
    this.drawType = type; this.drawStart = null; this.drawMesh = null; this.drawRect = null; this.controls.enabled = !type;
  }
  dispose() {
    cancelAnimationFrame(this.raf); this.ro.disconnect(); this.controls.dispose();
    this.scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []; mats.forEach((x) => { (x as THREE.MeshBasicMaterial).map?.dispose(); x.dispose(); }); });
    this.renderer.dispose(); this.renderer.domElement.remove(); this.labels.replaceChildren();
  }

  /* ---------- camera ---------- */
  private dist() { return this.camera.position.distanceTo(this.controls.target); }
  private polarFor(fallback: number) { return this.mode === '2d' ? 0.0001 : this.mode === '25d' ? TILT25 : fallback; }
  private computeFit() { const aspect = this.host.clientWidth / Math.max(1, this.host.clientHeight); const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2); this.fitDist = Math.max(330 / 2 / t, 480 / aspect / 2 / t) * 1.02; }
  private setCam(polar: number, azim: number, dist: number, target: THREE.Vector3 | null, dur = 700) {
    const c = this.controls; const from = { p: c.getPolarAngle(), a: c.getAzimuthalAngle(), d: this.dist(), t: c.target.clone() }; const to = { p: polar, a: azim, d: dist, t: target ?? c.target.clone() };
    let da = to.a - from.a; while (da > PI) da -= 2 * PI; while (da < -PI) da += 2 * PI;
    const t0 = performance.now();
    this.tween = (now) => {
      let k = Math.min(1, (now - t0) / dur); k = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const p = from.p + (to.p - from.p) * k, a = from.a + da * k, d = from.d + (to.d - from.d) * k; const t = from.t.clone().lerp(to.t, k);
      c.target.copy(t); this.camera.position.set(t.x + d * Math.sin(p) * Math.sin(a), t.y + d * Math.cos(p), t.z + d * Math.sin(p) * Math.cos(a)); this.camera.lookAt(t);
      if (k >= 1) this.tween = null;
    };
  }
  private resize() { const w = this.host.clientWidth, h = this.host.clientHeight; if (!w || !h) return; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.computeFit(); }

  /* ---------- pointer: pick + draw ---------- */
  private ndc(e: PointerEvent) { const rc = this.renderer.domElement.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1); }
  private groundPoint(e: PointerEvent) { this.ray.setFromCamera(this.ndc(e), this.camera); const p = new THREE.Vector3(); return this.ray.ray.intersectPlane(this.ground, p) ? { x: p.x + CX, y: p.z + CY } : null; }
  private onDown = (e: PointerEvent) => {
    if (this.drawType) { const p = this.groundPoint(e); if (!p) return; this.drawStart = p; this.renderer.domElement.setPointerCapture(e.pointerId); return; }
    this.downAt = { x: e.clientX, y: e.clientY };
  };
  private onMove = (e: PointerEvent) => {
    if (!this.drawType || !this.drawStart) return; const p = this.groundPoint(e); if (!p) return; const a = this.drawStart;
    const r: Zone['r'] = [Math.min(a.x, p.x), Math.min(a.y, p.y), Math.max(a.x, p.x), Math.max(a.y, p.y)];
    if (this.drawMesh) this.scene.remove(this.drawMesh); this.drawMesh = buildZone({ type: this.drawType, r }); this.scene.add(this.drawMesh); this.drawRect = r;
  };
  private onUp = (e: PointerEvent) => {
    if (this.drawType && this.drawStart) {
      const r = this.drawRect;
      if (r && r[2] - r[0] > 1.5 && r[3] - r[1] > 1.5) this.cb.onDrawn(r);
      else { this.drawStart = null; if (this.drawMesh) this.scene.remove(this.drawMesh); this.drawMesh = null; }
      return;
    }
    if (e.button === 0 && this.downAt && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) < (e.pointerType === 'touch' ? 10 : 5)) this.pick(e);
    this.downAt = null;
  };
  private pick(e: PointerEvent) {
    this.ray.setFromCamera(this.ndc(e), this.camera);
    const hit = this.ray.intersectObjects(this.groups.robots.children, true).find((h) => h.object.userData.robot && h.object.visible);
    if (hit) { this.cb.onPick(hit.object.userData.robot); return; }
    const rc = this.renderer.domElement.getBoundingClientRect(); let best: RobotView | null = null, bd = 28;   // fallback: nearest Sherpa on screen
    for (const r of this.robots) {
      if (!r.g.visible) continue; const p = W(r.wx, r.wy, 1).project(this.camera);
      const d = Math.hypot((p.x + 1) / 2 * rc.width - (e.clientX - rc.left), (1 - p.y) / 2 * rc.height - (e.clientY - rc.top)); if (d < bd) { bd = d; best = r; }
    }
    if (best) this.cb.onPick(best.o.id);
  }

  /* ---------- point clouds (lazy, 2.7 MB) ---------- */
  private async loadPointClouds() {
    this.pc = 'loading'; this.cb.onNotice('Loading point cloud maps…');
    try {
      const data = (await fetch('/supervisor/pointclouds.json').then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })) as { bounds: number[]; a: string; b: string };
      const [bx0, by0, bx1, by1] = data.bounds;
      const dec = (b64: string) => {          // 5 bytes per point: x,y as uint16, z as uint8
        const bin = atob(b64); const n = bin.length / 5; const pos = new Float32Array(n * 3); const z = new Float32Array(n);
        for (let i = 0; i < n; i++) { const o = i * 5; const qx = bin.charCodeAt(o) | (bin.charCodeAt(o + 1) << 8), qy = bin.charCodeAt(o + 2) | (bin.charCodeAt(o + 3) << 8), qz = bin.charCodeAt(o + 4);
          pos[i * 3] = bx0 + (qx / 65535) * (bx1 - bx0) - CX; pos[i * 3 + 2] = by0 + (qy / 65535) * (by1 - by0) - CY; z[i] = (qz / 255) * 8; pos[i * 3 + 1] = z[i]; }
        return { pos, z, n };
      };
      const cloud = (pos: Float32Array, col: Float32Array, size: number, opacity: number, depthWrite: boolean) => {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        return new THREE.Points(g, new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, opacity, depthWrite }));
      };
      const A = dec(data.a); { const col = new Float32Array(A.n * 3); const c1 = new THREE.Color('#66cbc4'), c2 = new THREE.Color('#e9fffd');
        for (let i = 0; i < A.n; i++) { const t = Math.random(); const c = c1.clone().lerp(c2, t * t); col.set([c.r, c.g, c.b], i * 3); A.pos[i * 3 + 1] = 0.15; }
        this.groups.pcA.add(cloud(A.pos, col, 0.55, 0.9, false)); }
      const B = dec(data.b); { const col = new Float32Array(B.n * 3); const stops = ['#3b2a8c', '#2e6fd8', '#17b2c4', '#5fd38c', '#e6d84a', '#f59a2c', '#e4502d'].map((c) => new THREE.Color(c));
        for (let i = 0; i < B.n; i++) { const t = Math.min(0.999, B.z[i] / 7.5) * (stops.length - 1); const k = Math.floor(t); const c = stops[k].clone().lerp(stops[k + 1], t - k); col.set([c.r, c.g, c.b], i * 3); }
        this.groups.pcB.add(cloud(B.pos, col, 0.5, 0.95, true)); }
      this.pc = 'done'; this.cb.onNotice('Point cloud maps ready');
    } catch { this.pc = 'none'; this.cb.onNotice('Point cloud maps could not load'); }
  }

  /* ---------- frame ---------- */
  private loop = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now; const t = now / 1000;
    for (const r of this.robots) this.place(r, dt, t);
    const sel = this.robots.find((r) => r.o.id === this.selected);
    if (this.follow && sel) { const d = W(sel.wx, sel.wy, 0).sub(this.controls.target).multiplyScalar(0.12); this.controls.target.add(d); this.camera.position.add(d); }
    if (this.tween) this.tween(now); else this.controls.update();
    for (const r of this.robots) { r.route.mat.opacity = sel ? (r === sel ? 0.95 : 0.12) : 0.45; r.route.mat.color.set(sel === r ? '#66cbc4' : r.o.model === 'xt' ? '#7ad7f0' : '#ffd166'); }
    this.renderer.render(this.scene, this.camera); this.updateLabels();
    this.raf = requestAnimationFrame(this.loop);
  };
  /** Smooth heading, keep-right offset, status ring, beacon, selection halo and tow cart. */
  private place(r: RobotView, dt: number, t: number) {
    const o = r.o; const p = posAt(o, o.s); const target = Math.atan2(p.dy, p.dx);
    let dh = target - r.heading; while (dh > PI) dh -= 2 * PI; while (dh < -PI) dh += 2 * PI; r.heading += dh * Math.min(1, dt * 6);
    const k = Math.min(1, dt * 3); r.off.x += (-Math.sin(target) * 1.6 - r.off.x) * k; r.off.y += (Math.cos(target) * 1.6 - r.off.y) * k;
    r.wx = p.x + r.off.x; r.wy = p.y + r.off.y; r.g.position.copy(W(r.wx, r.wy, 0)); r.g.rotation.y = -r.heading;
    const st = statusOf(o); const col = STATUS[st].color; (r.ring.material as THREE.MeshBasicMaterial).color.set(col); const gm = r.glow.material as THREE.MeshBasicMaterial; gm.color.set(col);
    gm.opacity = o.state === 'error' ? 0.18 + 0.18 * Math.sin(t * 6) : 0.12;
    r.beacon.emissiveIntensity = o.state === 'moving' ? (Math.sin(t * 10) > 0 ? 2 : 0.2) : o.state === 'error' ? (Math.sin(t * 14) > 0 ? 2.5 : 0.1) : 0.6; r.beacon.emissive.set(o.state === 'error' ? '#ff2020' : '#ff5a00');
    r.sel.visible = this.selected === o.id; if (r.sel.visible) r.sel.scale.setScalar(1 + 0.04 * Math.sin(t * 4));
    if (r.cart) {
      const c = posAt(o, o.s - (MODELS[o.model].L * K * 0.5 + 2.6)); const ch = Math.atan2(c.dy, c.dx); const cx = c.x - Math.sin(ch) * 1.6, cy = c.y + Math.cos(ch) * 1.6;
      r.cart.position.copy(W(cx, cy, 0)); r.cart.rotation.y = -Math.atan2(r.wy - cy, r.wx - cx); (r.cart.userData.load as THREE.Group).visible = o.loaded;
    }
  }
  private project(pos: THREE.Vector3, el: HTMLElement, offY = 0) {
    const v = this.v3.copy(pos).project(this.camera); const w = this.host.clientWidth, h = this.host.clientHeight;
    const x = ((v.x + 1) / 2) * w, y = ((1 - v.y) / 2) * h;
    if (v.z > 1 || x < -200 || y < -60 || x > w + 200 || y > h + 60) { el.style.display = 'none'; return; }
    el.style.display = ''; el.style.transform = `translate(${x}px,${y + offY}px) translate(-50%,-100%)`;
  }
  private updateLabels() {
    const dist = this.dist();
    if (this.labelsOn) {
      for (const r of this.robots) {
        const o = r.o; if (!(this.fleet === 'all' || o.fleet === this.fleet)) { r.label.style.display = 'none'; continue; }
        const st = statusOf(o); r.dot.style.background = STATUS[st].color; const sel = this.selected === o.id; r.label.classList.toggle('sel', sel);
        const showAct = sel || dist < 140; r.act.textContent = showAct ? (o.pausedByUser ? 'Paused' : o.action) : ''; r.act.style.display = showAct ? '' : 'none';
        this.project(W(r.wx, r.wy, MODELS[o.model].H * K + 2.2), r.label, -4);
      }
      for (const l of this.zoneLabels) { if (!this.groups.zones.visible || dist > l.maxDist) l.el.style.display = 'none'; else this.project(l.pos, l.el); }
      for (const l of this.stationLabels) { if (!this.groups.stations.visible || dist > l.maxDist) l.el.style.display = 'none'; else this.project(l.pos, l.el); }
    }
    const view = { zoomPct: Math.round((this.fitDist / dist) * 100), azimuth: this.controls.getAzimuthalAngle() };
    const key = view.zoomPct + ':' + view.azimuth.toFixed(2); if (key !== this.lastView) { this.lastView = key; this.cb.onView(view); }
  }
}

export const metres = (u: number) => Math.round(u * M_PER_U);
