require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

// Security & Parsing Middlewares
app.use(helmet());
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());
app.use(morgan('dev'));

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Import Routes
const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employee');
const attendanceRoutes = require('./routes/attendance');
const requestRoutes = require('./routes/request');
const campaignRoutes = require('./routes/campaign');
const loanRoutes = require('./routes/loan');
const payrollRoutes = require('./routes/payroll');
const documentRoutes = require('./routes/document');
const systemRoutes = require('./routes/system');

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/system', systemRoutes);

// Global Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`HRIS Backend running on port ${PORT}`);
  
  // Start Biometric Auto-Sync Scheduler (Every 2 hours, only when on office network)
  const { syncZKTeco } = require('./utils/zkteco');
  const AUTO_SYNC_INTERVAL = 2 * 60 * 60 * 1000; // 2 hours in ms

  console.log(`[Scheduler] Biometric auto-sync active (Interval: 2 hours, skips if not on office network)`);
  setInterval(async () => {
    console.log('[Scheduler] Initiating automatic biometric sync...');
    try {
      const result = await syncZKTeco();
      if (result.synced > 0 || result.errors.length > 0) {
        console.log(`[Scheduler] Auto-sync finished. Synced: ${result.synced}, Skipped: ${result.skipped}, Errors: ${result.errors.length}`);
      }
    } catch (err) {
      console.error('[Scheduler] Auto-sync encountered an error:', err.message);
    }
  }, AUTO_SYNC_INTERVAL);
});
