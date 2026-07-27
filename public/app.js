const PALETTE = [
  { bg: '#E3F5EA', accent: '#2E9E5B' }, // green - bast-like
  { bg: '#FCF1DA', accent: '#E0A93A' }, // amber
  { bg: '#E9E2FA', accent: '#8B6FD6' }, // purple
  { bg: '#FBE3E0', accent: '#E07A6B' }, // red/pink
  { bg: '#DDEBFB', accent: '#4C8FE0' }, // blue
  { bg: '#E0F7F4', accent: '#2BB6A3' }, // teal
  { bg: '#FDEAF3', accent: '#D6649E' }, // pink
];

let dashboardData = null;
let currentMenu = '__all__';
// explicit submenu grouping (overrides auto grouping)
const GROUP_MAP = {
  FBB: ['SP#8', 'SP#16', 'SP#20'],
  HEM: ['SP#27', 'SP#28']
};

function fmtMoney(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.00$/, '') + ' M';
  if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.00$/, '') + ' Jt';
  return Number(n).toLocaleString('id-ID');
}

function fmtNumber(n) {
  return Number(n).toLocaleString('id-ID');
}

// Status "00. DROP" (or any numbering + "Drop") is excluded from potensi/nilai totals.
function isDropStatus(status) {
  return /^\s*\d*\.?\s*drop\b/i.test((status || '').toString());
}

function getStatusDisplay(status) {
  const text = (status || '').toString().trim();
  if (!text) return { label: '-', title: '' };

  const normalized = text.replace(/^\s*\d+(?:\.\d+)?\s*\.?\s*/, '');
  return {
    label: text,
    title: normalized ? `(${normalized})` : ''
  };
}

// Strips the leading numbering (e.g. "01. ") from a status string, used for compact column headers.
function shortStatusLabel(status) {
  const text = (status || '').toString().trim();
  const normalized = text.replace(/^\s*\d+(?:\.\d+)?\s*\.?\s*/, '').trim();
  return normalized || text || '-';
}

async function loadData() {
  try {
    const res = await fetch('/api/dashboard');
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Gagal memuat data');
    dashboardData = json;
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('dashboardContent').style.display = 'grid';
    document.getElementById('updatedAt').textContent = new Date(json.updatedAt).toLocaleString('id-ID');
    renderSidebar();
    render();
  } catch (err) {
    document.getElementById('loadingState').style.display = 'none';
    const box = document.getElementById('errorState');
    box.style.display = 'block';
    box.textContent = 'Gagal memuat data: ' + err.message + '. Pastikan Service Account sudah punya akses "Viewer" ke Google Sheet, dan ENV variable sudah benar di Railway.';
  }
}

function renderSidebar() {
  const nav = document.getElementById('sidebarMenu');
  // clear all but the first "Dashboard" button
  nav.querySelectorAll('button[data-menu]:not([data-menu="__all__"])').forEach(b => b.remove());
  nav.querySelectorAll('.menu-group').forEach(g => g.remove());
  // Build groups from explicit GROUP_MAP but only include existing menus
  const existingMenus = new Set(dashboardData.menus || []);
  const groups = Object.keys(GROUP_MAP).map(k => ({ group: k, items: GROUP_MAP[k].filter(m => existingMenus.has(m)) }));

  groups.forEach(group => {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'menu-group';

    const groupLabel = document.createElement('div');
    groupLabel.className = 'menu-group-label';
    groupLabel.dataset.group = group.group;
    groupLabel.innerHTML = `<span class="menu-group-toggle">▼</span> ${group.group}`;
    groupDiv.appendChild(groupLabel);

    const filterBtn = document.createElement('button');
    filterBtn.className = 'menu-group-filter';
    filterBtn.textContent = 'Filter';
    filterBtn.style.marginLeft = '8px';
    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectGroup(group.group);
    });
    groupLabel.appendChild(filterBtn);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'menu-group-clear';
    clearBtn.textContent = 'Clear';
    clearBtn.style.marginLeft = '6px';
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectMenu('__all__');
    });
    groupLabel.appendChild(clearBtn);

    groupLabel.addEventListener('click', () => {
      const container = groupDiv.querySelector('.menu-group-items');
      const toggle = groupDiv.querySelector('.menu-group-toggle');
      const isCollapsed = container.style.display === 'none';
      container.style.display = isCollapsed ? 'block' : 'none';
      toggle.textContent = isCollapsed ? '▼' : '▶';
      localStorage.setItem(`menuGroupCollapsed_${group.group}`, isCollapsed ? 'false' : 'true');
    });

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'menu-group-items';
    itemsContainer.style.display = localStorage.getItem(`menuGroupCollapsed_${group.group}`) === 'true' ? 'none' : 'block';

    group.items.forEach(menu => {
      const btn = document.createElement('button');
      btn.className = 'menu-item menu-item-sub';
      btn.dataset.menu = menu;
      btn.innerHTML = `<span class="menu-icon">📄</span> <span>${menu}</span>`;
      btn.addEventListener('click', () => selectMenu(menu));
      itemsContainer.appendChild(btn);
    });

    groupDiv.appendChild(itemsContainer);
    nav.appendChild(groupDiv);
  });

  // Append any menus not included in groups
  dashboardData.menus.forEach(menu => {
    const inAnyGroup = Object.values(GROUP_MAP).some(arr => arr.includes(menu));
    if (!inAnyGroup) {
      const btn = document.createElement('button');
      btn.className = 'menu-item';
      btn.dataset.menu = menu;
      btn.innerHTML = `<span class="menu-icon">📁</span> <span>${menu}</span>`;
      btn.addEventListener('click', () => selectMenu(menu));
      nav.appendChild(btn);
    }
  });

  // ensure group active/clear states reflect currentMenu
  document.querySelectorAll('.menu-group-label').forEach(lbl => lbl.classList.remove('active'));
  if (currentMenu && currentMenu.startsWith('__group__')) {
    const g = currentMenu.replace('__group__', '');
    const lbl = document.querySelector(`.menu-group-label[data-group="${g}"]`);
    if (lbl) lbl.classList.add('active');
  }

  document.querySelector('.menu-item[data-menu="__all__"]').addEventListener('click', () => selectMenu('__all__'));
}

function selectMenu(menu) {
  currentMenu = menu;
  document.querySelectorAll('.menu-item, .menu-item-sub').forEach(b => {
    b.classList.toggle('active', b.dataset.menu === menu);
  });
  const title = menu === '__all__' ? 'Semua Project' : menu;
  document.getElementById('pageSubtitle').innerHTML = `${title} &middot; Update terakhir: <span id="updatedAt">${new Date(dashboardData.updatedAt).toLocaleString('id-ID')}</span>`;
  render();
}

// wrap render call to update group label active state as well
const originalRender = render;
render = function() {
  originalRender();
  updateGroupLabelActive();
};

function selectGroup(groupName) {
  currentMenu = `__group__${groupName}`;
  // mark group items as active
  document.querySelectorAll('.menu-item, .menu-item-sub').forEach(b => {
    const inGroup = (GROUP_MAP[groupName] || []).includes(b.dataset.menu);
    b.classList.toggle('active', inGroup);
  });
  const title = groupName;
  document.getElementById('pageSubtitle').innerHTML = `${title} &middot; Update terakhir: <span id="updatedAt">${new Date(dashboardData.updatedAt).toLocaleString('id-ID')}</span>`;
  render();
}

// ensure group label active state when selecting individual menu or clearing
function updateGroupLabelActive() {
  document.querySelectorAll('.menu-group-label').forEach(lbl => lbl.classList.remove('active'));
  if (currentMenu && currentMenu.startsWith('__group__')) {
    const g = currentMenu.replace('__group__', '');
    const lbl = document.querySelector(`.menu-group-label[data-group="${g}"]`);
    if (lbl) lbl.classList.add('active');
  }
}

function getFilteredRecords() {
  if (currentMenu === '__all__') return dashboardData.records;
  if (currentMenu && currentMenu.startsWith('__group__')) {
    const groupName = currentMenu.replace('__group__', '');
    const menus = GROUP_MAP[groupName] || [];
    return dashboardData.records.filter(r => menus.includes(r.menu));
  }
  return dashboardData.records.filter(r => r.menu === currentMenu);
}

function parseStatusOrder(status) {
  const match = String(status || '').match(/^\s*(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function computeStatusGroups(records) {
  const map = new Map();
  records.forEach(rec => {
    const key = rec.status || '(Belum ada status)';
    if (!map.has(key)) map.set(key, { status: key, count: 0, total: 0, items: [] });
    const e = map.get(key);
    e.count += 1;
    // DROP rows are still counted (LOP count) but excluded from the value total
    if (!isDropStatus(rec.status)) e.total += rec.value;
    e.items.push(rec);
  });
  return Array.from(map.values()).sort((a, b) => {
    const orderA = parseStatusOrder(a.status);
    const orderB = parseStatusOrder(b.status);
    if (orderA !== orderB) return orderA - orderB;
    return a.status.localeCompare(b.status);
  });
}

// Groups BAST-month data (column AS) by "YYYY-MM", respecting the current menu filter.
// DROP rows are still counted as LOP but excluded from the value total, same rule as elsewhere.
function computeBastTrend(records) {
  const map = new Map();
  records.forEach(rec => {
    if (!rec.bastMonth || !rec.bastMonth.key) return;
    const { key, label } = rec.bastMonth;
    if (!map.has(key)) map.set(key, { key, label, count: 0, total: 0 });
    const e = map.get(key);
    e.count += 1;
    if (!isDropStatus(rec.status)) e.total += rec.value;
  });
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}

// Builds a Lokasi x Status matrix: for every location, how many LOP (and how much value)
// sit in each status column. DROP status is excluded entirely (not a useful column here).
function computeLocationStatusMatrix(records, statuses) {
  const locMap = new Map();
  records.forEach(rec => {
    if (isDropStatus(rec.status)) return;
    const loc = (rec.location || '').toString().trim() || '(Tanpa lokasi)';
    if (!locMap.has(loc)) {
      const statusCells = {};
      statuses.forEach(s => { statusCells[s] = { count: 0, total: 0 }; });
      locMap.set(loc, { location: loc, statuses: statusCells, totalCount: 0, totalValue: 0 });
    }
    const entry = locMap.get(loc);
    if (!entry.statuses[rec.status]) entry.statuses[rec.status] = { count: 0, total: 0 };
    entry.statuses[rec.status].count += 1;
    entry.statuses[rec.status].total += rec.value;
    entry.totalCount += 1;
    entry.totalValue += rec.value;
  });
  return Array.from(locMap.values()).sort((a, b) => b.totalCount - a.totalCount);
}

function render() {
  const records = getFilteredRecords();
  const statusGroups = computeStatusGroups(records);
  // build smile groups from the `status` column (same basis as the STATUS SMILE table)
  const rawStatusSmileGroups = computeStatusGroups(records);
  // hide Drop from the matrix but keep header/count consistent with table
  const statusSmileGroups = rawStatusSmileGroups.filter(g => !isDropStatus(g.status));
  const statusLapGroups = computeStatusGroups(records.map(r => ({ ...r, status: r.statusLap })));
  const pmtaGroups = computeStatusGroups(records.filter(r => r.hasPMTA));
  const summaryGroups = pmtaGroups.length ? pmtaGroups : statusGroups;
  const bastTrend = computeBastTrend(records);

  // Total Potensi: DROP rows excluded from the value sum, still counted as LOP
  const totalPotensi = records.reduce((s, r) => s + (isDropStatus(r.status) ? 0 : r.value), 0);
  document.getElementById('statPotensi').textContent = 'Rp ' + fmtMoney(totalPotensi);
  document.getElementById('statPotensiSub').textContent = fmtNumber(records.length) + ' LOP';
  // show total status count same as STATUS SMILE table
  document.getElementById('statStatus').textContent = rawStatusSmileGroups.length;
  document.getElementById('statBranch').textContent = dashboardData.menus.length;

  document.getElementById('statusDetailPanel').style.display = 'none';
  document.getElementById('statusDetailPanel').innerHTML = '';

  renderProgressOverview(statusGroups, records.length, statusLapGroups, records);
  renderStatusTable(statusGroups);
  renderStatusFisikTable(statusLapGroups);
  renderStatusMatrix(records, statusSmileGroups);
  renderBastTrend(bastTrend);
}

function renderProgressOverview(statusGroups, totalCount, statusLapGroups, records) {
  const container = document.getElementById('progressOverview');
  container.innerHTML = '';

  // summary cards: top icon style similar to reference (selesai / progress / belum / total)
  const summaryWrap = document.createElement('div');
  summaryWrap.className = 'progress-summary';

  const bastGroup = statusGroups.find(g => /^\s*08\b|\bBAST\b/i.test(g.status));
  const bastValue = bastGroup ? bastGroup.total : 0;
  const bastLabel = bastGroup ? 'BAST' : '-';

  const potensiBulanIni = records
    .filter(r => {
      const v = (r.statusLap || '').toString().toLowerCase();
      return v.includes('golive') || v.includes('ut') || v.includes('pemberkasan');
    })
    .filter(r => !isDropStatus(r.status))
    .reduce((s, r) => s + r.value, 0);

  // TOTAL NILAI: DROP status group's total is excluded (its total is already 0 from computeStatusGroups,
  // but filtered explicitly here too for clarity/safety)
  const totalNilai = statusGroups
    .filter(g => !isDropStatus(g.status))
    .reduce((s, g) => s + g.total, 0);

  const cards = [
    { icon: '📊', label: 'TOTAL LOP', val: fmtNumber(totalCount), sub: '', action: 'all' },
    { icon: '🏷️', label: 'POTENSI (BULAN INI)', val: 'Rp ' + fmtMoney(potensiBulanIni), sub: 'Status Fisik', action: 'potensi' },
    { icon: '🥇', label: bastLabel, val: 'Rp ' + fmtMoney(bastValue), sub: '(Nilai BAST)', action: 'bast' },
    { icon: '💰', label: 'TOTAL NILAI', val: 'Rp ' + fmtMoney(totalNilai), sub: '', action: 'all' },
  ];

  cards.forEach(c => {
    const div = document.createElement('div');
    div.className = 'progress-card';
    div.innerHTML = `<div class="icon">${c.icon}</div><div class="val">${c.val}</div><div class="lbl">${c.label}</div><div class="sub">${c.sub}</div>`;
    div.style.cursor = 'pointer';
    div.addEventListener('click', () => showProgressModal(c.action));
    summaryWrap.appendChild(div);
  });
  container.appendChild(summaryWrap);

  // progress bar track
  const track = document.createElement('div');
  track.className = 'progress-bar-track';
  statusGroups.forEach((g, i) => {
    const seg = document.createElement('div');
    const pct = totalCount > 0 ? (g.count / totalCount) * 100 : 0;
    seg.className = 'progress-bar-seg';
    seg.style.width = pct + '%';
    seg.style.background = PALETTE[i % PALETTE.length].accent;
    seg.title = `${g.status}: ${g.count} LOP`;
    track.appendChild(seg);
  });
  container.appendChild(track);
}

function renderStatusTable(statusGroups) {
  const tbody = document.getElementById('statusTableBody');
  tbody.innerHTML = '';
  statusGroups.forEach((g, i) => {
    const tr = document.createElement('tr');
    const color = PALETTE[i % PALETTE.length].accent;
    tr.className = 'clickable-status';
    tr.innerHTML = `
      <td><span class="status-dot" style="background:${color}"></span>${g.status}</td>
      <td>${fmtNumber(g.count)}</td>
      <td style="color:${color}; font-weight:600; text-align:right;">Rp ${fmtMoney(g.total)}</td>
    `;
    tr.addEventListener('click', () => showStatusDetail(g.status));
    tbody.appendChild(tr);
  });
  if (statusGroups.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#999;">Tidak ada data</td></tr>';
  }
}

function renderStatusFisikTable(statusGroups) {
  const tbody = document.getElementById('statusFisikBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  statusGroups.forEach((g, i) => {
    const tr = document.createElement('tr');
    const color = PALETTE[i % PALETTE.length].accent;
    tr.innerHTML = `
      <td><span class="status-dot" style="background:${color}"></span>${g.status}</td>
      <td>${fmtNumber(g.count)}</td>
      <td style="color:${color}; font-weight:600; text-align:right;">Rp ${fmtMoney(g.total)}</td>
    `;
    tr.classList.add('clickable-status');
    tr.addEventListener('click', () => showStatusModal({ type: 'lap', status: g.status }));
    tbody.appendChild(tr);
  });
  if (statusGroups.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#999;">Tidak ada data</td></tr>';
  }
}

// ---- BAST trend (kolom AS) ----
function renderBastTrend(trend) {
  const container = document.getElementById('bastTrendBody');
  if (!container) return;
  container.innerHTML = '';

  if (!trend || trend.length === 0) {
    container.innerHTML = '<div style="color:#999; padding:16px; text-align:center;">Tidak ada data BAST (kolom AS kosong)</div>';
    return;
  }

  const maxVal = Math.max(...trend.map(t => t.total), 1);

  const chart = document.createElement('div');
  chart.className = 'bast-trend-chart';

  trend.forEach((t, i) => {
    const barPct = Math.max((t.total / maxVal) * 100, 3);
    const color = PALETTE[i % PALETTE.length].accent;

    const col = document.createElement('div');
    col.className = 'bast-trend-col';
    col.innerHTML = `
      <div class="bast-trend-value">Rp ${fmtMoney(t.total)}</div>
      <div class="bast-trend-bar-track">
        <div class="bast-trend-bar" style="height:${barPct}%; background:${color};"></div>
      </div>
      <div class="bast-trend-label">${t.label}</div>
      <div class="bast-trend-count">${fmtNumber(t.count)} LOP</div>
    `;
    col.style.cursor = 'pointer';
    col.addEventListener('click', () => showBastMonthModal(t));
    chart.appendChild(col);
  });

  container.appendChild(chart);
}

function showBastMonthModal(t) {
  const records = getFilteredRecords().filter(r => r.bastMonth && r.bastMonth.key === t.key);
  const totalValue = records.reduce((s, r) => s + (isDropStatus(r.status) ? 0 : r.value), 0);
  const fileName = createExportFileName('bast', t.label);
  openModal(`Trend BAST - ${t.label}`, records, records.length, totalValue, fileName);
}

// ---- Modal: list view + click-through full detail ----
let modalState = null; // { title, rows, count, totalValue, fileName }

function openModal(title, rows, count, totalValue, fileName) {
  modalState = { title, rows, count, totalValue, fileName };
  renderModalListView();

  const overlay = document.getElementById('modalOverlay');
  overlay.style.display = 'flex';

  const closeBtn = document.getElementById('modalClose');
  const downloadBtn = document.getElementById('modalDownload');
  function hide() { overlay.style.display = 'none'; }
  closeBtn.onclick = hide;
  overlay.onclick = (e) => { if (e.target === overlay) hide(); };
  downloadBtn.onclick = () => downloadExcelWithRaw(modalState.rows, modalState.fileName || 'export.xlsx');
}

function renderModalListView() {
  const { title, rows, count, totalValue } = modalState;
  document.getElementById('modalTitle').textContent = title;
  const body = document.getElementById('modalBody');

  const summaryHtml = `
    <div class="modal-summary">
      <div class="item">Jumlah LOP: <strong>${fmtNumber(count)}</strong></div>
      <div class="item">Total Nilai: <strong>Rp ${fmtMoney(totalValue)}</strong></div>
    </div>`;

  const rowsHtml = rows.map((r, idx) => `
    <tr class="modal-row" data-idx="${idx}" title="Klik untuk lihat detail lengkap">
      <td>${r.menu || '-'}</td>
      <td>${r.location || '-'}</td>
      <td>${r.pmta || '-'}</td>
      <td>${r.status || '-'}</td>
      <td>${r.statusLap || '-'}</td>
      <td style="text-align:right;">Rp ${fmtMoney(r.value)}</td>
    </tr>
  `).join('');

  body.innerHTML = `
    ${summaryHtml}
    <table class="modal-table">
      <thead>
        <tr>
          <th>Project</th>
          <th>Lokasi</th>
          <th>PM TA</th>
          <th>Status Smile</th>
          <th>Status Fisik</th>
          <th style="text-align:right;">Nilai</th>
        </tr>
      </thead>
      <tbody>${rowsHtml || '<tr><td colspan="6" style="text-align:center;color:#999;">Tidak ada data</td></tr>'}</tbody>
    </table>
  `;

  body.querySelectorAll('tr.modal-row').forEach(tr => {
    tr.addEventListener('click', () => {
      const idx = Number(tr.dataset.idx);
      renderModalDetailView(modalState.rows[idx]);
    });
  });
}

function renderModalDetailView(record) {
  const headerRow = (dashboardData && dashboardData.totals && dashboardData.totals.headerRow) || [];
  const raw = record.raw || [];
  const body = document.getElementById('modalBody');

  document.getElementById('modalTitle').textContent = `Detail LOP${record.location ? ' - ' + record.location : ''}`;

  const detailRowsHtml = headerRow.length
    ? headerRow.map((h, i) => {
        const val = raw[i] != null && raw[i] !== '' ? raw[i] : '-';
        return `<tr><td class="detail-key">${h || `Kolom ${i + 1}`}</td><td class="detail-val">${val}</td></tr>`;
      }).join('')
    : raw.map((val, i) => `<tr><td class="detail-key">Kolom ${i + 1}</td><td class="detail-val">${val || '-'}</td></tr>`).join('');

  body.innerHTML = `
    <button id="modalBackBtn" class="modal-back-btn">← Kembali ke daftar</button>
    <table class="modal-table detail-full-table">
      <tbody>${detailRowsHtml || '<tr><td style="text-align:center;color:#999;">Tidak ada detail</td></tr>'}</tbody>
    </table>
  `;

  document.getElementById('modalBackBtn').addEventListener('click', renderModalListView);
}

function showProgressModal(action) {
  let records = getFilteredRecords();
  let title = 'Semua Data';
  if (action === 'potensi') {
    records = records.filter(r => {
      const v = (r.statusLap || '').toString().toLowerCase();
      return v.includes('golive') || v.includes('ut') || v.includes('pemberkasan');
    });
    title = 'Potensi (Bulan Ini)';
  } else if (action === 'bast') {
    records = records.filter(r => /\b08\b|\bBAST\b/i.test((r.status || '').toString()));
    title = 'BAST';
  } else if (action === 'all') {
    title = 'Semua Data';
  }

  const totalValue = records.reduce((s, r) => s + (isDropStatus(r.status) ? 0 : r.value), 0);
  const count = records.length;
  const fileName = createExportFileName('progress', title);
  openModal(title, records, count, totalValue, fileName);
}

function normalizeFileName(name) {
  return name.toString().trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '').toLowerCase();
}

function createExportFileName(type, status, filterLabel) {
  const base = type === 'lap' ? 'status_lap' : (type === 'bast' ? 'trend_bast' : 'status_smile');
  const statusKey = normalizeFileName(status || 'all');
  const labelKey = filterLabel ? `_${normalizeFileName(filterLabel)}` : '';
  return `${base}_${statusKey}${labelKey}.xlsx`;
}

function downloadExcelWithRaw(records, fileName) {
  const headerRow = (dashboardData && dashboardData.totals && dashboardData.totals.headerRow) || [];
  const rows = records.map(rec => {
    const raw = rec.raw || [];
    const row = [];
    for (let i = 0; i < headerRow.length; i += 1) {
      row.push(raw[i] != null ? raw[i] : '');
    }
    return row;
  });
  const worksheetData = [headerRow, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(worksheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, fileName);
}

function showStatusModal({type, status, filterLabel}) {
  const needle = (status || '').toString().trim().toLowerCase();
  const labelNeedle = filterLabel ? filterLabel.toString().trim().toLowerCase() : '';

  const records = getFilteredRecords().filter(r => {
    const statusValue = ((type === 'lap' ? r.statusLap : r.status) || '').toString().trim().toLowerCase();
    const statusMatches = needle === '' ? false : statusValue.includes(needle);
    if (!statusMatches) return false;
    if (!labelNeedle) return true;
    return ((r.pmta || '').toString().trim().toLowerCase().includes(labelNeedle) ||
            (r.menu || '').toString().trim().toLowerCase().includes(labelNeedle));
  });

  const title = type === 'lap'
    ? `Status Fisik: ${status}${labelNeedle ? ` • ${filterLabel}` : ''}`
    : `Status Smile: ${status}${labelNeedle ? ` • ${filterLabel}` : ''}`;

  const totalValue = records.reduce((sum, r) => sum + (isDropStatus(r.status) ? 0 : r.value), 0);
  const count = records.length;
  const fileName = createExportFileName(type, status, filterLabel);
  openModal(title, records, count, totalValue, fileName);
}

function showStatusDetail(status) {
  showStatusModal({ type: 'smile', status });
  const detailPanel = document.getElementById('statusDetailPanel');
  detailPanel.style.display = 'none';
  detailPanel.innerHTML = '';
}

// Opens the modal for a single Lokasi x Status cell (exact location + exact status match).
function showLocationStatusModal(location, status) {
  const records = getFilteredRecords().filter(r => {
    const recLoc = (r.location || '').toString().trim() || '(Tanpa lokasi)';
    return recLoc === location && r.status === status;
  });
  const totalValue = records.reduce((sum, r) => sum + (isDropStatus(r.status) ? 0 : r.value), 0);
  const count = records.length;
  const fileName = createExportFileName('smile', status, location);
  openModal(`${location} • ${shortStatusLabel(status)}`, records, count, totalValue, fileName);
}

// Opens the modal for every record at a given location, across all statuses.
function showLocationModal(location) {
  const records = getFilteredRecords().filter(r => {
    const recLoc = (r.location || '').toString().trim() || '(Tanpa lokasi)';
    return recLoc === location && !isDropStatus(r.status);
  });
  const totalValue = records.reduce((sum, r) => sum + (isDropStatus(r.status) ? 0 : r.value), 0);
  const count = records.length;
  const fileName = createExportFileName('smile', 'semua_status', location);
  openModal(`${location} • Semua status`, records, count, totalValue, fileName);
}

// Renders the "DETAIL STATUS PROGRESS" panel as a Lokasi x Status matrix table.
// Rows = location, columns = status (in the same order as STATUS SMILE), each filled
// cell shows LOP count on top and value below. Click a cell to see the underlying LOP list.
function renderStatusMatrix(records, statusGroups) {
  const thead = document.getElementById('statusMatrixHead');
  const tbody = document.getElementById('statusMatrixBody');
  if (!thead || !tbody) return;
  thead.innerHTML = '';
  tbody.innerHTML = '';

  const statuses = statusGroups.map(g => g.status);

  if (statuses.length === 0) {
    tbody.innerHTML = '<tr><td style="text-align:center;color:#999;padding:16px;">Tidak ada data</td></tr>';
    return;
  }

  const headRow = document.createElement('tr');
  headRow.innerHTML = `<th class="matrix-loc-col">Lokasi</th>` +
    statuses.map(s => `<th>${shortStatusLabel(s)}</th>`).join('') +
    `<th class="matrix-total-col">Total</th>`;
  thead.appendChild(headRow);

  const matrix = computeLocationStatusMatrix(records, statuses);

  if (matrix.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${statuses.length + 2}" style="text-align:center;color:#999;padding:16px;">Tidak ada data</td></tr>`;
    return;
  }

  matrix.forEach(row => {
    const tr = document.createElement('tr');

    const cellsHtml = statuses.map(s => {
      const cell = row.statuses[s] || { count: 0, total: 0 };
      if (cell.count === 0) {
        return `<td class="matrix-cell empty">–</td>`;
      }
      return `<td class="matrix-cell filled" data-loc="${row.location}" data-status="${s}" title="Klik untuk lihat detail">
        <div class="matrix-cell-lop">${fmtNumber(cell.count)}</div>
        <div class="matrix-cell-val">Rp ${fmtMoney(cell.total)}</div>
      </td>`;
    }).join('');

    tr.innerHTML = `
      <td class="matrix-loc-col" data-loc="${row.location}" title="Klik untuk lihat semua status di lokasi ini"><strong>${row.location}</strong></td>
      ${cellsHtml}
      <td class="matrix-total-col">
        <div class="matrix-cell-lop">${fmtNumber(row.totalCount)} LOP</div>
        <div class="matrix-cell-val">Rp ${fmtMoney(row.totalValue)}</div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.matrix-cell.filled').forEach(td => {
    td.addEventListener('click', () => {
      showLocationStatusModal(td.dataset.loc, td.dataset.status);
    });
  });

  tbody.querySelectorAll('.matrix-loc-col[data-loc]').forEach(td => {
    td.style.cursor = 'pointer';
    td.addEventListener('click', () => {
      showLocationModal(td.dataset.loc);
    });
  });
}

document.getElementById('refreshBtn').addEventListener('click', async () => {
  await fetch('/api/refresh', { method: 'POST' });
  document.getElementById('loadingState').style.display = 'block';
  document.getElementById('dashboardContent').style.display = 'none';
  await loadData();
});

// Toggle sidebar
const toggleSidebarBtn = document.getElementById('toggleSidebar');
const showSidebarBtn = document.getElementById('showSidebarBtn');
const sidebar = document.getElementById('sidebar');
const appShell = document.querySelector('.app-shell');

toggleSidebarBtn.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
  appShell.classList.toggle('sidebar-collapsed');
  showSidebarBtn.style.display = sidebar.classList.contains('collapsed') ? 'flex' : 'none';
  localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
});

showSidebarBtn.addEventListener('click', () => {
  sidebar.classList.remove('collapsed');
  appShell.classList.remove('sidebar-collapsed');
  showSidebarBtn.style.display = 'none';
  localStorage.setItem('sidebarCollapsed', 'false');
});

// Restore sidebar state from localStorage
if (localStorage.getItem('sidebarCollapsed') === 'true') {
  sidebar.classList.add('collapsed');
  appShell.classList.add('sidebar-collapsed');
  showSidebarBtn.style.display = 'flex';
}

loadData();
setInterval(loadData, 5 * 60 * 1000); // auto refresh every 5 minutes