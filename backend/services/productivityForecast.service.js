const Faculty = require('../models/Faculty');
const Publication = require('../models/Publication');

const STABLE_TREND_TOLERANCE = 0.1;
const roundToTwoDecimals = value => Math.round((value + Number.EPSILON) * 100) / 100;

const normalizeHistoricalData = historicalData => {
  const countsByYear = new Map();

  for (const item of historicalData || []) {
    const year = Number(item?.year);
    const publicationCount = Number(item?.publicationCount);
    if (!Number.isInteger(year) || year < 1900 || !Number.isFinite(publicationCount) || publicationCount < 0) continue;
    countsByYear.set(year, (countsByYear.get(year) || 0) + publicationCount);
  }

  return [...countsByYear.entries()]
    .sort(([yearA], [yearB]) => yearA - yearB)
    .map(([year, publicationCount]) => ({ year, publicationCount }));
};

const forecastFromHistoricalData = historicalData => {
  const normalizedHistory = normalizeHistoricalData(historicalData);
  const historicalYearCount = normalizedHistory.length;
  const historicalPublicationCount = normalizedHistory.reduce((sum, item) => sum + item.publicationCount, 0);
  const averageAnnualPublications = historicalYearCount
    ? roundToTwoDecimals(historicalPublicationCount / historicalYearCount)
    : 0;
  const latestYear = normalizedHistory.length
    ? normalizedHistory[normalizedHistory.length - 1].year
    : null;

  if (normalizedHistory.length < 2) {
    return {
      historicalData: normalizedHistory,
      historicalYearCount,
      historicalPublicationCount,
      averageAnnualPublications,
      annualChange: null,
      rSquared: null,
      forecastSummary: 'Insufficient historical publication data for forecasting.',
      forecastYear: latestYear === null ? null : latestYear + 1,
      forecastPublicationCount: null,
      trendDirection: null,
      forecastAvailable: false,
      message: 'At least two historical publication years are required to generate a forecast.'
    };
  }

  const meanYear = normalizedHistory.reduce((sum, item) => sum + item.year, 0) / normalizedHistory.length;
  const meanCount = normalizedHistory.reduce((sum, item) => sum + item.publicationCount, 0) / normalizedHistory.length;
  const covariance = normalizedHistory.reduce(
    (sum, item) => sum + (item.year - meanYear) * (item.publicationCount - meanCount),
    0
  );
  const yearVariance = normalizedHistory.reduce(
    (sum, item) => sum + (item.year - meanYear) ** 2,
    0
  );
  const slope = covariance / yearVariance;
  const forecastYear = latestYear + 1;
  const unroundedForecast = meanCount + slope * (forecastYear - meanYear);
  const forecastPublicationCount = Math.round(Math.max(0, unroundedForecast) * 100) / 100;
  const residualSumSquares = normalizedHistory.reduce((sum, item) => {
    const fittedCount = meanCount + slope * (item.year - meanYear);
    return sum + (item.publicationCount - fittedCount) ** 2;
  }, 0);
  const totalSumSquares = normalizedHistory.reduce(
    (sum, item) => sum + (item.publicationCount - meanCount) ** 2,
    0
  );
  // R² measures fit to the historical linear trend; a constant series has no meaningful R², so use 0.
  const rawRSquared = totalSumSquares > 0 ? 1 - (residualSumSquares / totalSumSquares) : 0;
  const rSquared = roundToTwoDecimals(Math.min(1, Math.max(0, rawRSquared)));
  const trendDirection = slope > STABLE_TREND_TOLERANCE
    ? 'growing'
    : slope < -STABLE_TREND_TOLERANCE
      ? 'declining'
      : 'stable';
  const forecastSummary = trendDirection === 'growing'
    ? 'Historical publication activity shows a growing trend.'
    : trendDirection === 'declining'
      ? 'Historical publication activity shows a declining trend.'
      : 'Historical publication activity is relatively stable.';

  return {
    historicalData: normalizedHistory,
    historicalYearCount,
    historicalPublicationCount,
    averageAnnualPublications,
    annualChange: roundToTwoDecimals(slope),
    rSquared,
    forecastSummary,
    forecastYear,
    forecastPublicationCount,
    trendDirection,
    forecastAvailable: true
  };
};

const getFacultyProductivityForecast = async facultyId => {
  const faculty = await Faculty.findById(facultyId).select('_id name').lean();
  if (!faculty) return null;

  const publications = await Publication.find({
    facultyIds: faculty._id,
    isDuplicate: { $ne: true }
  })
    .select('year isDuplicate')
    .lean();

  const countsByYear = new Map();
  for (const publication of publications || []) {
    if (!publication || publication.isDuplicate === true) continue;
    const year = Number(publication.year);
    if (!Number.isInteger(year) || year < 1900) continue;
    countsByYear.set(year, (countsByYear.get(year) || 0) + 1);
  }

  const forecast = forecastFromHistoricalData(
    [...countsByYear.entries()].map(([year, publicationCount]) => ({ year, publicationCount }))
  );

  return {
    facultyId: String(faculty._id),
    facultyName: faculty.name,
    ...forecast
  };
};

module.exports = {
  STABLE_TREND_TOLERANCE,
  forecastFromHistoricalData,
  getFacultyProductivityForecast
};