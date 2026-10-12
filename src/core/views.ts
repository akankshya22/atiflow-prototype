import type { CameraMode, LayerKey } from './types';

/** Map views offered in the Live Floor "View" menu. Each is a camera mode plus the layers it shows; Walk and Follow are camera modes on top of the current view. */
export type ViewId = 'pointmap' | 'plan' | 'map' | '3d' | 'lidar';
export interface ViewDef { id: ViewId; label: string; hint: string; mode: CameraMode; layers: Partial<Record<LayerKey, boolean>> }
export const VIEWS: ViewDef[] = [
  { id: 'pointmap', label: '2D point map', hint: 'LiDAR scan from above', mode: 'top', layers: { pointmap: true, lidar: false, equipment: false, flat: false } },
  { id: 'plan', label: '2D map', hint: 'Flat floor map, no scan points', mode: 'top', layers: { pointmap: false, lidar: false, equipment: false, flat: true } },
  { id: 'map', label: '2.5D map', hint: 'Tilted map: drag to pan, pinch, twist', mode: 'map', layers: { pointmap: false, lidar: false, equipment: true, flat: false } },
  { id: '3d', label: '3D', hint: 'Orbit around the floor', mode: 'orbit', layers: { pointmap: false, lidar: false, equipment: true, flat: false } },
  { id: 'lidar', label: 'LiDAR 3D', hint: 'Scan points in 3D', mode: 'orbit', layers: { pointmap: false, lidar: true, equipment: false, flat: false } },
];
export const viewDef = (id: ViewId) => VIEWS.find((v) => v.id === id)!;
