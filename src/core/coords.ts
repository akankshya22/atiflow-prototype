// The ONLY place site<->three conversion happens. three.x = x, three.z = -y, three.y = up.
export const toScene = (x: number, y: number, up = 0): [number, number, number] => [x, up, -y];
export const fromScene = (x: number, _y: number, z: number): { x: number; y: number } => ({ x, y: -z });
/** site heading (0 = +X, CCW) -> three rotation.y so the robot's +Z... local +X forward faces that heading. */
export const headingToRotY = (theta: number) => theta;
