require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./modules/auth/auth.routes');
const documentRoutes = require('./modules/documents/documents.routes');
const nomineeRoutes = require('./modules/nominees/nominees.routes');
const switchRoutes = require('./modules/switch/switch.routes');
const emergencyRoutes = require('./modules/emergency/emergency.routes');
const secretsRoutes = require('./modules/secrets/secrets.routes');
const prescriptionsRoutes = require('./modules/prescriptions/prescriptions.routes');
const doctorsRoutes = require('./modules/doctors/doctors.routes');
const medicalReportsRoutes = require('./modules/medical-reports/medical-reports.routes');
const expensesRoutes = require('./modules/expenses/expenses.routes');
const { errorHandler } = require('./middleware/errorHandler');
const inactivityCheckerJob = require('./jobs/inactivityChecker');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: [process.env.CLIENT_URL || 'http://localhost:8081', 'exp://'],
  credentials: true,
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api', limiter);

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/nominees', nomineeRoutes);
app.use('/api/switch', switchRoutes);
app.use('/api/emergency', emergencyRoutes);
app.use('/api/secrets', secretsRoutes);
app.use('/api/prescriptions', prescriptionsRoutes);
app.use('/api/doctors', doctorsRoutes);
app.use('/api/medical-reports', medicalReportsRoutes);
app.use('/api/expenses', expensesRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🔐 Digital Vault Backend running on http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Health check: http://localhost:${PORT}/health\n`);

  // Start inactivity checker cron job
  inactivityCheckerJob.start();
  console.log('⏰ Dead Man\'s Switch cron job started (runs daily at midnight)');
});

module.exports = app;
