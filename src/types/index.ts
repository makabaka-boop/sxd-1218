export type MedicineStatus =
  | 'normal'
  | 'to_purchase'
  | 'purchased'
  | 'attention'
  | 'stopped';

export type QuantityStatus = 'sufficient' | 'low' | 'out_of_stock';

export type ExpireStatus = 'normal' | 'expiring_soon' | 'expired' | 'unknown';

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

export interface FilterState {
  category: string;
  expireMonth: string;
  quantityStatus: QuantityStatus | '';
  storageLocation: string;
  status: MedicineStatus | '';
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
    | 'expiring_soon';
  severity: 'warning' | 'error' | 'info';
  message: string;
}

export interface AppState {
  medicines: Medicine[];
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
