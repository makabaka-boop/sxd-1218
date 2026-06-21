import type { Medicine, FilterState, PurchaseItem } from '../types';
import { getQuantityStatus, getMedicinePurchaseStatus } from './validation';
import { getMonthStr } from './date';

export function filterMedicines(list: Medicine[], filters: FilterState, purchases: PurchaseItem[] = []): Medicine[] {
  return list.filter((m) => {
    if (filters.category && m.category !== filters.category) return false;
    if (filters.expireMonth && getMonthStr(m.expireDate) !== filters.expireMonth) return false;
    if (filters.quantityStatus && getQuantityStatus(m) !== filters.quantityStatus) return false;
    if (filters.storageLocation && m.storageLocation !== filters.storageLocation) return false;
    if (filters.status && m.status !== filters.status) return false;
    if (filters.purchaseStatus && getMedicinePurchaseStatus(m.id, purchases) !== filters.purchaseStatus) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const hay = `${m.name} ${m.specification} ${m.category} ${m.storageLocation} ${m.usageNotes}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function getUniqueCategories(list: Medicine[]): string[] {
  const s = new Set<string>();
  for (const m of list) if (m.category) s.add(m.category);
  return Array.from(s).sort();
}

export function getUniqueLocations(list: Medicine[]): string[] {
  const s = new Set<string>();
  for (const m of list) if (m.storageLocation) s.add(m.storageLocation);
  return Array.from(s).sort();
}

export function getUniqueMonths(list: Medicine[]): string[] {
  const s = new Set<string>();
  for (const m of list) {
    const ms = getMonthStr(m.expireDate);
    if (ms) s.add(ms);
  }
  return Array.from(s).sort();
}
