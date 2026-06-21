import type { Medicine, MedicineStatus, FilterState } from './types';
import { storage } from './storage';
import { getTodayStr } from './utils/date';

type Listener = () => void;

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const defaultFilters: FilterState = {
  category: '',
  expireMonth: '',
  quantityStatus: '',
  storageLocation: '',
  status: '',
  search: '',
};

function createStore() {
  let medicines: Medicine[] = storage.load();
  let selectedIds = new Set<string>();
  let filters: FilterState = { ...defaultFilters };
  let isMonthlyView = false;
  let detailMedicineId: string | null = null;
  let isFormOpen = false;
  let editingMedicine: Medicine | null = null;
  let sortField: keyof Medicine = 'updatedAt';
  let sortAsc = false;
  const listeners = new Set<Listener>();

  function notify() {
    for (const l of listeners) l();
  }

  function persist() {
    storage.save(medicines);
  }

  return {
    subscribe(l: Listener) {
      listeners.add(l);
      return () => listeners.delete(l);
    },

    getMedicines() { return medicines; },
    getSelectedIds() { return selectedIds; },
    getFilters() { return filters; },
    getIsMonthlyView() { return isMonthlyView; },
    getDetailMedicineId() { return detailMedicineId; },
    getIsFormOpen() { return isFormOpen; },
    getEditingMedicine() { return editingMedicine; },
    getSortField() { return sortField; },
    getSortAsc() { return sortAsc; },

    setSort(field: keyof Medicine) {
      if (sortField === field) {
        sortAsc = !sortAsc;
      } else {
        sortField = field;
        sortAsc = true;
      }
      notify();
    },

    setFilters(f: Partial<FilterState>) {
      filters = { ...filters, ...f };
      notify();
    },

    resetFilters() {
      filters = { ...defaultFilters };
      notify();
    },

    toggleMonthlyView() {
      isMonthlyView = !isMonthlyView;
      notify();
    },

    toggleSelected(id: string) {
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      selectedIds = next;
      notify();
    },

    selectAll(ids: string[]) {
      selectedIds = new Set(ids);
      notify();
    },

    clearSelection() {
      selectedIds = new Set();
      notify();
    },

    openDetail(id: string) {
      detailMedicineId = id;
      editingMedicine = medicines.find((m) => m.id === id) || null;
      isFormOpen = true;
      notify();
    },

    openNew() {
      detailMedicineId = null;
      editingMedicine = {
        id: '',
        name: '',
        category: '',
        specification: '',
        remainingQuantity: 0,
        minimumQuantity: 0,
        expireDate: '',
        storageLocation: '',
        usageNotes: '',
        status: 'normal',
        createdAt: '',
        updatedAt: '',
      };
      isFormOpen = true;
      notify();
    },

    closeForm() {
      isFormOpen = false;
      detailMedicineId = null;
      editingMedicine = null;
      notify();
    },

    updateFormField<K extends keyof Medicine>(field: K, value: Medicine[K]) {
      if (!editingMedicine) return;
      editingMedicine = { ...editingMedicine, [field]: value };
      notify();
    },

    saveMedicine() {
      if (!editingMedicine) return;
      const now = getTodayStr();
      const data = editingMedicine as Medicine;
      if (detailMedicineId) {
        medicines = medicines.map((m) =>
          m.id === detailMedicineId
            ? { ...data, id: detailMedicineId, updatedAt: now }
            : m
        );
      } else {
        const newMed: Medicine = {
          ...data,
          id: genId(),
          createdAt: now,
          updatedAt: now,
        };
        medicines = [newMed, ...medicines];
      }
      persist();
      isFormOpen = false;
      detailMedicineId = null;
      editingMedicine = null;
      notify();
    },

    deleteMedicine(id: string) {
      medicines = medicines.filter((m) => m.id !== id);
      if (selectedIds.has(id)) {
        const next = new Set(selectedIds);
        next.delete(id);
        selectedIds = next;
      }
      if (detailMedicineId === id) {
        detailMedicineId = null;
        editingMedicine = null;
        isFormOpen = false;
      }
      persist();
      notify();
    },

    batchUpdateStatus(ids: string[], status: MedicineStatus) {
      const now = getTodayStr();
      medicines = medicines.map((m) =>
        ids.includes(m.id) ? { ...m, status, updatedAt: now } : m
      );
      persist();
      selectedIds = new Set();
      notify();
    },
  };
}

export const store = createStore();
