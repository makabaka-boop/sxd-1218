import type { Medicine } from './types';

const STORAGE_KEY = 'medicine_cabinet_data';

export const storage = {
  load(): Medicine[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },

  save(medicines: Medicine[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(medicines));
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
  },
};
