const express = require('express');
const router = express.Router();
const {
  getOverviewAnalytics,
  getYearlyAnalytics,
  getDepartmentAnalytics,
  getResearchDomainAnalytics,
  getPredictedResearchDomainAnalytics,
  getCollaborationsAnalytics
} = require('../controllers/analytics.controller');

router.get('/overview', getOverviewAnalytics);
router.get('/yearly', getYearlyAnalytics);
router.get('/departments', getDepartmentAnalytics);
router.get('/research-domains/predicted', getPredictedResearchDomainAnalytics);
router.get('/research-domains', getResearchDomainAnalytics);
router.get('/collaborations', getCollaborationsAnalytics);

module.exports = router;
