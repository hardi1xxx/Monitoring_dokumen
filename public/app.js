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

function fmtMoney(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.00$/, '') + ' M';
  if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.00$/, '') + ' Jt';
  return Number(n).toLocaleString('id-ID');
}

function fmtNumber(n) {
  return Number(n).toLocaleString('id-ID');
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

  dashboardData.menus.forEach(menu => {
    const btn = document.createElement('button');
    btn.className = 'menu-item';
    btn.dataset.menu = menu;
    btn.innerHTML = `<span class="menu-icon">📁</span> <span>${menu}</span>`;
    btn.addEventListener('click', () => selectMenu(menu));
    nav.appendChild(btn);
  });

  document.querySelector('.menu-item[data-menu="__all__"]').addEventListener('click', () => selectMenu('__all__'));
}

function selectMenu(menu) {
  currentMenu = menu;
  document.querySelectorAll('.menu-item').forEach(b => {
    b.classList.toggle('active', b.dataset.menu === menu);
  });
  const title = menu === '__all__' ? 'Semua Project' : menu;
  document.getElementById('pageSubtitle').innerHTML = `${title} &middot; Update terakhir: <span id="updatedAt">${new Date(dashboardData.updatedAt).toLocaleString('id-ID')}</span>`;
  render();
}

function getFilteredRecords() {
  if (currentMenu === '__all__') return dashboardData.records;
  return dashboardData.records.filter(r => r.menu === currentMenu);
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
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

function render() {
  const records = getFilteredRecords();
  const statusGroups = computeStatusGroups(records);

  const totalPotensi = records.reduce((s, r) => s + r.value, 0);
  document.getElementById('statPotensi').textContent = 'Rp ' + fmtMoney(totalPotensi);
  document.getElementById('statPotensiSub').textContent = fmtNumber(records.length) + ' LOP';
  document.getElementById('statStatus').textContent = statusGroups.length;
  document.getElementById('statBranch').textContent = dashboardData.menus.length;

  renderProgressOverview(statusGroups, records.length);
  renderStatusTable(statusGroups);
  renderStatusCards(statusGroups);
}

function renderProgressOverview(statusGroups, totalCount) {
  const container = document.getElementById('progressOverview');
  container.innerHTML = '';

  // summary cards: top icon style similar to reference (selesai / progress / belum / total)
  const summaryWrap = document.createElement('div');
  summaryWrap.className = 'progress-summary';

  const cards = [
    { icon: '📊', label: 'TOTAL LOP', val: fmtNumber(totalCount), sub: '' },
    { icon: '🏷️', label: 'JUMLAH STATUS', val: statusGroups.length, sub: 'Status Smile' },
    { icon: '🥇', label: 'STATUS TERBANYAK', val: statusGroups[0] ? statusGroups[0].count : 0, sub: statusGroups[0] ? statusGroups[0].status : '-' },
    { icon: '💰', label: 'TOTAL NILAI', val: 'Rp ' + fmtMoney(statusGroups.reduce((s, g) => s + g.total, 0)), sub: '' },
  ];

  cards.forEach(c => {
    const div = document.createElement('div');
    div.className = 'progress-card';
    div.innerHTML = `<div class="icon">${c.icon}</div><div class="val">${c.val}</div><div class="lbl">${c.label}</div><div class="sub">${c.sub}</div>`;
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
    tr.innerHTML = `
      <td><span class="status-dot" style="background:${color}"></span>${g.status}</td>
      <td>${fmtNumber(g.count)}</td>
      <td style="color:${color}; font-weight:600; text-align:right;">Rp ${fmtMoney(g.total)}</td>
    `;
    tbody.appendChild(tr);
  });
  if (statusGroups.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#999;">Tidak ada data</td></tr>';
  }
}

function renderStatusCards(statusGroups) {
  const container = document.getElementById('statusCards');
  container.innerHTML = '';
  statusGroups.forEach((g, i) => {
    const color = PALETTE[i % PALETTE.length];
    const card = document.createElement('div');
    card.className = 'status-card';
    card.style.background = color.bg;

    const rowsHtml = g.items.slice(0, 5).map(item => `
      <div class="row-item">
        <span>${item.menu || '-'}</span>
        <span>${fmtMoney(item.value)}</span>
      </div>
    `).join('');

    card.innerHTML = `
      <div class="header">
        <span class="badge" style="background:${color.accent}">${i + 1}</span>
        <span>${g.status}</span>
      </div>
      <div class="amount" style="color:${color.accent}">Rp ${fmtMoney(g.total)}</div>
      <div class="count">${fmtNumber(g.count)} LOP</div>
      <div class="rows">${rowsHtml || '<div class="row-item">Tidak ada data</div>'}</div>
    `;
    container.appendChild(card);
  });
}

document.getElementById('refreshBtn').addEventListener('click', async () => {
  await fetch('/api/refresh', { method: 'POST' });
  document.getElementById('loadingState').style.display = 'block';
  document.getElementById('dashboardContent').style.display = 'none';
  await loadData();
});

loadData();
setInterval(loadData, 5 * 60 * 1000); // auto refresh every 5 minutes
