import { createNode, createStart } from './factory';
import type { Fleets } from './types';

/** Starting content (the two fleets from the reference design). */
export function seedFleets(): Fleets {
  return {
    'Line Side Fleet': { wf: 'Workflow Canvas', nodes: [
      createStart(),
      createNode('material', { type: 'Material', code: 'Material-003', fromTablet: false, qty: '10' }),
      createNode('logic', { material: 'Material-003', station: 'S102', cond: 'Greater than', qty: '10' }),
      createNode('confirm', { op: 'Dispatch Button' }), createNode('station', { action: 'Drop Off', station: 'STA-102' }), createNode('station', { action: 'Pick Up', station: 'STA-103' }),
      createNode('container'), createNode('confirm', { op: 'Dispatch Button' }), createNode('station', { action: 'Drop Off', station: 'STA-104', lbl: 'Station' }),
      createNode('confirm', { op: 'Dispatch Button' }), createNode('end')] },
    'Assembly Fleet': { wf: 'Workflow Canvas', nodes: [
      createStart({ trigger: 'Auto', request: 'MES' }),
      createNode('material', { type: 'Material', code: 'MAT-01', qty: '10' }), createNode('confirm', { op: 'Tablet' }), createNode('station', { action: 'Pick Up', station: 'STA-103' }),
      createNode('confirm', { op: 'Dispatch Button' }), createNode('station', { action: 'Drop Off', station: 'SA-101' }), createNode('confirm', { op: 'Dispatch Button' }), createNode('end')] },
  };
}
export const newFleetWorkflow = () => ({ wf: 'Workflow Canvas', nodes: [createStart(), createNode('end')] });
