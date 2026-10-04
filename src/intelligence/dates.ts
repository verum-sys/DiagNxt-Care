/** Local-date helpers. All care dates are stored as yyyy-mm-dd in the device's local calendar. */

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function today(now: Date = new Date()): string {
  return toISODate(now);
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return toISODate(new Date(y, m - 1, d + n));
}

/** Whole days from a to b (b - a). Positive when b is later. */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export function isValidISODate(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** 0 = Sunday … 6 = Saturday (local calendar). */
export function weekdayIndexFromAnchor(anchorIso: string): number {
  const [y, m, d] = anchorIso.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

export type WeekdayDirection = 'future' | 'past';

/** ISO date of the nearest named weekday relative to anchor (same week logic as field speech). */
export function nearestWeekdayIso(weekdayIndex: number, anchorIso: string, direction: WeekdayDirection): string {
  const anchorDay = weekdayIndexFromAnchor(anchorIso);
  let delta = weekdayIndex - anchorDay;
  if (direction === 'future') {
    if (delta <= 0) delta += 7;
  } else {
    if (delta >= 0) delta -= 7;
    if (delta === 0) delta = -7;
  }
  return addDays(anchorIso, delta);
}
