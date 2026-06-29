require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change_this_to_a_long_random_secret') {
  console.warn('\nWARNING: JWT_SECRET is missing or using the default placeholder value.');
  console.warn('Set a strong, random JWT_SECRET in your .env file before deploying.\n');
}

const db = require('./db'); // ensures schema is created on startup

const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employees');
const leaveRoutes = require('./routes/leave');
const attendanceRoutes = require('./routes/attendance');
const payrollRoutes = require('./routes/payroll');
const loanRoutes = require('./routes/loans');
const { requireAuth, requireAdmin } = require('./middleware/auth');
const { syncZKTeco } = require('./utils/zkteco');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/loans', loanRoutes);

// ─── ZKTeco Manual Sync Endpoint (admin only) ────────────────────────────────
app.post('/api/attendance/sync-zkteco', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await syncZKTeco();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: 'ZKTeco sync failed: ' + err.message });
  }
});

// Serve the frontend (single-page app) from ../../frontend/public
const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend', 'public');
app.use(express.static(FRONTEND_DIR));
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// Generic error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Brandigade HRIS running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser.`);

  // ─── Auto-sync ZKTeco every 5 minutes if device IP is configured ──────────
  if (process.env.ZKTECO_IP) {
    console.log(`[ZKTeco] Auto-sync enabled. Device: ${process.env.ZKTECO_IP}:${process.env.ZKTECO_PORT || 4370}`);
    console.log('[ZKTeco] Running initial sync...');

    // Initial sync on startup
    syncZKTeco().then(r => {
      console.log(`[ZKTeco] Startup sync done. Synced: ${r.synced}, Skipped: ${r.skipped}`);
    }).catch(e => console.error('[ZKTeco] Startup sync error:', e.message));

    // Auto-sync every 5 minutes (300,000 ms)
    setInterval(async () => {
      try {
        const r = await syncZKTeco();
        console.log(`[ZKTeco] Auto-sync: Synced ${r.synced} records, Skipped ${r.skipped}`);
      } catch (e) {
        console.error('[ZKTeco] Auto-sync error:', e.message);
      }
    }, 5 * 60 * 1000);
  } else {
    console.log('[ZKTeco] ZKTECO_IP not set — biometric auto-sync is disabled.');
  }
});

