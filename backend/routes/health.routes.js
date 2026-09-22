const express = require('express');
const router = express.Router();
const { getHealthStatus, getDatabaseHealth } = require('../controllers/health.controller');

router.get('/health', getHealthStatus);
router.get('/health/db', getDatabaseHealth);
router.get('/db-check', getDatabaseHealth);

module.exports = router;
