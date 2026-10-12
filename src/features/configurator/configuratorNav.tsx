import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { notify } from '@/ui/toast';
import type { NavModel, SearchHit } from '@/shell/types';
import robotsI from '@/ui/icons/robots.svg'; import mapsI from '@/ui/icons/maps.svg'; import hardwareI from '@/ui/icons/hardware.svg'; import usersI from '@/ui/icons/users.svg';
import masterI from '@/ui/icons/master-data.svg'; import workflowsI from '@/ui/icons/workflows.svg'; import fleetI from '@/ui/icons/fleet.svg'; import plusI from '@/ui/icons/plus-square.svg';
import bellI from '@/ui/icons/bell.svg'; import gearI from '@/ui/icons/settings.svg';
import { KINDS } from '@/features/devices/model/kinds';
import { deviceStore } from '@/features/devices/model/store';
import { nameOf } from '@/features/devices/model/validate';
import { builderNodeHits } from '@/features/workflow-builder/builderNav';
import { useWorkflow, wfStore } from '@/features/workflow-builder/model/store';

export const WORKFLOWS_PATH = '/configurator';
const soon = (name: string) => () => notify.info(`${name} isn't part of this prototype`, 'This prototype covers Workflows, Robots and Hardware.', 'soon');

/** "Create new fleet" row + inline name form (sidebar group extra). Creating a fleet opens it in the Workflow Builder. */
function NewFleet() {
  const [open, setOpen] = useState(false); const [name, setName] = useState(''); const navigate = useNavigate();
  const add = () => { if (wfStore.getState().createFleet(name)) { setName(''); setOpen(false); navigate(WORKFLOWS_PATH); } };
  return (
    <>
      <button className="sb-item" onClick={() => setOpen((o) => !o)}><span><img src={plusI} alt="" /><span className="t">Create new fleet</span></span></button>
      {open && <form className="new-fleet" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <Input size="sm" aria-label="New fleet name" placeholder="Fleet name" value={name} onChange={setName} autoFocus />
        <Button type="submit" size="sm" color="primary">Add</Button></form>}
    </>
  );
}

/** Sidebar shared by every configurator page. The highlighted item follows the URL, so each page only has to be a route. */
export function useConfiguratorNav(): NavModel {
  const names = useWorkflow((s) => Object.keys(s.fleets).join('|')).split('|'); const current = useWorkflow((s) => s.current);
  const { pathname } = useLocation(); const navigate = useNavigate();
  const onWorkflows = pathname === WORKFLOWS_PATH; const at = (route: string) => pathname.startsWith(`${WORKFLOWS_PATH}/${route}`);
  return {
    groups: [
      { id: 'global', label: 'Global Setup', items: [
        { id: 'robots', label: 'Robots', icon: robotsI, active: at(KINDS.robot.route), onSelect: () => navigate(`${WORKFLOWS_PATH}/${KINDS.robot.route}`) },
        { id: 'maps', label: 'Maps', icon: mapsI, onSelect: soon('Maps') },
        { id: 'hw', label: 'Hardware', icon: hardwareI, active: at(KINDS.hardware.route), onSelect: () => navigate(`${WORKFLOWS_PATH}/${KINDS.hardware.route}`) },
        { id: 'users', label: 'Users', icon: usersI, onSelect: soon('Users') }] },
      { id: 'build', label: 'Build', items: [{ id: 'md', label: 'Master Data', icon: masterI, onSelect: soon('Master Data') }, { id: 'wf', label: 'Workflows', icon: workflowsI, active: onWorkflows, onSelect: () => navigate(WORKFLOWS_PATH) }] },
      { id: 'fleets', label: 'Fleets', items: names.map((n) => ({ id: n, label: n, icon: fleetI, active: onWorkflows && n === current, onSelect: () => { wfStore.getState().switchFleet(n); navigate(WORKFLOWS_PATH); } })), extra: <NewFleet /> },
    ],
    footerItems: [{ id: 'notif', label: 'Notifications', icon: bellI, onSelect: soon('Notifications') }, { id: 'settings', label: 'Settings', icon: gearI, onSelect: soon('Settings') }],
  };
}

/** Top-bar search for every configurator page: fleets, robots, hardware (open their page) and, on the builder, the nodes of the open workflow. */
export function configuratorHits(q: string): SearchHit[] {
  const ql = q.toLowerCase(); const s = wfStore.getState(); const d = deviceStore.getState();
  const devices = (['robot', 'hardware'] as const).flatMap((id) => d[id].filter((x) => (nameOf(x) + ' ' + KINDS[id].typeOf(x)).toLowerCase().includes(ql)).slice(0, 5)
    .map((x) => ({ kind: KINDS[id].singular, title: nameOf(x), sub: KINDS[id].typeOf(x), to: `${WORKFLOWS_PATH}/${KINDS[id].route}/${encodeURIComponent(nameOf(x))}` })));
  return [
    ...Object.keys(s.fleets).filter((n) => n.toLowerCase().includes(ql)).map((n) => ({ kind: 'Fleet', title: n, to: WORKFLOWS_PATH, go: () => s.switchFleet(n) })),
    ...devices,
    ...(window.location.pathname === WORKFLOWS_PATH ? builderNodeHits(q) : []),
  ];
}
