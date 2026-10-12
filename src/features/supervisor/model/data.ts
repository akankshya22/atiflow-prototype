/**
 * Supervisor Live view data (ported from the supplied "AtiFlow Live View" prototype).
 * World units are the CAD drawing's units (≈0.63 m each); the floor map covers x 0–470, y 95–410.
 * Pure data: no DOM, no Three. Replace with the fleet manager's feed when one exists.
 */
import type { BadgeColors } from '@/components/base/badges/badge-types';

export const MAP = { x0: 0, y0: 95, x1: 470, y1: 410 };
export const CX = 235, CY = 252.5;          // world origin of the 3D scene (map centre)
export const M_PER_U = 0.628;               // metres per drawing unit
export const MOVE_SPEED = 3.2;              // units per second at 1x (≈2 m/s)

export type ModelId = '10k' | 'xt';
export const MODELS: Record<ModelId, { name: string; payload: string; L: number; Wd: number; H: number }> = {
  '10k': { name: 'Sherpa 10K', payload: 'Tugger · up to 1,000 kg', L: 2.6, Wd: 1.8, H: 1.35 },
  xt: { name: 'Sherpa XT Lite', payload: 'Tugger · up to 500 kg', L: 2.1, Wd: 1.3, H: 1.15 },
};

export interface Fleet { id: string; name: string; desc: string }
export const FLEETS: Fleet[] = [
  { id: 'lsf', name: 'Line Side Fleet', desc: 'Feeds CC, MI and SMT lines in the clean room' },
  { id: 'log', name: 'Logistics Fleet', desc: 'Inbound docks to staging in the warehouse hall' },
];
export const fleetName = (id: string) => FLEETS.find((f) => f.id === id)?.name ?? id;

export type Status = 'moving' | 'working' | 'waiting' | 'charging' | 'error' | 'paused';
/** One table for status label, map colour (3D ring, list dot) and Untitled badge colour. */
export const STATUS: Record<Status, { label: string; color: string; tone: BadgeColors }> = {
  moving: { label: 'Moving', color: '#66cbc4', tone: 'brand' },
  working: { label: 'At station', color: '#2e90fa', tone: 'blue' },
  waiting: { label: 'Waiting', color: '#f79009', tone: 'warning' },
  charging: { label: 'Charging', color: '#17b26a', tone: 'success' },
  error: { label: 'Error', color: '#f04438', tone: 'error' },
  paused: { label: 'Paused', color: '#98a2a6', tone: 'gray' },
};

export type ZoneType = 'traffic' | 'staging' | 'charging' | 'slow' | 'restricted' | 'kitting';
export const ZONE_TYPES: Record<ZoneType, { label: string; color: string; desc: string; prefix: string }> = {
  traffic: { label: 'Traffic zone', color: '#f5b400', desc: 'One Sherpa at a time', prefix: 'TZ' },
  staging: { label: 'Staging area', color: '#2e90fa', desc: 'Load buffer', prefix: 'SA' },
  charging: { label: 'Charging', color: '#17b26a', desc: 'Docking and charging', prefix: 'CH' },
  slow: { label: 'Slow speed', color: '#9b8afb', desc: 'Speed capped at 0.6 m/s', prefix: 'SZ' },
  restricted: { label: 'No-go zone', color: '#f04438', desc: 'Sherpas never enter', prefix: 'NG' },
  kitting: { label: 'Kitting / prep', color: '#22ccee', desc: 'Material preparation', prefix: 'KP' },
};

/** r = [x1, y1, x2, y2] in drawing units. `custom` = drawn by a supervisor (saved per browser). */
export interface Zone { id: string; type: ZoneType; name: string; r: [number, number, number, number]; custom?: boolean }

export interface Station { x: number; y: number; kind: 'line' | 'stage' | 'charge'; off?: boolean }
/** Station positions read from the layout: line ends of the CC, MI and SMT lines plus staging, docks and the charger. */
export const STATIONS: Record<string, Station> = {};
[382.5, 393.8, 401, 408.3, 415.5, 422.5].forEach((x, i) => (STATIONS['CC-0' + (i + 1)] = { x, y: 257.8, kind: 'line' }));
[360, 367.5, 375, 383.1, 391.3, 398.1, 405, 411.9, 419.4].forEach((x, i) => (STATIONS['MI-0' + (i + 1)] = { x, y: 324.3, kind: 'line' }));
[368.1, 374.4, 381.3, 386.9, 394.4, 400, 406.3, 412.5, 419.4].forEach((x, i) => (STATIONS['SMT-0' + (i + 1)] = { x, y: 324.3, kind: 'line', off: true }));
Object.assign(STATIONS, {
  'STG-A1': { x: 180, y: 350, kind: 'stage' }, 'STG-B1': { x: 294, y: 225, kind: 'stage' }, 'PREP-01': { x: 436, y: 245, kind: 'stage' }, 'THT-WIP': { x: 436, y: 300, kind: 'stage' },
  'DOCK-02': { x: 95, y: 369.5, kind: 'stage' }, 'CHG-01': { x: 437, y: 353.5, kind: 'charge' }, 'STG-A2': { x: 165, y: 350, kind: 'stage' }, 'PARK-02': { x: 294, y: 300, kind: 'stage' },
} satisfies Record<string, Station>);
/** Where the station pad is drawn (line stations sit at the aisle edge of their machine). */
export const stationPadY = (s: Station) => (s.off ? 327.6 : s.kind === 'line' && s.y > 300 ? 321 : s.kind === 'line' ? 254.4 : s.y);

export const BASE_ZONES: Zone[] = [
  { id: 'SA-A', type: 'staging', name: 'Staging Area A · Inbound', r: [150, 338, 215, 362] },
  { id: 'SA-B', type: 'staging', name: 'Staging Area B · Kitting buffer', r: [262, 212, 310, 238] },
  { id: 'KP-01', type: 'kitting', name: 'Kitting & preparation', r: [429, 232, 444.5, 254] },
  { id: 'KP-02', type: 'kitting', name: 'THT WIP', r: [429, 272, 444.5, 318] },
  { id: 'CH-01', type: 'charging', name: 'AMR charging dock', r: [429.5, 349, 444.5, 358] },
  { id: 'SZ-01', type: 'slow', name: 'Clean room aisle CC/MI', r: [343, 255.4, 423, 260.2] },
  { id: 'SZ-02', type: 'slow', name: 'Clean room aisle MI/SMT', r: [343, 321.9, 423, 326.7] },
  { id: 'NG-01', type: 'restricted', name: 'Drawing storage', r: [429.5, 164, 444.5, 226] },
  { id: 'NG-02', type: 'restricted', name: 'Inline X-ray', r: [429.5, 359, 444.5, 368] },
  { id: 'TZ-01', type: 'traffic', name: 'Clean room door North', r: [329, 253, 343, 262.6] },
  { id: 'TZ-02', type: 'traffic', name: 'Clean room door South', r: [329, 319.5, 343, 329] },
  { id: 'TZ-03', type: 'traffic', name: 'Aisle junction NE', r: [423, 253, 431.5, 262.6] },
  { id: 'TZ-04', type: 'traffic', name: 'Aisle junction SE', r: [423, 319.5, 431.5, 329] },
  { id: 'TZ-05', type: 'traffic', name: 'Hall crossing', r: [311, 318, 325, 332] },
];

export type StopKind = 'pickup' | 'drop' | 'charge';
export interface Stop { name: string; kind: StopKind; dwell: number; load?: string; verb: string }
export type RoutePoint = [number, number] | [number, number, { stop: Stop }];
export interface RobotDef { id: string; model: ModelId; fleet: string; batt: number; cart?: boolean; error?: string; route: RoutePoint[] }

const S = (name: string, kind: StopKind, dwell: number, extra: { load?: string; verb: string }) => ({ stop: { name, kind, dwell, ...extra } });
/** Each Sherpa runs a closed mission loop; stops carry the action text shown to supervisors. */
export const ROBOTS: RobotDef[] = [
  { id: 'SH-10K-01', model: '10k', fleet: 'lsf', batt: 82, cart: true, route: [
    [180, 350, S('STG-A1', 'pickup', 7, { load: '2 trolleys · 420 kg', verb: 'Picking up 2 trolleys at' })], [180, 325], [318, 325], [318, 324.3], [338.5, 324.3],
    [375, 324.3, S('MI-03', 'drop', 6, { verb: 'Dropping off trolleys at' })], [427.2, 324.3], [427.2, 257.8],
    [393.8, 257.8, S('CC-02', 'pickup', 5, { load: '2 empty trolleys', verb: 'Collecting empty trolleys at' })], [338.5, 257.8], [318, 257.8], [318, 325], [180, 325]] },
  { id: 'SH-10K-02', model: '10k', fleet: 'lsf', batt: 64, cart: true, route: [
    [294, 225, S('STG-B1', 'pickup', 7, { load: 'Kitted trolley · 260 kg', verb: 'Loading kitted trolley at' })], [294, 257.8], [338.5, 257.8],
    [415.5, 257.8, S('CC-05', 'drop', 6, { verb: 'Dropping off kit at' })], [427.2, 257.8], [427.2, 324.3],
    [386.9, 324.3, S('SMT-04', 'drop', 5, { verb: 'Delivering reels to' })], [338.5, 324.3], [318, 324.3], [318, 225]] },
  { id: 'XT-LITE-01', model: 'xt', fleet: 'lsf', batt: 71, route: [
    [436, 245, S('PREP-01', 'pickup', 6, { load: 'Bin cart · 120 kg', verb: 'Loading bin cart at' })], [427.2, 245], [427.2, 324.3],
    [405, 324.3, S('MI-07', 'drop', 5, { verb: 'Dropping off bins at' })], [338.5, 324.3], [338.5, 158.5], [427.2, 158.5], [427.2, 245]] },
  { id: 'XT-LITE-02', model: 'xt', fleet: 'lsf', batt: 47, route: [
    [436, 300, S('THT-WIP', 'pickup', 6, { load: 'THT parts · 90 kg', verb: 'Collecting THT parts at' })], [427.2, 300], [427.2, 257.8],
    [382.5, 257.8, S('CC-01', 'drop', 5, { verb: 'Dropping off parts at' })], [427.2, 257.8], [427.2, 324.3],
    [412.5, 324.3, S('SMT-08', 'pickup', 5, { load: 'Empty reel cart', verb: 'Collecting reel cart at' })], [427.2, 324.3], [427.2, 300]] },
  { id: 'XT-LITE-03', model: 'xt', fleet: 'lsf', batt: 38, route: [
    [437, 353.5, S('CHG-01', 'charge', 26, { verb: 'Charging at' })], [427.2, 353.5], [427.2, 324.3],
    [419.4, 324.3, S('SMT-09', 'drop', 5, { verb: 'Dropping off stencil at' })], [427.2, 324.3], [427.2, 353.5]] },
  { id: 'SH-10K-03', model: '10k', fleet: 'log', batt: 76, cart: true, route: [
    [95, 369.5, S('DOCK-02', 'pickup', 8, { load: '3 pallets · 760 kg', verb: 'Picking up pallets at' })], [95, 325], [165, 325],
    [165, 350, S('STG-A2', 'drop', 7, { verb: 'Unloading pallets at' })], [165, 369.5]] },
  { id: 'SH-10K-04', model: '10k', fleet: 'log', batt: 58, cart: true, error: 'Obstacle detected on path · waiting for clearance', route: [
    [210, 276.5], [294, 276.5], [294, 300, S('PARK-02', 'pickup', 10, { load: 'Empty pallet cart', verb: 'Waiting for dispatch at' })], [210, 300]] },
];
/** Where each Sherpa starts on its loop (fraction of the loop length), so they do not all start at their first stop. */
export const START_AT = [0.02, 0.35, 0.55, 0.12, 0.0, 0.4, 0.15];
