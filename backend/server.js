const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');
const models = require('./models');
const healthRoutes = require('./routes/health.routes');
const facultyRoutes = require('./routes/faculty.routes');
const publicationRoutes = require('./routes/publication.routes');
const authRoutes = require('./routes/auth.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const importRoutes = require('./routes/import.routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// CORS Configuration
app.use(cors());

// Body Parsing Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root welcome route
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Research Analytics & Faculty Profiling API is running',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      databaseCheck: '/api/db-check',
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        me: 'GET /api/auth/me (Bearer Token required)'
      },
      faculty: '/api/faculty',
      publications: '/api/publications',
      analytics: {
        overview: '/api/analytics/overview',
        yearly: '/api/analytics/yearly',
        departments: '/api/analytics/departments',
        researchDomains: '/api/analytics/research-domains',
        collaborations: '/api/analytics/collaborations'
      },
      import: {
        publications: 'POST /api/import/publications',
        sources: 'GET /api/import/sources'
      }
    }
  });
});

// API Routes
app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/faculty', facultyRoutes);
app.use('/api/publications', publicationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/import', importRoutes);

// Error Handling Middleware
app.use(notFound);
app.use(errorHandler);

// Start Server
const server = app.listen(PORT, () => {
  console.log('==================================================');
  console.log('  Research Analytics & Faculty Profiling API');
  console.log(`  Status: Running`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Health Check: http://localhost:${PORT}/api/health`);
  console.log(`  Database Check: http://localhost:${PORT}/api/db-check`);
  console.log(`  Auth API: http://localhost:${PORT}/api/auth`);
  console.log(`  Faculty API: http://localhost:${PORT}/api/faculty`);
  console.log(`  Publications API: http://localhost:${PORT}/api/publications`);
  console.log(`  Models Loaded: ${Object.keys(models).join(', ')}`);
  console.log('==================================================');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error(`Unhandled Rejection Error: ${err.message}`);
  server.close(() => process.exit(1));
});

module.exports = app;
