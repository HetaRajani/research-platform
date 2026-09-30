const importService = require('../services/import.service');

/**
 * @desc    Import normalized publications from an identified source
 * @route   POST /api/import/publications
 * @access  Public
 */
const importPublications = async (req, res, next) => {
  try {
    const result = await importService.importPublications(req.body);

    const statusCode = result.count > 0 ? 201 : 200;

    let message;
    if (result.count > 0 && result.duplicatesDetected && result.duplicatesDetected.length > 0) {
      message = `Successfully imported ${result.count} publication${result.count === 1 ? '' : 's'} (${result.duplicatesDetected.length} potential duplicate${result.duplicatesDetected.length === 1 ? '' : 's'} skipped)`;
    } else if (result.count > 0) {
      message = `Successfully imported ${result.count} publication${result.count === 1 ? '' : 's'} from ${result.source}`;
    } else if (result.duplicatesDetected && result.duplicatesDetected.length > 0) {
      message = `Import completed: 0 new publications created, ${result.duplicatesDetected.length} potential duplicate${result.duplicatesDetected.length === 1 ? '' : 's'} identified`;
    } else {
      message = `Processed 0 publications from ${result.source}`;
    }

    res.status(statusCode).json({
      success: true,
      message,
      count: result.count,
      source: result.source,
      data: result.publications,
      duplicates: result.duplicatesDetected || [],
      summary: result.summary
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
