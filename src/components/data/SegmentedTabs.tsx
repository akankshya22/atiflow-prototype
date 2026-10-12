import { Tabs } from '@/components/application/tabs/tabs';

/** Segmented switch ("Materials | Station Groups"): a small pill-style tab bar for switching between lists inside a panel. */
export function SegmentedTabs<T extends string>({ value, onChange, items, label }: { value: T; onChange(v: T): void; items: { id: T; label: string }[]; label: string }) {
  return (
    <Tabs selectedKey={value} onSelectionChange={(k) => onChange(k as T)} className="w-auto">
      <Tabs.List type="button-border" size="sm" aria-label={label} items={items} />
    </Tabs>
  );
}
