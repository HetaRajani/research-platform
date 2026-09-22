const express = require('express');
const router = express.Router();
const {
  getFaculty,
  getFacultyById,
  createFaculty,
  updateFaculty,
  deleteFaculty
} = require('../controllers/faculty.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.route('/')
  .get(getFaculty)
  .post(protect, authorize('admin'), createFaculty);

router.route('/:id')
  .get(getFacultyById)
  .put(protect, authorize('admin', 'faculty'), updateFaculty)
  .delete(protect, authorize('admin'), deleteFaculty);

module.exports = router;
