const mongoose = require('mongoose');
const Publication = require('../models/Publication');
const DuplicateReview = require('../models/DuplicateReview');

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
 * Mapping of raw publication types across sources to standard Platform Publication Types
 */
const PUBLICATION_TYPE_MAP = Object.freeze({
  'journal': 'Journal',
  'journal-article': 'Journal',
  'journal article': 'Journal',
  'article': 'Journal',
  'review': 'Journal',
  'short survey': 'Journal',
  'data paper': 'Journal',
  'conference': 'Conference',
  'conference-paper': 'Conference',
  'conference paper': 'Conference',
  'conference proceeding': 'Conference',
  'proceeding': 'Conference',
  'inproceedings': 'Conference',
  'book': 'Book',
  'edited-book': 'Book',
  'monograph': 'Book',
  'book chapter': 'Book Chapter',
  'book-chapter': 'Book Chapter',
  'chapter': 'Book Chapter',
  'book series': 'Book Chapter',
  'patent': 'Patent',
  'preprint': 'Preprint',
  'working-paper': 'Preprint',
  'dissertation-thesis': 'Other',
  'thesis': 'Other',
  'report': 'Other',
  'editorial': 'Other',
  'other': 'Other'
});

/**
 * Helper to collapse multiple whitespace characters and trim
 * @param {any} val 
 * @returns {string} Cleaned single-spaced string
 */
/**
 * Helper to collapse multiple whitespace characters and trim
 * @param {any} val 
 * @returns {string} Cleaned single-spaced string
 */
const cleanText = (val) => {
  if (val === null || val === undefined) return '';
  const str = String(val);
  return str.replace(/\s+/g, ' ').trim();
};

const KNOWN_ACRONYMS = new Set([
  'ai', 'ml', 'cnn', 'rnn', 'gnn', 'mri', 'ct', 'dna', 'rna',
  'covid', 'covid-19', 'hiv', 'icu', 'nlp', 'llm', 'iot', 'gpu', 'cpu', 'api'
]);

/**
 * Standardize title casing and remove duplicate whitespace.
 * If title is all-caps or all-lowercase, converts to Title Case.
 * Otherwise preserves mixed casing to respect acronyms and proper nouns.
 * @param {any} rawTitle 
 * @returns {string} Cleaned and normalized title
 */
const normalizeTitle = (rawTitle) => {
  const cleaned = cleanText(rawTitle);
  if (!cleaned) return '';

  if (cleaned.length > 3) {
    const isAllUpper = cleaned === cleaned.toUpperCase() && /[A-Z]/.test(cleaned);
    const isAllLower = cleaned === cleaned.toLowerCase() && /[a-z]/.test(cleaned);
    if (isAllUpper || isAllLower) {
      const stopWords = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'so', 'the', 'to', 'up', 'yet']);
      const words = cleaned.toLowerCase().split(' ');
      return words
        .map((w, idx) => {
          if (idx > 0 && stopWords.has(w)) return w;
          if (KNOWN_ACRONYMS.has(w)) return w.toUpperCase();
          return w.replace(/\b\w/g, c => c.toUpperCase());
        })
        .join(' ');
    }
  }

  return cleaned;
};

/**
 * Normalize DOI string by stripping url protocols, domain prefixes, and doi labels
 * @param {any} rawDoi 
 * @returns {string} Normalized DOI string (e.g. "10.1016/j.artmed.2025.04") or empty string
 */
const normalizeDoi = (rawDoi) => {
  if (!rawDoi || typeof rawDoi !== 'string') return '';
  let cleaned = rawDoi.trim();
  cleaned = cleaned.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '');
  cleaned = cleaned.replace(/^doi:\s*/i, '');
  cleaned = cleanText(cleaned);
  return cleaned;
};

/**
 * Normalize and identify research data source
 * @param {string} sourceRaw 
 * @returns {string|null} Canonical source name or null if invalid
 */
const normalizeSource = (sourceRaw) => {
  if (!sourceRaw || typeof sourceRaw !== 'string') return null;
  const cleaned = cleanText(sourceRaw).toLowerCase();
  if (SOURCE_ALIASES[cleaned]) {
    return SOURCE_ALIASES[cleaned];
  }
  if (SUPPORTED_SOURCES.includes(cleaned)) {
    return cleaned;
  }
  return null;
};

/**
 * Normalize publication authors into an array of non-empty strings
 * @param {any} rawAuthors Array, delimited string (comma/semicolon/and), or author objects
 * @returns {string[]}
 */
const normalizeAuthors = (rawAuthors) => {
  if (!rawAuthors) return [];

  if (Array.isArray(rawAuthors)) {
    return rawAuthors
      .map(item => {
        if (typeof item === 'string') return cleanText(item);
        if (item && typeof item === 'object') {
          return cleanText(
            item.name ||
            item.authname ||
            (item['credit-name'] && item['credit-name'].value) ||
            (item.surname ? `${item.surname}, ${item.given_name || item['given-name'] || ''}` : '') ||
            (item['family-name'] && item['given-names'] ? `${item['family-name'].value}, ${item['given-names'].value}` : '') ||
            item.title ||
            ''
          );
        }
        return '';
      })
      .filter(a => a.length > 0);
  }

  if (typeof rawAuthors === 'string') {
    return rawAuthors
      .split(/\s+and\s+|[,;\n\r]/i)
      .map(a => cleanText(a))
      .filter(a => a.length > 0);
  }

  return [];
};

/**
 * Normalize publication year from string or number format
 * @param {any} rawYear 
 * @returns {number|null|any} Integer year, null if missing, or raw/NaN if invalid
 */
const normalizeYear = (rawYear) => {
  if (rawYear === undefined || rawYear === null || rawYear === '') return null;

  if (typeof rawYear === 'string') {
    const trimmed = rawYear.trim();
    // Match 4 digit year in format YYYY or YYYY-MM-DD
    const match = trimmed.match(/\b(19\d{2}|20\d{2}|2100)\b/);
    if (match) {
      return parseInt(match[1], 10);
    }
    const num = Number(trimmed);
    if (!isNaN(num)) {
      return num;
    }
    return NaN;
  }

  if (typeof rawYear === 'number') {
    return rawYear;
  }

  return NaN;
};

/**
 * Normalize citation count from string or number
 * @param {any} rawCitations 
 * @returns {number} Non-negative number, 0 by default, or NaN / negative if invalid
 */
const normalizeCitations = (rawCitations) => {
  if (rawCitations === undefined || rawCitations === null || rawCitations === '') return 0;
  if (typeof rawCitations === 'string') {
    const trimmed = rawCitations.trim();
    if (trimmed === '') return 0;
    const num = Number(trimmed);
    return isNaN(num) ? NaN : num;
  }
  if (typeof rawCitations === 'number') {
    return rawCitations;
  }
  return NaN;
};

/**
 * Normalize publication type mapping
 * @param {string} rawType 
 * @param {string} conference 
 * @param {string} journal 
 * @returns {string} Platform standard enum
 */
const normalizePublicationType = (rawType, conference, journal) => {
  if (rawType && typeof rawType === 'string') {
    const key = cleanText(rawType).toLowerCase();
    if (PUBLICATION_TYPE_MAP[key]) {
      return PUBLICATION_TYPE_MAP[key];
    }
    const validEnums = ['Journal', 'Conference', 'Book Chapter', 'Book', 'Patent', 'Preprint', 'Other'];
    const directMatch = validEnums.find(v => v.toLowerCase() === key);
    if (directMatch) return directMatch;
  }

  if (conference && !journal) {
    return 'Conference';
  }
  return 'Journal';
};

/**
 * Unified, authoritative normalization function for publications from any source.
 * Produces a consistent, standardized publication structure across all sources:
 * - manual
 * - orcid
 * - scopus
 * - google_scholar
 * - institutional
 * 
 * @param {object} rawPub Raw publication object
 * @param {string} sourceHint Explicit source identifier hint
 * @returns {object} Standardized publication object
 */
const normalizePublication = (rawPub, sourceHint = 'manual') => {
  if (!rawPub || typeof rawPub !== 'object') {
    return null;
  }

  // 1. Source normalization: canonicalize known aliases, preserve raw if unsupported for validation
  const rawSrc = rawPub.source || sourceHint;
  const canonicalSource = normalizeSource(rawSrc);
  const resolvedSource = canonicalSource || (typeof rawSrc === 'string' ? cleanText(rawSrc).toLowerCase() : 'manual');

  // 2. Title normalization (collapse duplicate whitespace, handle casing)
  const title = normalizeTitle(rawPub.title);

  // 3. Abstract normalization (trim, clean whitespace)
  const abstract = cleanText(rawPub.abstract);

  // 4. Authors normalization (array of clean strings)
  const authors = normalizeAuthors(rawPub.authors);

  // 5. Year normalization (integer, or null if missing)
  const year = normalizeYear(rawPub.year);

  // 6. DOI normalization (strip url prefixes and doi: tags)
  const doi = normalizeDoi(rawPub.doi);

  // 7. Venue, Journal, Conference normalization
  const journal = cleanText(rawPub.journal);
  const conference = cleanText(rawPub.conference);
  const rawVenue = cleanText(rawPub.venue);
  const venue = rawVenue || journal || conference || '';

  // 8. Publication Type normalization
  const publicationType = normalizePublicationType(rawPub.publicationType, conference, journal);

  // 9. Citations normalization
  const citations = normalizeCitations(rawPub.citations);

  // 10. Keywords normalization
  let keywords = [];
  if (Array.isArray(rawPub.keywords)) {
    keywords = rawPub.keywords.map(k => cleanText(k)).filter(k => k.length > 0);
  } else if (typeof rawPub.keywords === 'string' && rawPub.keywords.trim() !== '') {
    keywords = rawPub.keywords.split(/[,;\n\r]/).map(k => cleanText(k)).filter(k => k.length > 0);
  }

  // 11. Research Domains
  const researchDomains = Array.isArray(rawPub.researchDomains) ? rawPub.researchDomains : [];

  // 12. Faculty associations
  let facultyIds = [];
  if (Array.isArray(rawPub.facultyIds)) {
    facultyIds = rawPub.facultyIds;
  } else if (rawPub.facultyId) {
    facultyIds = [rawPub.facultyId];
  }

  // 13. External URLs / identifiers (optional preservation)
  const externalUrl = rawPub.externalUrl || rawPub.url || rawPub.link || null;
  const orcidPutCode = rawPub.orcidPutCode || null;
  const scopusId = rawPub.scopusId || null;
  const publicationCode = rawPub.publicationCode || null;

  return {
    title,
    abstract,
    authors,
    year,
    journal: journal || (publicationType === 'Journal' ? venue : ''),
    conference: conference || (publicationType === 'Conference' ? venue : ''),
    venue,
    doi,
    publicationType,
    citations,
    researchDomains,
    keywords,
    source: resolvedSource,
    facultyIds,
    ...(publicationCode ? { publicationCode } : {}),
    ...(externalUrl ? { externalUrl } : {}),
    ...(orcidPutCode ? { orcidPutCode } : {}),
    ...(scopusId ? { scopusId } : {})
  };
};

/**
 * Validate an individual normalized publication record
 * @param {object} pub Publication object to validate
 * @param {object} options Optional validation flags (e.g. { requireYear: false })
 * @returns {{ isValid: boolean, errors: string[] }}
 */
const validatePublicationRecord = (pub, options = { requireYear: false }) => {
  const errors = [];

  if (!pub || typeof pub !== 'object') {
    return { isValid: false, errors: ['Publication must be a valid object'] };
  }

  // 1. Title is required
  if (!pub.title || typeof pub.title !== 'string' || cleanText(pub.title) === '') {
    errors.push('Publication "title" is required and cannot be empty');
  }

  // 2. Year must be a valid year when provided (or required if options.requireYear is true)
  if (pub.year !== null && pub.year !== undefined && pub.year !== '') {
    if (typeof pub.year !== 'number' || isNaN(pub.year) || !Number.isInteger(pub.year) || pub.year < 1900 || pub.year > 2100) {
      errors.push(`Publication year must be a valid 4-digit integer between 1900 and 2100 (got: ${pub.year})`);
    }
  } else if (options.requireYear) {
    errors.push('Publication "year" is required');
  }

  // 3. Citations must be a non-negative number
  if (pub.citations !== undefined && pub.citations !== null) {
    if (typeof pub.citations !== 'number' || isNaN(pub.citations) || pub.citations < 0) {
      errors.push(`Citations must be a non-negative number (got: ${pub.citations})`);
    }
  }

  // 4. Authors must use the existing application format (array of strings)
  if (pub.authors !== undefined && pub.authors !== null) {
    if (!Array.isArray(pub.authors) || pub.authors.some(a => typeof a !== 'string')) {
      errors.push('Authors must be an array of strings');
    }
  }

  // 5. Source must be one of the supported sources
  if (!pub.source || !SUPPORTED_SOURCES.includes(pub.source)) {
    errors.push(`Source "${pub.source}" is not supported. Supported sources: ${SUPPORTED_SOURCES.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors
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
  if (!source || typeof source !== 'string' || cleanText(source) === '') {
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

      // Validate normalized publication item using unified validatePublicationRecord
      const normalizedPub = normalizePublication(pub, canonicalSource || 'manual');
      const pubValidation = validatePublicationRecord(normalizedPub, { requireYear: true });
      if (!pubValidation.isValid) {
        pubValidation.errors.forEach(err => errors.push(`${idxLabel}: ${err}`));
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
 * Import and persist normalized publications into the database with duplicate detection integration
 * 
 * Rules:
 * - If strong existing match found (confidence === 'high'):
 *     Do NOT create another publication; report existing publication information and matching signals.
 * - If match is uncertain (confidence === 'medium' or 'low'):
 *     Allow publication to be safely stored; create a pending duplicate-review record without auto-merging.
 * - If no duplicate candidate exists:
 *     Create publication normally.
 * - Avoid duplicate review records (treat A+B and B+A as the same pair).
 * 
 * @param {object} payload 
 * @returns {Promise<{ count: number, source: string, publications: object[], duplicatesDetected: object[], summary: object }>}
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

  // If explicit deduplicate: false is passed, bypass deduplication guard (e.g. for testing fixtures)
  if (payload.deduplicate === false) {
    const inserted = await Publication.create(normalizedDocs);
    return {
      count: inserted.length,
      source: canonicalSource,
      publications: inserted,
      duplicatesDetected: [],
      summary: {
        totalProcessed: normalizedDocs.length,
        created: inserted.length,
        duplicatesSkipped: 0,
        pendingReviewsCreated: 0
      }
    };
  }

  const createdPublications = [];
  const duplicatesDetected = [];
  const pendingReviewsCreated = [];
  const duplicateDetectionService = require('./duplicateDetection.service');
  const seenReviewPairs = new Set();

  for (const normPub of normalizedDocs) {
    // 1. Run duplicate detection against existing active publications
    const dupResult = await duplicateDetectionService.findDuplicatesForRecord(normPub);
    const candidates = dupResult.candidates || [];

    // Filter candidates (excluding soft-merged duplicates which findDuplicatesForRecord already handles)
    const topCandidate = candidates[0];
    const isStrongMatch = topCandidate && topCandidate.confidence === 'high';
    const isUncertainMatch = topCandidate && (topCandidate.confidence === 'medium' || topCandidate.confidence === 'low');

    if (isStrongMatch) {
      // 2. Strong match: do NOT create duplicate publication; return matching signals and existing info
      duplicatesDetected.push({
        status: 'duplicate_detected',
        action: 'skipped',
        isDuplicate: true,
        existingPublicationId: topCandidate.existingPublicationId,
        existingPublication: topCandidate.existingPublication,
        incomingPublication: {
          title: normPub.title,
          year: normPub.year,
          authors: normPub.authors || [],
          doi: normPub.doi || '',
          venue: normPub.venue || normPub.journal || normPub.conference || '',
          journal: normPub.journal || '',
          conference: normPub.conference || '',
          source: normPub.source || canonicalSource
        },
        similarityScore: topCandidate.similarityScore,
        confidence: topCandidate.confidence,
        matchType: topCandidate.matchType,
        matchingSignals: topCandidate.matchingSignals,
        reasons: topCandidate.reasons,
        message: 'Publication was not created because a strong duplicate already exists'
      });
    } else if (isUncertainMatch) {
      // 3. Uncertain match: safely store publication and create a pending duplicate-review record
      const created = await Publication.create(normPub);
      createdPublications.push(created);

      const uncertainCandidates = candidates.filter(c => c.confidence === 'medium' || c.confidence === 'low');
      for (const candidate of uncertainCandidates) {
        try {
          const idA = created._id;
          const idB = candidate.existingPublicationId;
          const idAStr = idA.toString();
          const idBStr = idB ? idB.toString() : '';

          if (!idBStr) continue;

          const pairKey1 = `${idAStr}_${idBStr}`;
          const pairKey2 = `${idBStr}_${idAStr}`;

          // Check memory set first to avoid duplicate pairs in current batch
          if (seenReviewPairs.has(pairKey1) || seenReviewPairs.has(pairKey2)) {
            continue;
          }

          // Check if review already exists for this pair in either direction in database (Task 7)
          const existingReview = await DuplicateReview.findOne({
            $or: [
              { publicationId: idA, potentialDuplicateId: idB },
              { publicationId: idB, potentialDuplicateId: idA }
            ]
          });

          if (!existingReview) {
            const newReview = await DuplicateReview.create({
              publicationId: idA,
              potentialDuplicateId: idB,
              similarityScore: candidate.similarityScore,
              confidence: candidate.confidence,
              matchingSignals: candidate.matchingSignals,
              status: 'pending'
            });
            pendingReviewsCreated.push(newReview);
          }

          seenReviewPairs.add(pairKey1);
          seenReviewPairs.add(pairKey2);
        } catch (revErr) {
          // Continue gracefully if review record creation encounters issue
        }
      }
    } else {
      // 4. No candidate: create publication normally
      const created = await Publication.create(normPub);
      createdPublications.push(created);
    }
  }

  return {
    count: createdPublications.length,
    source: canonicalSource,
    publications: createdPublications,
    duplicatesDetected,
    pendingReviews: pendingReviewsCreated,
    summary: {
      totalProcessed: normalizedDocs.length,
      created: createdPublications.length,
      duplicatesSkipped: duplicatesDetected.length,
      pendingReviewsCreated: pendingReviewsCreated.length
    }
  };
};

/**
 * Compare an incoming or imported publication against existing database records for potential duplicates
 * before persisting it.
 * @param {object} rawOrNormalizedPub 
 * @param {object} options 
 * @returns {Promise<{ count: number, totalPotentialDuplicates: number, candidates: object[] }>}
 */
const checkPublicationDuplicates = async (rawOrNormalizedPub, options = {}) => {
  const duplicateDetectionService = require('./duplicateDetection.service');
  const normalized = normalizePublication(rawOrNormalizedPub);
  return await duplicateDetectionService.findDuplicatesForRecord(normalized, options);
};

module.exports = {
  SUPPORTED_SOURCES,
  cleanText,
  normalizeTitle,
  normalizeDoi,
  normalizeSource,
  normalizeAuthors,
  normalizeYear,
  normalizeCitations,
  normalizePublicationType,
  normalizePublication,
  validatePublicationRecord,
  validateImportPayload,
  importPublications,
  checkPublicationDuplicates
};
