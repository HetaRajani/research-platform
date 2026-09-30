const mongoose = require('mongoose');
const Faculty = require('../models/Faculty');
const importService = require('./import.service');

// Base URL for SerpApi Google Scholar Author API (permitted commercial provider)
const SERPAPI_BASE_URL = (process.env.SERPAPI_BASE_URL || 'https://serpapi.com/search.json').replace(/\/+$/, '');

/**
 * Helper to find faculty by MongoDB _id or facultyCode
 * @param {string} id 
 * @returns {Promise<object|null>}
 */
const findFacultyByIdOrCode = async (id) => {
  if (!id) return null;
  if (mongoose.Types.ObjectId.isValid(id)) {
    const faculty = await Faculty.findById(id);
    if (faculty) return faculty;
  }
  return await Faculty.findOne({ facultyCode: id });
};

/**
 * Check whether a permitted Google Scholar data provider is configured
 * @returns {boolean}
 */
const isScholarProviderConfigured = () => {
  const key = process.env.SERPAPI_API_KEY || process.env.SCHOLAR_PROVIDER_API_KEY;
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  return trimmed !== '' && !trimmed.includes('your_serpapi_key_here');
};

/**
 * Clean and extract Google Scholar User/Author ID
 * Handles raw ID (e.g. QCxP0cAAAAAJ), query parameter format (user=QCxP0cAAAAAJ), or profile URL
 * @param {string} rawId 
 * @returns {string|null} Clean 12-character Scholar user ID or cleaned string
 */
const cleanScholarId = (rawId) => {
  if (!rawId || typeof rawId !== 'string') return null;
  let cleaned = rawId.trim();

  // Extract from URL if full URL is supplied
  const urlMatch = cleaned.match(/[?&]user=([a-zA-Z0-9_-]+)/i);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  // Strip leading user= prefix if present
  cleaned = cleaned.replace(/^user=/i, '').trim();

  return cleaned.length > 0 ? cleaned : null;
};

/**
 * Normalize an individual publication record from Google Scholar format into standard platform format
 * using the shared authoritative normalization pipeline.
 * 
 * @param {object} article Raw article object from authorized provider or user import
 * @returns {object} Normalized publication object
 */
const normalizeScholarArticle = (article) => {
  if (!article || typeof article !== 'object') return null;

  const rawCitations = article.citations !== undefined 
    ? article.citations 
    : (article.cited_by && article.cited_by.value !== undefined ? article.cited_by.value : null);

  const venue = article.venue || article.publication || article.journal || null;
  const externalUrl = article.link || article.url || null;

  return importService.normalizePublication({
    title: article.title,
    year: article.year,
    authors: article.authors,
    doi: article.doi,
    journal: article.journal || venue,
    venue,
    publicationType: article.publicationType,
    citations: rawCitations,
    source: 'google_scholar',
    externalUrl
  }, 'google_scholar');
};

/**
 * Fetch publications from an authorized Google Scholar provider (e.g. SerpApi)
 * @param {string} scholarId 
 * @returns {Promise<{ found: boolean, status: number, publications: object[] }>}
 */
const fetchScholarFromProvider = async (scholarId) => {
  if (!isScholarProviderConfigured()) {
    const error = new Error('Google Scholar integration requires an authorized provider (such as SerpApi) or user-provided publication data import. Google does not provide a direct official public API.');
    error.status = 503;
    error.code = 'SCHOLAR_PROVIDER_NOT_CONFIGURED';
    error.configured = false;
    throw error;
  }

  const apiKey = (process.env.SERPAPI_API_KEY || process.env.SCHOLAR_PROVIDER_API_KEY).trim();
  const url = `${SERPAPI_BASE_URL}?engine=google_scholar_author&author_id=${encodeURIComponent(scholarId)}&api_key=${apiKey}&num=25`;

  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ResearchAnalyticsPlatform/1.0'
      },
      signal: AbortSignal.timeout(10000)
    });
  } catch (netErr) {
    const error = new Error(`Failed to connect to Google Scholar authorized provider: ${netErr.message}`);
    error.status = 502;
    error.isNetworkError = true;
    throw error;
  }

  if (response.status === 401 || response.status === 403) {
    const error = new Error('Google Scholar provider authentication failed. Check your configured provider API key.');
    error.status = 502;
    error.code = 'SCHOLAR_PROVIDER_AUTH_FAILED';
    throw error;
  }

  if (response.status === 404) {
    return {
      found: false,
      status: 404,
      publications: []
    };
  }

  if (!response.ok) {
    const error = new Error(`Google Scholar provider returned error HTTP ${response.status}`);
    error.status = response.status >= 500 ? 502 : response.status;
    throw error;
  }

  let json;
  try {
    json = await response.json();
  } catch (jsonErr) {
    const error = new Error('Invalid JSON response received from Google Scholar provider');
    error.status = 502;
    throw error;
  }

  const rawArticles = Array.isArray(json.articles) ? json.articles : [];
  const normalizedPubs = [];

  for (const item of rawArticles) {
    const normalized = normalizeScholarArticle({
      title: item.title,
      year: item.year,
      authors: item.authors,
      publication: item.publication,
      citations: item.cited_by ? item.cited_by.value : 0,
      link: item.link
    });
    if (normalized && normalized.title) {
      normalizedPubs.push(normalized);
    }
  }

  return {
    found: true,
    status: 200,
    publications: normalizedPubs
  };
};

/**
 * Retrieve Google Scholar publications for a faculty member
 * @param {string} facultyId Faculty ObjectId or facultyCode
 * @returns {Promise<object>} Result payload
 */
const getFacultyScholarPublications = async (facultyId) => {
  // 1. Find faculty member
  const faculty = await findFacultyByIdOrCode(facultyId);
  if (!faculty) {
    const error = new Error('Faculty member not found');
    error.status = 404;
    throw error;
  }

  // 2. Validate Google Scholar ID configuration on faculty record
  const rawScholarId = (faculty.googleScholarId || '').trim();
  if (!rawScholarId) {
    const error = new Error(`Faculty member "${faculty.name}" does not have a Google Scholar ID configured`);
    error.status = 400;
    error.code = 'GOOGLE_SCHOLAR_ID_MISSING';
    throw error;
  }

  const cleanId = cleanScholarId(rawScholarId);

  // 3. Check if an authorized Google Scholar provider is configured
  if (!isScholarProviderConfigured()) {
    const error = new Error('Google Scholar integration requires an authorized provider (such as SerpApi) or user-provided publication data import. Google does not provide a direct official public API.');
    error.status = 503;
    error.code = 'SCHOLAR_PROVIDER_NOT_CONFIGURED';
    error.configured = false;
    error.faculty = {
      id: faculty._id,
      facultyCode: faculty.facultyCode,
      name: faculty.name,
      department: faculty.department,
      googleScholarId: cleanId
    };
    throw error;
  }

  // 4. Call authorized provider
  const scholarResult = await fetchScholarFromProvider(cleanId);

  return {
    success: true,
    configured: true,
    faculty: {
      id: faculty._id,
      facultyCode: faculty.facultyCode,
      name: faculty.name,
      department: faculty.department,
      googleScholarId: cleanId
    },
    count: scholarResult.publications.length,
    source: 'google_scholar',
    data: scholarResult.publications
  };
};

/**
 * Import user-provided Google Scholar publication data for a faculty member
 * @param {string} facultyId Faculty ObjectId or facultyCode
 * @param {object[]} publications Array of publication objects to import
 * @returns {Promise<object>} Result payload
 */
const importFacultyScholarPublications = async (facultyId, publications) => {
  // 1. Find faculty member
  const faculty = await findFacultyByIdOrCode(facultyId);
  if (!faculty) {
    const error = new Error('Faculty member not found');
    error.status = 404;
    throw error;
  }

  if (!publications || !Array.isArray(publications) || publications.length === 0) {
    const error = new Error('The "publications" field is required and must be a non-empty array of publication objects');
    error.status = 400;
    throw error;
  }

  // 2. Associate faculty member to each publication
  const enrichedPublications = publications.map(p => ({
    ...p,
    facultyIds: Array.isArray(p.facultyIds) && p.facultyIds.length > 0 ? p.facultyIds : [faculty._id]
  }));

  // 3. Delegate to existing Phase 10A import logic
  const importResult = await importService.importPublications({
    source: 'google_scholar',
    publications: enrichedPublications
  });

  return {
    success: true,
    message: `Successfully imported ${importResult.count} Google Scholar publication(s) for ${faculty.name}`,
    faculty: {
      id: faculty._id,
      facultyCode: faculty.facultyCode,
      name: faculty.name,
      googleScholarId: faculty.googleScholarId || null
    },
    count: importResult.count,
    source: 'google_scholar',
    data: importResult.publications,
    duplicates: importResult.duplicatesDetected || [],
    summary: importResult.summary
  };
};

module.exports = {
  isScholarProviderConfigured,
  cleanScholarId,
  normalizeScholarArticle,
  fetchScholarFromProvider,
  getFacultyScholarPublications,
  importFacultyScholarPublications
};
