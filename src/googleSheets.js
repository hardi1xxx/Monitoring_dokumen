const { google } = require('googleapis');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 120 }); // cache 2 minutes

const SPREADSHEET_ID = process.env.SHEET_ID || '1gKM47QvbzO7p6BdwgV1oORCDaJSbAKk35hLPPKxx464';
const SHEET_NAME = process.env.SHEET_NAME || 'Data Loker';

// Column letters as requested:
// B = Menu / Project grouping (kiri sidebar)
// K = Nilai (jumlah / value, summed)
// R = Status Smile (status yang ditampilkan sebagai progress)
const COL = {
  MENU: 1,   // B -> index 1 (0-based)
  VALUE: 10, // K -> index 10
  STATUS: 17 // R -> index 17
};

function colLetterToIndex(letter) {
  let result = 0;
  for (let i = 0; i < letter.length; i++) {
    result = result * 26 + (letter.toUpperCase().charCodeAt(i) - 64);
  }
  return result - 1;
}

function getAuth() {
  // Supports either a JSON string in GOOGLE_SERVICE_ACCOUNT_JSON
  // or individual GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY env vars.
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
  }

  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });
}

async function fetchRawRows() {
  const cached = cache.get('raw_rows');
  if (cached) return cached;

  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const range = `${SHEET_NAME}!A1:Z10000`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range
  });

  const rows = res.data.values || [];
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

  const records = dataRows.map(r => ({
    menu: (r[COL.MENU] || '').toString().trim(),
    value: parseNumber(r[COL.VALUE]),
    status: (r[COL.STATUS] || '').toString().trim(),
    raw: r
  })).filter(rec => rec.menu !== '' || rec.status !== '');

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
