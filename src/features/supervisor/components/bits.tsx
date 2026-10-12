import { BadgeWithDot } from '@/components/base/badges/badges';
import { STATUS, type ModelId, type Status } from '../model/data';
import side10k from '../assets/sherpa10k-side.webp';
import sideXt from '../assets/xtlite-side.webp';

/** Product pictures per Sherpa model (list thumbnails, fleet chips, details hero). */
export const MODEL_IMG: Record<ModelId, string> = { '10k': side10k, xt: sideXt };

export function StatusBadge({ status, size = 'sm' }: { status: Status; size?: 'sm' | 'md' }) {
  const s = STATUS[status]; return <BadgeWithDot size={size} type="pill-color" color={s.tone}>{s.label}</BadgeWithDot>;
}

/** Sherpa picture with a status dot in the corner. */
export function SherpaThumb({ model, status, size = 40 }: { model: ModelId; status: Status; size?: number }) {
  return <span className="lv-thumb" style={{ width: size, height: size }}><img src={MODEL_IMG[model]} alt="" /><i style={{ background: STATUS[status].color }} /></span>;
}

export const battColor = (b: number) => (b < 25 ? 'var(--color-fg-error-secondary, #f04438)' : b < 50 ? 'var(--color-fg-warning-secondary, #f79009)' : 'var(--color-fg-success-secondary, #17b26a)');
export function Battery({ pct }: { pct: number }) {
  return <span className="lv-batt"><svg width="16" height="10" viewBox="0 0 16 10" aria-hidden><rect x=".5" y=".5" width="13" height="9" rx="2" fill="none" stroke="currentColor" opacity=".5" /><rect x="14" y="3" width="1.5" height="4" rx=".5" fill="currentColor" opacity=".5" /><rect x="2" y="2" width={Math.max(1, (10 * pct) / 100)} height="6" rx="1" fill={battColor(pct)} /></svg>{Math.round(pct)}%</span>;
}
