const NodeCache = require('node-cache');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const cache = new NodeCache({ stdTTL: 120 }); // cache 2 minutes

const SPREADSHEET_ID = process.env.SHEET_ID || '1MqKFY3mn7-Qa2xn9kslKPKYCF15ONWPf71_dZuIF458';
const SHEET_NAME = process.env.SHEET_NAME || 'Monitoring_Data';

// Column letters as requested:
// B = Menu / Project grouping (kiri sidebar)
// K = Nilai/jumlah (summed)
// E = PM AREA progress (status yang ditampilkan sebagai progress)
// F = Sub status PM TA (jika tersedia di sheet)
const COL = {
  MENU: 1,   // B -> index 1 (0-based)
  VALUE: 10, // K -> index 10
  STATUS: 17, // R -> index 17 (0-based)
  SUB_STATUS: 4 // e -> index 4 (0-based)
};

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

async function getDashboardData() {
  const rows = await fetchRawRows();
  if (rows.length < 2) {
    return { menus: [], statuses: [], records: [], totals: {} };
  }

  const header = rows[0];
  const dataRows = rows.slice(1).filter(r => r && r.length > 0 && r.join('').trim() !== '');

  const records = dataRows.map(r => {
    const status = (r[COL.STATUS] || '').toString().trim();
    const subStatus = (r[COL.SUB_STATUS] || '').toString().trim();
    const hasPMTA = /PM\s*TA/i.test(subStatus) || /PM\s*TA/i.test(r.join(' '));

    return {
      menu: (r[COL.MENU] || '').toString().trim(),
      value: parseNumber(r[COL.VALUE]),
      status,
      subStatus,
      hasPMTA,
      raw: r
    };
  }).filter(rec => rec.menu !== '' || rec.status !== '');

  // Unique menus (sidebar) preserving first-seen order
  const menuSet = [];
  records.forEach(rec => {
    if (rec.menu && !menuSet.includes(rec.menu)) menuSet.push(rec.menu);
  });

  // Status groups with count + sum of value
  const statusMap = new Map();
  records.forEach(rec => {
    const key = rec.status || '(Belum ada status)';
    if (!statusMap.has(key)) statusMap.set(key, { status: key, count: 0, total: 0 });
    const entry = statusMap.get(key);
    entry.count += 1;
    entry.total += rec.value;
  });

  const statuses = Array.from(statusMap.values()).sort((a, b) => b.count - a.count);

  const totals = {
    totalLOP: records.length,
    totalPotensi: records.reduce((s, r) => s + r.value, 0),
    totalStatus: statuses.length,
    totalBranch: menuSet.length,
    headerRow: header
  };

  return { menus: menuSet, statuses, records, totals };
}

function clearCache() {
  cache.del('raw_rows');
}

module.exports = { getDashboardData, clearCache };
