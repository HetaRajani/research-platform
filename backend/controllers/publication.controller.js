const publicationService = require('../services/publication.service');

/**
 * @desc    Get publications with filtering, search, and pagination
 * @route   GET /api/publications
 * @access  Public
 */
const getPublications = async (req, res, next) => {
  try {
    const result = await publicationService.getPublications(req.query);

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single publication by ID or publicationCode
 * @route   GET /api/publications/:id
 * @access  Public
 */
const getPublicationById = async (req, res, next) => {
  try {
    const publication = await publicationService.getPublicationById(req.params.id);

    if (!publication) {
      return res.status(404).json({
        success: false,
        message: 'Publication not found'
      });
    }

    res.status(200).json({
      success: true,
      data: publication
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a new publication
 * @route   POST /api/publications
 * @access  Private (Admin or Faculty)
 */
const createPublication = async (req, res, next) => {
  try {
    const { title, year } = req.body;

    // Validate essential fields explicitly
    if (!title || title.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Publication title is required'
      });
    }

    if (year === undefined || year === null || isNaN(year)) {
      return res.status(400).json({
        success: false,
        message: 'A valid publication year is required'
      });
    }

    if (Number(year) < 1900) {
      return res.status(400).json({
        success: false,
        message: 'Publication year cannot be earlier than 1900'
      });
    }

    // If logged in as faculty, automatically associate their facultyId
    if (req.user && req.user.role === 'faculty' && req.user.facultyId) {
      const facultyIdStr = req.user.facultyId.toString();
      const existingFacultyIds = (req.body.facultyIds || []).map(id => id.toString());
      if (!existingFacultyIds.includes(facultyIdStr)) {
        req.body.facultyIds = [...(req.body.facultyIds || []), req.user.facultyId];
      }
    }

    const publication = await publicationService.createPublication(req.body);

    res.status(201).json({
      success: true,
      data: publication
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update an existing publication by ID
 * @route   PUT /api/publications/:id
 * @access  Private (Admin or author Faculty)
 */
const updatePublication = async (req, res, next) => {
  try {
    if (req.body.year !== undefined && (isNaN(req.body.year) || Number(req.body.year) < 1900)) {
      return res.status(400).json({
        success: false,
        message: 'Publication year must be a valid number and at least 1900'
      });
    }

    const existingPub = await publicationService.getPublicationById(req.params.id);

    if (!existingPub) {
      return res.status(404).json({
        success: false,
        message: 'Publication not found'
      });
    }

    // Role check: Faculty can only update publications they are an author/co-author of
    if (req.user && req.user.role !== 'admin') {
      const userFacultyId = req.user.facultyId ? req.user.facultyId.toString() : null;
      const isAuthor = userFacultyId && Array.isArray(existingPub.facultyIds) && existingPub.facultyIds.some(
        f => (f._id ? f._id.toString() : f.toString()) === userFacultyId
      );

      if (!isAuthor) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to modify another faculty member\'s publication'
        });
      }
    }

    const updated = await publicationService.updatePublication(req.params.id, req.body);

    res.status(200).json({
      success: true,
      data: updated
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a publication by ID
 * @route   DELETE /api/publications/:id
 * @access  Private (Admin or author Faculty)
 */
const deletePublication = async (req, res, next) => {
  try {
    const existingPub = await publicationService.getPublicationById(req.params.id);

    if (!existingPub) {
      return res.status(404).json({
        success: false,
        message: 'Publication not found'
      });
    }

    // Role check: Faculty can only delete publications they are an author/co-author of
    if (req.user && req.user.role !== 'admin') {
      const userFacultyId = req.user.facultyId ? req.user.facultyId.toString() : null;
      const isAuthor = userFacultyId && Array.isArray(existingPub.facultyIds) && existingPub.facultyIds.some(
        f => (f._id ? f._id.toString() : f.toString()) === userFacultyId
      );

      if (!isAuthor) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to delete another faculty member\'s publication'
        });
      }
    }

    await publicationService.deletePublication(req.params.id);

    res.status(200).json({
      success: true,
      data: {
        message: 'Publication deleted successfully'
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPublications,
  getPublicationById,
  createPublication,
  updatePublication,
  deletePublication
};
