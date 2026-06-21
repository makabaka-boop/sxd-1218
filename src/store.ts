import type {
  Medicine,
  MedicineStatus,
  MedicinePurchaseStatus,
  PurchaseItem,
  PurchaseInbound,
  PurchasePriority,
  FilterState,
} from './types';
import { storage } from './storage';
import { getTodayStr, formatDate, getExpireStatus } from './utils/date';
import { filterMedicines } from './utils/filter';

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
  purchaseStatus: '',
  search: '',
};

function defaultPlannedDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return formatDate(d);
}

function deriveMedicineStatus(
  current: MedicineStatus,
  remainingQuantity: number,
  minimumQuantity: number,
  expireDate: string,
  hasOtherPending: boolean
): MedicineStatus {
  if (current === 'stopped') return 'stopped';
  if (hasOtherPending) return 'to_purchase';
  if (remainingQuantity <= 0 || remainingQuantity < minimumQuantity) {
    return 'to_purchase';
  }
  const es = getExpireStatus(expireDate);
  if (es === 'expired' || es === 'expiring_soon') {
    return 'attention';
  }
  return 'normal';
}

function createStore() {
  let medicines: Medicine[] = storage.loadMedicines();
  let purchaseItems: PurchaseItem[] = storage.loadPurchases();
  let selectedIds = new Set<string>();
  let filters: FilterState = { ...defaultFilters };
  let isMonthlyView = false;
  let detailMedicineId: string | null = null;
  let isFormOpen = false;
  let editingMedicine: Medicine | null = null;
  let sortField: keyof Medicine = 'updatedAt';
  let sortAsc = false;
  let isCompleteOpen = false;
  let completingPurchaseId: string | null = null;
  let completeDraft = {
    actualQuantity: '',
    actualPurchaseDate: '',
    batchExpireDate: '',
    completionNotes: '',
  };
  const listeners = new Set<Listener>();

  function notify() {
    for (const l of listeners) l();
  }

  function persistMedicines() {
    storage.saveMedicines(medicines);
  }

  function persistPurchases() {
    storage.savePurchases(purchaseItems);
  }

  function completePurchase(id: string, inbound?: PurchaseInbound) {
    const item = purchaseItems.find((p) => p.id === id);
    if (!item || item.completed) return;
    const now = getTodayStr();
    const actualQuantity =
      typeof inbound?.actualQuantity === 'number' && !Number.isNaN(inbound.actualQuantity)
        ? inbound.actualQuantity
        : item.quantity;
    const actualPurchaseDate = inbound?.actualPurchaseDate || now;
    const batchExpireDate = inbound?.batchExpireDate || null;
    const completionNotes = inbound?.completionNotes ?? null;

    purchaseItems = purchaseItems.map((p) =>
      p.id === id
        ? {
            ...p,
            completed: true,
            completedAt: actualPurchaseDate,
            actualQuantity,
            actualPurchaseDate,
            batchExpireDate,
            completionNotes,
            updatedAt: now,
          }
        : p
    );

    medicines = medicines.map((m) => {
      if (m.id !== item.medicineId) return m;
      const remaining = m.remainingQuantity + actualQuantity;
      let expireDate = m.expireDate;
      if (batchExpireDate && (!expireDate || batchExpireDate > expireDate)) {
        expireDate = batchExpireDate;
      }
      const hasOtherPending = purchaseItems.some(
        (p) => p.medicineId === item.medicineId && !p.completed
      );
      let status: MedicineStatus;
      if (m.status === 'stopped') status = 'stopped';
      else if (hasOtherPending) status = 'to_purchase';
      else status = 'purchased';
      return { ...m, remainingQuantity: remaining, expireDate, status, updatedAt: now };
    });

    persistMedicines();
    persistPurchases();
  }

  return {
    subscribe(l: Listener) {
      listeners.add(l);
      return () => listeners.delete(l);
    },

    getMedicines() { return medicines; },
    getPurchaseItems() { return purchaseItems; },
    getSelectedIds() { return selectedIds; },
    getFilters() { return filters; },
    getIsMonthlyView() { return isMonthlyView; },
    getDetailMedicineId() { return detailMedicineId; },
    getIsFormOpen() { return isFormOpen; },
    getEditingMedicine() { return editingMedicine; },
    getSortField() { return sortField; },
    getSortAsc() { return sortAsc; },
    getIsCompleteOpen() { return isCompleteOpen; },
    getCompleteDraft() { return completeDraft; },

    getCompletingPurchase(): PurchaseItem | null {
      if (!completingPurchaseId) return null;
      return purchaseItems.find((p) => p.id === completingPurchaseId) || null;
    },

    getPendingPurchaseByMedicineId(id: string): PurchaseItem | null {
      return purchaseItems.find((p) => p.medicineId === id && !p.completed) || null;
    },

    getLatestPurchaseByMedicineId(id: string): PurchaseItem | null {
      const items = purchaseItems.filter((p) => p.medicineId === id);
      if (items.length === 0) return null;
      return items.reduce((latest, p) =>
        (p.updatedAt || p.createdAt) > (latest.updatedAt || latest.createdAt) ? p : latest
      );
    },

    getAllPurchasesByMedicineId(id: string): PurchaseItem[] {
      return purchaseItems
        .filter((p) => p.medicineId === id)
        .sort((a, b) =>
          (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt)
        );
    },

    getMedicinePurchaseStatus(id: string): MedicinePurchaseStatus {
      if (purchaseItems.some((p) => p.medicineId === id && !p.completed)) return 'pending';
      const m = medicines.find((x) => x.id === id);
      if (m && m.status === 'purchased') return 'completed';
      return 'none';
    },

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
      const visibleIds = new Set(
        filterMedicines(medicines, filters, purchaseItems).map((m) => m.id)
      );
      let changed = false;
      const next = new Set<string>();
      for (const id of selectedIds) {
        if (visibleIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      }
      if (changed) selectedIds = next;
      notify();
    },

    initWithData(data: Medicine[]) {
      medicines = data;
      persistMedicines();
      notify();
    },

    initPurchaseData(data: PurchaseItem[]) {
      purchaseItems = data;
      persistPurchases();
      notify();
    },

    resetFilters() {
      filters = { ...defaultFilters };
      selectedIds = new Set();
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
      persistMedicines();
      isFormOpen = false;
      detailMedicineId = null;
      editingMedicine = null;
      notify();
    },

    deleteMedicine(id: string) {
      medicines = medicines.filter((m) => m.id !== id);
      const hadPurchases = purchaseItems.some((p) => p.medicineId === id);
      purchaseItems = purchaseItems.filter((p) => p.medicineId !== id);
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
      persistMedicines();
      if (hadPurchases) persistPurchases();
      notify();
    },

    batchUpdateStatus(ids: string[], status: MedicineStatus) {
      const now = getTodayStr();
      medicines = medicines.map((m) =>
        ids.includes(m.id) ? { ...m, status, updatedAt: now } : m
      );
      persistMedicines();
      selectedIds = new Set();
      notify();
    },

    addToPurchase(medicineId: string) {
      const m = medicines.find((x) => x.id === medicineId);
      if (!m) return;
      const existing = purchaseItems.find((p) => p.medicineId === medicineId && !p.completed);
      if (existing) {
        notify();
        return;
      }
      const now = getTodayStr();
      const newItem: PurchaseItem = {
        id: genId(),
        medicineId,
        quantity: Math.max(m.minimumQuantity, 1),
        priority: 'medium',
        notes: '',
        plannedDate: defaultPlannedDate(),
        completed: false,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      purchaseItems = [newItem, ...purchaseItems];
      medicines = medicines.map((x) =>
        x.id === medicineId && x.status !== 'stopped'
          ? { ...x, status: 'to_purchase' as MedicineStatus, updatedAt: now }
          : x
      );
      persistMedicines();
      persistPurchases();
      notify();
    },

    updatePurchaseField<K extends keyof PurchaseItem>(id: string, field: K, value: PurchaseItem[K]) {
      const now = getTodayStr();
      purchaseItems = purchaseItems.map((p) =>
        p.id === id ? { ...p, [field]: value, updatedAt: now } : p
      );
      persistPurchases();
      notify();
    },

    removePurchase(id: string) {
      const item = purchaseItems.find((p) => p.id === id);
      if (!item) return;
      purchaseItems = purchaseItems.filter((p) => p.id !== id);
      if (!item.completed && item.medicineId) {
        const now = getTodayStr();
        const m = medicines.find((x) => x.id === item.medicineId);
        if (m) {
          const hasOtherPending = purchaseItems.some(
            (p) => p.medicineId === item.medicineId && !p.completed
          );
          const nextStatus = deriveMedicineStatus(
            m.status,
            m.remainingQuantity,
            m.minimumQuantity,
            m.expireDate,
            hasOtherPending
          );
          if (nextStatus !== m.status) {
            medicines = medicines.map((x) =>
              x.id === item.medicineId
                ? { ...x, status: nextStatus, updatedAt: now }
                : x
            );
            persistMedicines();
          }
        }
      }
      persistPurchases();
      notify();
    },

    markPurchased(id: string, inbound?: PurchaseInbound) {
      completePurchase(id, inbound);
      notify();
    },

    openComplete(purchaseId: string) {
      const item = purchaseItems.find((p) => p.id === purchaseId);
      if (!item || item.completed) return;
      completingPurchaseId = purchaseId;
      completeDraft = {
        actualQuantity: String(item.quantity),
        actualPurchaseDate: getTodayStr(),
        batchExpireDate: '',
        completionNotes: '',
      };
      isCompleteOpen = true;
      notify();
    },

    updateCompleteField<K extends keyof typeof completeDraft>(field: K, value: (typeof completeDraft)[K]) {
      completeDraft = { ...completeDraft, [field]: value };
      notify();
    },

    closeComplete() {
      isCompleteOpen = false;
      completingPurchaseId = null;
      notify();
    },

    confirmComplete() {
      if (!completingPurchaseId) return;
      const id = completingPurchaseId;
      const draft = completeDraft;
      const qRaw = draft.actualQuantity.trim();
      const actualQuantity = qRaw === '' ? null : Math.max(0, Number(qRaw) || 0);
      completePurchase(id, {
        actualQuantity,
        actualPurchaseDate: draft.actualPurchaseDate || null,
        batchExpireDate: draft.batchExpireDate || null,
        completionNotes: draft.completionNotes.trim() || null,
      });
      isCompleteOpen = false;
      completingPurchaseId = null;
      notify();
    },

    batchAddToPurchase(ids: string[]) {
      const now = getTodayStr();
      const plannedDate = defaultPlannedDate();
      const idSet = new Set(ids);
      const existingPending = new Set(
        purchaseItems.filter((p) => !p.completed).map((p) => p.medicineId)
      );
      const newItems: PurchaseItem[] = [];
      for (const id of ids) {
        if (existingPending.has(id)) continue;
        const m = medicines.find((x) => x.id === id);
        if (!m) continue;
        newItems.push({
          id: genId(),
          medicineId: id,
          quantity: Math.max(m.minimumQuantity, 1),
          priority: 'medium' as PurchasePriority,
          notes: '',
          plannedDate,
          completed: false,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      }
      if (newItems.length > 0) {
        purchaseItems = [...newItems, ...purchaseItems];
        medicines = medicines.map((m) =>
          idSet.has(m.id) && m.status !== 'stopped'
            ? { ...m, status: 'to_purchase' as MedicineStatus, updatedAt: now }
            : m
        );
        persistMedicines();
        persistPurchases();
      }
      selectedIds = new Set();
      notify();
    },
  };
}

export const store = createStore();
