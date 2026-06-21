import './style.css';
import { store } from './store';
import { exportToCsv } from './utils/csv';
import { filterMedicines, getUniqueCategories, getUniqueLocations, getUniqueMonths } from './utils/filter';
import { validateMedicines, getIssuesByMedicineId, getQuantityStatus, validatePurchases } from './utils/validation';
import { getExpireStatus, daysBetween, parseDate } from './utils/date';
import {
  STATUS_LABELS,
  QUANTITY_STATUS_LABELS,
  EXPIRE_STATUS_LABELS,
  PURCHASE_PRIORITY_LABELS,
  PURCHASE_STATUS_LABELS,
  type Medicine,
  type MedicineStatus,
  type PurchaseItem,
  type PurchasePriority,
  type MedicinePurchaseStatus,
  type PurchaseStatusFilter,
} from './types';
import { getSampleData, getSamplePurchaseItems } from './utils/sample';
import { storage } from './storage';

declare global {
  interface Window {
    lucide: {
      createIcons: (opts?: any) => void;
    };
  }
}

const app = document.getElementById('app')!;

if (store.getMedicines().length === 0) {
  store.initWithData(getSampleData());
  store.initPurchaseData(getSamplePurchaseItems());
}

function h(tag: string, attrs: Record<string, any> = {}, children: any[] = []): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (v !== undefined && v !== null && v !== false) {
      el.setAttribute(k, String(v));
    }
  }
  for (const child of children) {
    if (child == null || child === false) continue;
    if (typeof child === 'string' || typeof child === 'number') {
      el.appendChild(document.createTextNode(String(child)));
    } else if (child instanceof Node) {
      el.appendChild(child);
    } else if (Array.isArray(child)) {
      child.forEach((c) => {
        if (c instanceof Node) el.appendChild(c);
        else if (c != null) el.appendChild(document.createTextNode(String(c)));
      });
    }
  }
  return el;
}

function icon(name: string, extraClass = ''): HTMLElement {
  const i = h('i', { class: `lucide-${name} ${extraClass}` });
  (i as any).setAttribute('data-lucide', name);
  return i;
}

function getStatusBadgeClass(status: MedicineStatus): string {
  switch (status) {
    case 'normal': return 'badge-success';
    case 'to_purchase': return 'badge-warning';
    case 'purchased': return 'badge-primary';
    case 'attention': return 'badge-warning';
    case 'stopped': return 'badge-gray';
  }
}

function getQuantityBadgeClass(status: string): string {
  if (status === 'sufficient') return 'badge-success';
  if (status === 'low') return 'badge-warning';
  return 'badge-danger';
}

function getExpireBadgeClass(status: string): string {
  if (status === 'expired') return 'badge-danger';
  if (status === 'expiring_soon') return 'badge-warning';
  if (status === 'unknown') return 'badge-gray';
  return 'badge-success';
}

function getPriorityBadgeClass(priority: PurchasePriority): string {
  if (priority === 'high') return 'badge-danger';
  if (priority === 'medium') return 'badge-warning';
  return 'badge-gray';
}

function getPurchaseBadgeClass(status: MedicinePurchaseStatus): string {
  if (status === 'pending') return 'badge-warning';
  if (status === 'completed') return 'badge-primary';
  return 'badge-gray';
}

function getHighestSeverityDot(issues: any[]): HTMLElement | null {
  if (issues.length === 0) return null;
  let cls = 'issue-dot-info';
  if (issues.some((i) => i.severity === 'error')) cls = 'issue-dot-error';
  else if (issues.some((i) => i.severity === 'warning')) cls = 'issue-dot-warning';
  const dot = h('span', { class: `issue-dot ${cls}` });
  dot.title = issues.map((i) => i.message).join('\n');
  return dot;
}

function sortList(list: Medicine[], field: keyof Medicine, asc: boolean): Medicine[] {
  return [...list].sort((a, b) => {
    const va = a[field];
    const vb = b[field];
    let cmp = 0;
    if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
    else cmp = String(va).localeCompare(String(vb), 'zh-CN');
    return asc ? cmp : -cmp;
  });
}

function applyPurchaseFilter(status: PurchaseStatusFilter) {
  if (store.getIsMonthlyView()) store.toggleMonthlyView();
  store.setFilters({ purchaseStatus: status });
}

function getStats(medicines: Medicine[], purchases: PurchaseItem[]) {
  const expiringCount = medicines.filter((m) => {
    const s = getExpireStatus(m.expireDate);
    return s === 'expiring_soon' || s === 'expired';
  }).length;
  const lowCount = medicines.filter((m) => getQuantityStatus(m) !== 'sufficient').length;
  const pendingPurchase = purchases.filter((p) => !p.completed).length;
  const completedPurchase = purchases.filter((p) => p.completed).length;
  return {
    total: medicines.length,
    expiring: expiringCount,
    low: lowCount,
    pendingPurchase,
    completedPurchase,
  };
}

function getMonthlyList(medicines: Medicine[]): Medicine[] {
  return medicines.filter((m) => {
    if (m.status === 'stopped') return false;
    const es = getExpireStatus(m.expireDate);
    const qs = getQuantityStatus(m);
    const noNotes = !m.usageNotes || m.usageNotes.trim() === '';
    const pStatus = store.getMedicinePurchaseStatus(m.id);
    return es === 'expiring_soon' || es === 'expired' || qs !== 'sufficient' || noNotes || pStatus === 'pending';
  });
}

function groupByCategory(list: Medicine[]): Map<string, Medicine[]> {
  const map = new Map<string, Medicine[]>();
  for (const m of list) {
    const cat = m.category || '未分类';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(m);
  }
  return map;
}

function renderStats(container: HTMLElement) {
  const all = store.getMedicines();
  const purchases = store.getPurchaseItems();
  const stats = getStats(all, purchases);
  container.innerHTML = '';

  const cards: { label: string; value: number; iconName: string; iconClass: string; onClick?: () => void }[] = [
    { label: '药品总数', value: stats.total, iconName: 'pill-bottle', iconClass: 'stat-icon-total' },
    { label: '临期/过期', value: stats.expiring, iconName: 'clock', iconClass: 'stat-icon-expiring' },
    { label: '库存不足', value: stats.low, iconName: 'package', iconClass: 'stat-icon-low' },
    { label: '待补购', value: stats.pendingPurchase, iconName: 'shopping-cart', iconClass: 'stat-icon-purchase', onClick: () => applyPurchaseFilter('pending') },
    { label: '已完成补购', value: stats.completedPurchase, iconName: 'check-check', iconClass: 'stat-icon-done', onClick: () => applyPurchaseFilter('completed') },
  ];

  const grid = h('div', { class: 'stats-grid' });
  for (const c of cards) {
    const card = h('div', { class: `stat-card ${c.onClick ? 'stat-card-clickable' : ''}`, onClick: c.onClick }, [
      h('div', { class: 'stat-card-header' }, [
        h('div', { class: 'stat-label' }, [c.label]),
        h('div', { class: `stat-icon ${c.iconClass}` }, [icon(c.iconName as any)]),
      ]),
      h('div', { class: 'stat-value' }, [String(c.value)]),
    ]);
    grid.appendChild(card);
  }
  container.appendChild(grid);
  if (window.lucide) window.lucide.createIcons();
}

function renderFilterBar(container: HTMLElement) {
  const all = store.getMedicines();
  const filters = store.getFilters();
  const categories = getUniqueCategories(all);
  const locations = getUniqueLocations(all);
  const months = getUniqueMonths(all);

  container.innerHTML = '';
  const bar = h('div', { class: 'filter-bar' });

  bar.appendChild(h('div', { class: 'filter-item' }, [
    h('div', { class: 'filter-label' }, ['搜索']),
    (() => {
      const input = h('input', {
        class: 'filter-input search-input',
        type: 'text',
        placeholder: '搜索药品名、规格、位置...',
        value: filters.search,
      }) as HTMLInputElement;
      input.addEventListener('input', (e) => {
        store.setFilters({ search: (e.target as HTMLInputElement).value });
      });
      return input;
    })(),
  ]));

  bar.appendChild(h('div', { class: 'filter-item' }, [
    h('div', { class: 'filter-label' }, ['类别']),
    (() => {
      const sel = h('select', { class: 'filter-select' }) as HTMLSelectElement;
      sel.appendChild(h('option', { value: '' }, ['全部类别']));
      for (const c of categories) {
        const opt = h('option', { value: c }, [c]) as HTMLOptionElement;
        if (filters.category === c) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', (e) => store.setFilters({ category: (e.target as HTMLSelectElement).value }));
      return sel;
    })(),
  ]));

  bar.appendChild(h('div', { class: 'filter-item' }, [
    h('div', { class: 'filter-label' }, ['到期月份']),
    (() => {
      const sel = h('select', { class: 'filter-select' }) as HTMLSelectElement;
      sel.appendChild(h('option', { value: '' }, ['全部月份']));
      for (const m of months) {
        const opt = h('option', { value: m }, [m]) as HTMLOptionElement;
        if (filters.expireMonth === m) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', (e) => store.setFilters({ expireMonth: (e.target as HTMLSelectElement).value }));
      return sel;
    })(),
  ]));

  bar.appendChild(h('div', { class: 'filter-item' }, [
    h('div', { class: 'filter-label' }, ['数量状态']),
    (() => {
      const sel = h('select', { class: 'filter-select' }) as HTMLSelectElement;
      const options: [string, string][] = [
        ['', '全部状态'],
        ['sufficient', '充足'],
        ['low', '偏低'],
        ['out_of_stock', '缺货'],
      ];
      for (const [v, l] of options) {
        const opt = h('option', { value: v }, [l]) as HTMLOptionElement;
        if (filters.quantityStatus === v) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', (e) => store.setFilters({ quantityStatus: (e.target as HTMLSelectElement).value as any }));
      return sel;
    })(),
  ]));

  bar.appendChild(h('div', { class: 'filter-item' }, [
    h('div', { class: 'filter-label' }, ['存放位置']),
    (() => {
      const sel = h('select', { class: 'filter-select' }) as HTMLSelectElement;
      sel.appendChild(h('option', { value: '' }, ['全部位置']));
      for (const l of locations) {
        const opt = h('option', { value: l }, [l]) as HTMLOptionElement;
        if (filters.storageLocation === l) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', (e) => store.setFilters({ storageLocation: (e.target as HTMLSelectElement).value }));
      return sel;
    })(),
  ]));

  bar.appendChild(h('div', { class: 'filter-item' }, [
    h('div', { class: 'filter-label' }, ['使用状态']),
    (() => {
      const sel = h('select', { class: 'filter-select' }) as HTMLSelectElement;
      const options: [string, string][] = [
        ['', '全部状态'],
        ['normal', '正常使用'],
        ['to_purchase', '待补购'],
        ['purchased', '已补购'],
        ['attention', '临期关注'],
        ['stopped', '停止使用'],
      ];
      for (const [v, l] of options) {
        const opt = h('option', { value: v }, [l]) as HTMLOptionElement;
        if (filters.status === v) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', (e) => store.setFilters({ status: (e.target as HTMLSelectElement).value as any }));
      return sel;
    })(),
  ]));

  bar.appendChild(h('div', { class: 'filter-item' }, [
    h('div', { class: 'filter-label' }, ['补购状态']),
    (() => {
      const sel = h('select', { class: 'filter-select' }) as HTMLSelectElement;
      const options: [string, string][] = [
        ['', '全部补购'],
        ['pending', '待补购'],
        ['completed', '已补购'],
        ['none', '未加入'],
      ];
      for (const [v, l] of options) {
        const opt = h('option', { value: v }, [l]) as HTMLOptionElement;
        if (filters.purchaseStatus === v) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', (e) => store.setFilters({ purchaseStatus: (e.target as HTMLSelectElement).value as PurchaseStatusFilter }));
      return sel;
    })(),
  ]));

  bar.appendChild(h('div', { class: 'filter-item', style: { alignSelf: 'flex-end' } }, [
    (() => {
      const btn = h('button', { class: 'btn btn-ghost btn-sm' }, [
        icon('rotate-ccw'),
        '重置',
      ]);
      btn.addEventListener('click', () => store.resetFilters());
      return btn;
    })(),
  ]));

  container.appendChild(bar);
  if (window.lucide) window.lucide.createIcons();
}

function renderBatchBar(container: HTMLElement, visibleIds: string[]) {
  const selectedIds = store.getSelectedIds();
  const count = selectedIds.size;
  container.innerHTML = '';
  if (count === 0) return;

  const bar = h('div', { class: 'batch-bar' }, [
    h('span', { class: 'batch-count' }, [`已选 ${count} 项`]),
  ]);

  const purchaseBtn = h('button', { class: 'btn btn-sm btn-warning' }, [
    icon('shopping-cart'),
    '加入补购',
  ]);
  purchaseBtn.addEventListener('click', () => {
    if (confirm(`确认将选中的 ${count} 项加入补购清单？`)) {
      store.batchAddToPurchase(Array.from(selectedIds));
    }
  });
  bar.appendChild(purchaseBtn);

  const divider = h('span', { class: 'batch-divider' });
  bar.appendChild(divider);

  const actions: [MedicineStatus, string, string][] = [
    ['to_purchase', '待补购', 'btn-warning'],
    ['purchased', '已补购', 'btn-primary'],
    ['attention', '临期关注', 'btn-secondary'],
    ['stopped', '停止使用', 'btn-ghost'],
  ];

  for (const [status, label, cls] of actions) {
    const btn = h('button', { class: `btn btn-sm ${cls}` }, [label]);
    btn.addEventListener('click', () => {
      if (confirm(`确认将选中的 ${count} 项标记为「${label}」？`)) {
        store.batchUpdateStatus(Array.from(selectedIds), status);
      }
    });
    bar.appendChild(btn);
  }

  const clearBtn = h('button', { class: 'btn btn-sm btn-ghost' }, ['取消选择']);
  clearBtn.addEventListener('click', () => store.clearSelection());
  bar.appendChild(clearBtn);

  container.appendChild(bar);
  if (window.lucide) window.lucide.createIcons();
}

function renderPurchaseCell(m: Medicine): HTMLElement {
  const td = h('td');
  const status = store.getMedicinePurchaseStatus(m.id);
  const pending = store.getPendingPurchaseByMedicineId(m.id);
  const wrap = h('div', { class: 'purchase-cell' });

  if (status === 'none') {
    const addBtn = h('button', { class: 'btn btn-ghost btn-sm purchase-action' }, [icon('shopping-cart'), '加入补购']);
    addBtn.addEventListener('click', (e) => { e.stopPropagation(); store.addToPurchase(m.id); });
    wrap.appendChild(addBtn);
  } else if (status === 'pending' && pending) {
    wrap.appendChild(h('span', { class: `badge ${getPurchaseBadgeClass(status)}` }, ['待补购']));
    wrap.appendChild(h('span', { class: `badge ${getPriorityBadgeClass(pending.priority)}` }, [PURCHASE_PRIORITY_LABELS[pending.priority]]));
    const doneBtn = h('button', { class: 'btn btn-sm btn-success purchase-action', title: '标记已买并回填库存' }, [icon('check')]);
    doneBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`确认已购买？将补购数量 ${pending.quantity} 回填到库存并更新状态。`)) {
        store.markPurchased(pending.id);
      }
    });
    wrap.appendChild(doneBtn);
    const cancelBtn = h('button', { class: 'btn btn-ghost btn-sm purchase-action', title: '取消补购' }, [icon('x')]);
    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('确认取消此补购项？')) store.removePurchase(pending.id);
    });
    wrap.appendChild(cancelBtn);
  } else {
    const latest = store.getLatestPurchaseByMedicineId(m.id);
    wrap.appendChild(h('span', { class: `badge ${getPurchaseBadgeClass(status)}` }, ['已补购']));
    if (latest && latest.completedAt) {
      wrap.appendChild(h('span', { class: 'purchase-date' }, [latest.completedAt]));
    }
  }

  td.appendChild(wrap);
  return td;
}

function renderTable(container: HTMLElement) {
  const all = store.getMedicines();
  const purchases = store.getPurchaseItems();
  const filters = store.getFilters();
  const sortField = store.getSortField();
  const sortAsc = store.getSortAsc();
  const selected = store.getSelectedIds();
  const issues = [...validateMedicines(all), ...validatePurchases(all, purchases)];
  const issuesMap = new Map<string, any[]>();
  for (const i of issues) {
    if (!issuesMap.has(i.medicineId)) issuesMap.set(i.medicineId, []);
    issuesMap.get(i.medicineId)!.push(i);
  }

  let list = filterMedicines(all, filters, purchases);
  list = sortList(list, sortField, sortAsc);

  container.innerHTML = '';

  if (list.length === 0) {
    container.appendChild(h('div', { class: 'table-container' }, [
      h('div', { class: 'empty-state' }, [
        icon('package-open', 'empty-state-icon'),
        h('div', { class: 'empty-state-title' }, ['暂无药品数据']),
        h('div', { class: 'empty-state-desc' }, ['调整筛选条件，或点击右上角「新增药品」添加记录']),
      ]),
    ]));
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  const cols: { key: keyof Medicine | 'issues' | 'status' | 'quantity' | 'expire' | 'purchase' | 'actions'; label: string; width?: string }[] = [
    { key: 'issues', label: '', width: '40px' },
    { key: 'name', label: '药品名称' },
    { key: 'category', label: '类别' },
    { key: 'specification', label: '规格' },
    { key: 'quantity', label: '剩余/最低' },
    { key: 'expire', label: '到期日期' },
    { key: 'storageLocation', label: '存放位置' },
    { key: 'status', label: '使用状态' },
    { key: 'purchase', label: '补购', width: '200px' },
    { key: 'actions', label: '操作', width: '90px' },
  ];

  const wrapper = h('div', { class: 'table-container' });
  const table = h('table', { class: 'data-table' });
  const thead = h('thead');
  const headRow = h('tr');

  const selectAllCb = h('th', { style: { width: '40px' } });
  const cb = h('input', { type: 'checkbox', class: 'checkbox' }) as HTMLInputElement;
  const allVisibleSelected = list.length > 0 && list.every((m) => selected.has(m.id));
  cb.checked = allVisibleSelected;
  cb.addEventListener('change', () => {
    if (cb.checked) store.selectAll(list.map((m) => m.id));
    else store.clearSelection();
  });
  selectAllCb.appendChild(cb);
  headRow.appendChild(selectAllCb);

  for (const c of cols) {
    const th = h('th', {}, [c.label]);
    if (c.width) th.style.width = c.width;
    if (c.key !== 'issues' && c.key !== 'actions' && c.key !== 'status' && c.key !== 'quantity' && c.key !== 'expire' && c.key !== 'purchase') {
      const sortKey = c.key as keyof Medicine;
      const arrow = h('span', { class: 'sort-arrow' }, [sortField === sortKey ? (sortAsc ? '▲' : '▼') : '↕']);
      th.appendChild(arrow);
      th.addEventListener('click', () => store.setSort(sortKey));
    }
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = h('tbody');
  for (const m of list) {
    const row = h('tr', {});
    const es = getExpireStatus(m.expireDate);
    if (es === 'expired') row.classList.add('row-expired');
    else if (es === 'expiring_soon') row.classList.add('row-expiring');
    if (selected.has(m.id)) row.classList.add('selected');

    const cbTd = h('td');
    const rowCb = h('input', { type: 'checkbox', class: 'checkbox' }) as HTMLInputElement;
    rowCb.checked = selected.has(m.id);
    rowCb.addEventListener('click', (e) => e.stopPropagation());
    rowCb.addEventListener('change', () => store.toggleSelected(m.id));
    cbTd.appendChild(rowCb);
    row.appendChild(cbTd);

    const issueTd = h('td');
    const dot = getHighestSeverityDot(issuesMap.get(m.id) || []);
    if (dot) issueTd.appendChild(dot);
    row.appendChild(issueTd);

    const nameCell = h('td', {}, [
      h('span', { class: 'ellipsis', title: m.name }, [m.name || '-']),
    ]);
    row.appendChild(nameCell);

    row.appendChild(h('td', {}, [m.category || '-']));
    row.appendChild(h('td', {}, [m.specification || '-']));

    const qs = getQuantityStatus(m);
    const qBadge = h('span', { class: `badge ${getQuantityBadgeClass(qs)}` }, [
      `${m.remainingQuantity} / ${m.minimumQuantity}`,
    ]);
    row.appendChild(h('td', {}, [qBadge]));

    const eBadge = h('span', { class: `badge ${getExpireBadgeClass(es)}` });
    if (es === 'unknown') eBadge.textContent = '未设置';
    else if (es === 'expired') eBadge.textContent = `${m.expireDate} (已过期)`;
    else if (es === 'expiring_soon') {
      const d = parseDate(m.expireDate);
      const days = d ? daysBetween(new Date(), d) : 0;
      eBadge.textContent = `${m.expireDate} (${days}天后)`;
    } else eBadge.textContent = m.expireDate;
    row.appendChild(h('td', {}, [eBadge]));

    row.appendChild(h('td', {}, [m.storageLocation || '-']));

    const sBadge = h('span', { class: `badge ${getStatusBadgeClass(m.status)}` }, [STATUS_LABELS[m.status]]);
    row.appendChild(h('td', {}, [sBadge]));

    row.appendChild(renderPurchaseCell(m));

    const actionsTd = h('td');
    const editBtn = h('button', { class: 'btn btn-ghost btn-sm' }, [icon('edit'), '编辑']);
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      store.openDetail(m.id);
    });
    actionsTd.appendChild(editBtn);
    row.appendChild(actionsTd);

    row.addEventListener('click', () => store.openDetail(m.id));
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  wrapper.appendChild(table);
  container.appendChild(wrapper);
  if (window.lucide) window.lucide.createIcons();
}

function renderMonthlyView(container: HTMLElement) {
  const all = store.getMedicines();
  const purchases = store.getPurchaseItems();
  const list = getMonthlyList(all);
  const grouped = groupByCategory(list);

  container.innerHTML = '';

  if (list.length === 0) {
    container.appendChild(h('div', { class: 'monthly-view' }, [
      h('div', { class: 'empty-state' }, [
        icon('party-popper', 'empty-state-icon'),
        h('div', { class: 'empty-state-title' }, ['状态良好！']),
        h('div', { class: 'empty-state-desc' }, ['当前没有需要关注的药品']),
      ]),
    ]));
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  const view = h('div', { class: 'monthly-view' });
  const sortedCats = Array.from(grouped.entries()).sort((a, b) => b[1].length - a[1].length);
  for (const [cat, meds] of sortedCats) {
    const section = h('div', { class: 'monthly-section' }, [
      h('div', { class: 'monthly-header' }, [
        h('span', { class: 'monthly-category-title' }, [cat]),
        h('span', { class: 'monthly-count' }, [`${meds.length}项`]),
      ]),
    ]);
    const cardGrid = h('div', { class: 'monthly-list' });
    for (const m of meds) {
      const es = getExpireStatus(m.expireDate);
      const qs = getQuantityStatus(m);
      const issues = [
        ...getIssuesByMedicineId(all, m.id),
        ...validatePurchases(all, purchases).filter((i) => i.medicineId === m.id),
      ];
      const pStatus = store.getMedicinePurchaseStatus(m.id);
      const pending = store.getPendingPurchaseByMedicineId(m.id);

      const card = h('div', { class: 'monthly-card' });
      card.addEventListener('click', () => store.openDetail(m.id));

      const title = h('div', { class: 'monthly-card-title' });
      const dot = getHighestSeverityDot(issues);
      if (dot) title.appendChild(dot);
      title.appendChild(document.createTextNode(m.name));
      card.appendChild(title);

      if (m.specification) {
        card.appendChild(h('div', { class: 'monthly-card-meta' }, [`规格：${m.specification}`]));
      }

      const meta = h('div', { class: 'monthly-card-meta' });
      meta.appendChild(h('span', { class: `badge ${getQuantityBadgeClass(qs)}` }, [
        `库存 ${m.remainingQuantity}/${m.minimumQuantity}`,
      ]));
      meta.appendChild(h('span', { class: `badge ${getExpireBadgeClass(es)}` }, [
        es === 'unknown' ? '未设置到期' : m.expireDate,
      ]));
      meta.appendChild(h('span', { class: `badge ${getStatusBadgeClass(m.status)}` }, [
        STATUS_LABELS[m.status],
      ]));
      card.appendChild(meta);

      if (m.storageLocation) {
        card.appendChild(h('div', { class: 'monthly-card-meta', style: { marginTop: '8px' } }, [
          icon('map-pin'),
          ` ${m.storageLocation}`,
        ]));
      }

      if (issues.length > 0) {
        const issuesEl = h('div', { class: 'monthly-card-meta', style: { marginTop: '8px', color: 'var(--color-danger)' } }, [
          icon('alert-triangle'),
          ` ${issues.map((i) => i.message).join('；')}`,
        ]);
        card.appendChild(issuesEl);
      }

      const actionRow = h('div', { class: 'monthly-card-action' });
      if (pStatus === 'pending' && pending) {
        actionRow.appendChild(h('span', { class: `badge ${getPriorityBadgeClass(pending.priority)}` }, [
          `${PURCHASE_PRIORITY_LABELS[pending.priority]} · 补 ${pending.quantity}`,
        ]));
        actionRow.appendChild(h('span', { class: 'monthly-action-text' }, [
          `计划 ${pending.plannedDate || '未定日期'}`,
        ]));
        const doneBtn = h('button', { class: 'btn btn-sm btn-success monthly-action-btn' }, [icon('check'), '标记已买']);
        doneBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`确认已购买？将补购数量 ${pending.quantity} 回填到库存并更新状态。`)) {
            store.markPurchased(pending.id);
          }
        });
        actionRow.appendChild(doneBtn);
      } else if (pStatus === 'completed') {
        const latest = store.getLatestPurchaseByMedicineId(m.id);
        actionRow.appendChild(h('span', { class: 'badge badge-primary' }, ['已补购']));
        if (latest && latest.completedAt) {
          actionRow.appendChild(h('span', { class: 'monthly-action-text' }, [`完成于 ${latest.completedAt}`]));
        }
        const againBtn = h('button', { class: 'btn btn-sm btn-secondary monthly-action-btn' }, [icon('shopping-cart'), '再次补购']);
        againBtn.addEventListener('click', (e) => { e.stopPropagation(); store.addToPurchase(m.id); });
        actionRow.appendChild(againBtn);
      } else if (qs !== 'sufficient' || m.status === 'to_purchase') {
        const addBtn = h('button', { class: 'btn btn-sm btn-warning monthly-action-btn' }, [icon('shopping-cart'), '加入补购清单']);
        addBtn.addEventListener('click', (e) => { e.stopPropagation(); store.addToPurchase(m.id); });
        actionRow.appendChild(addBtn);
      } else {
        const addBtn = h('button', { class: 'btn btn-sm btn-ghost monthly-action-btn' }, [icon('plus'), '加入补购']);
        addBtn.addEventListener('click', (e) => { e.stopPropagation(); store.addToPurchase(m.id); });
        actionRow.appendChild(addBtn);
      }
      card.appendChild(actionRow);

      cardGrid.appendChild(card);
    }
    section.appendChild(cardGrid);
    view.appendChild(section);
  }
  container.appendChild(view);
  if (window.lucide) window.lucide.createIcons();
}

function buildPurchaseSection(medicineId: string): HTMLElement {
  const status = store.getMedicinePurchaseStatus(medicineId);
  const pending = store.getPendingPurchaseByMedicineId(medicineId);
  const latest = store.getLatestPurchaseByMedicineId(medicineId);
  const allPurchases = store.getAllPurchasesByMedicineId(medicineId);
  const completedHistory = allPurchases.filter((p) => p.completed);

  const section = h('div', { class: 'purchase-section' });
  section.appendChild(h('div', { class: 'purchase-section-header' }, [
    icon('shopping-cart'),
    h('span', { class: 'purchase-section-title' }, ['补购信息']),
    h('span', { class: `badge ${getPurchaseBadgeClass(status)}` }, [PURCHASE_STATUS_LABELS[status]]),
  ]));

  if (status === 'pending' && pending) {
    section.appendChild(h('div', { class: 'purchase-hint' }, [
      icon('info'),
      ' 标记已买将把补购数量回填到药品库存，并将使用状态更新为「已补购」',
    ]));

    section.appendChild(h('div', { class: 'form-row' }, [
      h('div', { class: 'form-group' }, [
        h('label', { class: 'form-label' }, ['补购数量']),
        (() => {
          const input = h('input', { class: 'form-input', type: 'number', min: '1', value: String(pending.quantity) }) as HTMLInputElement;
          input.addEventListener('input', (e) => store.updatePurchaseField(pending.id, 'quantity', Math.max(1, Number((e.target as HTMLInputElement).value) || 1)));
          return input;
        })(),
      ]),
      h('div', { class: 'form-group' }, [
        h('label', { class: 'form-label' }, ['优先级']),
        (() => {
          const sel = h('select', { class: 'form-select' }) as HTMLSelectElement;
          for (const [v, l] of Object.entries(PURCHASE_PRIORITY_LABELS)) {
            const opt = h('option', { value: v }, [l]) as HTMLOptionElement;
            if (pending.priority === v) opt.selected = true;
            sel.appendChild(opt);
          }
          sel.addEventListener('change', (e) => store.updatePurchaseField(pending.id, 'priority', (e.target as HTMLSelectElement).value as PurchasePriority));
          return sel;
        })(),
      ]),
    ]));

    section.appendChild(h('div', { class: 'form-group' }, [
      h('label', { class: 'form-label' }, ['计划购买日期']),
      (() => {
        const input = h('input', { class: 'form-input', type: 'date', value: pending.plannedDate }) as HTMLInputElement;
        input.addEventListener('input', (e) => store.updatePurchaseField(pending.id, 'plannedDate', (e.target as HTMLInputElement).value));
        return input;
      })(),
    ]));

    section.appendChild(h('div', { class: 'form-group' }, [
      h('label', { class: 'form-label' }, ['补购备注']),
      (() => {
        const ta = h('textarea', { class: 'form-textarea', placeholder: '备注补购渠道、规格偏好等...' }) as HTMLTextAreaElement;
        ta.value = pending.notes;
        ta.addEventListener('input', (e) => store.updatePurchaseField(pending.id, 'notes', (e.target as HTMLTextAreaElement).value));
        return ta;
      })(),
    ]));

    const actions = h('div', { class: 'purchase-actions' });
    const doneBtn = h('button', { class: 'btn btn-success' }, [icon('check'), '标记已买']);
    doneBtn.addEventListener('click', () => {
      if (confirm(`确认已购买？将补购数量 ${pending.quantity} 回填到库存并更新状态。`)) {
        store.markPurchased(pending.id);
      }
    });
    actions.appendChild(doneBtn);
    const cancelBtn = h('button', { class: 'btn btn-ghost' }, [icon('x'), '取消补购']);
    cancelBtn.addEventListener('click', () => {
      if (confirm('确认取消此补购项？')) store.removePurchase(pending.id);
    });
    actions.appendChild(cancelBtn);
    section.appendChild(actions);
  } else {
    if (status === 'completed' && latest) {
      section.appendChild(h('div', { class: 'purchase-hint' }, [
        icon('info'),
        ` 上次补购已于 ${latest.completedAt || '—'} 完成，补购数量 ${latest.quantity}`,
      ]));
    } else {
      section.appendChild(h('div', { class: 'purchase-hint' }, [
        icon('info'),
        ' 将该药品加入补购清单后，可维护补购数量、优先级与计划购买日期',
      ]));
    }
    const addBtn = h('button', { class: 'btn btn-warning' }, [
      icon('shopping-cart'),
      status === 'completed' ? '再次加入补购' : '加入补购清单',
    ]);
    addBtn.addEventListener('click', () => store.addToPurchase(medicineId));
    section.appendChild(h('div', { class: 'purchase-actions' }, [addBtn]));
  }

  if (completedHistory.length > 0) {
    section.appendChild(h('div', { class: 'purchase-history-header' }, [
      icon('history'),
      h('span', { class: 'purchase-history-title' }, [`补购历史（共 ${completedHistory.length} 条）`]),
    ]));
    const historyList = h('div', { class: 'purchase-history-list' });
    for (const p of completedHistory) {
      const row = h('div', { class: 'purchase-history-row' }, [
        h('div', { class: 'purchase-history-date' }, [
          icon('calendar-check'),
          ` ${p.completedAt || '未知日期'}`,
        ]),
        h('div', { class: 'purchase-history-meta' }, [
          h('span', { class: `badge ${getPriorityBadgeClass(p.priority)}` }, [PURCHASE_PRIORITY_LABELS[p.priority]]),
          h('span', { class: 'purchase-history-quantity' }, [`补购 ${p.quantity}`]),
          p.plannedDate ? h('span', { class: 'purchase-history-sub' }, [`计划 ${p.plannedDate}`]) : null,
        ]),
        p.notes ? h('div', { class: 'purchase-history-notes', title: p.notes }, [
          icon('message-square'),
          ` ${p.notes}`,
        ]) : null,
      ]);
      historyList.appendChild(row);
    }
    section.appendChild(historyList);
  }

  return section;
}

function renderDetailPanel(container: HTMLElement) {
  const isOpen = store.getIsFormOpen();
  const editing = store.getEditingMedicine();
  const all = store.getMedicines();
  const purchases = store.getPurchaseItems();
  container.innerHTML = '';

  const overlay = h('div', { class: `detail-panel-overlay ${isOpen ? 'open' : ''}` });
  overlay.addEventListener('click', () => store.closeForm());
  container.appendChild(overlay);

  const panel = h('div', { class: `detail-panel ${isOpen ? 'open' : ''}` });
  if (isOpen && editing) {
    const isEdit = !!store.getDetailMedicineId();
    const issues = isEdit ? [
      ...getIssuesByMedicineId(all, editing.id),
      ...validatePurchases(all, purchases).filter((i) => i.medicineId === editing.id),
    ] : [];

    panel.appendChild(h('div', { class: 'detail-panel-header' }, [
      h('div', { class: 'detail-panel-title' }, [isEdit ? '编辑药品' : '新增药品']),
      (() => {
        const btn = h('button', { class: 'detail-panel-close' }, [icon('x')]);
        btn.addEventListener('click', () => store.closeForm());
        return btn;
      })(),
    ]));

    const body = h('div', { class: 'detail-panel-body' });

    if (issues.length > 0) {
      const il = h('div', { class: 'issues-list' });
      for (const issue of issues) {
        const cls = issue.severity === 'error' ? 'issue-dot-error' : issue.severity === 'warning' ? 'issue-dot-warning' : 'issue-dot-info';
        il.appendChild(h('div', { class: 'issue-item' }, [
          h('span', { class: `issue-dot ${cls}`, style: { marginTop: '5px' } }),
          h('span', {}, [issue.message]),
        ]));
      }
      body.appendChild(il);
    }

    body.appendChild(h('div', { class: 'form-group' }, [
      h('label', { class: 'form-label' }, ['药品名称 *']),
      (() => {
        const input = h('input', { class: 'form-input', type: 'text', value: editing.name, placeholder: '请输入药品名称' }) as HTMLInputElement;
        input.addEventListener('input', (e) => store.updateFormField('name', (e.target as HTMLInputElement).value));
        return input;
      })(),
    ]));

    body.appendChild(h('div', { class: 'form-row' }, [
      h('div', { class: 'form-group' }, [
        h('label', { class: 'form-label' }, ['类别']),
        (() => {
          const input = h('input', { class: 'form-input', type: 'text', value: editing.category, placeholder: '如：感冒用药' }) as HTMLInputElement;
          input.addEventListener('input', (e) => store.updateFormField('category', (e.target as HTMLInputElement).value));
          return input;
        })(),
      ]),
      h('div', { class: 'form-group' }, [
        h('label', { class: 'form-label' }, ['规格']),
        (() => {
          const input = h('input', { class: 'form-input', type: 'text', value: editing.specification, placeholder: '如：0.3g*20粒' }) as HTMLInputElement;
          input.addEventListener('input', (e) => store.updateFormField('specification', (e.target as HTMLInputElement).value));
          return input;
        })(),
      ]),
    ]));

    body.appendChild(h('div', { class: 'form-row' }, [
      h('div', { class: 'form-group' }, [
        h('label', { class: 'form-label' }, ['剩余数量']),
        (() => {
          const input = h('input', { class: 'form-input', type: 'number', min: '0', value: String(editing.remainingQuantity) }) as HTMLInputElement;
          input.addEventListener('input', (e) => store.updateFormField('remainingQuantity', Math.max(0, Number((e.target as HTMLInputElement).value) || 0)));
          return input;
        })(),
      ]),
      h('div', { class: 'form-group' }, [
        h('label', { class: 'form-label' }, ['最低数量']),
        (() => {
          const input = h('input', { class: 'form-input', type: 'number', min: '0', value: String(editing.minimumQuantity) }) as HTMLInputElement;
          input.addEventListener('input', (e) => store.updateFormField('minimumQuantity', Math.max(0, Number((e.target as HTMLInputElement).value) || 0)));
          return input;
        })(),
      ]),
    ]));

    body.appendChild(h('div', { class: 'form-row' }, [
      h('div', { class: 'form-group' }, [
        h('label', { class: 'form-label' }, ['到期日期']),
        (() => {
          const input = h('input', { class: 'form-input', type: 'date', value: editing.expireDate }) as HTMLInputElement;
          input.addEventListener('input', (e) => store.updateFormField('expireDate', (e.target as HTMLInputElement).value));
          return input;
        })(),
      ]),
      h('div', { class: 'form-group' }, [
        h('label', { class: 'form-label' }, ['存放位置']),
        (() => {
          const input = h('input', { class: 'form-input', type: 'text', value: editing.storageLocation, placeholder: '如：客厅药箱' }) as HTMLInputElement;
          input.addEventListener('input', (e) => store.updateFormField('storageLocation', (e.target as HTMLInputElement).value));
          return input;
        })(),
      ]),
    ]));

    body.appendChild(h('div', { class: 'form-group' }, [
      h('label', { class: 'form-label' }, ['使用状态']),
      (() => {
        const sel = h('select', { class: 'form-select' }) as HTMLSelectElement;
        for (const [v, l] of Object.entries(STATUS_LABELS)) {
          const opt = h('option', { value: v }, [l]) as HTMLOptionElement;
          if (editing.status === v) opt.selected = true;
          sel.appendChild(opt);
        }
        sel.addEventListener('change', (e) => store.updateFormField('status', (e.target as HTMLSelectElement).value as any));
        return sel;
      })(),
    ]));

    body.appendChild(h('div', { class: 'form-group' }, [
      h('label', { class: 'form-label' }, ['适用说明']),
      (() => {
        const ta = h('textarea', { class: 'form-textarea', placeholder: '请输入适用症状、用法用量等说明...' }) as HTMLTextAreaElement;
        ta.value = editing.usageNotes;
        ta.addEventListener('input', (e) => store.updateFormField('usageNotes', (e.target as HTMLTextAreaElement).value));
        return ta;
      })(),
    ]));

    if (isEdit) {
      body.appendChild(buildPurchaseSection(editing.id));
    }

    panel.appendChild(body);

    const footer = h('div', { class: 'detail-panel-footer' });
    if (isEdit) {
      const delBtn = h('button', { class: 'btn btn-danger', style: { marginRight: 'auto' } }, [
        icon('trash-2'),
        '删除',
      ]);
      delBtn.addEventListener('click', () => {
        if (confirm('确认删除此药品记录？关联的补购记录也将一并删除。')) {
          store.deleteMedicine(editing.id);
        }
      });
      footer.appendChild(delBtn);
    }
    const cancelBtn = h('button', { class: 'btn btn-secondary' }, ['取消']);
    cancelBtn.addEventListener('click', () => store.closeForm());
    footer.appendChild(cancelBtn);
    const saveBtn = h('button', { class: 'btn btn-primary' }, [icon('save'), '保存']);
    saveBtn.addEventListener('click', () => {
      const current = store.getEditingMedicine();
      if (!current || !current.name.trim()) {
        alert('请填写药品名称');
        return;
      }
      store.saveMedicine();
    });
    footer.appendChild(saveBtn);
    panel.appendChild(footer);
  }
  container.appendChild(panel);
  if (window.lucide) window.lucide.createIcons();
}

function render() {
  app.innerHTML = '';

  const container = h('div', { class: 'app-container' });

  const header = h('div', { class: 'app-header' }, [
    h('div', { class: 'app-title' }, [
      h('div', { class: 'app-title-icon' }, [icon('pill')]),
      '家用药箱管理系统',
    ]),
    h('div', { class: 'header-actions' }, [
      (() => {
        const toggle = h('div', { class: 'view-toggle' });
        const isMonthly = store.getIsMonthlyView();
        const b1 = h('button', { class: !isMonthly ? 'active' : '' }, [icon('table'), '清单视图']);
        b1.addEventListener('click', () => { if (isMonthly) store.toggleMonthlyView(); });
        const b2 = h('button', { class: isMonthly ? 'active' : '' }, [icon('calendar'), '月度补购清单']);
        b2.addEventListener('click', () => { if (!isMonthly) store.toggleMonthlyView(); });
        toggle.appendChild(b1);
        toggle.appendChild(b2);
        return toggle;
      })(),
      (() => {
        const btn = h('button', { class: 'btn btn-secondary' }, [icon('download'), '导出CSV']);
        btn.addEventListener('click', () => exportToCsv(store.getMedicines(), store.getPurchaseItems()));
        return btn;
      })(),
      (() => {
        const btn = h('button', { class: 'btn btn-primary' }, [icon('plus'), '新增药品']);
        btn.addEventListener('click', () => store.openNew());
        return btn;
      })(),
    ]),
  ]);
  container.appendChild(header);

  const statsContainer = h('div');
  renderStats(statsContainer);
  container.appendChild(statsContainer);

  const isMonthly = store.getIsMonthlyView();

  if (!isMonthly) {
    const filterContainer = h('div');
    renderFilterBar(filterContainer);
    container.appendChild(filterContainer);

    const all = store.getMedicines();
    const filters = store.getFilters();
    const list = filterMedicines(all, filters, store.getPurchaseItems());
    const batchContainer = h('div');
    renderBatchBar(batchContainer, list.map((m) => m.id));
    container.appendChild(batchContainer);

    const tableContainer = h('div');
    renderTable(tableContainer);
    container.appendChild(tableContainer);
  } else {
    const monthlyContainer = h('div');
    renderMonthlyView(monthlyContainer);
    container.appendChild(monthlyContainer);
  }

  app.appendChild(container);

  const panelContainer = h('div');
  renderDetailPanel(panelContainer);
  app.appendChild(panelContainer);

  if (window.lucide) window.lucide.createIcons();
}

store.subscribe(render);
render();
