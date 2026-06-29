require('dotenv').config();
const express = require('express');
const path = require('path');
const { getDashboardData, clearCache } = require('./googleSheets');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());

app.get('/api/dashboard', async (req, res) => {
  try {
    const data = await getDashboardData();
    res.json({ ok: true, ...data, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('Error fetching dashboard data:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/refresh', (req, res) => {
  clearCache();
  res.json({ ok: true, message: 'Cache cleared' });
});

app.get('/healthz', (req, res) => res.send('ok'));

app.listen(PORT, () => {
  console.log(`Dashboard server running on port ${PORT}`);
});
