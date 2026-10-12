import type { RefObject } from 'react';
import { useWorkflow } from '../model/store';
import { BranchGroup } from './BranchGroup';
import { Connector } from './Connector';
import { NodeCard } from './NodeCard';

/** The main flow: a row of steps (incoming arrow + card). Branch rows live inside each If Logic group. */
export function FlowTree({ innerRef }: { innerRef: RefObject<HTMLDivElement | null> }) {
  const nodes = useWorkflow((s) => s.fleets[s.current].nodes);
  return (
    <div className="wf-inner" ref={innerRef}>
      {nodes.map((n, i) => (
        <div className="wf-step" key={n.id}>
          {i > 0 && <Connector listKey="main" gap={i} variant={nodes[i - 1].t === 'logic' ? 'bare' : ''} />}
          {n.t === 'logic' ? <BranchGroup node={n} /> : <NodeCard node={n} />}
        </div>
      ))}
    </div>
  );
}
