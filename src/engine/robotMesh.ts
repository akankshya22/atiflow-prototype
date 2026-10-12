import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { FOOTPRINTS, TROLLEY } from '../core/footprint';

export interface RobotModelDef { label: string; footprint: [number, number]; build(): { group: THREE.Group; light: THREE.Mesh } }

// Ati Robotics Sherpa look (from the supplied side illustration + KeyShot render):
// yellow hip-roofed body, black bumper skirt, dark roof plate, lidar mast with orange beacon,
// exposed grey front wheels, D-shaped side door, vent slits, red e-stop, black front panel with green lights.
const M = {
  yellow: new THREE.MeshStandardMaterial({ color: 0xfcd900, roughness: 0.42, metalness: 0.05 }),
  black: new THREE.MeshStandardMaterial({ color: 0x101214, roughness: 0.55 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x1a2024, roughness: 0.2, metalness: 0.4 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x6f6f6f, roughness: 0.8 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }),
  orange: new THREE.MeshStandardMaterial({ color: 0xf58a1f, roughness: 0.35, emissive: 0xf58a1f, emissiveIntensity: 0.55 }),
  red: new THREE.MeshStandardMaterial({ color: 0xee3a24, roughness: 0.4, emissive: 0xee3a24, emissiveIntensity: 0.4 }),
  green: new THREE.MeshBasicMaterial({ color: 0x4ade80 }),
};
const GEO = { box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 24) };

let decalTex: THREE.CanvasTexture | null = null;
function decal() {
  if (decalTex) return decalTex;
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d')!;
  x.fillStyle = '#111'; x.font = '700 64px Inter, Arial, sans-serif'; x.textBaseline = 'middle'; x.fillText('Ati', 8, 64);
  x.font = '700 30px Inter, Arial, sans-serif'; x.fillText('SHERPA', 130, 38); x.fillText('XT LITE', 130, 88);
  decalTex = new THREE.CanvasTexture(c); decalTex.colorSpace = THREE.SRGBColorSpace; return decalTex;
}

function part(g: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], scale: [number, number, number], cast = false) {
  const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.scale.set(...scale); m.castShadow = cast; g.add(m); return m;
}

/** Local frame: +X forward, +Y up, Z across. Ground at y = 0. */
function sherpa(L: number, W: number, opts: { tug?: boolean } = {}) {
  const g = new THREE.Group();
  const SK = 0.12, SK0 = 0.04;                      // skirt height / ground clearance
  const BH = 0.4, BY = SK0 + SK;                    // lower body height / bottom
  const roofH = 0.15, roofY = BY + BH;

  part(g, GEO.box, M.black, [0, SK0 + SK / 2, 0], [L, SK, W], true);                    // bumper skirt
  const led = part(g, GEO.box, new THREE.MeshBasicMaterial({ color: 0x14b8a6, transparent: true }), [0, SK0 + SK + 0.008, 0], [L * 1.01, 0.016, W * 1.01]); // state LED band
  const body = new THREE.Mesh(new RoundedBoxGeometry(L * 0.985, BH, W * 0.985, 3, 0.035), M.yellow); body.position.y = BY + BH / 2; body.castShadow = true; g.add(body);

  const roofGeo = new THREE.CylinderGeometry(Math.SQRT2 * 0.5, Math.SQRT2, roofH, 4, 1); roofGeo.rotateY(Math.PI / 4);   // square frustum, half-extent 1 at base
  const roof = new THREE.Mesh(roofGeo, M.yellow); roof.scale.set(L / 2 * 0.985, 1, W / 2 * 0.985); roof.position.y = roofY + roofH / 2; roof.castShadow = true; g.add(roof);
  part(g, GEO.box, M.glass, [0, roofY + roofH + 0.014, 0], [L * 0.5, 0.028, W * 0.5], true);              // dark roof plate

  // lidar mast + beacon
  const my = roofY + roofH + 0.028;
  part(g, GEO.box, M.white, [0.068, my + 0.075, 0], [0.012, 0.15, 0.012]); part(g, GEO.box, M.white, [-0.068, my + 0.075, 0], [0.012, 0.15, 0.012]);
  part(g, GEO.box, M.black, [0, my + 0.07, 0], [0.075, 0.06, 0.075]);
  part(g, GEO.box, M.black, [0, my + 0.155, 0], [0.19, 0.01, 0.19]);
  part(g, GEO.cyl, M.black, [0, my + 0.185, 0], [0.032, 0.05, 0.032]);
  part(g, GEO.cyl, M.orange, [0, my + 0.225, 0], [0.032, 0.04, 0.032]);

  // front panel (black, green lights, Ati mark)
  part(g, GEO.box, M.black, [L / 2 * 0.985 + 0.002, BY + BH * 0.5, 0], [0.01, BH * 0.78, W * 0.8]);
  part(g, GEO.box, M.green, [L / 2 * 0.985 + 0.009, BY + BH * 0.8, W * 0.27], [0.004, 0.025, 0.16]); part(g, GEO.box, M.green, [L / 2 * 0.985 + 0.009, BY + BH * 0.8, -W * 0.27], [0.004, 0.025, 0.16]);
  part(g, GEO.box, M.white, [L / 2 * 0.985 + 0.009, BY + BH * 0.42, 0], [0.004, 0.035, 0.08]);

  for (const s of [1, -1]) {
    const zs = s * (W / 2 * 0.985 + 0.002);
    part(g, GEO.box, M.black, [L * 0.16, BY + 0.2, zs], [L * 0.24, 0.31, 0.008]);                         // door frame
    part(g, GEO.box, M.yellow, [L * 0.16, BY + 0.2, zs + s * 0.002], [L * 0.215, 0.285, 0.008]);          // door
    part(g, GEO.box, M.black, [L * 0.17, BY + 0.2, zs + s * 0.006], [0.03, 0.1, 0.006]);                  // handle
    for (const f of [0.45, 0.34, -0.36, -0.46]) part(g, GEO.box, M.black, [L * f, BY + 0.27, zs], [0.026, 0.075, 0.008]); // vent slits
    const e = part(g, GEO.cyl, M.red, [0, roofY + roofH * 0.55, s * W * 0.34], [0.022, 0.016, 0.022]); e.rotation.x = Math.PI / 2 - s * 0.45; // e-stop on roof slope
    const dc = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.085), new THREE.MeshBasicMaterial({ map: decal(), transparent: true }));
    dc.position.set(-L * 0.17, BY + 0.14, zs + s * 0.006); if (s < 0) dc.rotation.y = Math.PI; g.add(dc);
    for (const x of [L * 0.34, -L * 0.27]) {                                                              // wheels (front pair exposed)
      const t = part(g, GEO.cyl, M.tire, [x, 0.115, s * (W / 2 - 0.035)], [0.115, 0.07, 0.115], true); t.rotation.x = Math.PI / 2;
      const h = part(g, GEO.cyl, M.black, [x, 0.115, s * (W / 2 - 0.0)], [0.04, 0.075, 0.04]); h.rotation.x = Math.PI / 2;
    }
  }
  if (opts.tug) part(g, GEO.box, M.black, [-L / 2 - 0.05, 0.14, 0], [0.12, 0.05, 0.22]);                 // tow hitch plate
  return { group: g, light: led };
}

export const ROBOT_MODELS: Record<string, RobotModelDef> = {
  'sherpa-xt-lite': { label: 'Sherpa XT Lite', footprint: FOOTPRINTS['sherpa-xt-lite'], build: () => sherpa(...FOOTPRINTS['sherpa-xt-lite']) },
  'sherpa-tug': { label: 'Sherpa Tug', footprint: FOOTPRINTS['sherpa-tug'], build: () => sherpa(...FOOTPRINTS['sherpa-tug'], { tug: true }) },
};

// ---------------------------------------------------------------- towed material trolley
const TM = {
  steel: new THREE.MeshStandardMaterial({ color: 0x8a949c, roughness: 0.45, metalness: 0.6 }),
  deck: new THREE.MeshStandardMaterial({ color: 0x3b4650, roughness: 0.7, metalness: 0.2 }),
  carton: new THREE.MeshStandardMaterial({ color: 0xc89b62, roughness: 0.85 }),
  tape: new THREE.MeshStandardMaterial({ color: 0xe8d3a8, roughness: 0.8 }),
  tray: new THREE.MeshStandardMaterial({ color: 0x1f6f5c, roughness: 0.6 }),
  board: new THREE.MeshStandardMaterial({ color: 0x2f8f3a, roughness: 0.5 }),
  reel: new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.5 }),
  reelHub: new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 0.4 }),
};

/** Material trolley (local frame like the robots: +X forward towards the robot, ground at y = 0), with a tow bar reaching to the robot's hitch.
 *  Returns the group and a `setCargo` that fills the deck to match the payload. */
export function buildTrolley(): { group: THREE.Group; setCargo(kind: string, qty: number): void } {
  const g = new THREE.Group(); const { L, W, bar } = TROLLEY; const deckY = 0.3;
  part(g, GEO.box, TM.deck, [0, deckY, 0], [L, 0.05, W], true);                                              // deck
  for (const z of [W / 2 - 0.02, -W / 2 + 0.02]) part(g, GEO.box, TM.steel, [0, deckY - 0.04, z], [L, 0.04, 0.04]);   // side rails
  for (const x of [L / 2 - 0.12, -L / 2 + 0.12]) for (const z of [W / 2 - 0.1, -W / 2 + 0.1]) {
    part(g, GEO.box, TM.steel, [x, deckY / 2, z], [0.03, deckY - 0.08, 0.03]);                              // caster fork
    const w = part(g, GEO.cyl, M.black, [x, 0.06, z], [0.06, 0.04, 0.06], true); w.rotation.x = Math.PI / 2;  // caster wheel
  }
  for (const x of [-L / 2 + 0.02]) for (const z of [W / 2 - 0.02, -W / 2 + 0.02]) part(g, GEO.box, TM.steel, [x, deckY + 0.45, z], [0.03, 0.9, 0.03]);   // rear posts
  part(g, GEO.box, TM.steel, [-L / 2 + 0.02, deckY + 0.88, 0], [0.03, 0.03, W - 0.04]);                     // push handle
  part(g, GEO.box, TM.steel, [L / 2 + bar / 2, 0.2, 0], [bar + 0.1, 0.03, 0.05]);                            // tow bar
  part(g, GEO.box, M.black, [L / 2 + bar, 0.2, 0], [0.08, 0.06, 0.1]);                                       // coupling
  const cargo = new THREE.Group(); cargo.position.y = deckY + 0.025; g.add(cargo); let key = '';
  return { group: g, setCargo(kind, qty) {
    const k = `${kind}|${qty}`; if (k === key) return; key = k; cargo.clear(); const n = Math.max(1, Math.min(6, qty));
    if (/reel/i.test(kind)) {                                                                    // SMT reels standing in rows
      for (let i = 0; i < n * 2; i++) { const x = -L / 2 + 0.15 + (i % 6) * 0.16, z = i < 6 ? 0.19 : -0.19;   // discs face forward, like books on a shelf
        const r = part(cargo, GEO.cyl, TM.reel, [x, 0.18, z], [0.17, 0.035, 0.17], true); r.rotation.z = Math.PI / 2;
        const h = part(cargo, GEO.cyl, TM.reelHub, [x, 0.18, z], [0.05, 0.04, 0.05]); h.rotation.z = Math.PI / 2; }
    } else if (/pcba|tray/i.test(kind)) {                                                         // stacked ESD trays with boards
      for (let i = 0; i < n; i++) { const y = i * 0.07; part(cargo, GEO.box, TM.tray, [0, y + 0.03, 0], [L * 0.86, 0.06, W * 0.86], true);
        for (const z of [0.16, -0.16]) part(cargo, GEO.box, TM.board, [0, y + 0.065, z], [L * 0.7, 0.01, 0.22]); }
    } else {                                                                                       // cartons
      for (let i = 0; i < n; i++) { const col = i % 3, lay = Math.floor(i / 3), x = -L / 2 + 0.2 + col * 0.35, h = 0.26;
        part(cargo, GEO.box, TM.carton, [x, lay * h + h / 2, 0], [0.32, h, W * 0.8], true); part(cargo, GEO.box, TM.tape, [x, lay * h + h + 0.002, 0], [0.06, 0.004, W * 0.8]); }
    }
  } };
}
export const DEFAULT_MODEL = 'sherpa-xt-lite';
