import { describe, expect, it } from 'vitest';
import { KINDS } from '../src/features/devices/model/kinds';
import { blankValues, findDevice, nameOf, validateNew } from '../src/features/devices/model/validate';

const { robot, hardware } = KINDS;
const filled = (kind: typeof robot, over: Record<string, string> = {}) => ({ ...blankValues(kind), name: 'Sherpa-09', hardwareId: 'HW-1234-09', apiKey: 'flow_api_x', ...over });

describe('device registry (robots + hardware share one model)', () => {
  it('seeds: 8 robots spread over two fleets (one unassigned), 4 hardware items', () => {
    expect(robot.seed).toHaveLength(8); expect(hardware.seed).toHaveLength(4);
    expect(robot.seed.filter((d) => d.values.fleet === 'Line Side Fleet')).toHaveLength(5); expect(robot.seed.filter((d) => d.values.fleet === '')).toHaveLength(1); expect(robot.seed.every((d) => d.status === 'online')).toBe(true);
    expect(hardware.seed.map((d) => d.values.hwType)).toEqual(['Summon Button', 'Hooter', 'Ati Eye', 'Hooter']);
  });
  it('seed names and hardware ids are unique', () => {
    for (const k of [robot, hardware]) { const names = k.seed.map(nameOf); expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length); expect(new Set(k.seed.map((d) => d.values.hardwareId)).size).toBe(k.seed.length); }
  });
  it('a valid new robot has no errors', () => expect(validateNew(robot, filled(robot), robot.seed)).toEqual({}));
  it('required fields are enforced', () => {
    const e = validateNew(robot, filled(robot, { name: '  ', hardwareId: '', apiKey: '' }), robot.seed);
    expect(Object.keys(e).sort()).toEqual(['apiKey', 'hardwareId', 'name']);
  });
  it('names and hardware ids must be unique, ignoring case', () => {
    const e = validateNew(robot, filled(robot, { name: 'amr-001', hardwareId: 'hw-2024-amr-0844' }), robot.seed);
    expect(e.name).toMatch(/already registered/); expect(e.hardwareId).toMatch(/already registered/);
  });
  it('hardware modal asks for type but not robot-only fields', () => {
    expect(validateNew(hardware, filled(hardware, { name: 'Line 9 Hooter', hwType: 'Hooter' }), hardware.seed)).toEqual({});
    expect(hardware.fields.filter((f) => f.modal).map((f) => f.key)).toEqual(['name', 'manufacturer', 'hwType', 'hardwareId', 'apiKey']);
  });
  it('blankValues: fresh robots are unassigned with unknown connection details', () => {
    const v = blankValues(robot); expect(v.fleet).toBe(''); expect(v.ip).toBe('—'); expect(v.addons).toEqual([]); expect(v.sherpaType).toBe('Tug 1.5T');
  });
  it('presets (empty-state quick picks) override defaults', () => expect(blankValues(hardware, { hwType: 'Ati Eye' }).hwType).toBe('Ati Eye'));
  it('findDevice ignores case', () => expect(nameOf(findDevice(robot.seed, 'amr-004')!)).toBe('AMR-004'));
});
