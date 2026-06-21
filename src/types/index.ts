export type MedicineStatus =
  | 'normal'
  | 'to_purchase'
  | 'purchased'
  | 'attention'
  | 'stopped';

export type QuantityStatus = 'sufficient' | 'low' | 'out_of_stock';

export type ExpireStatus = 'normal' | 'expiring_soon' | 'expired' | 'unknown';

export type PurchasePriority = 'high' | 'medium' | 'low';

export type MedicinePurchaseStatus = 'none' | 'pending' | 'completed';

export type PurchaseStatusFilter = '' | 'pending' | 'completed' | 'none';

export interface Medicine {
  id: string;
  name: string;
  category: string;
  specification: string;
  remainingQuantity: number;
  minimumQuantity: number;
  expireDate: string;
  storageLocation: string;
  usageNotes: string;
  status: MedicineStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseItem {
  id: string;
  medicineId: string;
  quantity: number;
  priority: PurchasePriority;
  notes: string;
  plannedDate: string;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FilterState {
  category: string;
  expireMonth: string;
  quantityStatus: QuantityStatus | '';
  storageLocation: string;
  status: MedicineStatus | '';
  purchaseStatus: PurchaseStatusFilter;
  search: string;
}

export interface ValidationIssue {
  medicineId: string;
  type:
    | 'missing_expire_date'
    | 'low_stock'
    | 'duplicate'
    | 'stopped_in_purchase'
    | 'empty_notes'
    | 'expired'
    | 'expiring_soon'
    | 'purchase_overdue'
    | 'purchase_stopped_conflict';
  severity: 'warning' | 'error' | 'info';
  message: string;
}

export interface AppState {
  medicines: Medicine[];
  purchaseItems: PurchaseItem[];
  selectedIds: Set<string>;
  filters: FilterState;
  isMonthlyView: boolean;
  detailMedicineId: string | null;
  isFormOpen: boolean;
  editingMedicine: Medicine | null;
}

export const STATUS_LABELS: Record<MedicineStatus, string> = {
  normal: '正常使用',
  to_purchase: '待补购',
  purchased: '已补购',
  attention: '临期关注',
  stopped: '停止使用',
};

export const QUANTITY_STATUS_LABELS: Record<QuantityStatus, string> = {
  sufficient: '充足',
  low: '偏低',
  out_of_stock: '缺货',
};

export const EXPIRE_STATUS_LABELS: Record<ExpireStatus, string> = {
  normal: '正常',
  expiring_soon: '临期',
  expired: '已过期',
  unknown: '未设置',
};

export const PURCHASE_PRIORITY_LABELS: Record<PurchasePriority, string> = {
  high: '高优先',
  medium: '中优先',
  low: '低优先',
};

export const PURCHASE_STATUS_LABELS: Record<MedicinePurchaseStatus, string> = {
  none: '未加入',
  pending: '待补购',
  completed: '已补购',
};
