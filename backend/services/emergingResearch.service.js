const Publication = require('../models/Publication');

const DEFAULT_OPTIONS = Object.freeze({
  recentYears: 3,
  minimumPublications: 2,
  minimumGrowthRate: 20
});

const normalizeOptions = (options = {}) => {
  const recentYears = Number(options.recentYears);
  const minimumPublications = Number(options.minimumPublications);
  const minimumGrowthRate = Number(options.minimumGrowthRate);

  return {
    recentYears: Number.isInteger(recentYears) && recentYears > 0
      ? recentYears
      : DEFAULT_OPTIONS.recentYears,
    minimumPublications: Number.isInteger(minimumPublications) && minimumPublications >= 0
      ? minimumPublications
      : DEFAULT_OPTIONS.minimumPublications,
    minimumGrowthRate: Number.isFinite(minimumGrowthRate) && minimumGrowthRate >= 0
      ? minimumGrowthRate
      : DEFAULT_OPTIONS.minimumGrowthRate
  };
};

const parseYear = value => {
  if (value === null || value === undefined || value === '') return null;
  const year = Number(value);
  return Number.isInteger(year) && year >= 1900 ? year : null;
};

const analyzeEmergingResearch = (publications, options = {}) => {
  const config = normalizeOptions(options);
  const countsByDomain = new Map();
  let latestPublicationYear = null;

  for (const publication of publications || []) {
    if (!publication || publication.isDuplicate === true) continue;

    const year = parseYear(publication.year);
    if (year === null) continue;
    latestPublicationYear = latestPublicationYear === null
      ? year
      : Math.max(latestPublicationYear, year);

    if (!Array.isArray(publication.predictedResearchDomains)) continue;

    const publicationDomains = new Set();
    for (const prediction of publication.predictedResearchDomains) {
      const domain = typeof prediction?.name === 'string' ? prediction.name.trim() : '';
      if (domain) publicationDomains.add(domain);
    }

    for (const domain of publicationDomains) {
      if (!countsByDomain.has(domain)) countsByDomain.set(domain, new Map());
      const yearlyCounts = countsByDomain.get(domain);
      yearlyCounts.set(year, (yearlyCounts.get(year) || 0) + 1);
    }
  }

  if (latestPublicationYear === null) return [];

  const firstRecentYear = latestPublicationYear - config.recentYears + 1;
  return [...countsByDomain.entries()].map(([domain, counts]) => {
    const yearlyCounts = [...counts.entries()]
      .sort(([yearA], [yearB]) => yearA - yearB)
      .map(([year, count]) => ({ year, count }));
    const latestYear = yearlyCounts[yearlyCounts.length - 1].year;
    const previousYear = latestYear - 1;
    const latestCount = counts.get(latestYear) || 0;
    const previousCount = counts.get(previousYear) || 0;
    const growthRate = previousCount === 0
      ? (latestCount > 0 ? 100 : 0)
      : Math.round(((latestCount - previousCount) / previousCount) * 10000) / 100;
    const trendDirection = latestCount > previousCount
      ? 'growing'
      : latestCount < previousCount
        ? 'declining'
        : 'stable';
    const recentPublicationCount = yearlyCounts
      .filter(item => item.year >= firstRecentYear)
      .reduce((total, item) => total + item.count, 0);
    const isRecent = latestYear >= firstRecentYear;
    const isEmerging = isRecent &&
      latestCount > previousCount &&
      recentPublicationCount >= config.minimumPublications &&
      growthRate >= config.minimumGrowthRate;
    // Emerging score = growth percentage + 0.5 per latest-year publication,
    // with the volume bonus capped at 10 and the final score clamped to 0–100.
    const emergingScore = isEmerging
      ? Math.round(Math.min(100, Math.max(0, growthRate + Math.min(latestCount * 0.5, 10))) * 100) / 100
      : 0;

    return {
      domain,
      yearlyCounts,
      latestYear,
      previousYear,
      latestCount,
      previousCount,
      growthRate,
      trendDirection,
      recentPublicationCount,
      isEmerging,
      emergingScore
    };
  }).sort((domainA, domainB) =>
    Number(domainB.isEmerging) - Number(domainA.isEmerging) ||
    (domainB.isEmerging
      ? domainB.emergingScore - domainA.emergingScore
      : domainB.growthRate - domainA.growthRate) ||
    domainA.domain.localeCompare(domainB.domain)
  ).map((domain, index, domains) => {
    const rank = domain.isEmerging
      ? domains.slice(0, index + 1).filter(item => item.isEmerging).length
      : null;
    return { ...domain, rank };
  });
};

const getEmergingResearch = async (options = {}) => {
  const publications = await Publication.find({
    isDuplicate: { $ne: true }
  })
    .select('year predictedResearchDomains.name isDuplicate')
    .lean();

  return analyzeEmergingResearch(publications, options);
};

module.exports = {
  DEFAULT_OPTIONS,
  analyzeEmergingResearch,
  getEmergingResearch
};