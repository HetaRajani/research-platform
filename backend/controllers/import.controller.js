const importService = require('../services/import.service');

/**
 * @desc    Import normalized publications from an identified source
 * @route   POST /api/import/publications
 * @access  Public
 */
const importPublications = async (req, res, next) => {
  try {
    const result = await importService.importPublications(req.body);

    res.status(201).json({
      success: true,
      message: `Successfully imported ${result.count} publication${result.count === 1 ? '' : 's'} from ${result.source}`,
      count: result.count,
      source: result.source,
      data: result.publications
    });
  } catch (error) {
    if (error.status === 400 || error.validationErrors) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Import validation failed',
        errors: error.validationErrors || [error.message]
      });
    }
    next(error);
  }
};

/**
 * @desc    Get list of supported import sources
 * @route   GET /api/import/sources
 * @access  Public
 */
const getSupportedSources = (req, res) => {
  res.status(200).json({
    success: true,
    data: importService.SUPPORTED_SOURCES
  });
};

module.exports = {
  importPublications,
  getSupportedSources
};
