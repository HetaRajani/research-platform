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

/**
 * @desc    Get department-wise faculty, publication, and citation analytics from MongoDB
 * @route   GET /api/analytics/departments
 * @access  Public
 */
const getDepartmentAnalytics = async (req, res, next) => {
  try {
    const departmentStats = await Faculty.aggregate([
      {
        $match: {
          department: { $exists: true, $ne: null, $nin: ['', null] }
        }
      },
      {
        $project: {
          department: { $trim: { input: '$department' } }
        }
      },
      {
        $match: {
          department: { $ne: '' }
        }
      },
      {
        $group: {
          _id: '$department',
          facultyCount: { $sum: 1 },
          facultyIds: { $push: '$_id' }
        }
      },
      {
        $lookup: {
          from: 'publications',
          let: { deptFacultyIds: '$facultyIds' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $gt: [
                    {
                      $size: {
                        $setIntersection: [
                          { $ifNull: ['$facultyIds', []] },
                          '$$deptFacultyIds'
                        ]
                      }
                    },
                    0
                  ]
                }
              }
            },
            {
              $project: {
                _id: 1,
                citations: {
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
          ],
          as: 'deptPublications'
        }
      },
      {
        $project: {
          _id: 0,
          department: '$_id',
          facultyCount: 1,
          publicationCount: { $size: '$deptPublications' },
          citationCount: { $sum: '$deptPublications.citations' }
        }
      },
      {
        $sort: { department: 1 }
      }
    ]);

    const formattedStats = (departmentStats || []).map(item => ({
      department: item.department,
      facultyCount: item.facultyCount || 0,
      publicationCount: item.publicationCount || 0,
      citationCount: item.citationCount || 0
    }));

    res.status(200).json({
      success: true,
      data: formattedStats
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get research domain publication, citation, and faculty analytics from MongoDB
 * @route   GET /api/analytics/research-domains
 * @access  Public
 */
const getResearchDomainAnalytics = async (req, res, next) => {
  try {
    const domainStats = await ResearchDomain.aggregate([
      {
        $match: {
          name: { $exists: true, $ne: null, $nin: ['', null] }
        }
      },
      {
        $project: {
          name: { $trim: { input: '$name' } }
        }
      },
      {
        $match: {
          name: { $ne: '' }
        }
      },
      {
        $lookup: {
          from: 'publications',
          let: { domainId: '$_id', domainName: '$name' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $in: ['$$domainId', { $ifNull: ['$researchDomains', []] }] },
                    { $in: [{ $toString: '$$domainId' }, { $ifNull: ['$researchDomains', []] }] },
                    { $in: ['$$domainName', { $ifNull: ['$researchDomains', []] }] }
                  ]
                }
              }
            },
            {
              $project: {
                _id: 1,
                facultyIds: {
                  $filter: {
                    input: { $ifNull: ['$facultyIds', []] },
                    as: 'f',
                    cond: { $ne: ['$$f', null] }
                  }
                },
                citations: {
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
          ],
          as: 'domainPublications'
        }
      },
      {
        $project: {
          _id: 0,
          domain: '$name',
          publicationCount: { $size: '$domainPublications' },
          citationCount: { $sum: '$domainPublications.citations' },
          facultyCount: {
            $size: {
              $reduce: {
                input: '$domainPublications.facultyIds',
                initialValue: [],
                in: { $setUnion: ['$$value', '$$this'] }
              }
            }
          }
        }
      },
      {
        $sort: { publicationCount: -1, domain: 1 }
      }
    ]);

    const formattedStats = (domainStats || []).map(item => ({
      domain: item.domain,
      publicationCount: item.publicationCount || 0,
      citationCount: item.citationCount || 0,
      facultyCount: item.facultyCount || 0
    }));

    res.status(200).json({
      success: true,
      data: formattedStats
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get collaboration network analytics between faculty members based on shared publications
 * @route   GET /api/analytics/collaborations
 * @access  Public
 */
const getCollaborationsAnalytics = async (req, res, next) => {
  try {
    const collaborations = await Publication.aggregate([
      {
        $match: {
          'facultyIds.1': { $exists: true }
        }
      },
      {
        $project: {
          facultyIds: {
            $setUnion: [
              {
                $filter: {
                  input: { $ifNull: ['$facultyIds', []] },
                  as: 'f',
                  cond: { $ne: ['$$f', null] }
                }
              },
              []
            ]
          }
        }
      },
      {
        $match: {
          'facultyIds.1': { $exists: true }
        }
      },
      {
        $project: {
          pairs: {
            $reduce: {
              input: { $range: [0, { $size: '$facultyIds' }] },
              initialValue: [],
              in: {
                $concatArrays: [
                  '$$value',
                  {
                    $map: {
                      input: { $range: [{ $add: ['$$this', 1] }, { $size: '$facultyIds' }] },
                      as: 'j',
                      in: {
                        $cond: [
                          { $lt: [{ $arrayElemAt: ['$facultyIds', '$$this'] }, { $arrayElemAt: ['$facultyIds', '$$j'] }] },
                          {
                            f1: { $arrayElemAt: ['$facultyIds', '$$this'] },
                            f2: { $arrayElemAt: ['$facultyIds', '$$j'] }
                          },
                          {
                            f1: { $arrayElemAt: ['$facultyIds', '$$j'] },
                            f2: { $arrayElemAt: ['$facultyIds', '$$this'] }
                          }
                        ]
                      }
                    }
                  }
                ]
              }
            }
          }
        }
      },
      { $unwind: '$pairs' },
      {
        $group: {
          _id: { f1: '$pairs.f1', f2: '$pairs.f2' },
          publicationCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'faculties',
          localField: '_id.f1',
          foreignField: '_id',
          as: 'faculty1Doc'
        }
      },
      {
        $lookup: {
          from: 'faculties',
          localField: '_id.f2',
          foreignField: '_id',
          as: 'faculty2Doc'
        }
      },
      {
        $project: {
          _id: 0,
          faculty1: { $toString: '$_id.f1' },
          faculty2: { $toString: '$_id.f2' },
          faculty1Name: { $ifNull: [{ $first: '$faculty1Doc.name' }, 'Unknown'] },
          faculty2Name: { $ifNull: [{ $first: '$faculty2Doc.name' }, 'Unknown'] },
          publicationCount: 1,
          collaborationStrength: '$publicationCount'
        }
      },
      {
        $sort: { publicationCount: -1, faculty1Name: 1, faculty2Name: 1 }
      }
    ]);

    const formattedCollaborations = (collaborations || []).map(item => ({
      faculty1: item.faculty1,
      faculty2: item.faculty2,
      faculty1Name: item.faculty1Name,
      faculty2Name: item.faculty2Name,
      publicationCount: item.publicationCount || 0,
      collaborationStrength: item.collaborationStrength || item.publicationCount || 0
    }));

    res.status(200).json({
      success: true,
      data: formattedCollaborations
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOverviewAnalytics,
  getYearlyAnalytics,
  getDepartmentAnalytics,
  getResearchDomainAnalytics,
  getCollaborationsAnalytics
};


