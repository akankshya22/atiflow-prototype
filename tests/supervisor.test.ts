import { describe, it, expect } from 'vitest';
import { BASE_ZONES, ROBOTS, type RobotDef, type Zone } from '../src/features/supervisor/model/data';
import { FleetSim, counts, posAt, statusOf } from '../src/features/supervisor/model/sim';

const run = (sim: FleetSim, seconds: number, each?: () => void) => { for (let t = 0; t < seconds; t += 0.05) { sim.step(0.05); each?.(); } };
const onLoop = (o: FleetSim['robots'][number]) => { const p = posAt(o, o.s); return Math.hypot(p.x - o.x, p.y - o.y) < 1e-6; };

describe('supervisor live view simulation', () => {
  it('starts with 7 Sherpas in 2 fleets, one in error and one charging', () => {
    const sim = new FleetSim(() => BASE_ZONES);
    expect(sim.robots).toHaveLength(7); expect(new Set(sim.robots.map((o) => o.fleet))).toEqual(new Set(['lsf', 'log']));
    const c = counts(sim.robots); expect(c.error).toBe(1); expect(c.charging).toBe(1);
  });

  it('Sherpas stay on their mission loops and complete trips', () => {
    const sim = new FleetSim(() => BASE_ZONES);
    run(sim, 600, () => sim.robots.forEach((o) => expect(onLoop(o)).toBe(true)));
    expect(sim.trips).toBeGreaterThan(5);
    expect(sim.events.some((e) => e.text.startsWith('dropped off'))).toBe(true);
  });

  it('never has two Sherpas inside one traffic zone (except a give-way timeout)', () => {
    const sim = new FleetSim(() => BASE_ZONES); let worst = 0;
    run(sim, 600, () => { for (const z of BASE_ZONES.filter((q) => q.type === 'traffic')) worst = Math.max(worst, sim.robots.filter((o) => sim.zonesAt(o.x, o.y, ['traffic']).includes(z)).length); });
    expect(worst).toBeLessThanOrEqual(2);
  });

  it('a no-go zone drawn across a route stops the Sherpa before it', () => {
    const def: RobotDef = { id: 'T-1', model: 'xt', fleet: 'lsf', batt: 90, route: [[100, 300], [200, 300], [200, 310], [100, 310, { stop: { name: 'STG-A1', kind: 'pickup', dwell: 2, verb: 'Loading at' } }]] };
    const zones: Zone[] = [{ id: 'NG-99', type: 'restricted', name: 'Spill', r: [150, 295, 160, 305], custom: true }];
    const sim = new FleetSim(() => zones, [def]); run(sim, 60);
    const o = sim.robots[0]; expect(o.state).toBe('waiting'); expect(o.action).toContain('Spill'); expect(o.x).toBeLessThan(150);
  });

  it('pause fleet freezes every Sherpa; pausing one shows Paused; clearing an error resumes it', () => {
    const sim = new FleetSim(() => BASE_ZONES); sim.setPaused(true); const before = sim.robots.map((o) => o.s);
    run(sim, 5); expect(sim.robots.map((o) => o.s)).toEqual(before);
    sim.setPaused(false); const o = sim.robots[0]; sim.togglePause(o, 'Arjun'); expect(statusOf(o)).toBe('paused'); expect(sim.events[0].text).toBe('paused by Arjun');
    const err = sim.robots.find((r) => r.state === 'error')!; sim.clearError(err); run(sim, 2); expect(err.state).not.toBe('error');
  });

  it('every route stop names a station on the map', async () => {
    const { STATIONS } = await import('../src/features/supervisor/model/data');
    for (const r of ROBOTS) for (const p of r.route) if (p[2]) expect(STATIONS[p[2].stop.name]).toBeDefined();
  });
});
