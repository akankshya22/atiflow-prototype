# Ati Flow Prototype — Architecture & Working Guide

Read this first. It is the source of truth for how the system is designed. Update it when a decision changes.

**Status (updated): the app is now multi-page and role based (sections 20-22): login -> Live Floor (supervisor) or the configurator (Workflow Builder, Master Data, Robots, Hardware). Project/folder name: Ati Flow Prototype. Older sections that mention `src/ui/App.tsx`, `src/ui/Sidebar.tsx` or `src/ui/Topbar.tsx` describe code that moved (see section 20 for the new locations).** Build steps 1-6 of section 8 plus the map-rules system (section 12) are implemented and verified in the browser (see section 11 for exact state, gaps and how to run). Step 7 (WebSocket adapter + onboarding docs) is not done. Items marked **[OPEN]** still await confirmation.

## 1. What we are building

A real-time **3D robot fleet dashboard** for factory/warehouse floors. A client's CAD floor plan (DWG) becomes a Three.js scene you can orbit, pan, zoom and **walk through**. Ati Robotics AMRs run on it, driven by robot telemetry. It is **not** a workflow builder. We reuse only the *page layout and design language* of the Figma "Workflow Builder" screen.

Core promises:
1. **Any client DWG -> scene** through a repeatable import pipeline plus a per-site config, not hand-coded geometry.
2. **Robot data -> visuals** through one telemetry schema. Swapping mock for live data means writing one adapter.
3. **The renderer never knows about DWG, and the UI never knows about Three.js.** Three layers, each replaceable.

## 2. Sources and how to treat them

| Source | Use |
|---|---|
| `AMR ECC layout.dwg` (28 MB, AC1032 = DWG 2018) | Geometry reference for the first site (`ecc`). |
| Figma `fEwU407mfdug8j7LOrpzQA`, node `837:5241` (Workflow Builder, 1440x1024) | Layout + design tokens. Fetch with the Figma connector (`get_design_context`, `get_variable_defs`). Sidebar is node `837:5242`. |
| `ati_flow_3d_live_status_zoom_2d.html` | **Reference only, do not copy.** Useful ideas: orbit limits, pulsing selection halo, blocked-robot ring, waypoint-segment motion with pause/turn. Its geometry is hard-coded and it has a 2D fallback we do not want. |
| LinkedIn post (stasbel, Opus 5.5 3D warehouse mgmt) | Inspiration only (not fetchable without login). |

## 3. DWG facts (measured, first site)

- Whole-site plan: ~480k entities (LINE 294k, ARC 25k, LWPOLYLINE 20k, SPLINE 9k, INSERT 3.3k, TEXT/MTEXT 2.5k), 94 layers, no model/paper-space separation worth using, `$INSUNITS = 0` (unitless). Coordinates are **millimetres** (a bay is ~55,000 wide).
- It contains several buildings/drawings. The SMT production hall is the block at roughly **x 485,000-552,000, y 145,000-270,000 mm**, split into 3 bays (SMT lines at the south, assembly/workstations in the middle, ASRS + prep at the north).
- Useful layers: `WALL`, `A-WALL`, `50 MM EXTERNAL PILLAR`, `FAB WALL PANEL-*`, `EEC`, `EEC-1` (zone/area/equipment labels such as SMT OVER-L3..L12, PCBA WIP, THT WIP, VSTORE - ASRS, PREPARATION AREA, one `AMR` label), `AM_6`, `AM_8`, `A-EQUIP`, `0` (workstation blocks), `PATH`.
- Noise to drop by default: `LAYER01` (188k), `Sichtbar (ISO)` (116k), dimensions, hatches, MEP (`LAN`, `POWER`, `PNUEMATIC`, `PVC Conduits`, `NETWORK`), text notes.
- **The DWG has no AMR routes, stations or charging docks.** The nav graph must be authored or derived (see 6.3).
- Toolchain: `brew install libredwg` (already installed here), then `dwg2dxf` converts DWG->DXF, then Python `ezdxf` reads it. `dwgread -O json` works but produces ~730 MB, so avoid it. `dwg2dxf` warns about `DIMASSOC`/`ACDB_BLOCKREPRESENTATION_DATA`; these are harmless.
- Blocks (`INSERT`) hold much of the equipment detail (`workstation 1 meter`, `700 mm conveyor`, `VI 3D SPI`, hashed `A$C...` blocks). Some inserts reference missing block definitions (ezdxf raises `DXFStructureError`), so always wrap per-entity work in try/except and never call `bbox.extents` on the whole modelspace.

## 4. System architecture

```
 client .dwg
     |  tools/dwg-import  (Python, offline, one-time per site)
     v
 public/sites/<siteId>/
     site.json      <- Layout: bounds, walls, pillars, zones, equipment, labels, doors   (geometry, meters)
     nav.json       <- NavGraph: nodes, edges, stations, docks, one-way/width rules      (authored/derived)
     import.config.yaml  (kept in tools/dwg-import/sites/<siteId>/) layer->class mapping, crop box, origin, scale
     |
     v  runtime (browser)
 +-----------------------------------------------------------------------------+
 | core/      pure TS, no DOM, no Three      types, units/coords, nav pathing,  |
 |            fleet store (zustand-vanilla), telemetry schema + validators      |
 | adapters/  TelemetryAdapter interface     MockSimulator | WebSocket | REST   |
 | engine/    Three.js only                  SceneBuilder, RobotRenderer,       |
 |            CameraRig (orbit/top/walk/follow), Picking, Overlays, Minimap     |
 | ui/        React + CSS vars (Figma tokens) Sidebar, Topbar, panels, controls |
 +-----------------------------------------------------------------------------+
```

Dependency rule: `ui -> core`, `engine -> core`, `adapters -> core`. `ui` and `engine` talk only through the store and a small `EngineHandle` (focusRobot, setCameraMode, toggleLayer, screenshot). Nothing in `core` imports Three or React.

### 4.1 Stack (confirmed, updated for Untitled UI)
Vite + TypeScript + **React 19** shell; **vanilla Three.js** engine (imperative scene loop); `zustand` store; `vitest`. UI components come from **Untitled UI React** (https://www.untitledui.com/react), which needs **Tailwind CSS v4** + **React Aria Components** + `@untitledui/icons`. Tailwind was added on the user's explicit instruction (earlier guidance was "no Tailwind"); see section 14.

### 4.2 Planned folder layout
```
Ati Flow Prototype/
  CLAUDE.md                     this file
  tools/dwg-import/             python: convert.py, classify.py, build_site.py, sites/<id>/import.config.yaml
  public/sites/<siteId>/        site.json, nav.json, thumbnail.png
  public/models/                robots/<model>.glb (optional; procedural fallback exists)
  src/core/{types,coords,nav,store,telemetry}/
  src/adapters/{mock,websocket,rest}/
  src/engine/{scene,robots,camera,picking,overlays}/
  src/ui/{shell,panels,controls,tokens.css}/
  src/app.tsx, main.tsx
  tests/
```

## 5. Conventions that must not drift

**Units and coordinates**
- Site frame = **meters**, X east, Y north (plan view), origin at the site's SW corner after crop. Heading `theta` in radians, 0 = +X, CCW.
- Three.js frame: `three.x = x`, `three.z = -y`, `three.y = up`. Convert in exactly one place: `core/coords.ts` (`toScene`, `fromScene`). Do not hand-convert elsewhere.
- DWG mm -> meters happens only in the importer (`scale` in config, default 0.001).

**Layout schema (`site.json`)** (all geometry already in meters, plain polylines)
`{ schema:1, siteId, name, units:'m', bounds:{minX,minY,maxX,maxY}, floorPolygons[], walls[{pts,height,thickness,kind}], pillars[{x,y,w,d}], zones[{id,name,kind,polygon,color,active}], equipment[{id,kind,label,x,y,w,d,h,rot}], doors[{x,y,w,rot}], labels[{text,x,y}] }`.
Size budget: target < 3 MB gzip. Importer must simplify (Douglas-Peucker, merge collinear, dedupe) and reduce thousands of lines to wall *extrusions* and instanced boxes. The runtime draws with `InstancedMesh` and merged geometry, never one mesh per DWG entity.

**Nav schema (`nav.json`, schema 2: rules + lanes, see section 12)**
`{ schema:2, siteId, nodes[{id,x,y,kind}], lanes[{id,from,to,geom:[x,y][],fleets[],speed,len}], stations[{id:'STA-101',name,nodeId,type,zone,fleets[]}], fleets[{id,name,color,areas[]}], trafficZones[{id,name,capacity,fleets[],polygon}], forbiddenZones[{id,name,reason,polygon}] }`. A lane is ONE direction only; opposite directions are separate paired lanes (keep-right). Robots move only along lanes of their own fleet. Pathfinding is Dijkstra over directed lanes in `core/lanes.ts`.

**Robot telemetry (the one contract everything maps through)**
```ts
type RobotState = 'idle'|'moving'|'working'|'charging'|'blocked'|'error'|'offline'|'paused';
interface RobotTelemetry {
  id: string;            // e.g. "TRP-20487"
  model: string;         // key into the robot model registry, e.g. "sherpa-xt-lite"
  fleetId: string;
  siteId: string;
  pose: { x:number; y:number; theta:number };   // meters / radians, site frame
  speed: number;         // m/s
  state: RobotState;
  battery: number;       // 0-100
  payload?: { kind:string; qty?:number } | null;
  task?: { id:string; type:string; from?:string; to?:string; progress?:number } | null;
  path?: {x:number;y:number}[];                 // planned route, optional
  currentNode?: string; nextNode?: string;
  alerts?: { code:string; severity:'info'|'warn'|'critical'; msg:string }[];
  ts: number;            // epoch ms from source
}
```
Rules: adapters emit `RobotTelemetry` only (translate vendor payloads inside the adapter). The store keeps latest + short history. The renderer **interpolates** between ticks (dead reckoning on `speed` and `theta`) so 1 Hz data still looks smooth. Unknown `model` falls back to the default robot. Stale `ts` (> N s) shows as `offline`.

**State -> visual mapping** lives in one table (`engine/robots/stateStyle.ts`): moving = teal sensor pulse, working = amber beacon, charging = green pulse + dock link, blocked = red pulsing ring (as in reference), error = red + alert pin, offline = grey/translucent, idle = dim sensor. Selected = teal pulsing halo.

**Robot models.** All robots are Ati Robotics AMRs. Registry `engine/robots/registry.ts` maps `model` -> `{ glb?, procedural(), footprint, label }`. Start with a procedural Ati-style body (original design, not the reference's box robot) so the system works with zero assets, and accept `.glb` drop-ins per model. Confirmed: procedural Ati AMR first (Figma mentions **Sherpa XT Lite**), GLB drop-ins later. `src/engine/robotMesh.ts` now follows the user's reference (side illustration + KeyShot render): Ati yellow `#fcd900` hip-roofed body, black bumper skirt, dark roof plate, lidar mast with orange beacon, red e-stop, side door + vent slits, black front panel with green lights, grey wheels, 'Ati SHERPA XT LITE' decal; a teal LED band under the body shows robot state. All models (`sherpa-xt-lite`, `sherpa-tug`) share that look. Dev-only `window.__engine` exists for debugging. **[OPEN]**: full model list when more are needed.

## 6. Key subsystems

### 6.1 DWG importer (`tools/dwg-import`)
Pipeline: `dwg2dxf` -> ezdxf scan -> **classify** each entity by layer/block regex from `import.config.yaml` -> crop to `bbox` -> explode only whitelisted inserts -> simplify -> write `site.json`. Config per site declares: `crop`, `scale`, `origin`, `layers:{wall:[...], pillar:[...], zone:[...], equipment:[...], ignore:[...]}`, `blocks:{'workstation 1 meter':{kind:'workstation',h:0.9}, '700 mm conveyor':{kind:'conveyor',h:0.8}}`, default heights per kind, `labelPatterns` (e.g. `^SMT`, `ASRS`, `PCBA WIP` -> zones). A `--preview` flag writes a PNG so a human can check the crop. For a new client: run with `--discover` to dump layer/block/text stats, write the config, rerun. **No client-specific code in the engine.**

### 6.1b Scope: whole building, active areas only (confirmed)
The **entire building is rendered** for context (walls, pillars, big equipment, outer halls), but only **active areas** are interactive. An active area = a zone where robots actually move (first site: the SMT hall and its bays). Rules:
- `site.json` zones carry `active: boolean`. Active zones are derived from `nav.json` (any zone containing graph nodes/edges), and can be overridden in `import.config.yaml` (`activeZones`).
- Inactive areas: dimmed/desaturated, no hover, no click, excluded from raycast (`layers`/`raycast` filter), no labels beyond the building name.
- Active areas: hover highlight, click -> camera flies to the zone, zone becomes the "current area" in the UI (breadcrumb + robot list filtered to it). Click empty space or Esc returns to the whole-building view.
- Walk mode works everywhere (collision applies); only *selection* is limited to active areas and robots.
- Performance: whole building is mostly static, so merge static geometry per area, use `InstancedMesh`, freeze matrices, and keep detailed equipment only in/near active areas (LOD by distance).

### 6.2 Scene (`engine/scene`)
Floor + subtle grid, extruded walls, pillars, equipment as instanced boxes colored by `kind`, zone floor tints + floating labels, optional ceiling/roof hidden by default (so top and orbit views are clear). Lighting: hemisphere + one shadowed directional; soft shadows only near the camera for performance. Layer toggles: Robots, Routes, Stations, Zones, Labels, Equipment, Heatmap.

### 6.3 Navigation (superseded by section 12 for lanes, fleets, traffic and forbidden zones)
First site (confirmed): I derive candidate aisles from free corridors between equipment, author `nav.json` with stations at ASRS, workstations and SMT lines, and the user corrects it through the overlay. The runtime is agnostic to how `nav.json` was produced (hand-made, derived, or client-supplied). A debug overlay draws the graph so it can be edited visually; later an in-app edit mode can export `nav.json`.

### 6.4 Camera modes (`engine/camera`)
- **Orbit** (default): LMB-drag orbits, **MMB-drag pans in screen space (like DCC tools; browser middle-click auto-scroll is suppressed)**, RMB-drag also pans, wheel zooms to cursor, polar clamp so it never goes under the floor (if a pan would sink it, camera and target are lifted together so a pan stays a pure translation). Only the primary button selects robots/stations/zones; MMB/RMB are camera-only.
- **Top**: orthographic-like plan view with 2D feel, for map-style tracking.
- **Walk**: pointer-lock first person, WASD + mouse look, eye height 1.7 m, simple collision against wall/pillar/equipment AABBs (grid-based broadphase), Shift = run, Esc exits. Touch: virtual stick.
- **Follow**: chase camera locked to the selected robot.
Zoom control (+/-/percent), Home, Top/Orbit/Walk switch (the Figma Map Preview card was dropped by user decision).

### 6.5 Adapters
`interface TelemetryAdapter { connect(): void; disconnect(): void; onTelemetry(cb); onFleetMeta(cb) }`.
- `MockSimulator`: runs N robots over `nav.json` with tasks, pauses, charging, random blocks/faults, battery drain. Deterministic with a seed. This is the default until a live feed exists.
- `WebSocketAdapter` / `RestAdapter`: map vendor JSON -> `RobotTelemetry` via a small mapping function. Config in `public/config.json` (`adapter`, `url`, `siteId`).
- Replay mode (the Figma "Simulate" button's slot): record/replay telemetry JSONL.

## 7. UI design (from Figma node 837:5241)

Overall layout is kept: **dark rounded sidebar (280) | main column: topbar (64), title block, big rounded content card holding the canvas**, with floating controls on the canvas.

Mapping from the Workflow Builder to the Robots Dashboard:

| Figma element | Becomes |
|---|---|
| Sidebar: Ati Flow logo + `v4.0`, `CONFIGURATOR` header (now **SUPERVISOR**), groups Global Setup / Build / Fleets, footer Notifications(4)/Settings/User | Same shell. Header label **SUPERVISOR**. Nav: only **Live Floor** under Operations (Robots, Maps, Hardware, Users were removed on user request); Fleets list (All fleets + each fleet from `nav.fleets`) drives the fleet filter. Workflow-only items are dropped. |
| Topbar: back/forward, global search, Go to Support, Ati AI | Same. Search finds robots/stations/zones and flies the camera there. |
| Title "Workflow Builder / Set new workflows..." + Simulate + Publish Workflow | "Live Floor / Track every robot in real time" + **Replay** (ghost of Simulate) + primary **Dispatch Task** (placeholder, disabled until backend exists). |
| Builder header: "Workflow Canvas", node-count chip, `Fleet - [dropdown]` | **"Live View"** (the robot-count and site-name chips were removed on request), `Fleet - [dropdown]` |
| Nodes palette (8 colored tiles) | **Removed by user decision** (no layer bar) |
| Canvas dot-grid + node graph | The Three.js viewport |
| Map Preview (top-right) | **Removed by user decision** |
| AI prompt bar (bottom) | Command bar: "Ask Ati AI or search robots..." (optional, stub) |
| Zoom control 100% | Zoom control wired to camera |
| (none) | **Right-side Robot panel** (slides over canvas): selected robot id, model, state pill, battery, speed, task/route, alerts, buttons Follow / Locate / Pause. Plus a collapsible **Fleet list** with status counts and a live **Event feed**. |

**Tokens** (Figma variables): font Inter; text-sm 14/20 (Bold 700, Semibold 600, Medium 500, Regular 400), text-xs 12/18; spacing xxs2 xs4 sm6 md8 lg12 2xl20; radius sm6 md8 12 20 full; neutrals bg `#ffffff`/`#f5f5f5`, border `#e5e5e5`/`#d4d4d4`, text `#404040`, placeholder `#737373`, fg-quaternary `#a3a3a3`; brand `#66cbc4` (bg-brand-solid); success `#22c55e`; shadow-xs `0 1px 2px rgba(0,0,0,.05)`. Sidebar: gradient 148deg `#132630 -> #0f1b24 (38%) -> #111827 (85%)` plus teal radial glow top-left `rgba(45,212,191,.22)` and indigo glow bottom-right `rgba(99,102,241,.16)`; text `#cbd5e1`, group labels `#64748b`, accent `#5eead4`, active item gradient `rgba(94,234,212,.18)->.06` with 3px left border `#5eead4`, shadow `0 10px 15px rgba(15,23,32,.45)`, radius 20. Put these in `src/ui/tokens.css`; fetch icons from Figma assets (they expire in 7 days, so download and commit them to `src/ui/icons/`).
Status colors for robots (consistent across 3D and UI): moving `#14b8a6`, working `#f59e0b`, charging `#22c55e`, blocked `#ef4444`, error `#dc2626`, idle `#94a3b8`, offline `#cbd5e1`.

## 8. Build plan (each step verifiable)

1. Scaffold Vite+TS+React, tokens, shell layout matching Figma -> *screenshot compare to Figma*.
2. Importer: discover -> config -> `site.json` for the ECC hall -> *preview PNG matches the DWG crop*.
3. SceneBuilder renders `site.json` with orbit/top camera -> *60 fps on laptop, <3 MB site.json*.
4. Nav graph + MockSimulator + RobotRenderer (procedural Ati robot) -> *robots follow edges, never leave graph*.
5. Panels: fleet list, robot detail, search -> *click robot in 3D <-> list stays in sync*.
6. Walk mode with collision -> *cannot pass through walls/equipment*.
7. WebSocket adapter + schema validation + docs for onboarding a new site/robot feed -> *vitest suite passes; sample new-site walkthrough in `docs/ONBOARDING.md`*.

## 10. Confirmed decisions (user, this session)
- Whole building visible; only the SMT hall / areas with robot movement are active and clickable.
- Nav graph: Claude derives from aisles, user reviews via overlay.
- Stack: Vite + TypeScript + React + vanilla Three.js.
- Robots: procedural Sherpa-style Ati AMR, GLB registry for later.
- The user mentioned a reference image of the 3D look, but it was not visible to Claude in the first message; the reference HTML's look (light floor, dark walls, teal routes, yellow robots) is assumed. Ask for the image again if styling is in doubt.

## 9. Working rules for Claude in this repo
- Do not change the telemetry schema or coordinate conventions without updating section 5 here.
- Do not put DWG-, client-, or site-specific constants in `src/engine` or `src/ui`; they belong in `import.config.yaml`, `site.json`, `nav.json`, or `public/config.json`.
- Do not edit the reference HTML or copy its code. Take only the ideas listed in section 2.
- Verify visual work in the browser (screenshot) before claiming it matches Figma or runs smoothly.
- Scratch/intermediate files (DXF ~200 MB, renders) stay out of the repo (use the scratchpad; `.gitignore` `*.dxf`, `*.dwg`).
- Keep it minimal: no feature that is not in section 8 without asking.

## 11. Implemented state (update on every milestone)

**Run:** `npm install && npm run dev` (http://localhost:5173; the dev server also listens on the LAN, `server.host: true` + `strictPort` in vite.config.ts, so phones/tablets on the same Wi-Fi can open `http://<this-mac-ip>:5173`, find the IP with `ipconfig getifaddr en0`; plain HTTP, so secure-context-only browser APIs are unavailable on devices; the dev server is unauthenticated, only use it on a trusted network; `?site=<id>` selects a site). `npm test` (vitest: nav A*, collision), `npm run build` (tsc + vite).

**Done:** importer (`tools/dwg-import/import_dwg.py`), lane/rules derivation (`derive_lanes.py`), Vite/React/Three app, Figma-based shell (sidebar, topbar, title block, canvas card, camera-mode bar, zoom, collapsible fleet list + events, robot panel). The layer-tile bar and Map Preview window were removed on user request (layer state still exists in the store/engine but has no UI). Sidebar is collapsible on desktop (>1024 px): a chevron button in the sidebar header toggles 280 px <-> 72 px icon rail (labels/badges hidden, tooltips via `title`), state saved in `localStorage['sb-collapsed']`, canvas auto-resizes. Responsive: at <=1024 px the sidebar becomes a hamburger drawer (collapse button hidden there); at <=720 px the fleet list and robot panel become bottom sheets, whole-building scene with active zones (hover/click fly-in; the ECC site is now cropped to the factory floor only, 76 x 147 m), orbit/top/walk(collision)/follow cameras, procedural Sherpa-style robots with state colours, mock simulator (14 robots, 2 fleets, battery/charging/blocked events), search (robots/stations/zones).

**Regenerate a site** (needs `brew install libredwg`, Python venv with `tools/dwg-import/requirements.txt`):
```
dwg2dxf -y -o layout.dxf "<client>.dwg"
python -I tools/dwg-import/import_dwg.py discover layout.dxf            # layers/blocks
python -I tools/dwg-import/import_dwg.py build tools/dwg-import/sites/<id>/import.config.yaml layout.dxf public/sites/<id> --preview
python -I tools/dwg-import/derive_lanes.py public/sites/<id>/site.json tools/dwg-import/sites/<id>/import.config.yaml public/sites/<id>/nav.json --preview public/sites/<id>/lanes-preview.png
```
Then check `public/sites/<id>/preview.png`, edit the config (layers, crop, zones) and rerun. ECC numbers: site.json ~0.12 MB, 1200 walls, 273 equipment boxes, nav 2083 nodes / 28 stations. `crop` in the config decides what area of the DWG becomes the scene; keep it tight to the factory floor.

**New robot feed:** implement `TelemetryAdapter` (src/core/types.ts) mapping vendor payloads to `RobotTelemetry`, then swap it in `src/ui/App.tsx` (currently hard-wired to `MockSimulator`; `public/config.json` selection is planned, not built).

**Known gaps / honest limitations**
- ECC zone rectangles, wall heights and equipment heights are estimates from the plan, not survey data. Equipment boxes are clustered footprints (blocky), not real machine models; the DWG's block geometry (`INSERT`) is not exploded.
- The big west hall has only dashed pillar lines in the DWG, so its shell is generated from `floors` (`shell:` in config).
- `nav.json` is machine-derived from free space, so it is a candidate to be reviewed: stations are heuristic (label snapping, evenly spaced WS/charger placeholders). There is no in-app nav editor or debug overlay for editing yet (Routes layer only displays the graph).
- Robots avoid each other only through the simulator's random blocks; no collision/yielding model.
- Disabled/stub UI: Ati AI, Go to Support, Notifications/Settings/Create new fleet in the sidebar, back/forward. (Robots/Maps/Hardware/Users nav items no longer exist.)
- Walk mode needs pointer lock (mouse + keyboard); there is no touch control yet.
- Not built: WebSocket/REST adapters, `public/config.json`, telemetry validation, GLB loading in the robot registry, heatmap layer, touch controls for walk mode.
- Figma sidebar icons were downloaded into `src/ui/icons/` (other icons in the UI are text glyphs).

## 12. Map rules: fleets, lanes, traffic zones, forbidden zones (user spec, this session)

**Rules the system must show and never break**
1. **Fleets are limited to map areas** (`fleets[].areas` = site zone ids). A fleet cannot leave its areas. Fleets are isolated unless an area is listed by two fleets (a *shared* area, e.g. ECC `east-strip`); that is the only place robots meet other fleets. Lane network, station ownership and routing all respect this.
2. **One lane, one direction, always.** Every aisle has two paired lanes (one per direction, keep-right offset 0.5 m). No bidirectional lanes exist.
3. **Traffic zones**: a robot stops at the zone entrance (hold point 1.8 m before) until fewer than `capacity` robots (default 1) are inside, FIFO queue, applies across fleets. 
4. **Forbidden zones**: robots never enter; the deriver removes lanes/stations from them.
In real life the robot's localization and mapping engine enforces this; the dashboard only **visualises** it and **independently verifies** it from reported poses.

**Where it lives**
- `tools/dwg-import/derive_lanes.py <site.json> <import.config.yaml> <nav.json> [--preview png] [--force]`: free-space -> skeleton (aisle centre-lines) -> graph -> stations (on-lane or spur) -> fleet assignment -> paired lanes -> sample traffic zones at junctions -> validation (every station reachable by each owning fleet, no lane inside a forbidden zone; exits 1 on error). Config keys `fleets`, `forbidden`, `lanes` in `import.config.yaml`. **Fleet areas, forbidden zones and traffic-zone placement for ECC are SAMPLE data**; replace with the client's real map rules (edit config + rerun, or edit nav.json directly).
- `src/core/lanes.ts` LaneGraph (route + path geometry), `src/core/rules.ts` RulesIndex (independent checker + traffic occupancy), `src/adapters/sim.ts` FleetSim (pure deterministic simulator obeying all rules), `src/adapters/mock.ts` real-time wrapper.
- `src/engine/rulesLayer.ts` draws lanes (fleet colour, shared = indigo, direction arrows), traffic zones (amber; orange occupied; red + pulse when robots wait; magenta over capacity; label `TZ-xx · 1/1 · 2 waiting`), forbidden zones (red hatch + barrier + `NO-GO` label), stations (pin + `STA-1xx` label, clickable).
- UI: one popup card `src/ui/InfoPanel.tsx` is used by BOTH `RobotPanel` and `StationPanel` (title, subtitle, status pill, fleet chips, stat grid, custom children, alerts, actions). Reuse it for any new selectable thing. `MapLegend` shows the key plus live counters (traffic zones occupied/waiting, rule violations).

**Telemetry additions (adapters must fill these from the robot/fleet manager)**: `laneId`, `traffic:{zoneId,status:'waiting'|'inside'}`, `waitReason`, `atStation`, `task.to` = station id (`STA-xxx`). New state `waiting` (purple) = holding for a traffic zone or headway. Rule alerts (`FORBIDDEN_ZONE`, `FLEET_BOUNDARY`, `OFF_LANE`, `WRONG_WAY`, `TRAFFIC_VIOLATION`) are computed in the store (`ingest`) from poses, so they show even if the robot reports nothing; they raise red ring, popup alert, event feed and the violations counter.

**Station naming**: ids `STA-101...` assigned by the deriver (sorted by area, then position); `name` is the real name from the drawing labels (duplicates numbered, e.g. `PCBA WIP 2`), plus placeholder `Assembly Workstation n` and `Charging Dock n`. Clicking a station opens the popup: actual name, type, map area, serving fleets, docked robot, incoming bots with ETA/distance, status (Free / Robot inbound / Occupied / Charging).

**Verification gate ("without fail")**: `npm test` runs (a) data checks on `public/sites/ecc/nav.json` (stations reachable per fleet, lanes paired, fleet isolation), (b) 12 seeds x 20 simulated minutes of 14 robots with ZERO rule violations and no robot waiting > 2 min, (c) checker unit tests that fabricated violations ARE flagged. Rerun after any change to lanes, rules or the simulator. Bugs found this way and fixed: zone re-entry self-deadlock, angle-wrap false wrong-way, noisy centre-line offsets, junction back-hops.

**Known limits of section 12**: wrong-way is not evaluated within 1.4 m of lane ends (junctions/station U-turns); sim robots park on lane ends at on-lane stations; traffic zones are axis-aligned squares at junctions (1 capacity); lane geometry is derived from skeleton + offset, not a certified route map; no deadlock *recovery* (only avoidance by zone spacing >= 9 m and tests).

## 13. Reserved UI slots (buttons removed on request, keep the position for later)

**Title-block action slot**: in `src/ui/App.tsx` the empty `<div className="actions" />` sits at the **top-right of the page title block**, on the same row as the "Live Floor" heading, directly above the canvas card's right edge. It matches the Figma Workflow Builder screen where `Simulate` (secondary) and `Publish Workflow` (primary) sat.
- Removed on user request: **Replay** (left, secondary `.btn`, label `▷ Replay`, was disabled: needed recorded telemetry) and **Dispatch Task** (right, primary `.btn.brand`, was disabled: needed a fleet backend).
- Layout of the slot: `.actions { display:flex; gap:12px }` (src/ui/app.css). Order was `[secondary] [primary]`, 36 px tall buttons, 12 px apart. On <=720 px the first `.btn` in the slot is hidden by `.actions .btn:first-child` (so the primary one stays); keep that in mind for a new first button.
- To add a button: put `<button className="btn">...</button>` (secondary) or `className="btn brand"` (primary) inside that div.

## 14. Untitled UI React (components + rules for using them)

**Setup (done):** `npx untitledui@latest init --vite -y -c teal` created `src/styles/{globals,theme}.css` (brand colour = teal); then `@tailwindcss/vite` plugin + `@` -> `src/` alias (vite.config.ts and tsconfig `paths`) were added by hand because init did not. React was upgraded 18 -> 19 (the components target React 19 types). `src/main.tsx` imports `styles/globals.css` FIRST, then `ui/tokens.css`, `ui/app.css`.
**Add a component:** `npx untitledui@latest add <name> --yes` (free components: button, button-utility, button-group, input, select, badges, avatar, tooltip, progress-indicators, tabs, tables, ...). Find names with `npx untitledui@latest search "<query>"`. Components are copied into `src/components/` (you own the source). PRO items need `untitledui login`. The CLI pulls in many variants; prune unused files and re-run `npx tsc --noEmit` (done once: payment/tags/multi-select/pin/date/file inputs removed).
**Used now:** `Button` (header Go to Support / Ati AI, popup actions, command-bar send, Home/Fleet), `ButtonUtility` (menu, back/forward, zoom -/+, close X), `ButtonGroup` (3D/Top/Walk/Follow, controlled via `selectedKeys`), `Input` (topbar search, command bar), `Select` (fleet dropdown), `Badge`/`BadgeWithDot` (robot-count + site chips, status pills, fleet chips, state-count filters, notification count), `ProgressBar` (battery, route progress), `Avatar` (sidebar user, online dot), `Tooltip` (sidebar items when collapsed). Shared helpers: `src/ui/tones.ts` (robot state -> badge colour, bar tone), `src/ui/InfoPanel.tsx` (popup card, now takes `pill:{label,tone}` and `stats[].bar:{pct,tone}`).
**Deliberately NOT replaced (and why):** the dark gradient sidebar and its nav items (Untitled's sidebar navigation is a light, much larger design and would break the Figma look; free-form dark theme styling here), the search-results dropdown (grouped robot/zone/station results with custom focus behaviour), station/robot list rows and the event feed (dense custom rows), the Alerts inside the popup, the map key, the sidebar collapse/close buttons (dark background, ButtonUtility hover is light), the hamburger drawer scrim. Use Untitled components for any NEW element of these kinds unless it fights the dark sidebar or the compact map overlays.
**Gotchas**
- CSS precedence: Tailwind utilities live in `@layer`; the dashboard's `src/ui/app.css` is UNLAYERED so it always wins. Never write app.css rules that target elements rendered by Untitled components (e.g. `.modes button`, `.kv div` bugs showed up this way); style them with Tailwind classes via `className` or scope selectors tightly (`.kv > div`). Old `.btn/.chip/.pill/.select/.bar/.tb-nav` CSS was deleted.
- react-aria components use `onPress`, `isDisabled`, `onSelectionChange(keys)`; text inputs use `onChange(value: string)` not events.
- Topbar buttons use Figma icons: `Go to Support` = `HeadsetHelp`, `Ati AI` = `Brain` (Figma node 837:5352, components `headset-help` / `brain`). They are NOT in the free `@untitledui/icons` set, so `src/ui/icons/figma-icons.tsx` holds components generated from the exact Figma SVG exports (stroke -> `currentColor` so the button tints them; source `.svg` files kept beside it). Use the same approach for other Figma icons missing from the package.
- Never add unlayered global rules like `button { color: inherit }` (it turned the primary button text dark); Tailwind preflight already provides them.
- Brand colour is Untitled's teal (`bg-brand-solid`), not the Figma `#66cbc4`; the sidebar accent stays `#5eead4` from tokens.css.
- Preview tip: `window.__store` / `window.__engine` / `window.__adapter` exist in dev only (Vite dev) for console testing.
- `npm audit` reports vulnerabilities in dev tooling (vite 5 / vitest chain), not addressed.

## 15. Interaction rules added later (user requests)
- **Sidebar selection is its own state** (`store.navSel`: `'live'` | `'fleet:all'` | `'fleet:<id>'`), separate from the map filter `store.fleetId`. Exactly one sidebar item is highlighted. Clicking Live Floor selects it and resets the filter to all fleets; clicking a fleet selects it and filters the map to it. The fleet dropdown inside the Live Floor screen only changes `fleetId` and never changes the sidebar highlight.
- **Walk mode exit keeps the view**: `Engine.syncTargetFromCamera()` re-aims the orbit target along the current look direction (floor hit, 1..60 m) when leaving walk mode, so camera position and direction are unchanged (verified identical before/after). Do not reset the camera on mode changes unless the user asks.
- **Touch support: see section 16.**
- **Follow mode** (Follow button is ALWAYS clickable; with no robot selected it shows a warning toast "No robot selected / Please select a robot first to follow." and does nothing else): chase camera 9 m behind and 6 m above the selected robot, smoothly following its heading; orbit controls are disabled meanwhile. Exit by choosing 3D/Top/Walk/Home, pressing Esc, or deselecting the robot (this now returns to orbit; previously the camera froze).

## 16. Touch-friendly interface (implemented, user request)

Detection: `matchMedia('(pointer: coarse)')` (`Engine.coarse`, `useCoarse()` hook). Desktop behaviour is unchanged. Gesture code lives in `src/engine/Engine.ts` (section "touch"), UI in `src/ui/WalkPad.tsx`, `InfoPanel.tsx` (`SheetHandle`), `app.css` (section "touch"), `index.html` (viewport).

| # | Feature | Status |
|---|---|---|
| 1 | One-finger drag orbits the view | done (OrbitControls `touches.ONE`) |
| 2 | Two-finger pinch zooms | done (`touches.TWO = DOLLY_PAN`) |
| 3 | Two-finger drag pans (screen-space) | done |
| 4 | Two-finger twist rotates the view about the look-at point | done (`onTouchMove`, verified 40 deg twist = 40 deg rotation) |
| 5 | Tap selects robot / station / zone (10 px wobble tolerance instead of 5) | done |
| 6 | Double-tap zooms in on the tapped floor point (halves the distance); double-tap a robot locates it; desktop double-click does the same | done |
| 7 | Gesture/tap separation: a pinch/twist never counts as a tap; no hover raycasts on touch | done |
| 8 | Walk mode without pointer lock: on-screen move stick (push past 90% = run), one-finger drag looks around, `Exit walk` button, touch-specific hint | done |
| 9 | Bottom sheets (<=720 px): swipe-down handle dismisses the robot/station popup (>70 px), short swipes snap back | done |
| 10 | Tap targets >= 40-50 px on coarse pointers (sidebar items, list rows, search results, header/overlay buttons, zoom control, drawer close) | done |
| 11 | Browser gestures disabled where they fight the app: `touch-action: none` on the canvas, `manipulation` elsewhere (no double-tap page zoom), `overscroll-behavior: none`, no text selection / callout / tap highlight on chrome, long-press context menu blocked on the canvas | done |
| 12 | Notch / home-indicator safe areas (`viewport-fit=cover` + `env(safe-area-inset-*)`), `100dvh` so the mobile URL bar does not cut the layout, page pinch-zoom locked (`maximum-scale=1`) | done |
| 13 | Lighter rendering on touch devices: pixel ratio capped at 1.5, 1024 px shadow map | done |
| 14 | Existing buttons stay as non-gesture alternatives (zoom +/-, Home, mode bar) and the hamburger drawer / bottom sheets from the responsive work | done |
| 15 | Long-press on a robot to follow / context actions | NOT done (idea) |
| 16 | Haptic feedback on select (`navigator.vibrate`, Android only) | NOT done (idea) |
| 17 | Swipe from the left edge to open the sidebar drawer | NOT done (idea) |
| 18 | Tooltips on touch (React Aria tooltips are hover/focus only; the collapsed sidebar is not used on phones) | n/a |
| 19 | Orientation-lock / PWA install / offline | NOT done (out of scope) |

Testing notes: gestures were verified with synthetic touch `PointerEvent`s in the mobile emulator (pointer capture stubbed); `pointer: coarse` matched there. Please try on a real phone/tablet, especially: twist sensitivity, double-tap timing (320 ms window, 30 px), stick feel and run threshold, and iOS Safari safe-area/URL-bar behaviour. Tunables are constants at the top of the touch code (0.0055 look speed, 52 px stick radius, 10 px tap tolerance).

## 17. Toasts (user request)
- `src/ui/toast.tsx`: `<AppToaster />` (mounted in `App.tsx`, top-center) and `notify.warning|success|info|error(title, description?, id?)`. Pass a stable `id` so repeated triggers reuse one toast (e.g. `follow-needs-robot`). Used by the camera Follow button.
- **Untitled UI's real toast (`Notifications` / `toaster`) is PRO-only**: `npx untitledui add notifications` fails with "requires PRO access" (needs `npx untitledui@latest login` with a purchased licence). Until then the toast is built from FREE Untitled UI parts (`FeaturedIcon`, `ButtonUtility`, theme tokens) on top of `sonner` (the same engine the PRO component uses) with the same layout. To switch: log in, `npx untitledui@latest add notifications --yes`, then render `IconNotification` inside `show()` in `toast.tsx`; callers of `notify` do not change.

## 18. Phone camera bar sizing (bug + fix)
- **Cause**: a leftover phone-only rule in `app.css` (`.modes button { padding: 0 6px; flex: 1 }`, from before the Untitled UI swap) is unlayered, so it overrode Untitled UI's button padding and forced all six buttons into equal ~45 px slivers (labels touching the edges). Tablet/desktop never had it.
- **Fix**: rule removed. On touch devices every camera-bar button is >= 44 x 44 px (`@media (pointer: coarse)`), group items keep natural widths with 12 px side padding on phones, Home/Fleet are icon-only on phones (`.modes [data-text]` hidden, with `aria-label`s), and the bar wraps to a second row only on very narrow screens (<= ~340 px) instead of squeezing. Verified: 375 px = one row, all controls 44 px+; 320 px = two rows, no overflow; 768 px unchanged (labels shown).
- **Rule of thumb** (also in section 14): never size Untitled UI controls from `app.css` with plain element selectors; if a size must change on a breakpoint, set min sizes/padding narrowly and check the computed sizes at 375 / 768 / desktop.

## 19. Current user identity (sidebar footer)
Sidebar user = **Arjun Singh**, role "Lead Supervisor" (was "Thomas"), avatar = the user-supplied 3D blue-turban illustration, stored resized (256 px) at `src/ui/avatars/arjun-singh.png` and rendered through Untitled UI `Avatar` (`src`, online dot). The name/role are hard-coded placeholders in `src/ui/Sidebar.tsx`; replace with real auth data when a backend exists.

## 20. Multi-page architecture: auth, roles, routing, shell (user request)

**Principle:** each concern is an independent module; pages only compose. Nothing in `features/auth` knows about routes or pages, and the shell knows nothing about specific pages.

```
src/
  app/            AppRoot.tsx (route table), guards.tsx (RequireRole), roles.ts (role -> landing route + sidebar label)
  features/
    auth/         types.ts, users.ts (THE user directory), authService.ts (pure authenticate/findUser), authStore.ts (session), LoginPage.tsx, login.css, assets/, avatars/
    live-floor/   LiveFloorPage.tsx (the 3D page, content only), liveNav.ts (sidebar data + search for supervisors)
    workflow-builder/   (section 21)
  shell/          AppShell.tsx (sidebar + topbar + mobile drawer), Sidebar.tsx (data driven), Topbar.tsx (generic), UserMenu.tsx (avatar menu with Log out), types.ts
  ui/ core/ engine/ adapters/   shared UI pieces, Live Floor core/engine/simulator (unchanged)
```
**Routes (react-router-dom, BrowserRouter):** `/login` (public), `/live` (role `supervisor`), `/configurator` (role `configurator`), everything else redirects (`/` -> signed-in user's home or `/login`). `RequireRole` sends signed-out users to `/login` and users of another role to their own home, so roles never see each other's pages. A production host needs an SPA fallback (serve index.html for unknown paths); the Vite dev server already does.

**Accounts (prototype, plain text on purpose, no encryption was requested):** edit `src/features/auth/users.ts`.
| username | password | role | lands on | avatar |
|---|---|---|---|---|
| arjun | 1234 | supervisor | /live (Live Floor) | blue-turban illustration |
| kavin | 1234 | configurator | /configurator (Workflow Builder) | headset illustration (first image the user sent) |
| meera | 1234 | configurator | /configurator | saree illustration (second image the user sent) |
Usernames are case-insensitive. Session = username only; "Keep me signed in" ticked -> `localStorage['atiflow.session']`, unticked -> `sessionStorage` (cleared when the browser closes). Log out: click the avatar block at the bottom of the sidebar -> menu -> Log out (clears the session, goes to /login). Swap `authService.authenticate` for an API call later; callers only use its result.
**Add a user:** one record in users.ts (+ avatar png in `features/auth/avatars/`). **Add a role:** extend `Role` (auth/types.ts), add it to `ROLES` (app/roles.ts), add a page + a `RequireRole` route in AppRoot, give the page a `useNavModel` hook.

**Shell contract:** `<AppShell useNavModel={hook} getHits={fn} searchPlaceholder leading? onAi?>content</AppShell>`. `useNavModel` returns `{groups:[{id,label,items:[{id,label,icon,active,badge,onSelect}],extra?}], footerItems}` (hook called inside the Sidebar so only the sidebar re-renders on live data). `getHits(q)` returns search results `{kind,title,sub,go}`. `leading` replaces the topbar back/forward buttons (the builder passes undo/redo). The sidebar header label comes from the signed-in user's role. Same look, different content per role.

**Login page:** built from Figma `70:12398` with Untitled UI (`Input`, `Checkbox`, `Button`, `ButtonUtility`), the Figma factory illustration as background, hero text, and the robot + ribbon driving across the card (Figma node 78:9426: 8.04 s linear loop, `prefers-reduced-motion` aware). The dark **sidebar theme** is a shared token `--surface-sidebar` (tokens.css) used by the sidebar, the card header and the footer bar of the login page. Errors: inline alert + shake. Toaster is mounted once in AppRoot.

## 21. Workflow Builder (configurator page, from the supplied reference HTML)

Page = `features/workflow-builder/WorkflowBuilderPage.tsx` inside the same shell/frame as the Live Floor: title block with **Simulate** (Play/Stop/Completed with progress line) and **Publish Workflow** in the reserved header action slot (section 13), "Workflow Canvas" card header with node-count badge and **Fleet -** dropdown, floating **Nodes palette** (top-left), **AI bar** (bottom-left, same `.float.cmd` as the Live Floor command bar), **zoom bar** (bottom-right, shared `ui/ZoomBar`), **Map Preview** mini card (top-right) that opens a floating draggable map and docks beside the builder while a simulation runs. Sidebar (shared `features/configurator/configuratorNav.tsx`, section 22): Global Setup (Robots and Hardware are real pages, Maps/Users stubs -> toast "isn't part of this prototype"), Build (Master Data = section 23, Workflows active), Fleets (one item per workflow fleet, **Create new fleet** with inline name form), Notifications/Settings stubs. Top bar: undo/redo replace back/forward; search finds fleets and nodes; Ati AI focuses the AI bar.

**Features implemented (all from the reference):** per-fleet workflows (seeded Line Side Fleet 11 nodes, Assembly Fleet 8); create fleets (unique ignoring case, "Fleet" suffix added); 7 node types + the AIoT tile (no card, shows the reference's message); click or drag a palette tile to add (drop on a gap or inside an If Logic branch); drag cards to reorder / move into branches (mouse: anywhere on the card; touch: the handle); remove with the x or Delete key; Start/End fixed; placement rules (one End, End only at the end of the main flow, no nested If Logic); field editing (Untitled `Select`, multi-value "+" for User ID / branch stations, checkbox "quantity from tablet" which disables the quantity input, digits-only quantity committed on blur/Enter); If Logic with TRUE/OTHERWISE branches and measured connector lines at any zoom; undo/redo per fleet (buttons, Ctrl+Z / Ctrl+Shift+Z, 100 steps); pan (drag empty space, wheel, trackpad), zoom (buttons, Ctrl/Cmd +/-/0, Ctrl+wheel, pinch), fit-to-view per fleet, reveal of new/selected/simulated node; Ati AI text -> workflow (`model/parsePrompt.ts`, rule based; fixed the reference bug where "material 003" with a space was not recognised); **Simulate** walks the workflow (material quantities, If Logic evaluation, robot drives lanes on the map with trail, waits, confirmations, progress, Completed/Stop; switching fleet or leaving the page stops it); station highlight on the map when a node is selected; **Publish** validation (needs a step; no empty branches) + toast; toasts via `notify` (Sonner-based, section 17); persistence of all workflows in `localStorage['atiflow.workflows.v1']` (history is not persisted); responsive + touch (pinch, one-finger pan on empty space, tap tiles to add, palette scrolls).

**Scalable structure (`features/workflow-builder`):** `model/` pure logic (types, **registry.ts = add a node type here: fields, colours, defaults**, tree ops, validate, parsePrompt, seed, zustand store with history + persistence), `sim/` (geometry = map stations/lanes, runner = simulation + `simBus` for 60 fps robot frames without React re-renders), `hooks/` (`useCamera` pan/zoom, `useBuilderDnd` pointer-based DnD), `components/` (WorkflowCanvas, FlowTree, NodeCard, FieldControl, BranchGroup, Connector, NodePalette, AiPromptBar, MapPreview), `assets/` (icons + map generated from the reference), `workflow.css` (bespoke pieces, every class prefixed `wf-`). Controls inside cards are Untitled UI components.
**Gotchas found while building:** (1) a CSS class named `fixed` collided with Tailwind's `.fixed {position:fixed}` and pulled Start/End cards out of the layout; always prefix feature classes (`wf-`). (2) `display: contents` wrappers break getBoundingClientRect-based drawing; use fragments. (3) Fit-to-view must run for a new fleet before paint (done in `useLayoutEffect` keyed on fleet). (4) Select inside a transformed canvas works because React Aria portals the popover.
**Tests:** `tests/auth.test.ts`, `tests/workflow.test.ts` (tree rules, validation, AI parser, fleet names) alongside the rule/sim tests: 41 passing. UI behaviour was verified in the browser (drag-add, reorder, edits, undo/redo, AI, fleets, simulate, pan/zoom/pinch, login/logout/guards).
**Known limits / ideas:** workflows are saved per browser, not per user or on a server; the configurator's fleets (Line Side, Assembly, user-created) are independent of the Live Floor's fleets (Line Side, ASRS) and Publish only shows a toast (no backend); the reference map has 5 stations (S100-S104), other station ids are skipped by the simulation; palette drag with a finger is not supported (tap adds; cards drag by handle); AIoT has no node card (not in the Figma file).

## 22. Configurator: Robots and Hardware (Figma `346:43757` robots, `346:37118` hardware; theme and page layout stay ours, Figma is the content reference)

**Routes (role `configurator`):** `/configurator` (Workflow Builder), `/configurator/robots`, `/configurator/robots/:name`, `/configurator/hardware`, `/configurator/hardware/:name`. The sidebar is one shared hook, `features/configurator/configuratorNav.tsx` (`useConfiguratorNav`, `configuratorHits`): the highlighted item follows the URL, fleet items switch the builder's fleet and go to `/configurator`, top-bar search finds fleets, robots, hardware (hits carry `to:` and the top bar navigates) and, on the builder, workflow nodes.

**One feature for both pages: `src/features/devices/`.** Robots and hardware are the same screens with different data, so nothing is written twice:
```
model/types.ts      Device {status, values}, FieldDef, DeviceKind
model/kinds.tsx     THE extension point: KINDS.robot / KINDS.hardware = labels, field list, list thumbnails, detail illustration, modal preview, empty state, seed data
model/validate.ts   validateNew (required + unique name/hardware id, ignoring case), blankValues, findDevice (pure, tested)
model/store.ts      zustand + localStorage 'atiflow.devices.v1' (robot[], hardware[]): add / update / remove
components/         DeviceTable (Untitled Table), DeviceEmptyState, AddDeviceModal (Untitled Modal), DeviceDetail (tabs, spec grid, footer actions), DeviceField (ONE input renderer for modal + detail), ConfirmDialog, StatusBadge
DeviceListPage.tsx / DeviceDetailPage.tsx   thin pages: AppShell + title block + one card (same layout as the Workflow Builder page)
```
**Add a field:** one `FieldDef` in kinds.tsx (`modal: 'full'|'half'` puts it in the Add dialog, `detail` + `detailOrder` in the detail grid, `required`, `unique`, `tag`). **Add a device kind (maps, chargers...):** one more `KINDS` entry + a route in AppRoot + a sidebar item.

**Flows built:** list (striped rows, picture, type badge, fleet, status; row opens detail; header search + Add button); Add Robot / Add Hardware dialog (live preview, required stars, inline errors, duplicate name / hardware id refused, Hardware Add-ons checkboxes for robots, API key masked); empty states (robots: illustration + "Let's add your first robot!"; hardware: icon stack + three quick picks Summon Button / Hooter / Ati Eye that preselect the type); detail page (breadcrumb, large name + type / fleet / status badges, illustration, tabs Details / Configuration / Calibration / Software Update for robots, spec grid, **Edit Details** -> editable API key, type, add-ons, fleet -> **Save Changes** / Cancel, **Unassign from <fleet>**); hardware detail has no tabs (a divider), same grid.
**Decisions / assumptions (not in Figma, please correct):** new devices start **Offline** (they have not connected yet), unassigned, IP / firmware / calibration "—"; robot "Sherpa Type" options are placeholders (`Tug 1.5T`, `Tug 3T`); the robot list type column is the model ("Sherpa XT Lite"), the detail "Type of Robot" is the Sherpa Type; hardware detail also shows **Assigned Fleet** (the list has the column but the Figma detail did not); **Remove <device>** (footer, with confirm) was added because the subtitle says "remove" and the empty state is otherwise unreachable; Configuration / Calibration / Software Update tabs only show a placeholder; hardware icons are Untitled icons (StopSquare, VolumeMax, Camera01) since Figma only has a placeholder square (its annotation asks for proper icons); the Figma 4096 px XT Lite illustration is cropped and stored at `features/devices/assets/xt-lite-illustration.png`; Untitled UI Breadcrumbs is PRO so the breadcrumb is a plain nav. Devices are saved per browser and are independent of the 14 simulated Live Floor robots.
**Untitled UI added:** `modal`, `table`, `tabs` (FREE). **CSS gotcha fixed:** a generic mobile rule in workflow.css (`.title-block .actions > * {flex:1}`) leaked onto every page that has a title block; it is now scoped to `.wf-title`. Tests: `tests/devices.test.ts` (50 total passing).

## 23. Configurator: Master Data, material flow (Figma section `642:57051` "Import Material flow for Configurator"; theme and page layout stay ours, Figma is the content reference)

**Route (role `configurator`):** `/configurator/master-data`, sidebar Build > Master Data (highlight follows the URL). Top-bar search also finds materials.
```
src/features/master-data/
  model/types.ts     Material {code (unique key), name, group, unit, source 'api'|'csv'|'manual', updatedAt}
  model/catalog.ts   mock ERP/inventory API (Figma rows DCP-100x + MAT-100x first, then generated families), filterCatalog(search, code prefix). Swap fetchCatalog for the real API.
  model/csv.ts       CSV split/parse (header aliases, defaults, dedupe), templateCsv() = header + 24 sample rows (the Figma "24 rows, 22 imported" case)
  model/rules.ts     appendNew (append-only, existing codes untouched), statusOf (Available/Added), validateMaterial, formatCount (en-IN, "1,28,872"), relativeTime
  model/store.ts     zustand + localStorage 'atiflow.materials.v1'; CSV import job (row by row, survives closing the dialog, cancel keeps written rows)
  components/        MdModal (THE dialog layout of the flow), AddOptionsModal, ApiImportModal, CsvImportModal, ImportProgressModal, MaterialFormModal (add + edit), PickTable (selectable Untitled Table), MaterialsTable
  MasterDataPage.tsx, master-data.css (prefix md-)
```
**Flow:** empty state -> **Add Material** -> chooser (API / CSV / manual) ->
- **Import from API** (no list yet): search + "Starts with" code prefix, header checkbox selects every listed row, **Create material list (n)**. Once a list exists the same dialog is **Add more from API** (also a title-block button): Status column, already-added rows ticked + locked + "Added", **Add n materials**.
- **Import from CSV**: drop zone / click to upload, "Download template", reading progress -> file card with rows found + Complete, or the **Unsupported File Format** box (wrong extension or no name/code columns) with Download Template; **Review import** (840 px, Available/Added, all available pre-selected) -> **Import n materials** -> **Importing materials** progress (Cancel import / Run in background; a progress strip on the page reopens it) -> toast "n materials imported".
- **Manual**: name + code (+ group, unit), required + unique code -> toast "New Material Added".
- List: Materials | Staging Area tabs, Materials | Station Goods sub-tabs, info line, search + Group + Unit filters, newest batch first, row pencil = Edit material (code read-only). **No delete** (annotation: materials may already be used in workflows).
**Decisions / assumptions (not in Figma, please correct):** list starts empty; Staging Area and Station Goods are placeholders; CSV steps are "1 of 2 / 2 of 2" (Figma says 1 of 3 and 3 of 3 with no step 2) and the flow is CSV only, so an .xlsx upload shows the unsupported state (Figma mixes "CSV/XLSX" and "CSV only"); the API catalog is ~155 mock rows, not 1,28,872; group and unit were added to the manual form so the table columns are filled; the list table has no row checkboxes (no bulk action is designed); the Figma 04 frame's Fleet column is not shown (06 uses Last Updated); toasts after API create / manual add / edit reuse `notify`. Materials are saved per browser and are not yet offered in the Workflow Builder's material field. Tests: `tests/master-data.test.ts` (62 total passing).
