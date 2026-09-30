const mongoose = require('mongoose');
const Faculty = require('../models/Faculty');

// Base URL for public ORCID API (configurable via env)
const ORCID_API_BASE_URL = (process.env.ORCID_API_BASE_URL || 'https://pub.orcid.org/v3.0').replace(/\/+$/, '');

// Standard 16-character ORCID identifier regex (e.g. 0000-0002-1825-0097)
const ORCID_REGEX = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;

/**
 * Mapping of ORCID work-type strings to Platform Publication Type enums
 */
const ORCID_TYPE_MAP = Object.freeze({
  'journal-article': 'Journal',
  'conference-paper': 'Conference',
  'book-chapter': 'Book Chapter',
  'book': 'Book',
  'edited-book': 'Book',
  'patent': 'Patent',
  'preprint': 'Preprint',
  'working-paper': 'Preprint',
  'report': 'Other',
  'dissertation-thesis': 'Other',
  'manual': 'Other',
  'online-resource': 'Other',
  'other': 'Other'
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
 * Clean and validate ORCID identifier string
 * Accepts raw ORCID ID or full URL (e.g. https://orcid.org/0000-0002-1825-0097)
 * @param {string} rawId 
 * @returns {string|null} 16-character hyphenated ORCID ID, or null if invalid
 */
const cleanOrcidId = (rawId) => {
  if (!rawId || typeof rawId !== 'string') return null;
  let cleaned = rawId.trim();
  cleaned = cleaned.replace(/^https?:\/\/(?:www\.)?orcid\.org\//i, '').trim();
  return ORCID_REGEX.test(cleaned) ? cleaned : null;
};

const importService = require('./import.service');

/**
 * Normalize an ORCID work-summary into the platform's standard publication structure
 * using the shared authoritative normalization pipeline.
 * 
 * @param {object} summary Raw work-summary object from ORCID API
 * @returns {object} Normalized publication object
 */
const normalizeOrcidWork = (summary) => {
  if (!summary || typeof summary !== 'object') return null;

  // Title
  let title = null;
  if (summary.title) {
    if (summary.title.title && summary.title.title.value) {
      title = summary.title.title.value;
    } else if (typeof summary.title.value === 'string') {
      title = summary.title.value;
    }
  }

  // Publication Year
  const year = summary['publication-date']?.year?.value || null;

  // DOI extraction from external-ids
  let doi = null;
  const externalIds = summary['external-ids']?.['external-id'];
  if (Array.isArray(externalIds)) {
    const doiObj = externalIds.find(ext => {
      const type = (ext['external-id-type'] || '').toLowerCase();
      return type === 'doi';
    });
    if (doiObj && doiObj['external-id-value']) {
      doi = doiObj['external-id-value'];
    }
  }

  const publicationType = summary.type || null;
  const venue = summary['journal-title']?.value || null;
  const externalUrl = summary.url?.value || null;
  const orcidPutCode = summary['put-code'] || null;

  // Delegate to shared authoritative normalization function
  return importService.normalizePublication({
    title,
    year,
    authors: [],
    doi,
    publicationType,
    venue,
    journal: venue,
    source: 'orcid',
    externalUrl,
    orcidPutCode
  }, 'orcid');
};

/**
 * Fetch works from official ORCID Public API for a given ORCID ID
 * @param {string} orcidId Validated 16-character ORCID ID
 * @returns {Promise<{ found: boolean, status: number, works: object[] }>}
 */
const fetchOrcidWorks = async (orcidId) => {
  const url = `${ORCID_API_BASE_URL}/${encodeURIComponent(orcidId)}/works`;

  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ResearchAnalyticsPlatform/1.0 (academic-faculty-profiling)'
      },
      signal: AbortSignal.timeout(10000)
    });
  } catch (netErr) {
    const error = new Error(`Failed to connect to ORCID Public API: ${netErr.message}`);
    error.status = 502;
    error.isNetworkError = true;
    throw error;
  }

  if (response.status === 404) {
    return {
      found: false,
      status: 404,
      message: `ORCID profile "${orcidId}" was not found on the public ORCID registry`,
      works: []
    };
  }

  if (!response.ok) {
    const error = new Error(`ORCID API returned error status ${response.status}`);
    error.status = response.status >= 500 ? 502 : response.status;
    throw error;
  }

  let json;
  try {
    json = await response.json();
  } catch (jsonErr) {
    const error = new Error('Invalid JSON response received from ORCID API');
    error.status = 502;
    throw error;
  }

  const rawGroups = Array.isArray(json.group) ? json.group : [];
  const normalizedWorks = [];

  for (const group of rawGroups) {
    const summaries = Array.isArray(group['work-summary']) ? group['work-summary'] : [];
    if (summaries.length > 0) {
      // Extract the primary work summary from the group
      const normalized = normalizeOrcidWork(summaries[0]);
      if (normalized && normalized.title) {
        normalizedWorks.push(normalized);
      }
    }
  }

  return {
    found: true,
    status: 200,
    works: normalizedWorks
  };
};

/**
 * Retrieve public research works from ORCID for a faculty member
 * @param {string} facultyId Faculty ObjectId or facultyCode
 * @returns {Promise<object>} Result payload with faculty info and normalized works
 */
const getFacultyOrcidWorks = async (facultyId) => {
  // 1. Find faculty member
  const faculty = await findFacultyByIdOrCode(facultyId);
  if (!faculty) {
    const error = new Error('Faculty member not found');
    error.status = 404;
    throw error;
  }

  // 2. Validate ORCID ID configuration on faculty record
  const rawOrcid = (faculty.orcidId || '').trim();
  if (!rawOrcid) {
    const error = new Error(`Faculty member "${faculty.name}" does not have an ORCID ID configured`);
    error.status = 400;
    error.code = 'ORCID_ID_MISSING';
    throw error;
  }

  // 3. Validate ORCID ID format
  const cleanId = cleanOrcidId(rawOrcid);
  if (!cleanId) {
    const error = new Error(
      `Invalid ORCID ID format "${rawOrcid}" configured for "${faculty.name}". Expected format: 0000-0000-0000-0000`
    );
    error.status = 400;
    error.code = 'ORCID_ID_INVALID_FORMAT';
    throw error;
  }

  // 4. Request works from official ORCID Public API
  const orcidResult = await fetchOrcidWorks(cleanId);

  return {
    success: true,
    faculty: {
      id: faculty._id,
      facultyCode: faculty.facultyCode,
      name: faculty.name,
      department: faculty.department,
      orcidId: cleanId
    },
    count: orcidResult.works.length,
    source: 'orcid',
    orcidProfileFound: orcidResult.found,
    data: orcidResult.works
  };
};

/**
 * Import normalized ORCID works for a faculty member into the database
 * Integrates with shared publication import pipeline and deduplication workflow.
 * 
 * @param {string} facultyId Faculty ObjectId or facultyCode
 * @param {object[]} works Array of publication/work objects to import
 * @returns {Promise<object>} Result payload
 */
const importFacultyOrcidWorks = async (facultyId, works) => {
  const faculty = await findFacultyByIdOrCode(facultyId);
  if (!faculty) {
    const error = new Error('Faculty member not found');
    error.status = 404;
    throw error;
  }

  if (!works || !Array.isArray(works) || works.length === 0) {
    const error = new Error('The "publications" field is required and must be a non-empty array of publication objects');
    error.status = 400;
    throw error;
  }

  // Associate faculty member to each publication
  const enrichedWorks = works.map(w => ({
    ...w,
    facultyIds: Array.isArray(w.facultyIds) && w.facultyIds.length > 0 ? w.facultyIds : [faculty._id]
  }));

  // Delegate to shared authoritative import & deduplication logic
  const importResult = await importService.importPublications({
    source: 'orcid',
    publications: enrichedWorks
  });

  return {
    success: true,
    message: `Successfully imported ${importResult.count} ORCID publication(s) for ${faculty.name}`,
    faculty: {
      id: faculty._id,
      facultyCode: faculty.facultyCode,
      name: faculty.name,
      orcidId: faculty.orcidId || null
    },
    count: importResult.count,
    source: 'orcid',
    data: importResult.publications,
    duplicates: importResult.duplicatesDetected || [],
    summary: importResult.summary
  };
};

module.exports = {
  cleanOrcidId,
  normalizeOrcidWork,
  fetchOrcidWorks,
  getFacultyOrcidWorks,
  importFacultyOrcidWorks
};
