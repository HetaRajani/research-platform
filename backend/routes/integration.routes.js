const express = require('express');
const router = express.Router();
const {
  getFacultyOrcidWorks,
  getFacultyScopusPublications,
  getFacultyGoogleScholarPublications,
  importFacultyGoogleScholarPublications,
  importFacultyOrcidWorks,
  importFacultyScopusPublications
} = require('../controllers/integration.controller');

// ORCID integration
router.get('/orcid/:facultyId', getFacultyOrcidWorks);
router.post('/orcid/:facultyId/import', importFacultyOrcidWorks);

// Scopus integration
router.get('/scopus/:facultyId', getFacultyScopusPublications);
router.post('/scopus/:facultyId/import', importFacultyScopusPublications);

// Google Scholar integration (authorized provider or user-provided import)
router.get('/google-scholar/:facultyId', getFacultyGoogleScholarPublications);
router.post('/google-scholar/:facultyId/import', importFacultyGoogleScholarPublications);

module.exports = router;
