import { createContext } from 'react';

export interface FlowCtxValue {
  /** Current canvas zoom (branch connectors are measured in screen space and corrected by it). */
  zoom: number;
  startCardDrag: (e: React.PointerEvent, id: string, card: HTMLElement) => void;
}
export const FlowCtx = createContext<FlowCtxValue>({ zoom: 1, startCardDrag: () => {} });
