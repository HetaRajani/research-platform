const publicationService = require('../services/publication.service');
const duplicateDetectionService = require('../services/duplicateDetection.service');
const duplicateReviewService = require('../services/duplicateReview.service');
const domainClassificationService = require('../services/domainClassification.service');

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

    const result = await publicationService.createPublication(req.body);

    if (result && result.isDuplicate) {
      return res.status(409).json({
        success: false,
        isDuplicate: true,
        message: result.message || 'Publication was not created because a strong duplicate already exists',
        existingPublicationId: result.existingPublicationId,
        existingPublication: result.existingPublication,
        matchingSignals: result.matchingSignals,
        similarityScore: result.similarityScore,
        confidence: result.confidence,
        matchType: result.matchType,
        reasons: result.reasons
      });
    }

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    if (error.status === 400 || error.validationErrors) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Publication validation failed',
        errors: error.validationErrors || [error.message]
      });
    }
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

/**
 * @desc    Get potential duplicate publications for a publication by ID
 * @route   GET /api/publications/:id/duplicates
 * @access  Public
 */
const getPublicationDuplicates = async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
    const result = await publicationService.getPublicationDuplicates(req.params.id, { limit });

    res.status(200).json({
      success: true,
      publicationId: result.publicationId,
      targetPublication: result.targetPublication,
      count: result.count,
      candidates: result.candidates
    });
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({
        success: false,
        message: error.message || 'Publication not found'
      });
    }
    if (error.status === 400) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Invalid publication request'
      });
    }
    next(error);
  }
};

/**
 * @desc    Check potential duplicates for an incoming publication before saving
 * @route   POST /api/publications/check-duplicates
 * @access  Public
 */
const checkPublicationDuplicates = async (req, res, next) => {
  try {
    const rawPub = req.body.publication || req.body;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
    const result = await duplicateDetectionService.findDuplicatesForRecord(rawPub, { limit });

    res.status(200).json({
      success: true,
      count: result.count,
      totalPotentialDuplicates: result.totalPotentialDuplicates,
      candidates: result.candidates
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get duplicate candidate reviews with filtering and pagination
 * @route   GET /api/publications/duplicates
 * @access  Private (Admin only)
 */
const getDuplicateReviews = async (req, res, next) => {
  try {
    const filters = {
      status: req.query.status,
      confidence: req.query.confidence,
      publicationId: req.query.publicationId
    };
    const options = {
      page: req.query.page,
      limit: req.query.limit,
      autoSync: req.query.autoSync === 'true' || req.query.sync === 'true'
    };

    const result = await duplicateReviewService.getDuplicateReviews(filters, options);

    res.status(200).json({
      success: true,
      count: result.data.length,
      total: result.pagination.total,
      pagination: result.pagination,
      data: result.data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Confirm a duplicate review record
 * @route   PATCH /api/publications/duplicates/:id/confirm
 * @access  Private (Admin only)
 */
const confirmDuplicateReview = async (req, res, next) => {
  try {
    const review = await duplicateReviewService.confirmDuplicateReview(req.params.id, req.user._id);

    res.status(200).json({
      success: true,
      message: 'Duplicate review confirmed successfully',
      data: review
    });
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({
        success: false,
        message: error.message || 'Duplicate review not found'
      });
    }
    if (error.status === 400) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Invalid duplicate review request'
      });
    }
    next(error);
  }
};

/**
 * @desc    Reject a duplicate review record
 * @route   PATCH /api/publications/duplicates/:id/reject
 * @access  Private (Admin only)
 */
const rejectDuplicateReview = async (req, res, next) => {
  try {
    const review = await duplicateReviewService.rejectDuplicateReview(req.params.id, req.user._id);

    res.status(200).json({
      success: true,
      message: 'Duplicate review rejected successfully',
      data: review
    });
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({
        success: false,
        message: error.message || 'Duplicate review not found'
      });
    }
    if (error.status === 400) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Invalid duplicate review request'
      });
    }
    next(error);
  }
};

/**
 * @desc    Merge two confirmed duplicate publications
 * @route   POST /api/publications/duplicates/:id/merge
 * @access  Private (Admin only)
 */
const mergeDuplicateReview = async (req, res, next) => {
  try {
    const primaryPublicationId = req.body && req.body.primaryPublicationId ? req.body.primaryPublicationId : undefined;
    const userId = req.user && req.user._id ? req.user._id : null;

    const result = await duplicateReviewService.mergeDuplicateReview(
      req.params.id,
      userId,
      { primaryPublicationId }
    );

    res.status(200).json({
      success: true,
      message: 'Publications merged successfully',
      data: result
    });
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({
        success: false,
        message: error.message || 'Resource not found'
      });
    }
    if (error.status === 400) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Invalid merge request'
      });
    }
    next(error);
  }
};

/**
 * @desc    Predict research domains for an existing publication
 * @route   GET /api/publications/:id/research-domains/predict
 * @access  Public
 */
const predictPublicationResearchDomains = async (req, res, next) => {
  try {
    const minConfidence = req.query.minConfidence !== undefined ? parseFloat(req.query.minConfidence) : undefined;
    const maxDomains = req.query.maxDomains !== undefined
      ? parseInt(req.query.maxDomains, 10)
      : (req.query.limit !== undefined ? parseInt(req.query.limit, 10) : undefined);
    const includeEvidence = req.query.includeEvidence !== undefined
      ? (req.query.includeEvidence === 'true' || req.query.includeEvidence === '1')
      : true;

    const result = await domainClassificationService.predictDomainsForPublicationId(
      req.params.id,
      {
        minConfidence,
        maxDomains,
        topK: maxDomains,
        includeEvidence
      }
    );

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({
        success: false,
        message: error.message || 'Publication not found'
      });
    }
    if (error.status === 400) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Invalid publication request'
      });
    }
    next(error);
  }
};

/**
 * @desc    Predict and store research domains for an existing publication (Phase 12C)
 * @route   POST /api/publications/:id/research-domains/predict
 * @access  Private (Admin or Faculty)
 */
const applyPublicationResearchDomains = async (req, res, next) => {
  try {
    const minConfidence = req.query.minConfidence !== undefined
      ? parseFloat(req.query.minConfidence)
      : (req.body && req.body.minConfidence !== undefined ? parseFloat(req.body.minConfidence) : undefined);

    const maxDomains = req.query.maxDomains !== undefined
      ? parseInt(req.query.maxDomains, 10)
      : (req.query.limit !== undefined
          ? parseInt(req.query.limit, 10)
          : (req.body && req.body.maxDomains !== undefined
              ? parseInt(req.body.maxDomains, 10)
              : (req.body && req.body.limit !== undefined ? parseInt(req.body.limit, 10) : undefined)));

    const includeEvidence = req.query.includeEvidence !== undefined
      ? (req.query.includeEvidence === 'true' || req.query.includeEvidence === '1')
      : (req.body && req.body.includeEvidence !== undefined ? Boolean(req.body.includeEvidence) : true);

    const result = await domainClassificationService.predictAndStorePublicationResearchDomains(
      req.params.id,
      {
        minConfidence,
        maxDomains,
        topK: maxDomains,
        includeEvidence
      }
    );

    res.status(200).json({
      success: true,
      message: 'Research domains predicted and applied successfully',
      data: result
    });
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({
        success: false,
        message: error.message || 'Publication not found'
      });
    }
    if (error.status === 400) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Invalid publication request'
      });
    }
    next(error);
  }
};

module.exports = {
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
};
