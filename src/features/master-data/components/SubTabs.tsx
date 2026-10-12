import { SegmentedTabs } from '@/components/data/SegmentedTabs';
import { copy } from '../copy';

export type SubTab = 'materials' | 'groups';
/** Segmented switch "Materials | Station Groups" above the list. */
export function SubTabs({ value, onChange }: { value: SubTab; onChange(v: SubTab): void }) {
  return <SegmentedTabs value={value} onChange={onChange} label="Lists" items={(Object.keys(copy.sub) as SubTab[]).map((id) => ({ id, label: copy.sub[id] }))} />;
}
