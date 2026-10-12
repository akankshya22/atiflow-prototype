const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31_536_000_000], ['month', 2_592_000_000], ['week', 604_800_000], ['day', 86_400_000], ['hour', 3_600_000], ['minute', 60_000]];
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' });
const long = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "2 min. ago", "yesterday", "3 wk. ago"... Anything under a minute is `justNow`. */
export function timeAgo(then: number, now: number, justNow = 'Just now'): string {
  const diff = Math.max(0, now - then);
  for (const [unit, ms] of UNITS) {
    if (diff >= ms) { const n = Math.floor(diff / ms); return (unit === 'day' && n === 1 ? long : rtf).format(-n, unit); }
  }
  return justNow;
}
