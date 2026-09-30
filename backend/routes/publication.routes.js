const express = require('express');
const router = express.Router();
const {
  getPublications,
  getPublicationById,
  getPublicationDuplicates,
  checkPublicationDuplicates,
  getDuplicateReviews,
  confirmDuplicateReview,
  rejectDuplicateReview,
  mergeDuplicateReview,
  predictPublicationResearchDomains,
  applyPublicationResearchDomains,
  createPublication,
  updatePublication,
  deletePublication
} = require('../controllers/publication.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.route('/')
  .get(getPublications)
  .post(protect, authorize('admin', 'faculty'), createPublication);

// Duplicate detection & pre-import check
router.post('/check-duplicates', checkPublicationDuplicates);

// Duplicate review workflow endpoints (Admin only)
router.get('/duplicates', protect, authorize('admin'), getDuplicateReviews);
router.patch('/duplicates/:id/confirm', protect, authorize('admin'), confirmDuplicateReview);
router.patch('/duplicates/:id/reject', protect, authorize('admin'), rejectDuplicateReview);
router.post('/duplicates/:id/merge', protect, authorize('admin'), mergeDuplicateReview);

// Specific publication duplicates detection
router.get('/:id/duplicates', getPublicationDuplicates);

// Specific publication research domain prediction (Phase 12A read-only, Phase 12C apply/store)
router.get('/:id/research-domains/predict', predictPublicationResearchDomains);
router.post('/:id/research-domains/predict', protect, authorize('admin', 'faculty'), applyPublicationResearchDomains);

router.route('/:id')
  .get(getPublicationById)
  .put(protect, authorize('admin', 'faculty'), updatePublication)
  .delete(protect, authorize('admin', 'faculty'), deletePublication);

module.exports = router;
