import { useEffect, useState } from 'react';
import { CheckCircle, ChevronLeft, ChevronRight, Play, Stop } from '@untitledui/icons';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { ButtonUtility } from '@/components/base/buttons/button-utility';
import { Select } from '@/components/base/select/select';
import { notify } from '@/ui/toast';
import { AppShell } from '@/shell/AppShell';
import { Dataflow03 } from '@untitledui/icons';
import { WorkflowCanvas } from './components/WorkflowCanvas';
import { MapPreview } from './components/MapPreview';
import { configuratorHits, useConfiguratorNav } from '@/features/configurator/configuratorNav';
import { countNodes } from './model/tree';
import { useWorkflow, wfStore } from './model/store';
import { publishProblem } from './model/validate';
import { runSimulation, stopSimulation } from './sim/runner';
import './workflow.css';

/** Configurator home: the Workflow Builder. Chrome comes from AppShell; this file only assembles the page. */
export function WorkflowBuilderPage() {
  const current = useWorkflow((s) => s.current); const fleets = useWorkflow((s) => Object.keys(s.fleets).join('|')).split('|');
  const nodes = useWorkflow((s) => s.fleets[s.current].nodes); const title = useWorkflow((s) => s.fleets[s.current].wf);
  const sim = useWorkflow((s) => s.sim); const canUndo = useWorkflow((s) => !!s.hist[s.current]?.undo.length), canRedo = useWorkflow((s) => !!s.hist[s.current]?.redo.length);
  const [mapOpen, setMapOpen] = useState(false); const [publishing, setPublishing] = useState(false); const docked = sim.status !== 'idle';

  useEffect(() => { stopSimulation(); }, [current]);                       // switching fleets stops a running simulation
  useEffect(() => () => { stopSimulation(); }, []);                         // leaving the page does too

  const onSimulate = () => { if (sim.status === 'running') stopSimulation(); else void runSimulation(wfStore.getState().nodes()); };
  const onPublish = () => {
    const p = publishProblem(nodes); if (p) { notify.warning(p.title, p.body, 'publish'); return; }
    setPublishing(true); setTimeout(() => { setPublishing(false); wfStore.getState().publish(); }, 700);
  };
  const history = (
    <>
      <ButtonUtility className="hide-sm" icon={ChevronLeft} tooltip="Undo (Ctrl+Z)" isDisabled={!canUndo} onPress={() => wfStore.getState().undo()} />
      <ButtonUtility className="hide-sm" icon={ChevronRight} tooltip="Redo (Ctrl+Shift+Z)" isDisabled={!canRedo} onPress={() => wfStore.getState().redo()} />
    </>
  );
  return (
    <AppShell useNavModel={useConfiguratorNav} getHits={configuratorHits} searchPlaceholder="Search live operations, fleets, trips, analytics..." leading={history} onAi={() => document.querySelector<HTMLInputElement>('[data-wf-ai] input')?.focus()}>
      <div className="content">
        <div className="title-block wf-title"><div><h1>Workflow Builder</h1><p>Set new workflows and publish them</p></div>
          <div className="actions">
            <Button size="sm" color="secondary" className={'sim-btn' + (sim.status === 'done' ? ' done' : '')} iconLeading={sim.status === 'running' ? Stop : sim.status === 'done' ? CheckCircle : Play} onPress={onSimulate}>
              {sim.status === 'running' ? 'Stop' : sim.status === 'done' ? 'Completed' : 'Simulate'}{sim.status === 'running' && <span className="bar" style={{ width: sim.progress + '%' }} />}
            </Button>
            <Button size="sm" color="primary" isLoading={publishing} onPress={onPublish}>Publish Workflow</Button>
          </div></div>
        <div className="work">
          <div className="builder">
            <div className="bh"><Dataflow03 className="size-4 text-[#66cbc4]" /><h2>{title}</h2><Badge size="sm" color="brand">{countNodes(nodes)} nodes</Badge><div style={{ flex: 1 }} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>Fleet -</span>
              <Select size="sm" aria-label="Fleet" className="fleet-select" selectedKey={current} onSelectionChange={(k) => wfStore.getState().switchFleet(String(k))} items={fleets.map((n) => ({ id: n, label: n }))}>{(item) => <Select.Item {...item} />}</Select></div>
            <WorkflowCanvas mapOpen={mapOpen} setMapOpen={setMapOpen} docked={docked} />
          </div>
          {docked && <MapPreview mode="docked" onClose={stopSimulation} />}
        </div>
      </div>
    </AppShell>
  );
}
