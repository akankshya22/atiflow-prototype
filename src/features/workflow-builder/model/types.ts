export type NodeTypeId = 'start' | 'material' | 'logic' | 'container' | 'wait' | 'station' | 'confirm' | 'end';
export type FieldValue = string | boolean | string[];

export interface WfNode {
  id: string; t: NodeTypeId; f: Record<string, FieldValue>;
  /** If Logic only: the two branches (TRUE / OTHERWISE). */
  br?: { t: WfNode[]; o: WfNode[] };
}
/** Where a node list lives: the main flow, or one branch of an If Logic node ("<nodeId>:t" / "<nodeId>:o"). */
export type ListKey = 'main' | string;

export type FieldKind = 'select' | 'multi' | 'check' | 'input' | 'cond';
export interface FieldSpec {
  key: string; label: string | ((n: WfNode) => string); kind?: FieldKind; opts?: string[];
  /** Render label and control on one row. */
  row?: boolean;
  /** Overrides applied when the node sits inside a branch (e.g. Station uses S-numbers there). */
  branch?: Partial<FieldSpec>;
}
export type IconId = 'play' | 'keyframes' | 'box' | 'clock' | 'pin' | 'badge' | 'square' | 'antenna';
export interface NodeTypeSpec {
  label: string; accent: string; icon: IconId;
  /** Card width on the canvas (px) and width when inside a branch. */
  w: number; bw?: number;
  fields: FieldSpec[]; note?: string;
  /** Start / End: always present, cannot be removed or moved. */
  fixed?: boolean;
  defaults?: Record<string, FieldValue>;
}
export interface FleetWorkflow { wf: string; nodes: WfNode[] }
export interface Fleets { [name: string]: FleetWorkflow }
