import type { Medicine, ValidationIssue, QuantityStatus, PurchaseItem, MedicinePurchaseStatus } from '../types';
import { getExpireStatus, parseDate, daysBetween } from './date';

export function getQuantityStatus(m: Medicine): QuantityStatus {
  if (m.remainingQuantity <= 0) return 'out_of_stock';
  if (m.remainingQuantity < m.minimumQuantity) return 'low';
  return 'sufficient';
}

export function getMedicinePurchaseStatus(medicineId: string, purchases: PurchaseItem[]): MedicinePurchaseStatus {
  if (purchases.some((p) => p.medicineId === medicineId && !p.completed)) return 'pending';
  if (purchases.some((p) => p.medicineId === medicineId && p.completed)) return 'completed';
  return 'none';
}

export function getActivePurchaseForMedicine(medicineId: string, purchases: PurchaseItem[]): PurchaseItem | null {
  const pending = purchases.find((p) => p.medicineId === medicineId && !p.completed);
  if (pending) return pending;
  const completed = purchases.filter((p) => p.medicineId === medicineId && p.completed);
  if (completed.length === 0) return null;
  return completed.reduce((latest, p) =>
    (p.updatedAt || p.createdAt) > (latest.updatedAt || latest.createdAt) ? p : latest
  );
}

export function validateMedicines(list: Medicine[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Map<string, string[]>();

  for (const m of list) {
    const key = `${m.name.trim().toLowerCase()}|${m.specification.trim().toLowerCase()}`;
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key)!.push(m.id);
  }

  for (const m of list) {
    if (!m.expireDate || m.expireDate.trim() === '') {
      issues.push({
        medicineId: m.id,
        type: 'missing_expire_date',
        severity: 'warning',
        message: '到期日期缺失',
      });
    }

    const qs = getQuantityStatus(m);
    if (qs !== 'sufficient') {
      issues.push({
        medicineId: m.id,
        type: 'low_stock',
        severity: 'warning',
        message: qs === 'out_of_stock' ? '库存为零，需立即补购' : '库存低于最低数量',
      });
    }

    if (!m.usageNotes || m.usageNotes.trim() === '') {
      issues.push({
        medicineId: m.id,
        type: 'empty_notes',
        severity: 'info',
        message: '适用说明为空，建议补充',
      });
    }

    if (m.status === 'stopped' && qs !== 'sufficient') {
      issues.push({
        medicineId: m.id,
        type: 'stopped_in_purchase',
        severity: 'warning',
        message: '已停止使用，建议移除低库存预警状态',
      });
    }

    const es = getExpireStatus(m.expireDate);
    if (es === 'expired') {
      issues.push({
        medicineId: m.id,
        type: 'expired',
        severity: 'error',
        message: '药品已过期',
      });
    } else if (es === 'expiring_soon') {
      issues.push({
        medicineId: m.id,
        type: 'expiring_soon',
        severity: 'warning',
        message: '药品即将到期（30天内）',
      });
    }
  }

  for (const [, ids] of seen) {
    if (ids.length > 1) {
      for (const id of ids) {
        issues.push({
          medicineId: id,
          type: 'duplicate',
          severity: 'info',
          message: '存在同名同规格的重复记录',
        });
      }
    }
  }

  return issues;
}

export function getIssuesByMedicineId(list: Medicine[], id: string): ValidationIssue[] {
  return validateMedicines(list).filter((i) => i.medicineId === id);
}

export function validatePurchases(medicines: Medicine[], purchases: PurchaseItem[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const medMap = new Map(medicines.map((m) => [m.id, m]));

  for (const p of purchases) {
    if (p.completed) continue;
    const m = medMap.get(p.medicineId);
    if (!m) continue;

    if (p.plannedDate) {
      const d = parseDate(p.plannedDate);
      if (d && daysBetween(new Date(), d) < 0) {
        issues.push({
          medicineId: m.id,
          type: 'purchase_overdue',
          severity: 'warning',
          message: '补购计划日期已过，请尽快完成补购',
        });
      }
    }

    if (m.status === 'stopped') {
      issues.push({
        medicineId: m.id,
        type: 'purchase_stopped_conflict',
        severity: 'warning',
        message: '已停止使用但仍有待补购项，建议取消补购',
      });
    }
  }

  return issues;
}
