const NodeCache = require('node-cache');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const cache = new NodeCache({ stdTTL: 120 }); // cache 2 minutes

const SPREADSHEET_ID = process.env.SHEET_ID || '1MqKFY3mn7-Qa2xn9kslKPKYCF15ONWPf71_dZuIF458';
const SHEET_NAME = process.env.SHEET_NAME || 'Monitoring_Data';

// Column letters as requested:
// B = Menu / Project grouping (kiri sidebar)
// C = Project name (for menu grouping - take first word)
// K = Nilai/jumlah (summed)
// E = PM TA (sub status)
// F = ID IHLD
// H = Nama lokasi
// V = Status Fisik  -> exposed as record.statusLap (matches existing frontend field name)
// W = Status Smile  -> exposed as record.status
// AS = Bulan BAST (untuk trend)
const COL = {
  MENU: 1,        // B -> index 1 (0-based)
  PROJECT: 2,     // C -> index 2 (0-based)
  VALUE: 10,      // K -> index 10
  PM_TA: 4,       // E -> index 4
  IHLD: 5,        // F -> index 5
  LOCATION: 7,    // H -> index 7
  STATUS_LAP: 21, // V -> index 21 (Status Fisik)
  STATUS: 22,     // W -> index 22 (Status Smile)
  BAST_MONTH: 44  // AS -> index 44
};

// Same DROP-detection rule used on the frontend (matches "00. DROP", "00.DROP", "Drop", etc.)
function isDropStatus(status) {
  return /^\s*\d*\.?\s*drop\b/i.test((status || '').toString());
}

function colLetterToIndex(letter) {
  let result = 0;
  for (let i = 0; i < letter.length; i++) {
    result = result * 26 + (letter.toUpperCase().charCodeAt(i) - 64);
  }
  return result - 1;
}

async function fetchRawRows() {
  const cached = cache.get('raw_rows');
  if (cached) return cached;

  // Fetch from public Google Sheets CSV export (no authentication required)
  const csvUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;

  const response = await fetch(csvUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch sheet: ${response.statusText}`);
  }

  const csv = await response.text();
  const rows = csv.split('\n').map(line => {
    // Parse CSV line properly handling quotes and commas
    const result = [];
    let current = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }).filter(row => row.some(cell => cell !== ''));

  cache.set('raw_rows', rows);
  return rows;
}

function parseNumber(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  // Handle Indonesian number format: "1.234.567,89" or "1,234,567.89" or plain
  let s = String(val).trim();
  s = s.replace(/[^0-9.,-]/g, '');
  if (s.includes(',') && s.includes('.')) {
    // assume . is thousands, , is decimal if , comes after last .
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    // could be thousands or decimal - if more than one comma, thousands
    const parts = s.split(',');
    if (parts.length > 2) {
      s = s.replace(/,/g, '');
    } else if (parts[1] && parts[1].length === 3) {
      s = s.replace(',', '');
    } else {
      s = s.replace(',', '.');
    }
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// Parse a month value from column AS. Accepts "Januari 2025", "2025-01",
// "01/2025", "Jan-25", or a full date — normalizes to { key: "YYYY-MM", label }.
const ID_MONTHS = ['januari','februari','maret','april','mei','juni','juli','agustus','september','oktober','november','desember'];
const ID_MONTHS_SHORT = ['jan','feb','mar','apr','mei','jun','jul','agu','sep','okt','nov','des'];

function monthLabel(mm) {
  const idx = parseInt(mm, 10) - 1;
  const name = ID_MONTHS[idx] || mm;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function parseBastMonth(val) {
  if (!val) return null;
  const raw = String(val).trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  // "Januari 2025" / "Jan 2025" / "Jan-25"
  for (let i = 0; i < ID_MONTHS.length; i++) {
    if (lower.includes(ID_MONTHS[i]) || lower.includes(ID_MONTHS_SHORT[i])) {
      const yearMatch = lower.match(/(\d{4}|\d{2})/);
      if (yearMatch) {
        let year = yearMatch[1];
        if (year.length === 2) year = '20' + year;
        const mm = String(i + 1).padStart(2, '0');
        return { key: `${year}-${mm}`, label: `${monthLabel(mm)} ${year}` };
      }
    }
  }

  // "YYYY-MM" or "YYYY/MM"
  let m = raw.match(/^(\d{4})[\/-](\d{1,2})$/);
  if (m) {
    const year = m[1];
    const mm = String(parseInt(m[2], 10)).padStart(2, '0');
    return { key: `${year}-${mm}`, label: `${monthLabel(mm)} ${year}` };
  }

  // "MM/YYYY" or "MM-YYYY"
  m = raw.match(/^(\d{1,2})[\/-](\d{4})$/);
  if (m) {
    const mm = String(parseInt(m[1], 10)).padStart(2, '0');
    const year = m[2];
    return { key: `${year}-${mm}`, label: `${monthLabel(mm)} ${year}` };
  }

  // Full date "DD/MM/YYYY" or "DD-MM-YYYY"
  m = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) {
    const mm = String(parseInt(m[2], 10)).padStart(2, '0');
    const year = m[3];
    return { key: `${year}-${mm}`, label: `${monthLabel(mm)} ${year}` };
  }
  // ISO "YYYY-MM-DD"
  m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const year = m[1];
    const mm = String(parseInt(m[2], 10)).padStart(2, '0');
    return { key: `${year}-${mm}`, label: `${monthLabel(mm)} ${year}` };
  }

  // Fallback: let JS try to parse it (e.g. Google Sheets serial-date strings)
  const d = new Date(raw);
  if (!isNaN(d.getTime())) {
    const year = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return { key: `${year}-${mm}`, label: `${monthLabel(mm)} ${year}` };
  }

  return null;
}

async function getDashboardData() {
  const rows = await fetchRawRows();
  if (rows.length < 2) {
    return { menus: [], statuses: [], records: [], totals: {}, bastTrend: [] };
  }

  const header = rows[0];
  const dataRows = rows.slice(1).filter(r => r && r.length > 0 && r.join('').trim() !== '');

  const records = dataRows.map(r => {
    const status = (r[COL.STATUS] || '').toString().trim();       // Status Smile (W)
    const statusLap = (r[COL.STATUS_LAP] || '').toString().trim(); // Status Fisik (V)
    const pmta = (r[COL.PM_TA] || '').toString().trim();
    const ihld = (r[COL.IHLD] || '').toString().trim();
    const location = (r[COL.LOCATION] || '').toString().trim();
    const menu = (r[COL.MENU] || '').toString().trim();
    const project = (r[COL.PROJECT] || '').toString().trim();
    const projectGroup = project ? project.split(/\s+/)[0] : ''; // Extract first word
    const hasPMTA = pmta !== '' || /PM\s*TA/i.test(r.join(' '));
    const bastRaw = (r[COL.BAST_MONTH] || '').toString().trim();
    const bastMonth = parseBastMonth(bastRaw);
    const value = parseNumber(r[COL.VALUE]);
    const isDrop = isDropStatus(status);

    return {
      menu,
      projectGroup,
      value,
      status,       // Status Smile (W)
      statusLap,    // Status Fisik (V)
      pmta,
      ihld,
      location,
      hasPMTA,
      isDrop,
      bastRaw,
      bastMonth,    // { key: 'YYYY-MM', label } or null
      raw: r
    };
  }).filter(rec => rec.menu !== '' || rec.status !== '' || (rec.statusLap && rec.statusLap !== ''));

  // Unique menus (sidebar) preserving first-seen order, grouped by project
  const menuGroups = new Map();
  const menuSet = [];
  records.forEach(rec => {
    if (rec.menu && !menuSet.includes(rec.menu)) {
      menuSet.push(rec.menu);
      const group = rec.projectGroup || 'Lainnya';
      if (!menuGroups.has(group)) menuGroups.set(group, []);
      menuGroups.get(group).push(rec.menu);
    }
  });

  const groupedMenus = Array.from(menuGroups.entries()).map(([group, items]) => ({
    group,
    items
  }));

  // Status Smile groups with count + sum of value (DROP excluded from total value)
  const statusMap = new Map();
  records.forEach(rec => {
    const key = rec.status || '(Belum ada status)';
    if (!statusMap.has(key)) statusMap.set(key, { status: key, count: 0, total: 0 });
    const entry = statusMap.get(key);
    entry.count += 1;
    if (!rec.isDrop) entry.total += rec.value;
  });
  const statuses = Array.from(statusMap.values()).sort((a, b) => b.count - a.count);

  // Total Potensi: sum of value EXCLUDING "00. DROP" status rows (LOP count still includes them)
  const totalPotensi = records.reduce((s, r) => s + (r.isDrop ? 0 : r.value), 0);
  const totalDropCount = records.filter(r => r.isDrop).length;
  const totalDropValue = records.reduce((s, r) => s + (r.isDrop ? r.value : 0), 0);

  const totals = {
    totalLOP: records.length,
    totalPotensi,
    totalDropCount,
    totalDropValue,
    totalStatus: statuses.length,
    totalBranch: menuSet.length,
    headerRow: header
  };

  return { menus: menuSet, groupedMenus, statuses, records, totals };
}

function clearCache() {
  cache.del('raw_rows');
}

module.exports = { getDashboardData, clearCache };