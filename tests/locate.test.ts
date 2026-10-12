import { describe, it, expect } from 'vitest';
import { locateHits } from '../src/features/live-floor/locate';

const robots = [{ id: 'TRP-20480', state: 'moving' }, { id: 'TRP-20481', state: 'idle' }, { id: 'TRP-20410', state: 'idle' }];
const stations = [{ id: 'STA-101', name: 'PCBA WIP', type: 'pick' }, { id: 'STA-110', name: 'Charging Dock 1', type: 'charge' }];

describe('Live Floor locate search', () => {
  it('finds robots and stations by ID, exact and prefix matches first', () => {
    expect(locateHits('TRP-20481', robots, stations).map((h) => h.id)).toEqual(['TRP-20481']);
    expect(locateHits('sta-1', robots, stations).map((h) => h.id)).toEqual(['STA-101', 'STA-110']);
    expect(locateHits('2048', robots, stations).map((h) => h.id)).toEqual(['TRP-20480', 'TRP-20481']);
    expect(locateHits('101', robots, stations)[0]).toMatchObject({ kind: 'station', id: 'STA-101' });
  });
  it('also matches a station name, ignores spaces and case, and returns nothing for an empty query', () => {
    expect(locateHits('charging dock', robots, stations).map((h) => h.id)).toEqual(['STA-110']);
    expect(locateHits('  ', robots, stations)).toEqual([]);
    expect(locateHits('zzz', robots, stations)).toEqual([]);
  });
});
