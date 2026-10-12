import type { Problem } from './tree';
import type { WfNode } from './types';

/** Publish gate. Returns the first problem, or null when the workflow may be published. */
export function publishProblem(nodes: WfNode[]): Problem | null {
  if (nodes.length < 3) return { title: 'Add at least one step before publishing', body: 'Drag a node between Start and End.' };
  if (nodes.some((n) => n.br && (!n.br.t.length || !n.br.o.length))) return { title: 'An If Logic branch is empty', body: 'Give both TRUE and OTHERWISE at least one node before publishing.' };
  return null;
}
