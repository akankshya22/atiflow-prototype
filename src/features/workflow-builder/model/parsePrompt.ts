import { createNode, createStart } from './factory';
import type { WfNode } from './types';

const pad = (v: number) => String(v).padStart(2, '0');
function fmtTime(n: number, unit: string) {
  const s = /^h/.test(unit) ? n * 3600 : /^m/.test(unit) ? n * 60 : n;
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
const isStation = (s: string) => /\b(pick ?up|pickup|collect|load|drop|deliver|unload|go to|move to|visit|stop at|station)\b|sta[\s-]?\d{3}|\bs\d{3}\b/.test(s);
function stationFrom(s: string, inBranch: boolean): WfNode {
  const m = s.match(/sta[\s-]?(\d{3})|\bs[\s-]?(\d{3})\b|station\s+(\d{3})/); const num = m ? m[1] || m[2] || m[3] : null;
  const action = /\b(drop|deliver|unload)/.test(s) ? 'Drop Off' : 'Pick Up';
  return inBranch ? createNode('station', { action, station: ['S' + (num || '101')] }) : createNode('station', { action, station: num ? 'STA-' + num : 'STA-101' });
}

/** Ati AI (prototype): plain English -> workflow steps. Rule based, deterministic, easy to replace with a real model behind the same signature. */
export function parsePrompt(text: string): WfNode[] {
  const steps: WfNode[] = []; let logic: WfNode | null = null; let pendingTrue = false;
  const segs = text.toLowerCase().split(/,|;|\bthen\b|\band\b|\.\s|\n/).map((s) => s.trim()).filter(Boolean);
  for (const s of segs) {
    if (/^(otherwise|else)\b/.test(s) && logic) { if (isStation(s)) logic.br!.o = [stationFrom(s, true)]; continue; }
    if (/\b(if|when|unless)\b/.test(s)) {
      const cond = /less|below|under|fewer/.test(s) ? 'Less than' : /not equal|isn't|is not/.test(s) ? 'Not equal to' : /equal|exactly/.test(s) ? 'Equal to' : 'Greater than';
      const q = s.match(/(\d+)/); logic = createNode('logic', { cond, qty: q ? q[1] : '10' }); steps.push(logic); pendingTrue = true; continue;
    }
    if (pendingTrue && logic && isStation(s)) { logic.br!.t = [stationFrom(s, true)]; pendingTrue = false; continue; }
    pendingTrue = false;
    if (/\b(wait|pause|hold|idle)\b/.test(s)) { const m = s.match(/(\d+(?:\.\d+)?)\s*(h|hr|hour|m|min|minute|s|sec|second)/); steps.push(createNode('wait', { time: m ? fmtTime(Math.round(+m[1]), m[2]) : '00:01:00' })); continue; }
    if (/\b(confirm|dispatch|scan|approve|weigh)/.test(s)) { const op = /scan|barcode/.test(s) ? 'Barcode Scan' : /tablet/.test(s) ? 'Tablet' : /weigh/.test(s) ? 'Weight Sensor' : 'Dispatch Button'; steps.push(createNode('confirm', { op })); continue; }
    if (/\b(container|tote)\b/.test(s)) { steps.push(createNode('container')); continue; }
    if (/\b(material|mat-|kit|quantity|qty)/.test(s)) {
      // accepts both "material 003" and "material-003"
      const c = s.match(/material[\s-]?(\d{3})|mat[\s-]?(\d{2})/); const q = s.match(/(\d+)\s*(units|pcs|pieces|qty|quantity)?\b/);
      steps.push(createNode('material', { code: c ? (c[1] ? 'Material-' + c[1] : 'MAT-' + c[2]) : 'Material-001', qty: q && !c ? q[1] : '10' })); continue;
    }
    if (isStation(s)) steps.push(stationFrom(s, false));
  }
  return steps;
}

/** Replace everything between Start and End with the parsed steps (keeps the existing Start/End). */
export function applySteps(nodes: WfNode[], steps: WfNode[]): WfNode[] {
  const start = nodes.find((n) => n.t === 'start') ?? createStart(); const end = nodes.find((n) => n.t === 'end') ?? createNode('end');
  return [start, ...steps, end];
}
