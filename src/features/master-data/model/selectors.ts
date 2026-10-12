import { useMemo } from 'react';
import { codesForFleet } from './logic';
import { masterDataStore, useMasterData } from './store';

/** Material codes assigned to a fleet, read once (stores, parsers). */
export const fleetMaterialCodes = (fleet: string) => codesForFleet(masterDataStore.getState().materials, fleet);

/** Same, as a hook: re-renders when the master data changes (Workflow Builder dropdowns). */
export function useFleetMaterialCodes(fleet: string): string[] {
  const materials = useMasterData((s) => s.materials);
  return useMemo(() => codesForFleet(materials, fleet), [materials, fleet]);
}
