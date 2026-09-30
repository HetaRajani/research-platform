const mongoose = require('mongoose');
const Faculty = require('../models/Faculty');

// Base URL for Elsevier Scopus Search API
const SCOPUS_API_BASE_URL = (process.env.SCOPUS_API_BASE_URL || 'https://api.elsevier.com/content/search/scopus').replace(/\/+$/, '');

/**
 * Mapping of Scopus aggregation / subtype types to platform Publication Type enums
 */
const SCOPUS_TYPE_MAP = Object.freeze({
  'journal': 'Journal',
  'conference proceeding': 'Conference',
  'proceeding': 'Conference',
  'book': 'Book',
  'book series': 'Book Chapter',
  'chapter': 'Book Chapter',
  'article': 'Journal',
  'review': 'Journal',
  'conference paper': 'Conference',
  'short survey': 'Journal',
  'editorial': 'Other',
  'letter': 'Other',
  'erratum': 'Other',
  'note': 'Other',
  'data paper': 'Journal',
  'preprint': 'Preprint'
});

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
 * Check whether a valid Scopus API key is configured in the environment
 * @returns {boolean}
 */
const isScopusConfigured = () => {
  const key = process.env.SCOPUS_API_KEY;
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  return trimmed !== '' && !trimmed.includes('your_elsevier_scopus_api_key_here');
};

/**
 * Clean and extract Scopus Author Identifier (AU-ID)
 * @param {string} rawId 
 * @returns {string|null} Digits string representing Scopus Author ID
 */
const cleanScopusId = (rawId) => {
  if (!rawId || typeof rawId !== 'string') return null;
  const cleaned = rawId.trim().replace(/^AUTH-ID:/i, '').replace(/^AUTHOR_ID:/i, '').trim();
  return /^\d{5,15}$/.test(cleaned) ? cleaned : cleaned;
};

const importService = require('./import.service');

/**
 * Normalize an individual Scopus search entry into the platform publication format
 * using the shared authoritative normalization pipeline.
 * 
 * @param {object} entry Raw Scopus search result entry
 * @returns {object} Normalized publication object
 */
const normalizeScopusPublication = (entry) => {
  if (!entry || typeof entry !== 'object') return null;

  // Title
  const title = entry['dc:title'] || null;

  // Year (from prism:coverDate: YYYY-MM-DD)
  const year = entry['prism:coverDate'] ? entry['prism:coverDate'].substring(0, 4) : null;

  // Authors (dc:creator contains first author or author name string)
  let authors = [];
  if (entry['dc:creator']) {
    authors = [entry['dc:creator']];
  } else if (Array.isArray(entry.author)) {
    authors = entry.author
      .map(a => (a['authname'] || a['given-name'] ? `${a['surname'] || ''}, ${a['given-name'] || ''}`.trim() : ''))
      .filter(a => a.length > 0);
  }

  // DOI
  const doi = entry['prism:doi'] || null;

  // Venue / Journal
  const venue = entry['prism:publicationName'] || null;

  // Publication Type
  const rawSubtype = entry['subtypeDescription'] || entry['prism:aggregationType'] || null;

  // Citations
  const citations = entry['citedby-count'];

  // Scopus Document Identifier
  const scopusId = entry['dc:identifier'] || null;

  // External Scopus URL
  let externalUrl = null;
  if (Array.isArray(entry.link)) {
    const scopusLink = entry.link.find(l => l['@ref'] === 'scopus');
    if (scopusLink && scopusLink['@href']) {
      externalUrl = scopusLink['@href'];
    }
  } else if (entry['prism:url']) {
    externalUrl = entry['prism:url'];
  }

  // Delegate to shared authoritative normalization function
  return importService.normalizePublication({
    title,
    year,
    authors,
    doi,
    journal: venue,
    venue,
    publicationType: rawSubtype,
    citations,
    source: 'scopus',
    externalUrl,
    scopusId
  }, 'scopus');
};

/**
 * Fetch publication records from Scopus API for a Scopus Author ID
 * @param {string} scopusId 
 * @returns {Promise<{ found: boolean, status: number, publications: object[] }>}
 */
const fetchScopusPublications = async (scopusId) => {
  if (!isScopusConfigured()) {
    const error = new Error('Scopus integration requires a valid Elsevier API key. Please configure SCOPUS_API_KEY in your environment variables.');
    error.status = 503;
    error.code = 'SCOPUS_API_KEY_MISSING';
    error.configured = false;
    throw error;
  }

  const apiKey = process.env.SCOPUS_API_KEY.trim();
  const url = `${SCOPUS_API_BASE_URL}?query=AU-ID(${encodeURIComponent(scopusId)})&count=25`;

  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-ELS-APIKey': apiKey,
        'User-Agent': 'ResearchAnalyticsPlatform/1.0'
      },
      signal: AbortSignal.timeout(10000)
    });
  } catch (netErr) {
    const error = new Error(`Failed to connect to Elsevier Scopus API: ${netErr.message}`);
    error.status = 502;
    error.isNetworkError = true;
    throw error;
  }

  if (response.status === 401 || response.status === 403) {
    const error = new Error('Scopus API authentication failed. The configured SCOPUS_API_KEY is invalid or not authorized.');
    error.status = 502;
    error.code = 'SCOPUS_AUTH_FAILED';
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
    const error = new Error(`Scopus API returned error HTTP ${response.status}`);
    error.status = response.status >= 500 ? 502 : response.status;
    throw error;
  }

  let json;
  try {
    json = await response.json();
  } catch (jsonErr) {
    const error = new Error('Invalid JSON response received from Scopus API');
    error.status = 502;
    throw error;
  }

  const rawEntries = json['search-results']?.entry || [];
  const normalizedPubs = [];

  for (const entry of rawEntries) {
    const normalized = normalizeScopusPublication(entry);
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
 * Retrieve Scopus publications for a faculty member
 * @param {string} facultyId Faculty ObjectId or facultyCode
 * @returns {Promise<object>} Result payload
 */
const getFacultyScopusPublications = async (facultyId) => {
  // 1. Find faculty member
  const faculty = await findFacultyByIdOrCode(facultyId);
  if (!faculty) {
    const error = new Error('Faculty member not found');
    error.status = 404;
    throw error;
  }

  // 2. Validate Scopus ID configuration on faculty record
  const rawScopusId = (faculty.scopusId || '').trim();
  if (!rawScopusId) {
    const error = new Error(`Faculty member "${faculty.name}" does not have a Scopus ID configured`);
    error.status = 400;
    error.code = 'SCOPUS_ID_MISSING';
    throw error;
  }

  const cleanId = cleanScopusId(rawScopusId);

  // 3. Check if Scopus API credentials are configured
  if (!isScopusConfigured()) {
    const error = new Error('Scopus integration requires a valid Elsevier API key. Please configure SCOPUS_API_KEY in your environment variables.');
    error.status = 503;
    error.code = 'SCOPUS_API_KEY_MISSING';
    error.configured = false;
    error.faculty = {
      id: faculty._id,
      facultyCode: faculty.facultyCode,
      name: faculty.name,
      department: faculty.department,
      scopusId: cleanId
    };
    throw error;
  }

  // 4. Call official Scopus API
  const scopusResult = await fetchScopusPublications(cleanId);

  return {
    success: true,
    configured: true,
    faculty: {
      id: faculty._id,
      facultyCode: faculty.facultyCode,
      name: faculty.name,
      department: faculty.department,
      scopusId: cleanId
    },
    count: scopusResult.publications.length,
    source: 'scopus',
    data: scopusResult.publications
  };
};

/**
 * Import Scopus publications for a faculty member into the database
 * Integrates with shared publication import pipeline and deduplication workflow.
 * 
 * @param {string} facultyId Faculty ObjectId or facultyCode
 * @param {object[]} publications Array of publication objects to import
 * @returns {Promise<object>} Result payload
 */
const importFacultyScopusPublications = async (facultyId, publications) => {
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

  // Associate faculty member to each publication
  const enrichedPublications = publications.map(p => ({
    ...p,
    facultyIds: Array.isArray(p.facultyIds) && p.facultyIds.length > 0 ? p.facultyIds : [faculty._id]
  }));

  // Delegate to shared authoritative import & deduplication logic
  const importResult = await importService.importPublications({
    source: 'scopus',
    publications: enrichedPublications
  });

  return {
    success: true,
    message: `Successfully imported ${importResult.count} Scopus publication(s) for ${faculty.name}`,
    faculty: {
      id: faculty._id,
      facultyCode: faculty.facultyCode,
      name: faculty.name,
      scopusId: faculty.scopusId || null
    },
    count: importResult.count,
    source: 'scopus',
    data: importResult.publications,
    duplicates: importResult.duplicatesDetected || [],
    summary: importResult.summary
  };
};

module.exports = {
  isScopusConfigured,
  cleanScopusId,
  normalizeScopusPublication,
  fetchScopusPublications,
  getFacultyScopusPublications,
  importFacultyScopusPublications
};
