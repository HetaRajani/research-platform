const { Faculty, Publication, ResearchDomain, Collaboration } = require('../models');

/**
 * @desc    Get dashboard overview analytics from MongoDB
 * @route   GET /api/analytics/overview
 * @access  Public
 */
const getOverviewAnalytics = async (req, res, next) => {
  try {
    const [
      totalFaculty,
      totalPublications,
      totalResearchDomains,
      totalCollaborations,
      citationAgg
    ] = await Promise.all([
      Faculty.countDocuments(),
      Publication.countDocuments(),
      ResearchDomain.countDocuments(),
      Collaboration.countDocuments(),
      Publication.aggregate([
        {
          $group: {
            _id: null,
            totalCitations: { $sum: '$citations' },
            avgCitations: { $avg: '$citations' }
          }
        }
      ])
    ]);

    const totalCitations = citationAgg.length > 0 && citationAgg[0].totalCitations != null
      ? citationAgg[0].totalCitations
      : 0;

    const averageCitations = totalPublications > 0
      ? Math.round((totalCitations / totalPublications) * 100) / 100
      : 0;

    res.status(200).json({
      success: true,
      data: {
        totalFaculty,
        totalPublications,
        totalCitations,
        averageCitations,
        totalResearchDomains,
        totalCollaborations
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get year-wise publication and citation analytics from MongoDB
 * @route   GET /api/analytics/yearly
 * @access  Public
 */
const getYearlyAnalytics = async (req, res, next) => {
  try {
    const yearlyStats = await Publication.aggregate([
      {
        $project: {
          citations: 1,
          parsedYear: {
            $convert: {
              input: '$year',
              to: 'int',
              onError: null,
              onNull: null
            }
          }
        }
      },
      {
        $match: {
          parsedYear: { $ne: null, $gt: 0 }
        }
      },
      {
        $group: {
          _id: '$parsedYear',
          publications: { $sum: 1 },
          citations: {
            $sum: {
              $max: [
                0,
                {
                  $convert: {
                    input: '$citations',
                    to: 'int',
                    onError: 0,
                    onNull: 0
                  }
                }
              ]
            }
          }
        }
      },
      {
        $sort: { _id: 1 }
      },
      {
        $project: {
          _id: 0,
          year: '$_id',
          publications: 1,
          citations: 1
        }
      }
    ]);

    const formattedStats = (yearlyStats || []).map(item => ({
      year: item.year,
      publications: item.publications,
      citations: item.citations
    }));

    res.status(200).json({
      success: true,
      data: formattedStats
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOverviewAnalytics,
  getYearlyAnalytics
};
