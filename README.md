# Dashboard Monitoring Dokumen - Telkom Akses

Dashboard web (Node.js + Express) yang membaca data langsung dari Google Sheets
("Data Loker") dan menampilkannya mirip tampilan referensi Telkom Akses Area 2,
siap deploy ke **Railway**.

## Struktur data yang dipakai dari sheet
| Kolom | Fungsi |
|-------|--------|
| **B** | Nama Project/Menu → jadi daftar menu di sidebar kiri |
| **K** | Nilai/jumlah (Rupiah) → dijumlahkan per status & per project |
| **R** | Status Smile → jadi pengelompokan status (kartu warna-warni & tabel) |

Kolom lain di sheet tetap dibaca tapi tidak ditampilkan — bisa ditambahkan
belakangan kalau perlu kolom lain (misal SP, Branch, dst).

## 1. Siapkan Google Service Account (karena sheet private)

1. Buka [Google Cloud Console](https://console.cloud.google.com/) → buat project (atau pakai yang sudah ada).
2. Aktifkan **Google Sheets API** (APIs & Services → Enable APIs).
3. Buat **Service Account** (IAM & Admin → Service Accounts → Create).
4. Buat **Key** baru untuk service account tersebut → pilih JSON → download file JSON-nya.
5. Buka Google Sheet kamu → klik **Share** → tambahkan email service account
   (formatnya: `nama-xxx@project-id.iam.gserviceaccount.com`) dengan akses **Viewer**.

## 2. Konfigurasi Environment Variable

Salin isi file JSON service account yang sudah didownload, lalu jadikan satu baris,
masukkan ke environment variable `GOOGLE_SERVICE_ACCOUNT_JSON`.

Variable yang dibutuhkan (lihat juga `.env.example`):

```
SHEET_ID=1gKM47QvbzO7p6BdwgV1oORCDaJSbAKk35hLPPKxx464
SHEET_NAME=Data Loker
GOOGLE_SERVICE_ACCOUNT_JSON={...isi file json service account dalam 1 baris...}
PORT=3000
```

Tips: paling mudah, buka file JSON-nya, copy semua isinya, paste sebagai value
dari `GOOGLE_SERVICE_ACCOUNT_JSON` (tidak perlu format ulang, JSON.parse akan
membacanya langsung).

## 3. Jalankan lokal (opsional, untuk testing)

```bash
npm install
cp .env.example .env
# edit .env, isi GOOGLE_SERVICE_ACCOUNT_JSON dan SHEET_ID
npm start
```

Buka `http://localhost:3000`.

## 4. Deploy ke Railway

1. Push folder project ini ke repo GitHub baru (atau pakai Railway CLI / drag-drop).
2. Di Railway: **New Project → Deploy from GitHub repo**.
3. Di tab **Variables**, tambahkan:
   - `SHEET_ID`
   - `SHEET_NAME` (isi: `Data Loker`)
   - `GOOGLE_SERVICE_ACCOUNT_JSON` (paste isi JSON service account)
4. Railway otomatis detect `npm start` lewat `package.json`. Pastikan **Start Command** = `npm start`.
5. Setelah deploy sukses, Railway akan kasih domain publik (`xxxx.up.railway.app`).

## Catatan teknis

- Data di-cache 2 menit di server (`node-cache`) supaya tidak terlalu sering
  hit Google Sheets API (ada limit kuota). Tombol **🔄 Refresh Data** di sidebar
  bisa dipakai untuk force-refresh kapan saja.
- Auto-refresh otomatis tiap 5 menit di sisi browser.
- Parsing angka mendukung format Indonesia (titik untuk ribuan, koma untuk desimal)
  maupun format umum lainnya — kalau ada data kolom K yang tidak terbaca dengan
  benar, kabari saya formatnya seperti apa di sheet supaya saya sesuaikan parsernya.
- Kalau struktur baris header/kolom di sheet berbeda dari asumsi (B=menu, K=nilai,
  R=status), tinggal ubah `COL.MENU`, `COL.VALUE`, `COL.STATUS` di
  `src/googleSheets.js` (index dimulai dari 0, jadi B=1, K=10, R=17).

## Yang bisa dikembangkan lebih lanjut

- Filter tambahan (SP, Status Tim UT, dst) sesuai dropdown di referensi gambar.
- Drill-down per baris (klik kartu status → munculkan detail tabel lengkap).
- Export ke PDF/PPT seperti dashboard PT2/PT3 yang sudah pernah dibuat sebelumnya.

Kalau mau saya tambahkan salah satu di atas, atau ternyata kolomnya berbeda
dari yang diasumsikan, kasih tahu saya datanya seperti apa ya.
# Monitoring_dokumen
