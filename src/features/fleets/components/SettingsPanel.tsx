import { copy } from '../copy';

/** Settings tab: shown in the design, content not defined yet. */
export function SettingsPanel(_: { fleet: string }) {
  return <p className="rounded-xl border border-dashed border-primary p-10 text-center text-sm text-tertiary">{copy.settings.soon}</p>;
}
