import type { Medicine, ValidationIssue, QuantityStatus } from '../types';
import { getExpireStatus } from './date';

export function getQuantityStatus(m: Medicine): QuantityStatus {
  if (m.remainingQuantity <= 0) return 'out_of_stock';
  if (m.remainingQuantity < m.minimumQuantity) return 'low';
  return 'sufficient';
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
