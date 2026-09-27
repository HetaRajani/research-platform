const express = require('express');
const router = express.Router();
const {
  importPublications,
  getSupportedSources
} = require('../controllers/import.controller');

router.post('/publications', importPublications);
router.get('/sources', getSupportedSources);

module.exports = router;
