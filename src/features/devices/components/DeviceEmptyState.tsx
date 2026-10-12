import { Plus } from '@untitledui/icons';
import { Button } from '@/components/base/buttons/button';
import type { DeviceKind } from '../model/types';

/** First-use screen: illustration, headline, supporting text, optional quick picks, primary action. */
export function DeviceEmptyState({ kind, onAdd }: { kind: DeviceKind; onAdd(preset?: Record<string, string>): void }) {
  const e = kind.empty;
  return (
    <div className="m-auto flex flex-col items-center gap-6 px-6 py-10 text-center">
      <div className="grid size-[240px] max-w-full place-items-center rounded-[20px] shadow-xl">{kind.emptyIllustration}</div>
      <div className="flex max-w-[480px] flex-col items-center gap-1">
        <h2 className="text-display-xs font-semibold text-primary sm:text-display-sm">{e.headline}</h2>
        <p className="text-md text-tertiary">{e.description}</p>
        {e.hint && <p className="text-xs font-medium text-tertiary opacity-80">{e.hint}</p>}
      </div>
      {e.quickPicks && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm font-semibold text-secondary">{e.prompt}</p>
          <div className="flex flex-wrap justify-center gap-6">
            {e.quickPicks.map((p) => (
              <button key={p.value} type="button" onClick={() => onAdd({ hwType: p.value })}
                className="flex size-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-primary bg-secondary text-secondary shadow-xs outline-focus-ring transition hover:bg-primary_hover focus-visible:outline-2">
                <p.icon className="size-14 stroke-1" /><span className="text-xs font-semibold text-primary">{p.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <Button size="md" color="primary" iconLeading={Plus} onPress={() => onAdd()}>{kind.addLabel}</Button>
    </div>
  );
}
