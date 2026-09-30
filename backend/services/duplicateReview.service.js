const mongoose = require('mongoose');
const DuplicateReview = require('../models/DuplicateReview');
const Publication = require('../models/Publication');
const duplicateDetectionService = require('./duplicateDetection.service');

/**
 * Sync pending duplicate reviews by scanning existing publications in the database
 * Creates new pending review entries for newly detected candidate pairs without
 * altering existing reviewed (confirmed/rejected) records.
 * Uses batch querying and bulk insertion for sub-second execution.
 * 
 * @returns {Promise<{ createdCount: number, existingCount: number }>}
 */
const syncPendingDuplicateReviews = async () => {
  const [publications, existingReviews] = await Promise.all([
    Publication.find({ isDuplicate: { $ne: true } })
      .select('title year authors doi venue journal conference publicationType citations source publicationCode')
      .lean(),
    DuplicateReview.find({})
      .select('publicationId potentialDuplicateId status')
      .lean()
  ]);

  // Index existing pairs in memory for O(1) lookups
  const existingSet = new Set();
  for (const rev of existingReviews) {
    if (rev.publicationId && rev.potentialDuplicateId) {
      const id1 = rev.publicationId.toString();
      const id2 = rev.potentialDuplicateId.toString();
      existingSet.add(`${id1}_${id2}`);
      existingSet.add(`${id2}_${id1}`);
    }
  }

  const toCreate = [];
  let existingCount = existingReviews.length;

  // Compare unique pairs in memory
  for (let i = 0; i < publications.length; i++) {
    for (let j = i + 1; j < publications.length; j++) {
      const pubA = publications[i];
      const pubB = publications[j];

      const idAStr = pubA._id.toString();
      const idBStr = pubB._id.toString();

      // Skip if review record already exists in database or current batch
      if (existingSet.has(`${idAStr}_${idBStr}`)) {
        continue;
      }

      // Fast evaluation of candidate signals
      const candidate = duplicateDetectionService.evaluateDuplicateCandidate(pubA, pubB);
      if (!candidate) continue;

      // Register in memory map so reciprocal pair isn't added twice
      existingSet.add(`${idAStr}_${idBStr}`);
      existingSet.add(`${idBStr}_${idAStr}`);

      toCreate.push({
        publicationId: pubA._id,
        potentialDuplicateId: pubB._id,
        similarityScore: candidate.similarityScore,
        confidence: candidate.confidence,
        matchingSignals: candidate.matchingSignals,
        status: 'pending'
      });
    }
  }

  if (toCreate.length > 0) {
    await DuplicateReview.insertMany(toCreate, { ordered: false });
  }

  return { createdCount: toCreate.length, existingCount };
};

/**
 * Get duplicate reviews with optional filtering and pagination
 * 
 * @param {object} filters Filtering parameters (status, confidence, publicationId)
 * @param {object} options Pagination options (page, limit, autoSync)
 * @returns {Promise<{ data: object[], pagination: object }>}
 */
const getDuplicateReviews = async (filters = {}, options = {}) => {
  // If autoSync requested or table is empty, run a quick sync to discover pending candidates
  const count = await DuplicateReview.countDocuments();
  if (count === 0 || options.autoSync === true) {
    await syncPendingDuplicateReviews();
  }

  const filter = {};

  if (filters.status) {
    const validStatuses = ['pending', 'confirmed', 'rejected'];
    const normStatus = filters.status.toString().toLowerCase().trim();
    if (validStatuses.includes(normStatus)) {
      filter.status = normStatus;
    }
  }

  if (filters.confidence) {
    const validConfidences = ['high', 'medium', 'low'];
    const normConf = filters.confidence.toString().toLowerCase().trim();
    if (validConfidences.includes(normConf)) {
      filter.confidence = normConf;
    }
  }

  if (filters.publicationId && mongoose.Types.ObjectId.isValid(filters.publicationId)) {
    const targetObjId = new mongoose.Types.ObjectId(filters.publicationId);
    filter.$or = [
      { publicationId: targetObjId },
      { potentialDuplicateId: targetObjId }
    ];
  }

  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(options.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const total = await DuplicateReview.countDocuments(filter);
  const totalPages = Math.ceil(total / limit) || 1;

  const reviews = await DuplicateReview.find(filter)
    .populate('publicationId', 'title year authors doi venue journal conference publicationType citations source publicationCode')
    .populate('potentialDuplicateId', 'title year authors doi venue journal conference publicationType citations source publicationCode')
    .populate('reviewedBy', 'name email role')
    .sort({ confidence: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit);

  return {
    data: reviews,
    pagination: {
      page,
      limit,
      total,
      pages: totalPages
    }
  };
};

/**
 * Confirm a duplicate review (Admin only)
 * Marks status as 'confirmed', records reviewedBy and reviewedAt.
 * NEVER deletes or merges publications.
 * 
 * @param {string} reviewId 
 * @param {string|ObjectId} userId 
 * @returns {Promise<object>}
 */
const confirmDuplicateReview = async (reviewId, userId) => {
  if (!reviewId || !mongoose.Types.ObjectId.isValid(reviewId)) {
    const error = new Error('Invalid duplicate review ID format');
    error.status = 400;
    throw error;
  }

  const review = await DuplicateReview.findById(reviewId);
  if (!review) {
    const error = new Error('Duplicate review not found');
    error.status = 404;
    throw error;
  }

  if (review.status === 'rejected') {
    const error = new Error('Cannot confirm an already rejected duplicate review');
    error.status = 400;
    throw error;
  }

  if (review.status === 'confirmed') {
    const error = new Error('Duplicate review has already been confirmed');
    error.status = 400;
    throw error;
  }

  review.status = 'confirmed';
  review.reviewedBy = userId;
  review.reviewedAt = new Date();
  await review.save();

  return await DuplicateReview.findById(review._id)
    .populate('publicationId', 'title year authors doi venue journal conference publicationType citations source publicationCode')
    .populate('potentialDuplicateId', 'title year authors doi venue journal conference publicationType citations source publicationCode')
    .populate('reviewedBy', 'name email role');
};

/**
 * Reject a duplicate review (Admin only)
 * Marks status as 'rejected', records reviewedBy and reviewedAt.
 * Rejected pairs are excluded from pending duplicate candidate lists.
 * 
 * @param {string} reviewId 
 * @param {string|ObjectId} userId 
 * @returns {Promise<object>}
 */
const rejectDuplicateReview = async (reviewId, userId) => {
  if (!reviewId || !mongoose.Types.ObjectId.isValid(reviewId)) {
    const error = new Error('Invalid duplicate review ID format');
    error.status = 400;
    throw error;
  }

  const review = await DuplicateReview.findById(reviewId);
  if (!review) {
    const error = new Error('Duplicate review not found');
    error.status = 404;
    throw error;
  }

  if (review.status === 'confirmed') {
    const error = new Error('Cannot reject an already confirmed duplicate review');
    error.status = 400;
    throw error;
  }

  if (review.status === 'rejected') {
    const error = new Error('Duplicate review has already been rejected');
    error.status = 400;
    throw error;
  }

  review.status = 'rejected';
  review.reviewedBy = userId;
  review.reviewedAt = new Date();
  await review.save();

  return await DuplicateReview.findById(review._id)
    .populate('publicationId', 'title year authors doi venue journal conference publicationType citations source publicationCode')
    .populate('potentialDuplicateId', 'title year authors doi venue journal conference publicationType citations source publicationCode')
    .populate('reviewedBy', 'name email role');
};

/**
 * Get Set of publication IDs that have been explicitly rejected as duplicates of a target publication
 * 
 * @param {string|ObjectId} publicationId 
 * @returns {Promise<Set<string>>}
 */
const getRejectedPartnerIds = async (publicationId) => {
  if (!publicationId || !mongoose.Types.ObjectId.isValid(publicationId)) {
    return new Set();
  }

  const targetObjId = new mongoose.Types.ObjectId(publicationId);
  const targetIdStr = targetObjId.toString();

  const rejectedReviews = await DuplicateReview.find({
    status: 'rejected',
    $or: [
      { publicationId: targetObjId },
      { potentialDuplicateId: targetObjId }
    ]
  }).select('publicationId potentialDuplicateId').lean();

  const partnerIds = new Set();
  for (const r of rejectedReviews) {
    const pubIdStr = r.publicationId.toString();
    const potIdStr = r.potentialDuplicateId.toString();
    if (pubIdStr === targetIdStr) {
      partnerIds.add(potIdStr);
    } else {
      partnerIds.add(pubIdStr);
    }
  }

  return partnerIds;
};

/**
 * Combine metadata from primary and duplicate publications according to safe merge rules:
 * - Keep primary value when valid
 * - If primary value is missing, use duplicate value
 * - Combine authors without duplicates
 * - Combine keywords without duplicates
 * - Combine research domains without duplicates
 * - Combine faculty associations without duplicates
 * - Preserve the highest citation count
 * - Preserve valid DOI
 * - Preserve venue/journal/conference when missing from primary
 * - Preserve the most complete abstract
 * 
 * @param {object} primaryPub 
 * @param {object} duplicatePub 
 * @returns {object} Merged publication data dictionary
 */
const mergePublicationData = (primaryPub, duplicatePub) => {
  const merged = {};

  // 1. Title: keep primary title, fallback to duplicate
  merged.title = (primaryPub.title && primaryPub.title.trim()) || (duplicatePub.title && duplicatePub.title.trim()) || '';

  // 2. Abstract: preserve the most complete abstract
  const pAbs = (primaryPub.abstract || '').trim();
  const dAbs = (duplicatePub.abstract || '').trim();
  if (!pAbs) {
    merged.abstract = dAbs;
  } else if (dAbs && dAbs.length > pAbs.length + 30) {
    merged.abstract = dAbs;
  } else {
    merged.abstract = pAbs;
  }

  // 3. Authors: combine without duplicates (case-insensitive deduplication)
  const authorsList = [];
  const seenAuthors = new Set();
  const rawAuthors = [...(primaryPub.authors || []), ...(duplicatePub.authors || [])];
  for (const a of rawAuthors) {
    if (typeof a !== 'string') continue;
    const cleaned = a.trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase().replace(/[,.\s]/g, '');
    if (!seenAuthors.has(key)) {
      seenAuthors.add(key);
      authorsList.push(cleaned);
    }
  }
  merged.authors = authorsList;

  // 4. Faculty IDs: combine without duplicates
  const facultyList = [];
  const seenFaculty = new Set();
  const rawFaculty = [...(primaryPub.facultyIds || []), ...(duplicatePub.facultyIds || [])];
  for (const f of rawFaculty) {
    const idStr = f ? (f._id ? f._id.toString() : f.toString()) : null;
    if (idStr && mongoose.Types.ObjectId.isValid(idStr) && !seenFaculty.has(idStr)) {
      seenFaculty.add(idStr);
      facultyList.push(new mongoose.Types.ObjectId(idStr));
    }
  }
  merged.facultyIds = facultyList;

  // 5. Year: keep primary year if valid, else duplicate year
  merged.year = (primaryPub.year && !isNaN(primaryPub.year)) ? Number(primaryPub.year) : (Number(duplicatePub.year) || undefined);

  // 6. Citations: preserve the highest citation count
  const pCitations = Number(primaryPub.citations) || 0;
  const dCitations = Number(duplicatePub.citations) || 0;
  merged.citations = Math.max(pCitations, dCitations);

  // 7. DOI: preserve valid DOI
  const pDoi = (primaryPub.doi || '').trim();
  const dDoi = (duplicatePub.doi || '').trim();
  merged.doi = pDoi || dDoi || '';

  // 8. Journal / Conference / Venue: preserve when missing from primary
  merged.journal = (primaryPub.journal && primaryPub.journal.trim()) || (duplicatePub.journal && duplicatePub.journal.trim()) || '';
  merged.conference = (primaryPub.conference && primaryPub.conference.trim()) || (duplicatePub.conference && duplicatePub.conference.trim()) || '';
  merged.venue = (primaryPub.venue && primaryPub.venue.trim()) || (duplicatePub.venue && duplicatePub.venue.trim()) || merged.journal || merged.conference || '';

  // 9. Publication Type: keep primary unless 'Other' and duplicate is specific
  const pType = primaryPub.publicationType;
  const dType = duplicatePub.publicationType;
  if (pType && pType !== 'Other') {
    merged.publicationType = pType;
  } else if (dType && dType !== 'Other') {
    merged.publicationType = dType;
  } else {
    merged.publicationType = pType || dType || 'Journal';
  }

  // 10. Research Domains: combine without duplicates
  const domainsList = [];
  const seenDomains = new Set();
  const rawDomains = [...(primaryPub.researchDomains || []), ...(duplicatePub.researchDomains || [])];
  for (const d of rawDomains) {
    const idStr = d ? (d._id ? d._id.toString() : d.toString()) : null;
    if (idStr && mongoose.Types.ObjectId.isValid(idStr) && !seenDomains.has(idStr)) {
      seenDomains.add(idStr);
      domainsList.push(new mongoose.Types.ObjectId(idStr));
    }
  }
  merged.researchDomains = domainsList;

  // 11. Keywords: combine without duplicates
  const keywordsList = [];
  const seenKeywords = new Set();
  const rawKeywords = [...(primaryPub.keywords || []), ...(duplicatePub.keywords || [])];
  for (const k of rawKeywords) {
    if (typeof k !== 'string') continue;
    const cleaned = k.trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (!seenKeywords.has(key)) {
      seenKeywords.add(key);
      keywordsList.push(cleaned);
    }
  }
  merged.keywords = keywordsList;

  // 12. Source: preserve primary source
  merged.source = primaryPub.source || duplicatePub.source || 'Manual';

  return merged;
};

/**
 * Merge two confirmed duplicate publications.
 * Only confirmed reviews can be merged.
 * Primary publication is updated with combined metadata; duplicate publication is soft-merged.
 * 
 * @param {string} reviewId ID of the DuplicateReview record
 * @param {string|ObjectId} userId ID of admin performing the merge
 * @param {object} options Optional { primaryPublicationId }
 * @returns {Promise<{ primaryPublication: object, duplicatePublication: object, review: object }>}
 */
const mergeDuplicateReview = async (reviewId, userId, options = {}) => {
  if (!reviewId || !mongoose.Types.ObjectId.isValid(reviewId)) {
    const error = new Error('Invalid duplicate review ID format');
    error.status = 400;
    throw error;
  }

  const review = await DuplicateReview.findById(reviewId);
  if (!review) {
    const error = new Error('Duplicate review not found');
    error.status = 404;
    throw error;
  }

  // 1. Verify status is confirmed
  if (review.status !== 'confirmed') {
    const error = new Error(`Only confirmed duplicate reviews can be merged (current status: '${review.status}')`);
    error.status = 400;
    throw error;
  }

  // 2. Verify not already merged
  if (review.merged === true) {
    const error = new Error('Duplicate review has already been merged');
    error.status = 400;
    throw error;
  }

  // 3. Identify primary and duplicate publications
  let primaryId = review.publicationId;
  let duplicateId = review.potentialDuplicateId;

  if (options.primaryPublicationId) {
    const requestedPrimaryStr = options.primaryPublicationId.toString();
    const pubIdStr = review.publicationId.toString();
    const potIdStr = review.potentialDuplicateId.toString();

    if (requestedPrimaryStr === pubIdStr) {
      primaryId = review.publicationId;
      duplicateId = review.potentialDuplicateId;
    } else if (requestedPrimaryStr === potIdStr) {
      primaryId = review.potentialDuplicateId;
      duplicateId = review.publicationId;
    } else {
      const error = new Error('primaryPublicationId must match one of the publications in this duplicate review');
      error.status = 400;
      throw error;
    }
  }

  // 4. Prevent merging a publication with itself
  if (primaryId.toString() === duplicateId.toString()) {
    const error = new Error('Cannot merge a publication with itself');
    error.status = 400;
    throw error;
  }

  // 5. Fetch both publications
  const [primaryPub, duplicatePub] = await Promise.all([
    Publication.findById(primaryId),
    Publication.findById(duplicateId)
  ]);

  if (!primaryPub) {
    const error = new Error('Primary publication not found in database');
    error.status = 404;
    throw error;
  }

  if (!duplicatePub) {
    const error = new Error('Duplicate publication not found in database');
    error.status = 404;
    throw error;
  }

  // 6. Verify duplicate is not already merged
  if (duplicatePub.isDuplicate === true || duplicatePub.mergedInto) {
    const error = new Error('Duplicate publication has already been merged into another record');
    error.status = 400;
    throw error;
  }

  if (primaryPub.isDuplicate === true) {
    const error = new Error('Cannot use an already merged duplicate as primary publication');
    error.status = 400;
    throw error;
  }

  // 7. Calculate merged metadata
  const mergedFields = mergePublicationData(primaryPub, duplicatePub);

  // 8. Execute update with transaction support if available
  let session = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
  } catch (e) {
    session = null;
  }

  try {
    const saveOptions = session ? { session } : {};

    // Update primary publication
    Object.assign(primaryPub, mergedFields);
    await primaryPub.save(saveOptions);

    // Soft-merge duplicate publication (do NOT physically delete)
    duplicatePub.isDuplicate = true;
    duplicatePub.mergedInto = primaryPub._id;
    duplicatePub.mergedAt = new Date();
    await duplicatePub.save(saveOptions);

    // Update duplicate review record
    review.status = 'confirmed';
    review.merged = true;
    review.mergedInto = primaryPub._id;
    review.mergedAt = new Date();
    review.mergedBy = userId;
    await review.save(saveOptions);

    if (session) {
      await session.commitTransaction();
    }
  } catch (mergeErr) {
    if (session) {
      await session.abortTransaction();
    }
    throw mergeErr;
  } finally {
    if (session) {
      session.endSession();
    }
  }

  const populatedPrimary = await Publication.findById(primaryPub._id)
    .populate('facultyIds', 'name email department designation')
    .populate('researchDomains', 'name');

  return {
    review,
    primaryPublication: populatedPrimary,
    duplicatePublication: {
      _id: duplicatePub._id,
      title: duplicatePub.title,
      isDuplicate: true,
      mergedInto: primaryPub._id,
      mergedAt: duplicatePub.mergedAt
    }
  };
};

module.exports = {
  syncPendingDuplicateReviews,
  getDuplicateReviews,
  confirmDuplicateReview,
  rejectDuplicateReview,
  mergeDuplicateReview,
  mergePublicationData,
  getRejectedPartnerIds
};
