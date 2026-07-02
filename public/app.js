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

function getStatusDisplay(status) {
  const text = (status || '').toString().trim();
  if (!text) return { label: '-', title: '' };

  const normalized = text.replace(/^\s*\d+(?:\.\d+)?\s*\.?\s*/, '');
  return {
    label: text,
    title: normalized ? `(${normalized})` : ''
  };
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
    e.total += rec.value;
    e.items.push(rec);
  });
  return Array.from(map.values()).sort((a, b) => {
    const orderA = parseStatusOrder(a.status);
    const orderB = parseStatusOrder(b.status);
    if (orderA !== orderB) return orderA - orderB;
    return a.status.localeCompare(b.status);
  });
}

function render() {
  const records = getFilteredRecords();
  const statusGroups = computeStatusGroups(records);
  // build smile groups from the `status` column (same basis as the STATUS SMILE table)
  const rawStatusSmileGroups = computeStatusGroups(records);
  // hide Drop from cards but keep header/count consistent with table
  const statusSmileGroups = rawStatusSmileGroups.filter(g => !/^\s*\d*\.?\s*drop\b/i.test((g.status || '').toString()));
  const statusLapGroups = computeStatusGroups(records.map(r => ({ ...r, status: r.statusLap })));
  const pmtaGroups = computeStatusGroups(records.filter(r => r.hasPMTA));
  const summaryGroups = pmtaGroups.length ? pmtaGroups : statusGroups;

  const totalPotensi = records.reduce((s, r) => s + r.value, 0);
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
  renderStatusCards(statusSmileGroups);
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
    .reduce((s, r) => s + r.value, 0);

    const cards = [
      { icon: '📊', label: 'TOTAL LOP', val: fmtNumber(totalCount), sub: '', action: 'all' },
      { icon: '🏷️', label: 'POTENSI (BULAN INI)', val: 'Rp ' + fmtMoney(potensiBulanIni), sub: 'Status Fisik', action: 'potensi' },
      { icon: '🥇', label: bastLabel, val: 'Rp ' + fmtMoney(bastValue), sub: '(Nilai BAST)', action: 'bast' },
      { icon: '💰', label: 'TOTAL NILAI', val: 'Rp ' + fmtMoney(statusGroups.reduce((s, g) => s + g.total, 0)), sub: '', action: 'all' },
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

function openModal(title, rows, count, totalValue, fileName) {
  const overlay = document.getElementById('modalOverlay');
  const titleEl = document.getElementById('modalTitle');
  const body = document.getElementById('modalBody');

  titleEl.textContent = title;

  const summaryHtml = `
    <div class="modal-summary">
      <div class="item">Jumlah LOP: <strong>${fmtNumber(count)}</strong></div>
      <div class="item">Total Nilai: <strong>Rp ${fmtMoney(totalValue)}</strong></div>
    </div>`;

  const rowsHtml = rows.map(r => `
    <tr>
      <td>${r.menu || '-'}</td>
      <td>${r.location || '-'}</td>
      <td>${r.pmta || '-'}</td>
      <td>${r.status || '-'}</td>
      <td>${r.statusLap || '-'}</td>
      <td style="text-align:right;">Rp ${fmtMoney(r.value)}</td>
    </tr>
  `).join('');

  const tableHtml = `
    ${summaryHtml}
    <table class="modal-table">
      <thead>
        <tr>
          <th>Project</th>
          <th>Lokasi</th>
          <th>PM TA</th>
          <th>Status Smile</th>
          <th>Status Lap</th>
          <th style="text-align:right;">Nilai</th>
        </tr>
      </thead>
      <tbody>${rowsHtml || '<tr><td colspan="6" style="text-align:center;color:#999;">Tidak ada data</td></tr>'}</tbody>
    </table>
  `;

  body.innerHTML = tableHtml;
  overlay.style.display = 'flex';

  const closeBtn = document.getElementById('modalClose');
  const downloadBtn = document.getElementById('modalDownload');
  function hide() { overlay.style.display = 'none'; }
  closeBtn.onclick = hide;
  overlay.onclick = (e) => { if (e.target === overlay) hide(); };
  downloadBtn.onclick = () => downloadExcelWithRaw(rows, fileName || 'export.xlsx');
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

  const totalValue = records.reduce((s, r) => s + r.value, 0);
  const count = records.length;
  const fileName = createExportFileName('progress', title);
  openModal(title, records, count, totalValue, fileName);
}

function normalizeFileName(name) {
  return name.toString().trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '').toLowerCase();
}

function createExportFileName(type, status, filterLabel) {
  const base = type === 'lap' ? 'status_lap' : 'status_smile';
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
    ? `Status Lapangan: ${status}${labelNeedle ? ` • ${filterLabel}` : ''}`
    : `Status Smile: ${status}${labelNeedle ? ` • ${filterLabel}` : ''}`;

  const totalValue = records.reduce((sum, r) => sum + r.value, 0);
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

function renderStatusCards(statusGroups) {
  const container = document.getElementById('statusCards');
  container.innerHTML = '';

  if (!statusGroups || statusGroups.length === 0) {
    container.innerHTML = '<div style="color:#999; padding:12px;">Tidak ada kartu status</div>';
    return;
  }

  const orderedGroups = [...statusGroups].sort((a, b) => parseStatusOrder(b.status) - parseStatusOrder(a.status) || b.status.localeCompare(a.status));

  orderedGroups.forEach((g) => {
    // skip Drop status cards (do not display)
    if (/^\s*\d*\.?\s*drop\b/i.test((g.status || '').toString())) return;
    let originalIndex = statusGroups.findIndex(group => group.status === g.status);
    if (originalIndex === -1) originalIndex = 0;
    const color = PALETTE[originalIndex % PALETTE.length] || PALETTE[0];
    
    // Extract unique PM TAs from items
    const pmtaMap = new Map();
    if (g.items) {
      g.items.forEach(item => {
        const pmta = (item.pmta || '-').toString().trim();
        if (!pmtaMap.has(pmta)) pmtaMap.set(pmta, 0);
        pmtaMap.set(pmta, pmtaMap.get(pmta) + 1);
      });
    }
    const uniquePMTAs = Array.from(pmtaMap.keys()).filter(p => p !== '-');
    
    const card = document.createElement('div');
    card.className = 'status-card-free';
    card.style.borderLeft = `5px solid ${color.accent}`;
    
    // Clean, modern design: just show key metrics
    const statusLabel = g.status.replace(/^\s*\d+\.?\s*/, ''); // Remove leading numbers
    
    let pmtaHtml = '';
    if (uniquePMTAs.length === 0) {
      pmtaHtml = '<div style="font-size:11px; color:#888; margin-top:8px;">Tidak ada PM TA</div>';
    } else if (uniquePMTAs.length === 1) {
      pmtaHtml = `<div class="pmta-chip" data-pmta="${uniquePMTAs[0]}" data-status="${g.status}" style="font-size:12px; color:#555; margin-top:8px; padding:6px 8px; background:#f0f1f6; border-radius:4px; cursor:pointer; transition:all 0.2s ease;" onmouseover="this.style.background='${color.accent}'; this.style.color='white';" onmouseout="this.style.background='#f0f1f6'; this.style.color='#555';">${uniquePMTAs[0]}</div>`;
    } else {
      // Free design: show all PM TAs as chips (no truncation)
      pmtaHtml = `<div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">
        ${uniquePMTAs.map(pmta => `<span class="pmta-chip" data-pmta="${pmta}" data-status="${g.status}" style="font-size:11px; padding:5px 10px; background:${color.accent}; color:white; border-radius:12px; white-space:nowrap; cursor:pointer; transition:all 0.2s ease;" onmouseover="this.style.opacity='0.8'; this.style.transform='scale(1.05)';" onmouseout="this.style.opacity='1'; this.style.transform='scale(1)';">${pmta}</span>`).join('')}
      </div>`;
    }
    
    card.innerHTML = `
      <div class="card-top" style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:0;">
        <div style="flex:1;">
          <div class="card-status-name" style="font-size:13px; color:${color.accent}; font-weight:600; margin-bottom:2px;">
            ${statusLabel}
          </div>
          <div class="card-lop-count" style="font-size:18px; font-weight:700; color:#1a2c4a;">
            ${fmtNumber(g.count)}
          </div>
          <div class="card-lop-label" style="font-size:11px; color:#888; margin-top:2px;">LOP</div>
        </div>
        <div style="text-align:right;">
          <div class="card-value" style="font-size:14px; font-weight:700; color:${color.accent};">
            Rp ${fmtMoney(g.total)}
          </div>
        </div>
      </div>
      <div style="margin-top:8px;">
        ${pmtaHtml}
      </div>
    `;
    
    card.style.cursor = 'pointer';
    card.style.transition = 'all 0.2s ease';
    card.addEventListener('mouseenter', () => {
      card.style.boxShadow = '0 6px 16px rgba(15,27,76,0.12)';
      card.style.transform = 'translateY(-2px)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.boxShadow = '0 1px 4px rgba(15,27,76,0.06)';
      card.style.transform = 'translateY(0)';
    });
    card.addEventListener('click', (e) => {
      // Check if a PM TA chip was clicked
      if (e.target.classList.contains('pmta-chip')) {
        e.stopPropagation();
        const pmta = e.target.dataset.pmta;
        const status = e.target.dataset.status;
        showStatusModal({ type: 'smile', status, filterLabel: pmta });
      } else {
        showStatusModal({ type: 'smile', status: g.status });
      }
    });
    
    container.appendChild(card);
  });
}

// renderStatusLapCards removed — Status Lapangan Cards no longer used in UI

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
