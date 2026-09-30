const mongoose = require('mongoose');
const Publication = require('../models/Publication');
const { cleanText, normalizeDoi } = require('./import.service');

/**
 * Standard stop-words to ignore during token-level author/title filtering if needed
 */
const COMMON_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'in', 'into', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'to',
  'with', 'via', 'using', 'based'
]);

/**
 * Canonical title normalization:
 * - lowercase
 * - remove all punctuation and non-alphanumeric characters (except spaces)
 * - collapse multiple whitespace characters
 * - trim
 * 
 * @param {string} rawTitle 
 * @returns {string} Canonicalized title string
 */
const getCanonicalTitle = (rawTitle) => {
  if (!rawTitle) return '';
  const cleaned = cleanText(rawTitle).toLowerCase();
  // Replace punctuation and special characters with spaces
  const noPunct = cleaned.replace(/[-_/:,;."''`!?()[\]{}<>=+*#&%~^|\\]/g, ' ');
  return cleanText(noPunct);
};

/**
 * Calculate Levenshtein edit distance between two strings
 * Uses two-row DP for O(min(N, M)) space efficiency
 * @param {string} s1 
 * @param {string} s2 
 * @returns {number}
 */
const levenshteinDistance = (s1, s2) => {
  if (s1 === s2) return 0;
  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;

  let prev = new Array(s2.length + 1);
  let curr = new Array(s2.length + 1);

  for (let j = 0; j <= s2.length; j++) {
    prev[j] = j;
  }

  for (let i = 1; i <= s1.length; i++) {
    curr[0] = i;
    const char1 = s1.charCodeAt(i - 1);

    for (let j = 1; j <= s2.length; j++) {
      const char2 = s2.charCodeAt(j - 1);
      const cost = char1 === char2 ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,       // insertion
        prev[j] + 1,           // deletion
        prev[j - 1] + cost     // substitution
      );
    }

    // Swap buffers
    const temp = prev;
    prev = curr;
    curr = temp;
  }

  return prev[s2.length];
};

/**
 * Calculate normalized Levenshtein similarity [0.0 - 1.0]
 * @param {string} s1 
 * @param {string} s2 
 * @returns {number}
 */
const calculateLevenshteinSimilarity = (s1, s2) => {
  if (s1 === s2) return 1.0;
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(s1, s2);
  return Math.max(0, 1 - dist / maxLen);
};

/**
 * Calculate token-level Sørensen-Dice coefficient on words
 * @param {string} s1 
 * @param {string} s2 
 * @returns {number}
 */
const calculateTokenDice = (s1, s2) => {
  const tokens1 = s1.split(' ').filter(t => t.length > 0);
  const tokens2 = s2.split(' ').filter(t => t.length > 0);

  if (tokens1.length === 0 && tokens2.length === 0) return 1.0;
  if (tokens1.length === 0 || tokens2.length === 0) return 0.0;

  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);

  let intersection = 0;
  for (const token of set1) {
    if (set2.has(token)) {
      intersection++;
    }
  }

  return (2 * intersection) / (set1.size + set2.size);
};

/**
 * Calculate character bigram Sørensen-Dice coefficient
 * Highly resilient to transposed letters and minor typos
 * @param {string} s1 
 * @param {string} s2 
 * @returns {number}
 */
const calculateBigramDice = (s1, s2) => {
  if (s1 === s2) return 1.0;
  if (s1.length < 2 || s2.length < 2) return 0.0;

  const getBigrams = (str) => {
    const bigrams = new Map();
    for (let i = 0; i < str.length - 1; i++) {
      const bigram = str.substring(i, i + 2);
      bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
    }
    return bigrams;
  };

  const bigrams1 = getBigrams(s1);
  const bigrams2 = getBigrams(s2);

  let intersection = 0;
  for (const [bigram, count1] of bigrams1.entries()) {
    if (bigrams2.has(bigram)) {
      intersection += Math.min(count1, bigrams2.get(bigram));
    }
  }

  const total = (s1.length - 1) + (s2.length - 1);
  return total > 0 ? (2 * intersection) / total : 0;
};

/**
 * Calculate comprehensive fuzzy title similarity score [0.0 - 1.0]
 * Combines exact canonical comparison, Levenshtein, token Dice, and bigram Dice.
 * 
 * @param {string} title1 
 * @param {string} title2 
 * @returns {number} Value between 0.0 and 1.0
 */
const calculateTitleSimilarity = (title1, title2) => {
  const canon1 = getCanonicalTitle(title1);
  const canon2 = getCanonicalTitle(title2);

  if (!canon1 || !canon2) return 0.0;
  if (canon1 === canon2) return 1.0;

  const levSim = calculateLevenshteinSimilarity(canon1, canon2);
  const tokenDice = calculateTokenDice(canon1, canon2);
  const bigramDice = calculateBigramDice(canon1, canon2);

  // Return highest matching signal among edit distance and token/bigram Dice
  const combined = Math.max(levSim, (tokenDice * 0.6) + (bigramDice * 0.4), tokenDice);
  return Math.min(1.0, Math.max(0.0, Math.round(combined * 1000) / 1000));
};

/**
 * Normalize and clean DOI for strict comparison
 * @param {any} rawDoi 
 * @returns {string|null} Lowercase normalized DOI without protocol prefixes, or null
 */
const getCanonicalDoi = (rawDoi) => {
  const norm = normalizeDoi(rawDoi);
  if (!norm || typeof norm !== 'string') return null;
  const cleaned = norm.trim().toLowerCase();
  return cleaned.length > 0 ? cleaned : null;
};

/**
 * Extract author surnames / primary identifier tokens from author list
 * @param {any} authors Array of author strings or objects
 * @returns {string[]}
 */
const extractAuthorTokens = (authors) => {
  if (!authors) return [];
  const list = Array.isArray(authors) ? authors : [authors];
  const tokens = [];

  for (const item of list) {
    if (typeof item === 'string') {
      const parts = item
        .replace(/^(dr\.?|prof\.?|mr\.?|ms\.?|mrs\.?)\s+/i, '')
        .replace(/[,;]/g, ' ')
        .split(' ')
        .map(p => cleanText(p).toLowerCase())
        .filter(p => p.length >= 3);
      tokens.push(...parts);
    } else if (item && typeof item === 'object') {
      if (item.surname) tokens.push(cleanText(item.surname).toLowerCase());
      if (item.name) tokens.push(...extractAuthorTokens(item.name));
    }
  }

  return [...new Set(tokens)];
};

/**
 * Calculate author overlap between two publications
 * @param {any} authors1 
 * @param {any} authors2 
 * @returns {{ hasOverlap: boolean, overlapScore: number, commonTokens: string[] }}
 */
const calculateAuthorOverlap = (authors1, authors2) => {
  const tokens1 = extractAuthorTokens(authors1);
  const tokens2 = extractAuthorTokens(authors2);

  if (tokens1.length === 0 || tokens2.length === 0) {
    return { hasOverlap: false, overlapScore: 0, commonTokens: [], unknown: true };
  }

  const set2 = new Set(tokens2);
  const common = tokens1.filter(t => set2.has(t));
  const union = new Set([...tokens1, ...tokens2]);
  const overlapScore = union.size > 0 ? common.length / union.size : 0;

  return {
    hasOverlap: common.length > 0,
    overlapScore: Math.round(overlapScore * 100) / 100,
    commonTokens: common,
    unknown: false
  };
};

/**
 * Compare two publication venues/journals/conferences
 * @param {object} pub1 
 * @param {object} pub2 
 * @returns {{ isMatch: boolean, similarity: number }}
 */
const compareVenues = (pub1, pub2) => {
  const v1 = getCanonicalTitle(pub1.venue || pub1.journal || pub1.conference || '');
  const v2 = getCanonicalTitle(pub2.venue || pub2.journal || pub2.conference || '');

  if (!v1 || !v2) {
    return { isMatch: false, similarity: 0, unknown: true };
  }

  if (v1 === v2) {
    return { isMatch: true, similarity: 1.0, unknown: false };
  }

  const sim = calculateTokenDice(v1, v2);
  return { isMatch: sim >= 0.75, similarity: sim, unknown: false };
};

/**
 * Evaluate whether an existing publication is a potential duplicate of a target publication
 * 
 * @param {object} targetPub Incoming or source publication
 * @param {object} candidatePub Existing publication in database
 * @returns {object|null} Candidate duplicate record or null if not a candidate
 */
const evaluateDuplicateCandidate = (targetPub, candidatePub) => {
  if (!candidatePub || !targetPub) return null;

  // Soft-merged duplicate publications are excluded from normal duplicate matching
  if (targetPub.isDuplicate === true || candidatePub.isDuplicate === true) {
    return null;
  }

  // Do not compare a publication against itself
  const targetId = targetPub._id ? targetPub._id.toString() : (targetPub.id ? targetPub.id.toString() : null);
  const candidateId = candidatePub._id ? candidatePub._id.toString() : (candidatePub.id ? candidatePub.id.toString() : null);
  if (targetId && candidateId && targetId === candidateId) {
    return null;
  }

  const matchingSignals = [];
  const reasons = [];

  // 1. DOI Matching
  const targetDoi = getCanonicalDoi(targetPub.doi);
  const candidateDoi = getCanonicalDoi(candidatePub.doi);
  const isDoiMatch = Boolean(targetDoi && candidateDoi && targetDoi === candidateDoi);

  if (isDoiMatch) {
    matchingSignals.push(`IDENTICAL_DOI (${targetDoi})`);
    reasons.push(`Publications share identical DOI (${targetDoi}).`);
  }

  // 2. Title Matching & Similarity
  const rawTitle1 = targetPub.title || '';
  const rawTitle2 = candidatePub.title || '';
  const canon1 = getCanonicalTitle(rawTitle1);
  const canon2 = getCanonicalTitle(rawTitle2);
  const isExactTitle = Boolean(canon1 && canon2 && canon1 === canon2);
  const titleSim = calculateTitleSimilarity(rawTitle1, rawTitle2);

  if (isExactTitle) {
    matchingSignals.push('EXACT_TITLE_MATCH');
    reasons.push('Titles match identically after normalization.');
  } else if (titleSim >= 0.85) {
    matchingSignals.push(`HIGH_TITLE_SIMILARITY (${Math.round(titleSim * 100)}%)`);
    reasons.push(`Titles are highly similar (${Math.round(titleSim * 100)}% match).`);
  } else if (titleSim >= 0.70) {
    matchingSignals.push(`MODERATE_TITLE_SIMILARITY (${Math.round(titleSim * 100)}%)`);
    reasons.push(`Titles have moderate similarity (${Math.round(titleSim * 100)}% match).`);
  }

  // 3. Year Comparison
  const year1 = targetPub.year !== null && targetPub.year !== undefined ? Number(targetPub.year) : null;
  const year2 = candidatePub.year !== null && candidatePub.year !== undefined ? Number(candidatePub.year) : null;
  let yearStatus = 'unknown';

  if (year1 && year2 && !isNaN(year1) && !isNaN(year2)) {
    const yearDiff = Math.abs(year1 - year2);
    if (yearDiff === 0) {
      yearStatus = 'same';
      matchingSignals.push(`SAME_PUBLICATION_YEAR (${year1})`);
    } else if (yearDiff === 1) {
      yearStatus = 'proximate';
      matchingSignals.push(`PROXIMATE_PUBLICATION_YEAR (${year1} vs ${year2})`);
      reasons.push(`Publication years differ by 1 year (${year1} vs ${year2}), common between preprint and final publication.`);
    } else {
      yearStatus = 'different';
      matchingSignals.push(`DIFFERENT_PUBLICATION_YEAR (${year1} vs ${year2})`);
      reasons.push(`Publication years differ by ${yearDiff} years (${year1} vs ${year2}).`);
    }
  } else {
    matchingSignals.push('YEAR_METADATA_INCOMPLETE');
  }

  // 4. Author Overlap
  const authorEval = calculateAuthorOverlap(targetPub.authors, candidatePub.authors);
  if (!authorEval.unknown) {
    if (authorEval.hasOverlap) {
      const topAuthors = authorEval.commonTokens.slice(0, 3).map(a => a.charAt(0).toUpperCase() + a.slice(1)).join(', ');
      matchingSignals.push(`AUTHOR_OVERLAP (${topAuthors})`);
      reasons.push(`Shared authors identified (${topAuthors}).`);
    } else {
      matchingSignals.push('DIFFERENT_AUTHORS');
      reasons.push('No author overlap detected.');
    }
  }

  // 5. Venue / Journal Overlap
  const venueEval = compareVenues(targetPub, candidatePub);
  if (!venueEval.unknown && venueEval.isMatch) {
    const venueName = candidatePub.venue || candidatePub.journal || candidatePub.conference || '';
    matchingSignals.push(`SAME_VENUE (${venueName})`);
    reasons.push(`Published in the same venue/journal (${venueName}).`);
  }

  // -------------------------------------------------------------------------
  // DUPLICATE CONFIDENCE DETERMINATION
  // -------------------------------------------------------------------------
  let confidence = null;
  let matchType = 'none';

  // Rule 1: Valid DOI match is a definitive high-confidence signal
  if (isDoiMatch) {
    confidence = 'high';
    matchType = 'doi_match';
  }
  // Rule 2: Exact/canonical title match
  else if (isExactTitle) {
    if (yearStatus === 'same' || yearStatus === 'proximate') {
      if (authorEval.hasOverlap || authorEval.unknown) {
        confidence = 'high';
        matchType = 'exact_title_match';
      } else {
        // Same title, same year, but completely different authors (e.g. coincidental common title)
        confidence = 'medium';
        matchType = 'exact_title_different_authors';
      }
    } else if (yearStatus === 'different') {
      // Same title, but years differ by 2+ years (e.g. reprint, multiple editions, or separate work)
      confidence = authorEval.hasOverlap ? 'medium' : 'low';
      matchType = 'exact_title_different_year';
    } else {
      // Year unknown
      confidence = authorEval.hasOverlap ? 'high' : 'medium';
      matchType = 'exact_title_match';
    }
  }
  // Rule 3: Fuzzy title match (similarity >= 0.85)
  else if (titleSim >= 0.85) {
    if (yearStatus === 'same' && (authorEval.hasOverlap || venueEval.isMatch)) {
      confidence = 'high';
      matchType = 'fuzzy_title_match';
    } else if (yearStatus === 'same' || yearStatus === 'proximate') {
      confidence = 'medium';
      matchType = 'fuzzy_title_match';
    } else if (yearStatus === 'different' && authorEval.hasOverlap) {
      confidence = 'medium';
      matchType = 'fuzzy_title_match';
    } else if (titleSim >= 0.90) {
      confidence = 'medium';
      matchType = 'fuzzy_title_match';
    } else {
      confidence = 'low';
      matchType = 'fuzzy_title_match';
    }
  }
  // Rule 4: Moderate title match (0.70 - 0.84)
  else if (titleSim >= 0.70) {
    if (yearStatus === 'same' && authorEval.hasOverlap) {
      confidence = 'medium';
      matchType = 'fuzzy_title_match';
    } else if (yearStatus === 'same' || authorEval.hasOverlap) {
      confidence = 'low';
      matchType = 'fuzzy_title_match';
    }
  }

  // If no duplicate threshold was met, discard candidate
  if (!confidence) {
    return null;
  }

  // Format final candidate representation
  const summaryExisting = {
    id: candidatePub._id ? candidatePub._id.toString() : candidatePub.id,
    publicationCode: candidatePub.publicationCode || undefined,
    title: candidatePub.title,
    year: candidatePub.year,
    authors: candidatePub.authors || [],
    doi: candidatePub.doi || '',
    venue: candidatePub.venue || candidatePub.journal || candidatePub.conference || '',
    journal: candidatePub.journal || '',
    conference: candidatePub.conference || '',
    publicationType: candidatePub.publicationType || 'Journal',
    citations: candidatePub.citations || 0,
    source: candidatePub.source || 'manual'
  };

  const summaryIncoming = {
    id: targetPub._id ? targetPub._id.toString() : (targetPub.id || undefined),
    title: targetPub.title,
    year: targetPub.year,
    authors: targetPub.authors || [],
    doi: targetPub.doi || '',
    venue: targetPub.venue || targetPub.journal || targetPub.conference || '',
    source: targetPub.source || 'manual'
  };

  return {
    existingPublicationId: summaryExisting.id,
    existingPublication: summaryExisting,
    incomingPublication: summaryIncoming,
    similarityScore: Math.round(titleSim * 100) / 100,
    confidence,
    matchType,
    matchingSignals,
    reasons: reasons.join(' ')
  };
};

/**
 * Find potential duplicate publication candidates for a given publication object
 * against all existing publications in MongoDB
 * 
 * @param {object} targetPub Publication record (from database or incoming import)
 * @param {object} options Optional filtering/limit options
 * @returns {Promise<{ count: number, candidates: object[] }>}
 */
const findDuplicatesForRecord = async (targetPub, options = {}) => {
  if (!targetPub || typeof targetPub !== 'object' || !targetPub.title) {
    return { count: 0, candidates: [] };
  }

  // Soft-merged duplicate publications are excluded from normal duplicate matching
  if (targetPub.isDuplicate === true) {
    return { count: 0, candidates: [] };
  }

  const targetId = targetPub._id ? targetPub._id : (targetPub.id && mongoose.Types.ObjectId.isValid(targetPub.id) ? targetPub.id : null);

  // Check for rejected duplicate reviews to suppress them from candidate lists
  let rejectedPartnerIds = new Set();
  if (targetId && !options.includeRejected) {
    try {
      const DuplicateReview = require('../models/DuplicateReview');
      const rejectedReviews = await DuplicateReview.find({
        status: 'rejected',
        $or: [
          { publicationId: targetId },
          { potentialDuplicateId: targetId }
        ]
      }).select('publicationId potentialDuplicateId').lean();

      for (const r of rejectedReviews) {
        const pubIdStr = r.publicationId.toString();
        const potIdStr = r.potentialDuplicateId.toString();
        const targetStr = targetId.toString();
        rejectedPartnerIds.add(pubIdStr === targetStr ? potIdStr : pubIdStr);
      }
    } catch (e) {
      // Continue gracefully if review collection query fails
    }
  }

  // Fetch all other active (non-merged) publications from MongoDB
  const query = { isDuplicate: { $ne: true } };
  if (targetId) {
    query._id = { $ne: targetId };
  }
  const existingPubs = await Publication.find(query)
    .select('title year authors doi venue journal conference publicationType citations source publicationCode')
    .lean();

  const candidates = [];

  for (const existing of existingPubs) {
    const existingIdStr = existing._id ? existing._id.toString() : '';
    if (rejectedPartnerIds.has(existingIdStr)) {
      continue; // Suppress rejected duplicate pair
    }

    const candidate = evaluateDuplicateCandidate(targetPub, existing);
    if (candidate) {
      candidates.push(candidate);
    }
  }

  // Sort candidates by confidence (high -> medium -> low), then similarityScore descending
  const confidenceOrder = { high: 3, medium: 2, low: 1 };
  candidates.sort((a, b) => {
    const confDiff = (confidenceOrder[b.confidence] || 0) - (confidenceOrder[a.confidence] || 0);
    if (confDiff !== 0) return confDiff;
    return b.similarityScore - a.similarityScore;
  });

  const limit = options.limit || 20;
  const limitedCandidates = candidates.slice(0, limit);

  return {
    count: limitedCandidates.length,
    totalPotentialDuplicates: candidates.length,
    candidates: limitedCandidates
  };
};

/**
 * Service to find potential duplicates for an existing publication by ID
 * 
 * @param {string} publicationId MongoDB _id or publicationCode
 * @param {object} options Optional search options
 * @returns {Promise<{ targetPublication: object, count: number, candidates: object[] }>}
 */
const findDuplicatesForPublicationId = async (publicationId, options = {}) => {
  if (!publicationId) {
    const error = new Error('Publication ID is required');
    error.status = 400;
    throw error;
  }

  let targetPub = null;
  if (mongoose.Types.ObjectId.isValid(publicationId)) {
    targetPub = await Publication.findById(publicationId).lean();
  }
  if (!targetPub) {
    targetPub = await Publication.findOne({ publicationCode: publicationId }).lean();
  }

  if (!targetPub) {
    const error = new Error('Publication not found');
    error.status = 404;
    throw error;
  }

  const result = await findDuplicatesForRecord(targetPub, options);

  return {
    publicationId: targetPub._id.toString(),
    targetPublication: {
      id: targetPub._id.toString(),
      publicationCode: targetPub.publicationCode || undefined,
      title: targetPub.title,
      year: targetPub.year,
      authors: targetPub.authors || [],
      doi: targetPub.doi || '',
      venue: targetPub.venue || targetPub.journal || targetPub.conference || '',
      source: targetPub.source || 'manual'
    },
    count: result.count,
    candidates: result.candidates
  };
};

module.exports = {
  getCanonicalTitle,
  getCanonicalDoi,
  levenshteinDistance,
  calculateLevenshteinSimilarity,
  calculateTokenDice,
  calculateBigramDice,
  calculateTitleSimilarity,
  extractAuthorTokens,
  calculateAuthorOverlap,
  evaluateDuplicateCandidate,
  findDuplicatesForRecord,
  findDuplicatesForPublicationId
};
