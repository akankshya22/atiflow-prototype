import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { FleetMap } from './types';

// placeholder thumbnail until real maps provide their own (the imported ECC floor plan)
const PREVIEW = `${import.meta.env.BASE_URL}sites/ecc/preview.png`;

/** The maps that are part of the system. (Generating or importing new maps is not defined yet, so this is the whole list.) */
export const SYSTEM_MAPS: FleetMap[] = [
  { id: 'main-assembly', name: 'Main_Assembly_Hall_Engine_Bay_All', version: 5, tag: 'Waypoint v5', thumbnail: PREVIEW, stations: [
    { id: 'ST-01', name: 'Engine Bay Line 2' }, { id: 'ST-02', name: 'Kitting Area' }, { id: 'ST-03', name: 'Assembly Line 1' }, { id: 'ST-04', name: 'Packing Zone' }] },
  { id: 'assembly-east', name: 'Assembly_Hall_East_All', version: 2, tag: 'Waypoint v2', thumbnail: PREVIEW, stations: [
    { id: 'ST-01', name: 'Line A Feeder' }, { id: 'ST-02', name: 'Sub-Assembly Cell' }, { id: 'ST-03', name: 'Inspection Bay' }] },
];

export const mapsStore = createStore<{ maps: FleetMap[] }>(() => ({ maps: SYSTEM_MAPS }));
export const useMaps = () => useStore(mapsStore, (s) => s.maps);
export const useMap = (id: string | null) => useStore(mapsStore, (s) => s.maps.find((m) => m.id === id) ?? null);
export const mapById = (id: string | null) => mapsStore.getState().maps.find((m) => m.id === id) ?? null;
if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { __maps: mapsStore });   // dev-only handle (e.g. empty the list to see the empty state)
