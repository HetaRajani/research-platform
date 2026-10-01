const mongoose = require('mongoose');
const Faculty = require('../models/Faculty');
const Publication = require('../models/Publication');
const ResearchDomain = require('../models/ResearchDomain');
const emergingResearchService = require('./emergingResearch.service');
const collaboratorRecommendationService = require('./collaboratorRecommendation.service');
const productivityForecastService = require('./productivityForecast.service');

const SUPPORTED_TOPICS = [
  'publications',
  'citations',
  'research domains',
  'emerging research',
  'collaborator recommendations',
  'productivity forecasts'
];

const detectIntent = question => {
  if (typeof question !== 'string') return 'UNKNOWN';
  const normalizedQuestion = question.toLowerCase();

  if (/\bhelp\b|what can you do|supported topics/.test(normalizedQuestion)) return 'HELP';
  if (/\bforecast\b|\bforecasting\b|\bproductivity\b|predict.{0,30}publication/.test(normalizedQuestion)) {
    return 'PRODUCTIVITY_FORECAST';
  }
  if (/\bcollaborat\w*\b|\bco-?author\b|work with/.test(normalizedQuestion)) {
    return 'COLLABORATOR_RECOMMENDATIONS';
  }
  if (/\bemerging\b|\bgrowing research\b|research trends?/.test(normalizedQuestion)) return 'EMERGING_RESEARCH';
  if (/research domains?|research areas?|research fields?/.test(normalizedQuestion)) return 'RESEARCH_DOMAINS';
  if (/citations?|\bcited\b|\bh-?index\b|\bi10\b/.test(normalizedQuestion)) return 'CITATION_STATISTICS';
  if (/publications?|\bpapers?\b|\bpublished\b/.test(normalizedQuestion)) return 'PUBLICATION_COUNT';
  return 'UNKNOWN';
};

const parseDomainReference = reference => {
  if (typeof reference === 'string') {
    const value = reference.trim();
    if (!value) return null;
    return mongoose.isValidObjectId(value) ? { id: value } : { name: value };
  }
  if (!reference || typeof reference !== 'object') return null;
  if (typeof reference.name === 'string' && reference.name.trim()) {
    return { name: reference.name.trim() };
  }
  const id = reference._id || reference;
  return mongoose.isValidObjectId(id) ? { id: String(id) } : null;
};

const getFacultyResearchDomains = async facultyId => {
  const publications = await Publication.find({
    facultyIds: facultyId,
    isDuplicate: { $ne: true }
  })
    .select('researchDomains predictedResearchDomains.name isDuplicate')
    .lean();
  const activePublications = (publications || []).filter(publication => publication && publication.isDuplicate !== true);
  const manualReferences = activePublications.flatMap(publication =>
    (publication.researchDomains || []).map(parseDomainReference).filter(Boolean)
  );
  const domainIds = [...new Set(manualReferences.filter(reference => reference.id).map(reference => reference.id))];
  const domains = domainIds.length
    ? await ResearchDomain.find({ _id: { $in: domainIds } }).select('_id name').lean()
    : [];
  const namesById = new Map((domains || []).map(domain => [String(domain._id), domain.name]));
  const manual = new Set();
  const predicted = new Set();

  for (const reference of manualReferences) {
    const name = reference.name || namesById.get(reference.id);
    if (name) manual.add(name);
  }
  for (const publication of activePublications) {
    for (const prediction of publication.predictedResearchDomains || []) {
      const name = typeof prediction?.name === 'string' ? prediction.name.trim() : '';
      if (name) predicted.add(name);
    }
  }

  return {
    manual: [...manual].sort((nameA, nameB) => nameA.localeCompare(nameB)),
    predicted: [...predicted].sort((nameA, nameB) => nameA.localeCompare(nameB))
  };
};

const answerResearchQuestion = async ({ question, facultyId } = {}, analyticsProviders = {}) => {
  const intent = detectIntent(question);
  const hasFacultyId = facultyId !== undefined && facultyId !== null && facultyId !== '';

  if (hasFacultyId && !mongoose.isObjectIdOrHexString(facultyId)) {
    return { errorStatus: 400, errorMessage: 'Invalid faculty ID' };
  }

  let faculty = null;
  if (hasFacultyId) {
    faculty = await Faculty.findById(facultyId).select('_id name').lean();
    if (!faculty) return { errorStatus: 404, errorMessage: 'Faculty not found' };
  }

  if (intent === 'HELP') {
    return {
      intent,
      answer: `I can help with ${SUPPORTED_TOPICS.join(', ')}.`,
      data: { supportedTopics: SUPPORTED_TOPICS },
      sources: []
    };
  }

  if (intent === 'UNKNOWN') {
    return {
      intent,
      answer: 'I can help with publications, citations, research domains, emerging research, collaborator recommendations, and productivity forecasts.',
      data: null,
      sources: []
    };
  }

  const needsFacultyId = intent === 'COLLABORATOR_RECOMMENDATIONS' || intent === 'PRODUCTIVITY_FORECAST';
  const asksForFaculty = /\b(my|mine|me|this faculty|this faculty member|faculty's|of faculty|for faculty)\b/i.test(question);
  const facultyScopedIntent = ['PUBLICATION_COUNT', 'CITATION_STATISTICS', 'RESEARCH_DOMAINS'].includes(intent);
  if (!faculty && (needsFacultyId || (facultyScopedIntent && asksForFaculty))) {
    return {
      intent,
      answer: 'Please provide a facultyId so I can answer for the intended faculty member.',
      data: null,
      sources: []
    };
  }

  if (intent === 'PUBLICATION_COUNT') {
    if (faculty) {
      const publicationCount = await Publication.countDocuments({
        facultyIds: faculty._id,
        isDuplicate: { $ne: true }
      });
      return {
        intent,
        answer: `${faculty.name} has ${publicationCount} non-duplicate publications.`,
        data: { facultyId: String(faculty._id), facultyName: faculty.name, publicationCount },
        sources: ['Publication.countDocuments']
      };
    }

    const overview = await analyticsProviders.getOverviewAnalytics();
    return {
      intent,
      answer: `The platform has ${overview.totalPublications} non-duplicate publications.`,
      data: { totalPublications: overview.totalPublications },
      sources: ['analytics.controller.getOverviewAnalytics']
    };
  }

  if (intent === 'CITATION_STATISTICS') {
    if (faculty) {
      const [stats] = await Publication.aggregate([
        { $match: { facultyIds: faculty._id, isDuplicate: { $ne: true } } },
        {
          $group: {
            _id: null,
            totalPublications: { $sum: 1 },
            totalCitations: { $sum: '$citations' }
          }
        }
      ]);
      const totalPublications = stats?.totalPublications || 0;
      const totalCitations = stats?.totalCitations || 0;
      const averageCitations = totalPublications
        ? Math.round((totalCitations / totalPublications) * 100) / 100
        : 0;
      return {
        intent,
        answer: `${faculty.name} has ${totalCitations} citations across ${totalPublications} publications (average ${averageCitations} per publication).`,
        data: { facultyId: String(faculty._id), facultyName: faculty.name, totalPublications, totalCitations, averageCitations },
        sources: ['Publication.aggregate']
      };
    }

    const overview = await analyticsProviders.getOverviewAnalytics();
    return {
      intent,
      answer: `The platform has ${overview.totalCitations} citations, averaging ${overview.averageCitations} per publication.`,
      data: {
        totalCitations: overview.totalCitations,
        averageCitations: overview.averageCitations,
        totalPublications: overview.totalPublications
      },
      sources: ['analytics.controller.getOverviewAnalytics']
    };
  }

  if (intent === 'RESEARCH_DOMAINS') {
    const data = faculty
      ? await getFacultyResearchDomains(faculty._id)
      : await analyticsProviders.getResearchDomainAnalytics();
    const manualCount = data.manual?.length || 0;
    const predictedCount = data.predicted?.length || 0;
    const subject = faculty ? `${faculty.name} has` : 'Current analytics report';
    return {
      intent,
      answer: `${subject} ${manualCount} manual and ${predictedCount} predicted research domains.`,
      data,
      sources: faculty
        ? ['Publication', 'ResearchDomain']
        : ['analytics.controller.getResearchDomainAnalytics']
    };
  }

  if (intent === 'EMERGING_RESEARCH') {
    const data = await emergingResearchService.getEmergingResearch();
    const emergingCount = data.filter(item => item.isEmerging).length;
    return {
      intent,
      answer: `The system identified ${emergingCount} emerging research ${emergingCount === 1 ? 'area' : 'areas'} based on recent publication trends.`,
      data,
      sources: ['emergingResearch.service']
    };
  }

  if (intent === 'COLLABORATOR_RECOMMENDATIONS') {
    const data = await collaboratorRecommendationService.getCollaboratorRecommendations(faculty._id);
    if (data === null) return { errorStatus: 404, errorMessage: 'Faculty not found' };
    return {
      intent,
      answer: `Shared research domains identify ${data.length} potential collaborators for ${faculty.name}.`,
      data,
      sources: ['collaboratorRecommendation.service']
    };
  }

  const data = await productivityForecastService.getFacultyProductivityForecast(faculty._id);
  if (data === null) return { errorStatus: 404, errorMessage: 'Faculty not found' };
  return {
    intent,
    answer: data.forecastAvailable
      ? `The baseline forecast for ${faculty.name} is ${data.forecastPublicationCount} publications in ${data.forecastYear}.`
      : data.forecastSummary,
    data,
    sources: ['productivityForecast.service']
  };
};

module.exports = {
  SUPPORTED_TOPICS,
  detectIntent,
  answerResearchQuestion
};