const express = require('express');
const router = express.Router();
const {
  getPublications,
  getPublicationById,
  createPublication,
  updatePublication,
  deletePublication
} = require('../controllers/publication.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.route('/')
  .get(getPublications)
  .post(protect, authorize('admin', 'faculty'), createPublication);

router.route('/:id')
  .get(getPublicationById)
  .put(protect, authorize('admin', 'faculty'), updatePublication)
  .delete(protect, authorize('admin', 'faculty'), deletePublication);

module.exports = router;
