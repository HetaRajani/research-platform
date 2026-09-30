const orcidService = require('../services/orcid.service');
const scopusService = require('../services/scopus.service');
const googleScholarService = require('../services/googleScholar.service');

/**
 * @desc    Get normalized public research works from ORCID for a faculty member
 * @route   GET /api/integrations/orcid/:facultyId
 * @access  Public
 */
const getFacultyOrcidWorks = async (req, res, next) => {
  try {
    const result = await orcidService.getFacultyOrcidWorks(req.params.facultyId);
    res.status(200).json(result);
  } catch (error) {
    if (error.status && error.status <= 504) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
        code: error.code || undefined
      });
    }
    next(error);
  }
};

/**
 * @desc    Get normalized publications from Elsevier Scopus for a faculty member
 * @route   GET /api/integrations/scopus/:facultyId
 * @access  Public
 */
const getFacultyScopusPublications = async (req, res, next) => {
  try {
    const result = await scopusService.getFacultyScopusPublications(req.params.facultyId);
    res.status(200).json(result);
  } catch (error) {
    if (error.status && error.status <= 503) {
      return res.status(error.status).json({
        success: false,
        configured: error.configured !== undefined ? error.configured : false,
        message: error.message,
        code: error.code || undefined,
        faculty: error.faculty || undefined
      });
    }
    next(error);
  }
};

/**
 * @desc    Get normalized publications from Google Scholar via authorized provider
 * @route   GET /api/integrations/google-scholar/:facultyId
 * @access  Public
 */
const getFacultyGoogleScholarPublications = async (req, res, next) => {
  try {
    const result = await googleScholarService.getFacultyScholarPublications(req.params.facultyId);
    res.status(200).json(result);
  } catch (error) {
    if (error.status && error.status <= 503) {
      return res.status(error.status).json({
        success: false,
        configured: error.configured !== undefined ? error.configured : false,
        message: error.message,
        code: error.code || undefined,
        faculty: error.faculty || undefined
      });
    }
    next(error);
  }
};

/**
 * @desc    Import user/institution provided Google Scholar publications for a faculty member
 * @route   POST /api/integrations/google-scholar/:facultyId/import
 * @access  Public
 */
const importFacultyGoogleScholarPublications = async (req, res, next) => {
  try {
    const publications = Array.isArray(req.body) ? req.body : req.body.publications;
    const result = await googleScholarService.importFacultyScholarPublications(
      req.params.facultyId,
      publications
    );
    res.status(201).json(result);
  } catch (error) {
    if (error.status && error.status <= 500) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
        errors: error.validationErrors || [error.message]
      });
    }
    next(error);
  }
};

/**
 * @desc    Import ORCID works for a faculty member
 * @route   POST /api/integrations/orcid/:facultyId/import
 * @access  Public
 */
const importFacultyOrcidWorks = async (req, res, next) => {
  try {
    const publications = Array.isArray(req.body) ? req.body : req.body.publications;
    const result = await orcidService.importFacultyOrcidWorks(
      req.params.facultyId,
      publications
    );
    res.status(201).json(result);
  } catch (error) {
    if (error.status && error.status <= 500) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
        errors: error.validationErrors || [error.message]
      });
    }
    next(error);
  }
};

/**
 * @desc    Import Scopus publications for a faculty member
 * @route   POST /api/integrations/scopus/:facultyId/import
 * @access  Public
 */
const importFacultyScopusPublications = async (req, res, next) => {
  try {
    const publications = Array.isArray(req.body) ? req.body : req.body.publications;
    const result = await scopusService.importFacultyScopusPublications(
      req.params.facultyId,
      publications
    );
    res.status(201).json(result);
  } catch (error) {
    if (error.status && error.status <= 500) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
        errors: error.validationErrors || [error.message]
      });
    }
    next(error);
  }
};

module.exports = {
  getFacultyOrcidWorks,
  getFacultyScopusPublications,
  getFacultyGoogleScholarPublications,
  importFacultyGoogleScholarPublications,
  importFacultyOrcidWorks,
  importFacultyScopusPublications
};
