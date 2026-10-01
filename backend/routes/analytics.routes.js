const express = require('express');
const router = express.Router();
const {
  getOverviewAnalytics,
  getYearlyAnalytics,
  getDepartmentAnalytics,
  getResearchDomainAnalytics,
  getPredictedResearchDomainAnalytics,
  getEmergingResearchAnalytics,
  getCollaboratorRecommendations,
  getProductivityForecast,
  postResearchAssistantQuestion,
  getCollaborationsAnalytics
} = require('../controllers/analytics.controller');

router.get('/overview', getOverviewAnalytics);
router.get('/yearly', getYearlyAnalytics);
router.get('/departments', getDepartmentAnalytics);
router.get('/research-domains/predicted', getPredictedResearchDomainAnalytics);
router.get('/emerging-research', getEmergingResearchAnalytics);
router.get('/collaborator-recommendations/:facultyId', getCollaboratorRecommendations);
router.get('/productivity-forecast/:facultyId', getProductivityForecast);
router.post('/research-assistant', postResearchAssistantQuestion);
router.get('/research-domains', getResearchDomainAnalytics);
router.get('/collaborations', getCollaborationsAnalytics);

module.exports = router;
