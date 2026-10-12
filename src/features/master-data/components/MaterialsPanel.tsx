import { useState } from 'react';
import { copy } from '../copy';
import { ImportModal, useImportFlow } from './ImportModal';
import { MaterialsList } from './MaterialsList';
import { StationGroupsList } from './StationGroupsList';
import type { SubTab } from './SubTabs';

/** Materials top tab: the two lists plus the add-materials flow. */
export function MaterialsPanel() {
  const [sub, setSub] = useState<SubTab>('materials'); const { flow, open, dispatch } = useImportFlow();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4" data-panel={copy.tabs.materials.label}>
      {sub === 'materials' ? <MaterialsList sub={sub} onSub={setSub} onAdd={() => open()} onAddMore={() => open('addMore')} /> : <StationGroupsList sub={sub} onSub={setSub} />}
      <ImportModal flow={flow} dispatch={dispatch} />
    </div>
  );
}
