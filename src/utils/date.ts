export function getTodayStr(): string {
  const d = new Date();
  return formatDate(d);
}

export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function daysBetween(a: Date, b: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db.getTime() - da.getTime()) / MS_PER_DAY);
}

export function getExpireStatus(expireDate: string): 'normal' | 'expiring_soon' | 'expired' | 'unknown' {
  const d = parseDate(expireDate);
  if (!d) return 'unknown';
  const today = new Date();
  const diff = daysBetween(today, d);
  if (diff < 0) return 'expired';
  if (diff <= 30) return 'expiring_soon';
  return 'normal';
}

export function getMonthStr(dateStr: string): string {
  if (!dateStr) return '';
  const d = parseDate(dateStr);
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function getAvailableMonths(dateStrs: string[]): string[] {
  const set = new Set<string>();
  for (const s of dateStrs) {
    const m = getMonthStr(s);
    if (m) set.add(m);
  }
  return Array.from(set).sort();
}
