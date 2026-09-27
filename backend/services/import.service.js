const mongoose = require('mongoose');
const Publication = require('../models/Publication');

/**
 * Canonical list of supported external and internal research data sources
 */
const SUPPORTED_SOURCES = Object.freeze([
  'manual',
  'orcid',
  'scopus',
  'google_scholar',
  'institutional'
]);

/**
 * Mapping of common aliases / variants to canonical source names
 */
const SOURCE_ALIASES = Object.freeze({
  'manual': 'manual',
  'orcid': 'orcid',
  'scopus': 'scopus',
  'google_scholar': 'google_scholar',
  'google scholar': 'google_scholar',
  'googlescholar': 'google_scholar',
  'google-scholar': 'google_scholar',
  'institutional': 'institutional',
  'repository': 'institutional',
  'institutional_repository': 'institutional'
});

/**
 * Normalize and identify research data source
 * @param {string} sourceRaw 
 * @returns {string|null} Canonical source name or null if invalid
 */
const normalizeSource = (sourceRaw) => {
  if (!sourceRaw || typeof sourceRaw !== 'string') return null;
  const cleaned = sourceRaw.trim().toLowerCase();
  if (SOURCE_ALIASES[cleaned]) {
    return SOURCE_ALIASES[cleaned];
  }
  if (SUPPORTED_SOURCES.includes(cleaned)) {
    return cleaned;
  }
  return null;
};

/**
 * Normalize an individual publication record from raw imported payload
 * @param {object} rawPub 
 * @param {string} canonicalSource 
 * @returns {object} Normalized publication document
 */
const normalizePublication = (rawPub, canonicalSource) => {
  // Title
  const title = (rawPub.title || '').trim();

  // Year
  const year = parseInt(rawPub.year, 10);

  // Authors (handle array or comma/semicolon delimited string)
  let authors = [];
  if (Array.isArray(rawPub.authors)) {
    authors = rawPub.authors
      .map(a => (typeof a === 'string' ? a.trim() : ''))
      .filter(a => a.length > 0);
  } else if (typeof rawPub.authors === 'string' && rawPub.authors.trim() !== '') {
    authors = rawPub.authors
      .split(/[,;]/)
      .map(a => a.trim())
      .filter(a => a.length > 0);
  }

  // Citations
  let citations = 0;
  if (rawPub.citations !== undefined && rawPub.citations !== null) {
    const parsed = parseInt(rawPub.citations, 10);
    citations = !isNaN(parsed) && parsed >= 0 ? parsed : 0;
  }

  // DOI (trim and remove url prefixes if present)
  let doi = (rawPub.doi || '').trim();
  doi = doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');

  // Venue, Journal, Conference
  const journal = (rawPub.journal || '').trim();
  const conference = (rawPub.conference || '').trim();
  const venue = (rawPub.venue || '').trim() || journal || conference || '';

  // Publication Type
  const validTypes = ['Journal', 'Conference', 'Book Chapter', 'Book', 'Patent', 'Preprint', 'Other'];
  let publicationType = 'Journal';
  if (rawPub.publicationType && typeof rawPub.publicationType === 'string') {
    const matched = validTypes.find(t => t.toLowerCase() === rawPub.publicationType.trim().toLowerCase());
    if (matched) {
      publicationType = matched;
    }
  } else if (conference && !journal) {
    publicationType = 'Conference';
  }

  // Abstract & Keywords
  const abstract = (rawPub.abstract || '').trim();
  let keywords = [];
  if (Array.isArray(rawPub.keywords)) {
    keywords = rawPub.keywords
      .map(k => (typeof k === 'string' ? k.trim() : ''))
      .filter(k => k.length > 0);
  } else if (typeof rawPub.keywords === 'string' && rawPub.keywords.trim() !== '') {
    keywords = rawPub.keywords
      .split(/[,;]/)
      .map(k => k.trim())
      .filter(k => k.length > 0);
  }

  // Faculty IDs (optional association)
  const facultyIds = Array.isArray(rawPub.facultyIds) ? rawPub.facultyIds : [];

  return {
    title,
    year,
    authors,
    doi,
    citations,
    venue,
    journal,
    conference,
    publicationType,
    abstract,
    keywords,
    source: canonicalSource,
    facultyIds
  };
};

/**
 * Validate import payload structure and publication contents
 * @param {object} payload 
 * @returns {{ isValid: boolean, errors: string[], canonicalSource: string|null }}
 */
const validateImportPayload = (payload) => {
  const errors = [];

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      isValid: false,
      errors: ['Request body must be a JSON object containing "source" and "publications" fields'],
      canonicalSource: null
    };
  }

  // Source validation
  const { source, publications } = payload;
  if (!source || typeof source !== 'string' || source.trim() === '') {
    errors.push('The "source" field is required (e.g. manual, orcid, scopus, google_scholar, institutional)');
  }

  const canonicalSource = normalizeSource(source);
  if (source && !canonicalSource) {
    errors.push(
      `Invalid source "${source}". Supported sources are: ${SUPPORTED_SOURCES.join(', ')}`
    );
  }

  // Publications array validation
  if (!publications) {
    errors.push('The "publications" field is required and must be an array of publication objects');
  } else if (!Array.isArray(publications)) {
    errors.push('The "publications" field must be an array');
  } else if (publications.length === 0) {
    errors.push('The "publications" array cannot be empty');
  } else {
    // Validate each publication item
    publications.forEach((pub, index) => {
      const idxLabel = `Publication at index ${index}`;

      if (!pub || typeof pub !== 'object' || Array.isArray(pub)) {
        errors.push(`${idxLabel} must be a valid JSON object`);
        return;
      }

      // Title validation
      if (!pub.title || typeof pub.title !== 'string' || pub.title.trim() === '') {
        errors.push(`${idxLabel}: "title" is required and cannot be empty`);
      }

      // Year validation
      if (pub.year === undefined || pub.year === null || pub.year === '') {
        errors.push(`${idxLabel}: "year" is required`);
      } else {
        const yearNum = Number(pub.year);
        if (!Number.isInteger(yearNum) || yearNum < 1900 || yearNum > 2100) {
          errors.push(`${idxLabel}: "year" must be a valid 4-digit integer between 1900 and 2100`);
        }
      }

      // Citations validation
      if (pub.citations !== undefined && pub.citations !== null) {
        const citNum = Number(pub.citations);
        if (isNaN(citNum) || citNum < 0) {
          errors.push(`${idxLabel}: "citations" must be a non-negative number`);
        }
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    canonicalSource
  };
};

/**
 * Import and persist normalized publications into the database
 * @param {object} payload 
 * @returns {Promise<{ count: number, source: string, publications: object[] }>}
 */
const importPublications = async (payload) => {
  const validation = validateImportPayload(payload);

  if (!validation.isValid) {
    const error = new Error('Import validation failed');
    error.status = 400;
    error.validationErrors = validation.errors;
    throw error;
  }

  const { canonicalSource } = validation;
  const normalizedDocs = payload.publications.map(raw => normalizePublication(raw, canonicalSource));

  // Batch insert into MongoDB using Mongoose model
  const inserted = await Publication.create(normalizedDocs);

  return {
    count: inserted.length,
    source: canonicalSource,
    publications: inserted
  };
};

module.exports = {
  SUPPORTED_SOURCES,
  normalizeSource,
  normalizePublication,
  validateImportPayload,
  importPublications
};
