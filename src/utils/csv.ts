import type { Medicine, PurchaseItem } from '../types';
import { STATUS_LABELS, PURCHASE_STATUS_LABELS, PURCHASE_PRIORITY_LABELS } from '../types';
import { getQuantityStatus, getMedicinePurchaseStatus, getActivePurchaseForMedicine } from './validation';
import { QUANTITY_STATUS_LABELS, EXPIRE_STATUS_LABELS } from '../types';
import { getExpireStatus } from './date';

function escapeCsv(v: string): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportToCsv(medicines: Medicine[], purchases: PurchaseItem[] = []): void {
  const headers = [
    '药品名称',
    '类别',
    '规格',
    '剩余数量',
    '最低数量',
    '数量状态',
    '到期日期',
    '到期状态',
    '存放位置',
    '适用说明',
    '使用状态',
    '补购状态',
    '补购数量',
    '优先级',
    '计划购买日期',
    '补购完成时间',
    '补购备注',
    '创建时间',
    '更新时间',
  ];

  const rows = medicines.map((m) => {
    const purchase = getActivePurchaseForMedicine(m.id, purchases);
    const purchaseStatus = getMedicinePurchaseStatus(m.id, purchases, medicines);
    return [
      m.name,
      m.category,
      m.specification,
      String(m.remainingQuantity),
      String(m.minimumQuantity),
      QUANTITY_STATUS_LABELS[getQuantityStatus(m)],
      m.expireDate,
      EXPIRE_STATUS_LABELS[getExpireStatus(m.expireDate)],
      m.storageLocation,
      m.usageNotes,
      STATUS_LABELS[m.status],
      purchaseStatus === 'none' ? '' : PURCHASE_STATUS_LABELS[purchaseStatus],
      purchase ? String(purchase.quantity) : '',
      purchase ? PURCHASE_PRIORITY_LABELS[purchase.priority] : '',
      purchase ? purchase.plannedDate : '',
      purchase && purchase.completedAt ? purchase.completedAt : '',
      purchase ? purchase.notes : '',
      m.createdAt,
      m.updatedAt,
    ];
  });

  const csv = [headers, ...rows].map((r) => r.map(escapeCsv).join(',')).join('\n');
  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `药品清单_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
