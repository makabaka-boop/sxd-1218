import type { Medicine, PurchaseItem } from './types';

const MEDICINE_STORAGE_KEY = 'medicine_cabinet_data';
const PURCHASE_STORAGE_KEY = 'medicine_cabinet_purchases';

export const storage = {
  loadMedicines(): Medicine[] {
    try {
      const raw = localStorage.getItem(MEDICINE_STORAGE_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },

  saveMedicines(medicines: Medicine[]): void {
    try {
      localStorage.setItem(MEDICINE_STORAGE_KEY, JSON.stringify(medicines));
    } catch (e) {
      console.error('Failed to save medicines to localStorage:', e);
    }
  },

  loadPurchases(): PurchaseItem[] {
    try {
      const raw = localStorage.getItem(PURCHASE_STORAGE_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },

  savePurchases(purchases: PurchaseItem[]): void {
    try {
      localStorage.setItem(PURCHASE_STORAGE_KEY, JSON.stringify(purchases));
    } catch (e) {
      console.error('Failed to save purchases to localStorage:', e);
    }
  },
};
