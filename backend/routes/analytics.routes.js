const express = require('express');
const router = express.Router();
const {
  getOverviewAnalytics,
  getYearlyAnalytics
} = require('../controllers/analytics.controller');

router.get('/overview', getOverviewAnalytics);
router.get('/yearly', getYearlyAnalytics);

module.exports = router;
