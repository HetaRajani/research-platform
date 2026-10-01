const mongoose = require('mongoose');
const { Faculty, Publication, ResearchDomain, Collaboration } = require('../models');
const emergingResearchService = require('../services/emergingResearch.service');
const collaboratorRecommendationService = require('../services/collaboratorRecommendation.service');

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
      Publication.countDocuments({ isDuplicate: { $ne: true } }),
      ResearchDomain.countDocuments(),
      Collaboration.countDocuments(),
      Publication.aggregate([
        { $match: { isDuplicate: { $ne: true } } },
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
      { $match: { isDuplicate: { $ne: true } } },
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
                isDuplicate: { $ne: true },
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
 * Helper to compute analytics from automated predictedResearchDomains (Phase 12D)
 * Evaluates non-duplicate publications, aggregates publication count, citations,
 * unique faculty count, average prediction confidence, and prediction count per domain.
 * 
 * Duplicate safety: completely ignores isDuplicate === true records.
 * Anti double-counting: a publication contributes only once to publicationCount and citationCount per domain.
 * 
 * @returns {Promise<Array<object>>}
 */
const computePredictedDomainStats = async () => {
  const predictedAgg = await Publication.aggregate([
    // 1. Exclude soft-merged duplicate records and publications without predictions
    {
      $match: {
        isDuplicate: { $ne: true },
        'predictedResearchDomains.0': { $exists: true }
      }
    },
    // 2. Unwind predictedResearchDomains
    {
      $unwind: '$predictedResearchDomains'
    },
    // 3. Project normalized fields
    {
      $project: {
        publicationId: '$_id',
        domain: { $trim: { input: '$predictedResearchDomains.name' } },
        confidence: '$predictedResearchDomains.confidence',
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
        },
        facultyIds: {
          $filter: {
            input: { $ifNull: ['$facultyIds', []] },
            as: 'f',
            cond: { $ne: ['$$f', null] }
          }
        }
      }
    },
    // 4. Ensure domain is a non-empty string
    {
      $match: {
        domain: { $exists: true, $nin: ['', null] }
      }
    },
    // 5. Deduplicate per (domain, publicationId):
    // Prevents double-counting if a publication accidentally has duplicate prediction entries
    {
      $group: {
        _id: {
          domain: '$domain',
          publicationId: '$publicationId'
        },
        citations: { $first: '$citations' },
        facultyIds: { $first: '$facultyIds' },
        confidencesOnPub: {
          $push: {
            $cond: [
              {
                $and: [
                  { $ne: ['$confidence', null] },
                  { $gte: ['$confidence', 0] },
                  { $lte: ['$confidence', 1] }
                ]
              },
              '$confidence',
              '$$REMOVE'
            ]
          }
        },
        predictionEntriesOnPub: { $sum: 1 }
      }
    },
    // 6. Group by domain across all unique publications
    {
      $group: {
        _id: '$_id.domain',
        publicationCount: { $sum: 1 },
        citationCount: { $sum: '$citations' },
        predictionCount: { $sum: '$predictionEntriesOnPub' },
        facultyIdsArray: { $push: '$facultyIds' },
        allConfidences: { $push: '$confidencesOnPub' }
      }
    },
    // 7. Calculate final metrics
    {
      $project: {
        _id: 0,
        domain: '$_id',
        publicationCount: '$publicationCount',
        citationCount: '$citationCount',
        predictionCount: '$predictionCount',
        facultyCount: {
          $size: {
            $reduce: {
              input: '$facultyIdsArray',
              initialValue: [],
              in: { $setUnion: ['$$value', '$$this'] }
            }
          }
        },
        flattenedConfidences: {
          $reduce: {
            input: '$allConfidences',
            initialValue: [],
            in: { $concatArrays: ['$$value', '$$this'] }
          }
        }
      }
    },
    {
      $project: {
        domain: 1,
        publicationCount: 1,
        citationCount: 1,
        facultyCount: 1,
        predictionCount: 1,
        averageConfidence: {
          $cond: [
            { $gt: [{ $size: '$flattenedConfidences' }, 0] },
            { $round: [{ $avg: '$flattenedConfidences' }, 2] },
            null
          ]
        }
      }
    },
    {
      $sort: { publicationCount: -1, domain: 1 }
    }
  ]);

  return (predictedAgg || []).map(item => ({
    domain: item.domain,
    publicationCount: item.publicationCount || 0,
    citationCount: item.citationCount || 0,
    facultyCount: item.facultyCount || 0,
    averageConfidence: item.averageConfidence !== null && !isNaN(item.averageConfidence) ? item.averageConfidence : null,
    predictionCount: item.predictionCount || item.publicationCount || 0
  }));
};

/**
 * @desc    Get research domain publication, citation, and faculty analytics from MongoDB
 * @route   GET /api/analytics/research-domains
 * @access  Public
 */
const getResearchDomainAnalytics = async (req, res, next) => {
  try {
    const type = req.query.type ? String(req.query.type).toLowerCase() : null;
    const isSplit = req.query.split === 'true' || req.query.format === 'split' || req.query.view === 'split' || type === 'split';

    // 1. If client specifically requested predicted domains:
    if (type === 'predicted') {
      const predictedStats = await computePredictedDomainStats();
      return res.status(200).json({
        success: true,
        data: predictedStats,
        predicted: predictedStats
      });
    }

    // 2. Compute manual domain analytics (existing pipeline)
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
                isDuplicate: { $ne: true },
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

    const formattedManualStats = (domainStats || []).map(item => ({
      domain: item.domain,
      publicationCount: item.publicationCount || 0,
      citationCount: item.citationCount || 0,
      facultyCount: item.facultyCount || 0
    }));

    // If client specifically requested only manual domains:
    if (type === 'manual') {
      return res.status(200).json({
        success: true,
        data: formattedManualStats,
        manual: formattedManualStats
      });
    }

    // Compute predicted domain stats for enhanced analytics response
    const predictedStats = await computePredictedDomainStats();

    // If client requested split format:
    if (isSplit) {
      return res.status(200).json({
        success: true,
        data: {
          manual: formattedManualStats,
          predicted: predictedStats
        },
        manual: formattedManualStats,
        predicted: predictedStats
      });
    }

    // Default backward-compatible format:
    // data is array of manual stats (preserving existing frontend and tests),
    // and predicted & manual arrays are also exposed as top-level properties!
    res.status(200).json({
      success: true,
      data: formattedManualStats,
      manual: formattedManualStats,
      predicted: predictedStats
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get automated predicted research domain analytics (Phase 12D)
 * @route   GET /api/analytics/research-domains/predicted
 * @access  Public
 */
const getPredictedResearchDomainAnalytics = async (req, res, next) => {
  try {
    const predictedStats = await computePredictedDomainStats();
    res.status(200).json({
      success: true,
      data: predictedStats
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get explainable rule-based emerging research analytics
 * @route   GET /api/analytics/emerging-research
 * @access  Public
 */
const getEmergingResearchAnalytics = async (req, res, next) => {
  try {
    const data = await emergingResearchService.getEmergingResearch({
      minimumPublications: req.query.minimumPublications,
      minimumGrowthRate: req.query.minimumGrowthRate,
      recentYears: req.query.recentYears
    });

    res.status(200).json({
      success: true,
      data
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
          isDuplicate: { $ne: true },
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

/**
 * @desc    Recommend faculty with overlapping research domains
 * @route   GET /api/analytics/collaborator-recommendations/:facultyId
 * @access  Public, matching the existing analytics routes
 */
const getCollaboratorRecommendations = async (req, res, next) => {
  if (!mongoose.isObjectIdOrHexString(req.params.facultyId)) {
    return res.status(400).json({ success: false, message: 'Invalid faculty ID' });
  }

  try {
    const recommendations = await collaboratorRecommendationService.getCollaboratorRecommendations(req.params.facultyId);
    if (recommendations === null) {
      return res.status(404).json({ success: false, message: 'Faculty not found' });
    }

    return res.status(200).json({ success: true, data: recommendations });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getOverviewAnalytics,
  getYearlyAnalytics,
  getDepartmentAnalytics,
  getResearchDomainAnalytics,
  getPredictedResearchDomainAnalytics,
  getEmergingResearchAnalytics,
  getCollaboratorRecommendations,
  getCollaborationsAnalytics
};


