const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');

const Publication = require('../models/Publication');
const DuplicateReview = require('../models/DuplicateReview');
const Faculty = require('../models/Faculty');
const importService = require('../services/import.service');
const publicationService = require('../services/publication.service');
const duplicateDetectionService = require('../services/duplicateDetection.service');
const duplicateReviewService = require('../services/duplicateReview.service');
const orcidService = require('../services/orcid.service');
const scopusService = require('../services/scopus.service');
const googleScholarService = require('../services/googleScholar.service');

const TEST_DB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/research_platform_test';

describe('Phase 11D — Publication Import Deduplication Integration', () => {
  let testFaculty = null;

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_DB_URI);
    }
    // Clean up collections for testing
    await Publication.deleteMany({ title: { $regex: /^TEST_/ } });
    await DuplicateReview.deleteMany({});
    await Faculty.deleteMany({ facultyCode: { $regex: /^TEST_FAC_/ } });

    testFaculty = await Faculty.create({
      facultyCode: 'TEST_FAC_001',
      name: 'Dr. Test Deduplication Faculty',
      email: 'test.dedup@university.edu',
      department: 'Computer Science',
      designation: 'Professor',
      orcidId: '0000-0002-1825-0097',
      scopusId: '57200000001',
      googleScholarId: 'QCxP0cAAAAAJ'
    });
  });

  after(async () => {
    await Publication.deleteMany({ title: { $regex: /^TEST_/ } });
    await DuplicateReview.deleteMany({});
    await Faculty.deleteMany({ facultyCode: { $regex: /^TEST_FAC_/ } });
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clear test publications and duplicate reviews between tests
    await Publication.deleteMany({ title: { $regex: /^TEST_/ } });
    await DuplicateReview.deleteMany({});
  });

  // 1. New publication with no match
  test('1. Should import a new publication normally when no duplicate candidate exists', async () => {
    const payload = {
      source: 'manual',
      publications: [
        {
          title: 'TEST_Novel Quantum Algorithm for Graph Partitioning',
          year: 2024,
          authors: ['Alice Smith', 'Bob Johnson'],
          journal: 'Quantum Computing Journal',
          doi: '10.1000/test.quantum.001',
          citations: 5
        }
      ]
    };

    const result = await importService.importPublications(payload);

    assert.strictEqual(result.count, 1);
    assert.strictEqual(result.summary.created, 1);
    assert.strictEqual(result.summary.duplicatesSkipped, 0);
    assert.strictEqual(result.summary.pendingReviewsCreated, 0);
    assert.strictEqual(result.duplicatesDetected.length, 0);

    // Verify stored document in MongoDB
    const doc = await Publication.findOne({ doi: '10.1000/test.quantum.001' });
    assert.ok(doc, 'Publication should be stored in MongoDB');
    assert.strictEqual(doc.title, 'TEST_Novel Quantum Algorithm for Graph Partitioning');
    assert.strictEqual(doc.year, 2024);
    assert.strictEqual(doc.source, 'manual');
    assert.strictEqual(doc.isDuplicate, false);

    // Verify no DuplicateReview record was created
    const reviewCount = await DuplicateReview.countDocuments();
    assert.strictEqual(reviewCount, 0, 'No DuplicateReview record should be created');
  });

  // 2. Exact DOI match
  test('2. Should detect exact DOI match as strong duplicate and not create a new publication', async () => {
    // Seed existing publication
    const existing = await Publication.create({
      title: 'TEST_Federated Learning for Edge Computing',
      year: 2023,
      authors: ['Charlie Brown', 'Dana White'],
      doi: '10.1016/j.edge.2023.01',
      journal: 'Journal of Edge Computing',
      source: 'manual'
    });

    const payload = {
      source: 'manual',
      publications: [
        {
          // Same DOI with https://doi.org/ prefix and different title casing
          title: 'TEST_federated learning for edge computing (re-import)',
          year: 2023,
          authors: ['C. Brown', 'D. White'],
          doi: 'https://doi.org/10.1016/j.edge.2023.01',
          journal: 'Journal of Edge Computing'
        }
      ]
    };

    const result = await importService.importPublications(payload);

    assert.strictEqual(result.count, 0, 'Should not create new publication');
    assert.strictEqual(result.summary.created, 0);
    assert.strictEqual(result.summary.duplicatesSkipped, 1);
    assert.strictEqual(result.duplicatesDetected.length, 1);

    const dup = result.duplicatesDetected[0];
    assert.strictEqual(dup.isDuplicate, true);
    assert.strictEqual(dup.action, 'skipped');
    assert.strictEqual(dup.confidence, 'high');
    assert.strictEqual(dup.matchType, 'doi_match');
    assert.strictEqual(dup.existingPublicationId.toString(), existing._id.toString());
    assert.ok(dup.matchingSignals.some(s => s.includes('IDENTICAL_DOI')));

    // Ensure database publication count remained 1
    const totalDocs = await Publication.countDocuments({ title: { $regex: /^TEST_/ } });
    assert.strictEqual(totalDocs, 1);
  });

  // 3. Exact normalized title match
  test('3. Should detect exact normalized title match and not create another publication', async () => {
    const existing = await Publication.create({
      title: 'TEST_Deep Learning in Medical Imaging: A Comprehensive Survey',
      year: 2024,
      authors: ['Eve Adams', 'Frank Miller'],
      journal: 'Medical Imaging Today',
      source: 'manual'
    });

    const payload = {
      source: 'manual',
      publications: [
        {
          // Canonical match: different casing, punctuation marks, extra spaces
          title: 'test: deep learning in medical imaging -- a comprehensive survey!',
          year: 2024,
          authors: ['Eve Adams', 'Frank Miller'],
          journal: 'Medical Imaging Today'
        }
      ]
    };

    const result = await importService.importPublications(payload);

    assert.strictEqual(result.count, 0, 'No publication should be created');
    assert.strictEqual(result.summary.duplicatesSkipped, 1);
    assert.strictEqual(result.duplicatesDetected.length, 1);

    const dup = result.duplicatesDetected[0];
    assert.strictEqual(dup.confidence, 'high');
    assert.strictEqual(dup.matchType, 'exact_title_match');
    assert.strictEqual(dup.existingPublicationId.toString(), existing._id.toString());
    assert.ok(dup.matchingSignals.some(s => s.includes('EXACT_TITLE_MATCH')));
    assert.ok(dup.matchingSignals.some(s => s.includes('SAME_PUBLICATION_YEAR')));

    // Ensure only 1 publication remains in DB
    const totalDocs = await Publication.countDocuments({ title: { $regex: /^TEST_/ } });
    assert.strictEqual(totalDocs, 1);
  });

  // 4. Fuzzy title candidate detection
  test('4. Should detect fuzzy title candidate with high similarity score', async () => {
    const existing = await Publication.create({
      title: 'TEST_Artificial Intelligence for Healthcare Decision Support Systems',
      year: 2024,
      authors: ['Grace Hopper'],
      journal: 'AI in Medicine',
      source: 'manual'
    });

    // Check similarity directly through duplicateDetectionService
    const candidatePub = {
      title: 'TEST_Artificial Intelligence in Healthcare Decision Support System',
      year: 2024,
      authors: ['Grace Hopper'],
      journal: 'AI in Medicine'
    };

    const dupResult = await duplicateDetectionService.findDuplicatesForRecord(candidatePub);
    assert.ok(dupResult.candidates.length > 0, 'Should find at least 1 candidate');
    const topCandidate = dupResult.candidates[0];
    assert.strictEqual(topCandidate.existingPublicationId.toString(), existing._id.toString());
    assert.ok(topCandidate.similarityScore >= 0.85, `Similarity score should be >= 0.85 (got ${topCandidate.similarityScore})`);
  });

  // 5. Uncertain candidate creating pending review (without auto-merge)
  test('5. Should safely store uncertain candidate and create a pending duplicate-review record without auto-merging', async () => {
    const existing = await Publication.create({
      title: 'TEST_Computer Vision Applications in Robotics',
      year: 2023,
      authors: ['Ivan Ivanov'],
      journal: 'Robotics Journal',
      source: 'manual'
    });

    const payload = {
      source: 'manual',
      publications: [
        {
          // Title with moderate similarity (tokens match partially) and different year
          title: 'TEST_Computer Vision Approaches in Autonomous Robotics',
          year: 2024,
          authors: ['Ivan Ivanov'],
          journal: 'Robotics Conference'
        }
      ]
    };

    const result = await importService.importPublications(payload);

    assert.strictEqual(result.count, 1, 'Uncertain publication should be safely stored');
    assert.strictEqual(result.summary.created, 1);
    assert.strictEqual(result.summary.duplicatesSkipped, 0);
    assert.strictEqual(result.summary.pendingReviewsCreated, 1);
    assert.strictEqual(result.pendingReviews.length, 1);

    const newPub = result.publications[0];
    const review = result.pendingReviews[0];

    // Assert review fields
    assert.strictEqual(review.status, 'pending');
    assert.strictEqual(review.merged, false, 'Must not be automatically merged');
    assert.strictEqual(review.publicationId.toString(), newPub._id.toString());
    assert.strictEqual(review.potentialDuplicateId.toString(), existing._id.toString());

    // Assert neither publication was auto-merged or deleted
    const pubInDb = await Publication.findById(newPub._id);
    const existingInDb = await Publication.findById(existing._id);
    assert.ok(pubInDb, 'New publication must exist in DB');
    assert.ok(existingInDb, 'Existing publication must exist in DB');
    assert.strictEqual(pubInDb.isDuplicate, false, 'New publication should not be marked duplicate');
    assert.strictEqual(existingInDb.isDuplicate, false, 'Existing publication should not be marked duplicate');
  });

  // 6. Repeated import of the same publication
  test('6. Should handle repeated import of the same publication gracefully without duplicating records', async () => {
    const pubData = {
      title: 'TEST_Blockchain Consensus Mechanisms: A Comparative Study',
      year: 2024,
      authors: ['Karl Marx', 'Friedrich Engels'],
      doi: '10.5555/test.blockchain.2024',
      journal: 'Distributed Systems'
    };

    // First import: creates publication
    const firstResult = await importService.importPublications({
      source: 'manual',
      publications: [pubData]
    });
    assert.strictEqual(firstResult.count, 1);
    assert.strictEqual(firstResult.summary.created, 1);

    // Second import with identical publication: skips creation
    const secondResult = await importService.importPublications({
      source: 'manual',
      publications: [pubData]
    });
    assert.strictEqual(secondResult.count, 0);
    assert.strictEqual(secondResult.summary.created, 0);
    assert.strictEqual(secondResult.summary.duplicatesSkipped, 1);
    assert.strictEqual(secondResult.duplicatesDetected.length, 1);

    // Verify DB count remains exactly 1
    const countInDb = await Publication.countDocuments({ doi: '10.5555/test.blockchain.2024' });
    assert.strictEqual(countInDb, 1, 'Only one publication record should exist in MongoDB');
  });

  // 7. Duplicate review not being created twice (treating A+B and B+A as same pair)
  test('7. Should not create duplicate review records for the same publication pair (A+B and B+A)', async () => {
    const pubA = await Publication.create({
      title: 'TEST_Natural Language Processing for Clinical Text Summarization',
      year: 2023,
      authors: ['Liam Neeson'],
      source: 'manual'
    });

    const pubB = await Publication.create({
      title: 'TEST_Natural Language Processing in Clinical Text Summarization Systems',
      year: 2024,
      authors: ['Liam Neeson'],
      source: 'manual'
    });

    // Run review sync
    const sync1 = await duplicateReviewService.syncPendingDuplicateReviews();
    assert.ok(sync1.createdCount >= 1, 'Should create pending review for candidate pair');

    const reviewsAfterSync1 = await DuplicateReview.find({
      $or: [
        { publicationId: pubA._id, potentialDuplicateId: pubB._id },
        { publicationId: pubB._id, potentialDuplicateId: pubA._id }
      ]
    });
    assert.strictEqual(reviewsAfterSync1.length, 1, 'Exactly one review should exist for the pair');

    // Run review sync again: should not create a second review for the same pair
    const sync2 = await duplicateReviewService.syncPendingDuplicateReviews();
    assert.strictEqual(sync2.createdCount, 0, 'No new review should be created on second sync');

    const reviewsAfterSync2 = await DuplicateReview.find({
      $or: [
        { publicationId: pubA._id, potentialDuplicateId: pubB._id },
        { publicationId: pubB._id, potentialDuplicateId: pubA._id }
      ]
    });
    assert.strictEqual(reviewsAfterSync2.length, 1, 'Still exactly one review record must exist');
  });

  // 8. Existing publication remaining unchanged when duplicate is detected
  test('8. Existing publication must remain completely unchanged when duplicate is detected', async () => {
    const originalPub = await Publication.create({
      title: 'TEST_Graph Neural Networks for Drug Repurposing',
      year: 2023,
      authors: ['Mona Lisa', 'Leonardo DaVinci'],
      doi: '10.1234/test.gnn.drug',
      citations: 42,
      journal: 'Bioinformatics Review',
      abstract: 'Original abstract text that should never be overwritten.',
      source: 'manual'
    });

    const originalUpdatedAt = originalPub.updatedAt.getTime();

    // Attempt to import a duplicate with differing metadata (e.g. modified abstract, higher citations)
    const duplicatePayload = {
      source: 'manual',
      publications: [
        {
          title: 'TEST_Graph Neural Networks for Drug Repurposing',
          year: 2023,
          authors: ['M. Lisa', 'L. DaVinci'],
          doi: '10.1234/test.gnn.drug',
          citations: 999,
          journal: 'Modified Journal',
          abstract: 'Overwriting attempt that must not happen.'
        }
      ]
    };

    const result = await importService.importPublications(duplicatePayload);
    assert.strictEqual(result.count, 0, 'Should skip duplicate import');

    // Fetch existing publication again from DB
    const fetchedPub = await Publication.findById(originalPub._id);
    assert.strictEqual(fetchedPub.citations, 42, 'Citations must not be modified');
    assert.strictEqual(fetchedPub.journal, 'Bioinformatics Review', 'Journal must not be modified');
    assert.strictEqual(fetchedPub.abstract, 'Original abstract text that should never be overwritten.');
    assert.strictEqual(fetchedPub.updatedAt.getTime(), originalUpdatedAt, 'updatedAt timestamp must remain unchanged');
  });

  // 9. All integration sources continuing to work and preserving source info
  test('9. Should handle manual, orcid, scopus, and google_scholar imports and preserve source info', async () => {
    // 9a. Manual import
    const manualResult = await importService.importPublications({
      source: 'manual',
      publications: [{
        title: 'TEST_Source Preservation Manual Article',
        year: 2024,
        authors: ['Test Author A']
      }]
    });
    assert.strictEqual(manualResult.count, 1);
    assert.strictEqual(manualResult.publications[0].source, 'manual');

    // 9b. ORCID import
    const orcidResult = await importService.importPublications({
      source: 'orcid',
      publications: [{
        title: 'TEST_Source Preservation ORCID Work',
        year: 2024,
        authors: ['Test Author B']
      }]
    });
    assert.strictEqual(orcidResult.count, 1);
    assert.strictEqual(orcidResult.publications[0].source, 'orcid');

    // 9c. Scopus import
    const scopusResult = await importService.importPublications({
      source: 'scopus',
      publications: [{
        title: 'TEST_Source Preservation Scopus Paper',
        year: 2024,
        authors: ['Test Author C']
      }]
    });
    assert.strictEqual(scopusResult.count, 1);
    assert.strictEqual(scopusResult.publications[0].source, 'scopus');

    // 9d. Google Scholar import via service helper
    const scholarResult = await googleScholarService.importFacultyScholarPublications(
      testFaculty._id.toString(),
      [{
        title: 'TEST_Source Preservation Google Scholar Publication',
        year: 2024,
        authors: ['Test Author D']
      }]
    );
    assert.strictEqual(scholarResult.count, 1);
    assert.strictEqual(scholarResult.data[0].source, 'google_scholar');

    // Verify all four publications are stored with correct source in DB
    const pubs = await Publication.find({ title: { $regex: /^TEST_Source Preservation/ } }).sort({ title: 1 });
    assert.strictEqual(pubs.length, 4);
    const sources = pubs.map(p => p.source);
    assert.ok(sources.includes('manual'));
    assert.ok(sources.includes('orcid'));
    assert.ok(sources.includes('scopus'));
    assert.ok(sources.includes('google_scholar'));
  });

  // 10. Soft-merged publications excluded from normal duplicate matching
  test('10. Soft-merged duplicate publications should be excluded from normal duplicate candidate matching', async () => {
    // Primary active publication
    const primary = await Publication.create({
      title: 'TEST_Primary Autonomous Navigation Architecture',
      year: 2024,
      authors: ['Professor X'],
      doi: '10.9999/primary.001',
      source: 'manual'
    });

    // Soft-merged duplicate publication
    const mergedDuplicate = await Publication.create({
      title: 'TEST_Soft Merged Duplicate Architecture',
      year: 2024,
      authors: ['Prof. X'],
      doi: '10.9999/merged.duplicate.001',
      isDuplicate: true,
      mergedInto: primary._id,
      mergedAt: new Date(),
      source: 'manual'
    });

    // Check duplicate detection for merged duplicate directly: should return 0 candidates
    const checkMerged = await duplicateDetectionService.findDuplicatesForRecord(mergedDuplicate);
    assert.strictEqual(checkMerged.count, 0, 'Soft-merged publication should not have candidate duplicates evaluated');

    // An incoming publication matching the mergedDuplicate's DOI should not match against mergedDuplicate
    const candidatePub = {
      title: 'TEST_Something Completely Different',
      year: 2024,
      doi: '10.9999/merged.duplicate.001'
    };
    const dupResult = await duplicateDetectionService.findDuplicatesForRecord(candidatePub);
    // Should not find the merged duplicate because query excludes { isDuplicate: { $ne: true } }
    const matchMerged = dupResult.candidates.some(c => c.existingPublicationId.toString() === mergedDuplicate._id.toString());
    assert.strictEqual(matchMerged, false, 'Soft-merged publication must be excluded from candidate results');
  });

  // 11. Single publication creation service (publicationService.createPublication) deduplication flow
  test('11. Single publication creation should detect strong duplicates and return duplicate info', async () => {
    await Publication.create({
      title: 'TEST_Reinforcement Learning for Robotic Control',
      year: 2024,
      doi: '10.8888/rl.control.2024',
      authors: ['Sutton', 'Barto'],
      source: 'manual'
    });

    // Attempt to create duplicate via publicationService.createPublication
    const createResult = await publicationService.createPublication({
      title: 'TEST_Reinforcement Learning for Robotic Control',
      year: 2024,
      doi: '10.8888/rl.control.2024',
      authors: ['R. Sutton', 'A. Barto']
    });

    assert.strictEqual(createResult.isDuplicate, true, 'Should detect duplicate');
    assert.strictEqual(createResult.action, 'skipped');
    assert.strictEqual(createResult.confidence, 'high');
    assert.ok(createResult.matchingSignals.length > 0);

    // Verify DB count is still 1
    const countInDb = await Publication.countDocuments({ doi: '10.8888/rl.control.2024' });
    assert.strictEqual(countInDb, 1);
  });
});
