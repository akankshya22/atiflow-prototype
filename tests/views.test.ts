import { describe, expect, it } from 'vitest';
import { store } from '../src/core/store';
import { VIEWS } from '../src/core/views';

describe('Live Floor views', () => {
  it('each view sets its camera mode and layers', () => {
    for (const v of VIEWS) {
      store.getState().setView(v.id); const s = store.getState();
      expect(s.cameraMode).toBe(v.mode); for (const [k, on] of Object.entries(v.layers)) expect(s.layers[k as keyof typeof s.layers]).toBe(on);
    }
  });
  it('leaving Walk / Follow returns to the chosen view', () => {
    store.getState().setView('map'); store.getState().setCameraMode('walk'); store.getState().exitToView();
    expect(store.getState().cameraMode).toBe('map');
    store.getState().setView('pointmap'); store.getState().setCameraMode('follow'); store.getState().exitToView();
    expect(store.getState().cameraMode).toBe('top'); expect(store.getState().layers.pointmap).toBe(true);
  });
});
