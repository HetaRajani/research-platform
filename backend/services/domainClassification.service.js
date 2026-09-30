const mongoose = require('mongoose');
const { DOMAIN_VOCABULARY } = require('../config/domainVocabulary');
const Publication = require('../models/Publication');
const ResearchDomain = require('../models/ResearchDomain');

/**
 * Default classification configuration and constants (Phase 12B)
 */
const DEFAULT_MIN_RAW_SCORE = 2.0;
const DEFAULT_MIN_CONFIDENCE = 0.40;
const DEFAULT_MAX_DOMAINS = 5;
const CLASSIFIER_VERSION = '1.2.0-enhanced-rule-baseline';
const CLASSIFICATION_METHOD = 'rule-based-keyword-phrase-matching';

/**
 * Text cleaner and normalizer
 * @param {any} val 
 * @returns {string} Lowercase, trimmed, whitespace-collapsed string
 */
const normalizeText = (val) => {
  if (val === null || val === undefined) return '';
  const str = String(val).toLowerCase();
  return str.replace(/\s+/g, ' ').trim();
};

/**
 * Extract combined and segmented textual components from a publication object
 * @param {object} pub Publication document or plain object
 * @returns {{ title: string, abstract: string, keywords: string[], combined: string, hasText: boolean }}
 */
const extractPublicationText = (pub) => {
  if (!pub || typeof pub !== 'object') {
    return { title: '', abstract: '', keywords: [], combined: '', hasText: false };
  }

  const title = normalizeText(pub.title);
  const abstract = normalizeText(pub.abstract);

  let keywords = [];
  if (Array.isArray(pub.keywords)) {
    keywords = pub.keywords
      .map(k => normalizeText(k))
      .filter(k => k.length > 0);
  } else if (typeof pub.keywords === 'string' && pub.keywords.trim() !== '') {
    keywords = pub.keywords
      .split(/[,;\n\r]/)
      .map(k => normalizeText(k))
      .filter(k => k.length > 0);
  }

  const combined = [title, abstract, ...keywords].join(' ').trim();
  const hasText = title.length > 3 || abstract.length > 10 || keywords.length > 0;

  return {
    title,
    abstract,
    keywords,
    combined,
    hasText
  };
};

/**
 * Escape special regex characters in search strings
 * @param {string} str 
 * @returns {string}
 */
const escapeRegex = (str) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Match word or phrase using word boundary regex
 * @param {string} text Target text
 * @param {string} pattern Keyword or phrase to find
 * @returns {boolean}
 */
const matchesWordBoundary = (text, pattern) => {
  if (!text || !pattern) return false;
  const escaped = escapeRegex(pattern);
  // Match word boundary at start and end
  const regex = new RegExp(`\\b${escaped}\\b`, 'i');
  return regex.test(text);
};

/**
 * Classify publication text against configurable research domain vocabulary
 * using an explainable, rule-based keyword and phrase matching engine.
 * 
 * Computes transparent confidence scores based on:
 * - Specificity: multi-word phrases vs single keywords vs acronyms
 * - Location: Title (high weight), Keywords (highest weight), Abstract (standard weight)
 * - Composite evidence guard: avoids assigning domains based on a single weak or ambiguous word
 * 
 * @param {object} publication Plain object or Mongoose publication document
 * @param {object} options Optional scoring options { minConfidence, maxDomains, topK, minRawScore, includeEvidence, vocabulary }
 * @returns {{ domains: Array<object>, metadata: object }}
 */
const classifyPublicationResearchDomains = (publication, options = {}) => {
  const { title, abstract, keywords, hasText } = extractPublicationText(publication);

  const vocabulary = options.vocabulary || DOMAIN_VOCABULARY;
  const minRawScore = options.minRawScore !== undefined ? Number(options.minRawScore) : DEFAULT_MIN_RAW_SCORE;
  const minConfidence = options.minConfidence !== undefined ? Number(options.minConfidence) : DEFAULT_MIN_CONFIDENCE;
  const maxDomains = options.maxDomains !== undefined
    ? Number(options.maxDomains)
    : (options.topK !== undefined ? Number(options.topK) : DEFAULT_MAX_DOMAINS);
  const includeEvidence = options.includeEvidence !== undefined ? Boolean(options.includeEvidence) : true;

  const metadata = {
    classifierVersion: CLASSIFIER_VERSION,
    classificationMethod: CLASSIFICATION_METHOD,
    predictedAt: new Date().toISOString(),
    confidenceThreshold: minConfidence,
    maxDomainsLimit: maxDomains,
    totalDomainsEvaluated: vocabulary.length
  };

  // Guard against publications with insufficient text
  if (!hasText) {
    return {
      domains: [],
      reason: 'insufficient_text',
      textAnalyzed: { titleLength: title.length, abstractLength: abstract.length, keywordCount: keywords.length },
      metadata
    };
  }

  const candidateDomains = [];

  for (const domain of vocabulary) {
    let rawScore = 0;
    const matchedPhrases = new Set();
    const matchedKeywords = new Set();
    const matchedAcronyms = new Set();
    const titleMatches = new Set();
    const keywordMatches = new Set();
    const abstractMatches = new Set();

    // 1. Multi-word phrase matching (highest semantic specificity)
    if (Array.isArray(domain.phrases)) {
      for (const phrase of domain.phrases) {
        const normPhrase = normalizeText(phrase);
        if (!normPhrase) continue;

        let matched = false;
        // Author keywords match
        const foundInKeywords = keywords.some(k => k === normPhrase || matchesWordBoundary(k, normPhrase));
        if (foundInKeywords) {
          rawScore += 3.5;
          matched = true;
          keywordMatches.add(normPhrase);
        }

        // Title match
        if (matchesWordBoundary(title, normPhrase)) {
          rawScore += 3.0;
          matched = true;
          titleMatches.add(normPhrase);
        }

        // Abstract match
        if (abstract && matchesWordBoundary(abstract, normPhrase)) {
          rawScore += 1.8;
          matched = true;
          abstractMatches.add(normPhrase);
        }

        if (matched) {
          matchedPhrases.add(normPhrase);
        }
      }
    }

    // 2. Single distinct keywords matching
    if (Array.isArray(domain.keywords)) {
      for (const kw of domain.keywords) {
        const normKw = normalizeText(kw);
        if (!normKw) continue;

        let matched = false;
        const foundInKeywords = keywords.some(k => k === normKw || matchesWordBoundary(k, normKw));
        if (foundInKeywords) {
          rawScore += 2.5;
          matched = true;
          keywordMatches.add(normKw);
        }

        if (matchesWordBoundary(title, normKw)) {
          rawScore += 2.0;
          matched = true;
          titleMatches.add(normKw);
        }

        if (abstract && matchesWordBoundary(abstract, normKw)) {
          rawScore += 1.0;
          matched = true;
          abstractMatches.add(normKw);
        }

        if (matched) {
          matchedKeywords.add(normKw);
        }
      }
    }

    // 3. Acronyms matching (strictly word-bounded)
    if (Array.isArray(domain.acronyms)) {
      for (const ac of domain.acronyms) {
        const normAc = normalizeText(ac);
        if (!normAc) continue;
        const upperAc = normAc.toUpperCase();

        let matched = false;
        const foundInKeywords = keywords.some(k => k === normAc);
        if (foundInKeywords) {
          rawScore += 2.5;
          matched = true;
          keywordMatches.add(upperAc);
        }

        if (matchesWordBoundary(title, normAc)) {
          rawScore += 2.0;
          matched = true;
          titleMatches.add(upperAc);
        }

        if (abstract && matchesWordBoundary(abstract, normAc)) {
          rawScore += 0.8;
          matched = true;
          abstractMatches.add(upperAc);
        }

        if (matched) {
          matchedAcronyms.add(upperAc);
        }
      }
    }

    // Composite evidence evaluation:
    // Avoid treating ONE ambiguous word as strong evidence.
    // Require either at least one multi-word phrase OR at least two distinct keyword/acronym matches,
    // OR cross-section confirmation (keyword explicitly confirmed in title and author keywords).
    const distinctMatchesCount = matchedPhrases.size + matchedKeywords.size + matchedAcronyms.size;
    const hasCrossSectionConfirmation = (matchedKeywords.size >= 1 || matchedAcronyms.size >= 1) && (titleMatches.size > 0 && keywordMatches.size > 0);
    const hasCompositeEvidence = matchedPhrases.size > 0 || distinctMatchesCount >= 2 || hasCrossSectionConfirmation;

    // If minimum evidence threshold was met, compute normalized confidence score
    if (rawScore >= minRawScore && hasCompositeEvidence) {
      // Exponential saturation confidence: maps evidence smoothly to [0.0, 0.98]
      const confidence = Math.min(0.98, Math.round((1 - Math.exp(-rawScore / 3.8)) * 100) / 100);

      if (confidence >= minConfidence) {
        // Combined matched terms for backwards compatibility with 12A consumers
        const combinedMatched = [...new Set([
          ...matchedPhrases,
          ...matchedKeywords,
          ...matchedAcronyms
        ])];

        candidateDomains.push({
          name: domain.name,
          confidence,
          matchedKeywords: combinedMatched,
          matchedPhrases: [...matchedPhrases],
          matchedAcronyms: [...matchedAcronyms],
          rawScore: Math.round(rawScore * 100) / 100,
          signals: {
            titleMatches: [...titleMatches],
            keywordMatches: [...keywordMatches],
            abstractMatches: [...abstractMatches]
          }
        });
      }
    }
  }

  // Sort by confidence descending, then rawScore descending
  candidateDomains.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.rawScore - a.rawScore;
  });

  const selectedDomains = candidateDomains.slice(0, maxDomains);

  return {
    domains: selectedDomains.map(d => {
      if (!includeEvidence) {
        return {
          name: d.name,
          confidence: d.confidence
        };
      }
      return {
        name: d.name,
        confidence: d.confidence,
        matchedKeywords: d.matchedKeywords,
        matchedPhrases: d.matchedPhrases,
        matchedAcronyms: d.matchedAcronyms,
        signals: d.signals
      };
    }),
    metadata
  };
};

/**
 * Predict research domains for an existing publication by ID
 * Returns predictions without modifying or overwriting the publication in MongoDB.
 * 
 * @param {string} publicationId MongoDB _id or publicationCode
 * @param {object} options Optional scoring parameters { minConfidence, maxDomains, topK, includeEvidence }
 * @returns {Promise<object>} Prediction result payload with publication info and domain matches
 */
const predictDomainsForPublicationId = async (publicationId, options = {}) => {
  if (!publicationId || typeof publicationId !== 'string' || publicationId.trim() === '') {
    const error = new Error('Publication ID is required');
    error.status = 400;
    throw error;
  }

  const trimmedId = publicationId.trim();

  let publication = null;
  if (mongoose.Types.ObjectId.isValid(trimmedId)) {
    publication = await Publication.findById(trimmedId)
      .populate('facultyIds', 'name email department designation')
      .populate('researchDomains', 'name description');
  } else {
    publication = await Publication.findOne({ publicationCode: trimmedId })
      .populate('facultyIds', 'name email department designation')
      .populate('researchDomains', 'name description');

    if (!publication) {
      const error = new Error('Invalid publication ID format');
      error.status = 400;
      throw error;
    }
  }

  if (!publication) {
    const error = new Error('Publication not found');
    error.status = 404;
    throw error;
  }

  // Run explainable baseline classification on publication text
  const classification = classifyPublicationResearchDomains(publication, options);
  const includeEvidence = options.includeEvidence !== undefined ? Boolean(options.includeEvidence) : true;

  // Look up matching ResearchDomain records in MongoDB to provide domain IDs where available
  const predictedDomainNames = classification.domains.map(d => d.name);
  let domainRecords = [];
  if (predictedDomainNames.length > 0) {
    try {
      domainRecords = await ResearchDomain.find({
        name: { $in: predictedDomainNames }
      }).select('_id name description').lean();
    } catch (e) {
      domainRecords = [];
    }
  }

  const domainMap = new Map();
  for (const dr of domainRecords) {
    domainMap.set(dr.name.toLowerCase(), dr._id);
  }

  const enrichedPredictions = classification.domains.map(d => {
    const item = {
      domainId: domainMap.get(d.name.toLowerCase()) || null,
      name: d.name,
      confidence: d.confidence
    };
    if (includeEvidence) {
      item.matchedKeywords = d.matchedKeywords;
      item.matchedPhrases = d.matchedPhrases;
      item.matchedAcronyms = d.matchedAcronyms;
      item.signals = d.signals;
    }
    return item;
  });

  return {
    publicationId: publication._id.toString(),
    publicationCode: publication.publicationCode || undefined,
    title: publication.title,
    year: publication.year,
    authors: publication.authors || [],
    manualResearchDomains: (publication.researchDomains || []).map(rd => ({
      id: rd._id ? rd._id.toString() : rd.toString(),
      name: rd.name || undefined
    })),
    predictions: enrichedPredictions,
    hasPredictions: enrichedPredictions.length > 0,
    metadata: classification.metadata
  };
};

/**
 * Predict and store research domains for an existing publication (Phase 12C)
 * 
 * Reuses the existing Phase 12B explainable classifier, updates predictedResearchDomains
 * and predictionMetadata on the publication in MongoDB, and returns the stored result.
 * 
 * CRITICAL: Manual researchDomains are strictly preserved and never modified or overwritten.
 * 
 * @param {string} publicationId MongoDB _id or publicationCode
 * @param {object} options Optional scoring parameters { minConfidence, maxDomains, topK, includeEvidence }
 * @returns {Promise<object>} Prediction result payload with stored domain records and metadata
 */
const predictAndStorePublicationResearchDomains = async (publicationId, options = {}) => {
  if (!publicationId || typeof publicationId !== 'string' || publicationId.trim() === '') {
    const error = new Error('Publication ID is required');
    error.status = 400;
    throw error;
  }

  const trimmedId = publicationId.trim();

  let publication = null;
  if (mongoose.Types.ObjectId.isValid(trimmedId)) {
    publication = await Publication.findById(trimmedId)
      .populate('facultyIds', 'name email department designation')
      .populate('researchDomains', 'name description');
  } else {
    publication = await Publication.findOne({ publicationCode: trimmedId })
      .populate('facultyIds', 'name email department designation')
      .populate('researchDomains', 'name description');

    if (!publication) {
      const error = new Error('Invalid publication ID format');
      error.status = 400;
      throw error;
    }
  }

  if (!publication) {
    const error = new Error('Publication not found');
    error.status = 404;
    throw error;
  }

  // 1. Run the existing Phase 12B classifier on the publication text
  const classification = classifyPublicationResearchDomains(publication, options);
  const includeEvidence = options.includeEvidence !== undefined ? Boolean(options.includeEvidence) : true;

  // 2. Look up matching ResearchDomain records in MongoDB to link domain IDs
  const predictedDomainNames = classification.domains.map(d => d.name);
  let domainRecords = [];
  if (predictedDomainNames.length > 0) {
    try {
      domainRecords = await ResearchDomain.find({
        name: { $in: predictedDomainNames }
      }).select('_id name description').lean();
    } catch (e) {
      domainRecords = [];
    }
  }

  const domainMap = new Map();
  for (const dr of domainRecords) {
    domainMap.set(dr.name.toLowerCase(), dr._id);
  }

  const predictionTimestamp = new Date(classification.metadata.predictedAt);

  // 3. Format predictions for storage in publication.predictedResearchDomains
  const storedPredictions = classification.domains.map(d => {
    const domainId = domainMap.get(d.name.toLowerCase()) || null;
    const entry = {
      domain: domainId,
      name: d.name,
      confidence: d.confidence,
      classifierVersion: classification.metadata.classifierVersion,
      classificationMethod: classification.metadata.classificationMethod,
      predictedAt: predictionTimestamp
    };

    if (includeEvidence) {
      entry.matchedKeywords = d.matchedKeywords || [];
      entry.matchedPhrases = d.matchedPhrases || [];
      entry.matchedAcronyms = d.matchedAcronyms || [];
      entry.signals = d.signals || { titleMatches: [], keywordMatches: [], abstractMatches: [] };
    } else {
      entry.matchedKeywords = [];
      entry.matchedPhrases = [];
      entry.matchedAcronyms = [];
      entry.signals = { titleMatches: [], keywordMatches: [], abstractMatches: [] };
    }

    return entry;
  });

  // 4. Update predictedResearchDomains and predictionMetadata on publication
  // Repeated prediction replaces previous automated entries cleanly
  publication.predictedResearchDomains = storedPredictions;
  publication.predictionMetadata = {
    classifierVersion: classification.metadata.classifierVersion,
    classificationMethod: classification.metadata.classificationMethod,
    predictedAt: predictionTimestamp,
    confidenceThreshold: classification.metadata.confidenceThreshold,
    maxDomainsLimit: classification.metadata.maxDomainsLimit,
    totalDomainsEvaluated: classification.metadata.totalDomainsEvaluated
  };

  // 5. Save the updated publication to MongoDB (manual researchDomains remain untouched)
  await publication.save();

  // 6. Return response payload
  const returnedPredictions = storedPredictions.map(p => {
    const item = {
      domainId: p.domain ? p.domain.toString() : null,
      name: p.name,
      confidence: p.confidence
    };
    if (includeEvidence) {
      item.matchedKeywords = p.matchedKeywords;
      item.matchedPhrases = p.matchedPhrases;
      item.matchedAcronyms = p.matchedAcronyms;
      item.signals = p.signals;
    }
    item.classifierVersion = p.classifierVersion;
    item.classificationMethod = p.classificationMethod;
    item.predictedAt = p.predictedAt ? p.predictedAt.toISOString() : undefined;
    return item;
  });

  return {
    publicationId: publication._id.toString(),
    publicationCode: publication.publicationCode || undefined,
    title: publication.title,
    year: publication.year,
    authors: publication.authors || [],
    manualResearchDomains: (publication.researchDomains || []).map(rd => ({
      id: rd._id ? rd._id.toString() : rd.toString(),
      name: rd.name || undefined
    })),
    predictions: returnedPredictions,
    hasPredictions: returnedPredictions.length > 0,
    metadata: classification.metadata,
    saved: true
  };
};

module.exports = {
  DEFAULT_MIN_RAW_SCORE,
  DEFAULT_MIN_CONFIDENCE,
  DEFAULT_MAX_DOMAINS,
  CLASSIFIER_VERSION,
  CLASSIFICATION_METHOD,
  normalizeText,
  extractPublicationText,
  classifyPublicationResearchDomains,
  predictDomainsForPublicationId,
  predictAndStorePublicationResearchDomains
};
