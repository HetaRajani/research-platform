const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const express = require('express');
const jwt = require('jsonwebtoken');

const healthRoutes = require('../routes/health.routes');
const facultyRoutes = require('../routes/faculty.routes');
const publicationRoutes = require('../routes/publication.routes');
const analyticsRoutes = require('../routes/analytics.routes');
const { errorHandler } = require('../middleware/errorHandler');

const User = require('../models/User');
const Faculty = require('../models/Faculty');
const Publication = require('../models/Publication');
const DuplicateReview = require('../models/DuplicateReview');
const ResearchDomain = require('../models/ResearchDomain');

const duplicateReviewService = require('../services/duplicateReview.service');
const duplicateDetectionService = require('../services/duplicateDetection.service');

const { getTestDatabaseUri } = require('./testDatabase');
const TEST_DB_URI = getTestDatabaseUri();
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

describe('Phase 11E — Merge Workflow, Review Lifecycle & Post-Merge Analytics', () => {
  let app;
  let server;
  let baseUrl;
  let adminUser;
  let facultyUser;
  let adminToken;
  let facultyToken;

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_DB_URI);
    }

    // Set up test Express server
    app = express();
    app.use(express.json());
    app.use('/api', healthRoutes);
    app.use('/api/faculty', facultyRoutes);
    app.use('/api/publications', publicationRoutes);
    app.use('/api/analytics', analyticsRoutes);
    app.use(errorHandler);

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });

    // Cleanup any lingering Phase 11E test records
    await User.deleteMany({ email: { $regex: /ph11e_test/ } });
    await Publication.deleteMany({ title: { $regex: /^PH11E_/ } });
    await Faculty.deleteMany({ facultyCode: { $regex: /^PH11E_/ } });
    await ResearchDomain.deleteMany({ name: { $regex: /^PH11E_/ } });
    await DuplicateReview.deleteMany({});

    // Create test admin user
    adminUser = await User.create({
      name: 'PH11E Admin User',
      email: 'ph11e_test_admin@university.edu',
      password: 'Password123!',
      role: 'admin'
    });
    adminToken = jwt.sign({ id: adminUser._id }, JWT_SECRET, { expiresIn: '1h' });

    // Create test faculty user
    facultyUser = await User.create({
      name: 'PH11E Faculty User',
      email: 'ph11e_test_faculty@university.edu',
      password: 'Password123!',
      role: 'faculty'
    });
    facultyToken = jwt.sign({ id: facultyUser._id }, JWT_SECRET, { expiresIn: '1h' });
  });

  after(async () => {
    await User.deleteMany({ email: { $regex: /ph11e_test/ } });
    await Publication.deleteMany({ title: { $regex: /^PH11E_/ } });
    await Faculty.deleteMany({ facultyCode: { $regex: /^PH11E_/ } });
    await ResearchDomain.deleteMany({ name: { $regex: /^PH11E_/ } });
    await DuplicateReview.deleteMany({});

    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    await mongoose.connection.close();
  });

  // =========================================================================
  // TASK 1: MERGE TESTS
  // =========================================================================
  describe('Task 1 — Missing Merge Tests', () => {
    test('1.1 Successful confirmed duplicate merge combines metadata and soft-merges duplicate', async () => {
      const pubA = await Publication.create({
        title: 'PH11E_Autonomous Vehicles Trajectory Planning',
        year: 2024,
        authors: ['Alice Smith', 'Bob Jones'],
        doi: '10.1000/ph11e.auto.001',
        citations: 12,
        journal: 'IEEE Transactions on Intelligent Vehicles',
        abstract: 'Short original abstract.',
        source: 'manual',
        keywords: ['Autonomous Driving', 'Path Planning']
      });

      const pubB = await Publication.create({
        title: 'PH11E_Autonomous Vehicles Trajectory Planning (Preprint)',
        year: 2024,
        authors: ['alice smith', 'Charlie Brown'],
        doi: '10.1000/ph11e.auto.001',
        citations: 28,
        venue: 'IEEE Transactions on Intelligent Vehicles',
        abstract: 'Comprehensive and detailed preprint abstract with complete methodology details.',
        source: 'scopus',
        keywords: ['Path Planning', 'Trajectory Optimization']
      });

      const review = await DuplicateReview.create({
        publicationId: pubA._id,
        potentialDuplicateId: pubB._id,
        similarityScore: 0.95,
        confidence: 'high',
        status: 'confirmed',
        reviewedBy: adminUser._id,
        reviewedAt: new Date()
      });

      // Admin executes merge via HTTP endpoint
      const res = await fetch(`${baseUrl}/api/publications/duplicates/${review._id}/merge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ primaryPublicationId: pubA._id.toString() })
      });

      assert.strictEqual(res.status, 200, 'Merge request should succeed with 200');
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.message, 'Publications merged successfully');

      // Verify duplicate publication in DB
      const updatedDuplicate = await Publication.findById(pubB._id);
      assert.strictEqual(updatedDuplicate.isDuplicate, true, 'Merged publication must have isDuplicate = true');
      assert.strictEqual(updatedDuplicate.mergedInto.toString(), pubA._id.toString(), 'mergedInto must point to primary publication');
      assert.ok(updatedDuplicate.mergedAt instanceof Date, 'mergedAt must be populated');

      // Verify primary publication in DB: preserved metadata
      const updatedPrimary = await Publication.findById(pubA._id);
      assert.strictEqual(updatedPrimary.isDuplicate, false);
      assert.strictEqual(updatedPrimary.title, 'PH11E_Autonomous Vehicles Trajectory Planning');
      assert.strictEqual(updatedPrimary.citations, 28, 'Citations must preserve highest value (28 vs 12)');
      assert.strictEqual(updatedPrimary.abstract, 'Comprehensive and detailed preprint abstract with complete methodology details.', 'More complete abstract should be preserved');
      assert.strictEqual(updatedPrimary.source, 'manual', 'Primary source should be preserved');

      // Authors combined without case-insensitive duplicates
      assert.strictEqual(updatedPrimary.authors.length, 3);
      assert.ok(updatedPrimary.authors.includes('Alice Smith'));
      assert.ok(updatedPrimary.authors.includes('Bob Jones'));
      assert.ok(updatedPrimary.authors.includes('Charlie Brown'));

      // Keywords combined without duplicates
      assert.strictEqual(updatedPrimary.keywords.length, 3);
      assert.ok(updatedPrimary.keywords.includes('Autonomous Driving'));
      assert.ok(updatedPrimary.keywords.includes('Path Planning'));
      assert.ok(updatedPrimary.keywords.includes('Trajectory Optimization'));

      // Verify review record updated
      const updatedReview = await DuplicateReview.findById(review._id);
      assert.strictEqual(updatedReview.status, 'confirmed');
      assert.strictEqual(updatedReview.merged, true);
      assert.strictEqual(updatedReview.mergedInto.toString(), pubA._id.toString());
      assert.ok(updatedReview.mergedAt instanceof Date);
      assert.strictEqual(updatedReview.mergedBy.toString(), adminUser._id.toString());
    });

    test('1.2 Pending duplicate cannot be merged', async () => {
      const pubA = await Publication.create({ title: 'PH11E_Pending Pub A', year: 2023, authors: ['Author A'] });
      const pubB = await Publication.create({ title: 'PH11E_Pending Pub B', year: 2023, authors: ['Author B'] });

      const pendingReview = await DuplicateReview.create({
        publicationId: pubA._id,
        potentialDuplicateId: pubB._id,
        similarityScore: 0.88,
        confidence: 'medium',
        status: 'pending'
      });

      const res = await fetch(`${baseUrl}/api/publications/duplicates/${pendingReview._id}/merge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({})
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.success, false);
      assert.ok(body.message.includes('Only confirmed duplicate reviews can be merged'));
    });

    test('1.3 Rejected duplicate cannot be merged', async () => {
      const pubA = await Publication.create({ title: 'PH11E_Rejected Pub A', year: 2023, authors: ['Author A'] });
      const pubB = await Publication.create({ title: 'PH11E_Rejected Pub B', year: 2023, authors: ['Author B'] });

      const rejectedReview = await DuplicateReview.create({
        publicationId: pubA._id,
        potentialDuplicateId: pubB._id,
        similarityScore: 0.75,
        confidence: 'low',
        status: 'rejected',
        reviewedBy: adminUser._id,
        reviewedAt: new Date()
      });

      const res = await fetch(`${baseUrl}/api/publications/duplicates/${rejectedReview._id}/merge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({})
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.success, false);
      assert.ok(body.message.includes('Only confirmed duplicate reviews can be merged'));
    });

    test('1.4 Already merged duplicate cannot be merged again', async () => {
      const pubA = await Publication.create({ title: 'PH11E_Already Merged Pub A', year: 2023, authors: ['Author A'] });
      const pubB = await Publication.create({
        title: 'PH11E_Already Merged Pub B',
        year: 2023,
        authors: ['Author B'],
        isDuplicate: true,
        mergedInto: pubA._id,
        mergedAt: new Date()
      });

      const alreadyMergedReview = await DuplicateReview.create({
        publicationId: pubA._id,
        potentialDuplicateId: pubB._id,
        similarityScore: 0.92,
        confidence: 'high',
        status: 'confirmed',
        merged: true,
        mergedInto: pubA._id,
        mergedAt: new Date(),
        mergedBy: adminUser._id
      });

      const res = await fetch(`${baseUrl}/api/publications/duplicates/${alreadyMergedReview._id}/merge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({})
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.success, false);
      assert.ok(body.message.includes('already been merged'));
    });

    test('1.5 Self-merge is rejected', async () => {
      const pubA = await Publication.create({ title: 'PH11E_Self Merge Pub', year: 2023, authors: ['Author A'] });

      const selfReview = await DuplicateReview.create({
        publicationId: pubA._id,
        potentialDuplicateId: pubA._id,
        similarityScore: 1.0,
        confidence: 'high',
        status: 'confirmed'
      });

      const res = await fetch(`${baseUrl}/api/publications/duplicates/${selfReview._id}/merge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({})
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.success, false);
      assert.ok(body.message.includes('Cannot merge a publication with itself'));
    });

    test('1.6 Missing publication is handled with 404', async () => {
      const pubA = await Publication.create({ title: 'PH11E_Remaining Pub', year: 2023, authors: ['Author A'] });
      const nonExistentId = new mongoose.Types.ObjectId();

      const brokenReview = await DuplicateReview.create({
        publicationId: pubA._id,
        potentialDuplicateId: nonExistentId,
        similarityScore: 0.90,
        confidence: 'high',
        status: 'confirmed'
      });

      const res = await fetch(`${baseUrl}/api/publications/duplicates/${brokenReview._id}/merge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({})
      });

      assert.strictEqual(res.status, 404);
      const body = await res.json();
      assert.strictEqual(body.success, false);
      assert.ok(body.message.includes('not found in database'));
    });

    test('1.7 Unauthorized user cannot merge', async () => {
      const pubA = await Publication.create({ title: 'PH11E_Auth Pub A', year: 2024, authors: ['Author A'] });
      const pubB = await Publication.create({ title: 'PH11E_Auth Pub B', year: 2024, authors: ['Author B'] });

      const review = await DuplicateReview.create({
        publicationId: pubA._id,
        potentialDuplicateId: pubB._id,
        similarityScore: 0.91,
        confidence: 'high',
        status: 'confirmed'
      });

      // 1. Unauthenticated (no token)
      const resNoToken = await fetch(`${baseUrl}/api/publications/duplicates/${review._id}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      assert.strictEqual(resNoToken.status, 401);

      // 2. Non-admin (faculty role)
      const resFaculty = await fetch(`${baseUrl}/api/publications/duplicates/${review._id}/merge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${facultyToken}`
        },
        body: JSON.stringify({})
      });
      assert.strictEqual(resFaculty.status, 403);
    });

    test('1.8 Merging combines research domains and faculty associations without duplicates', async () => {
      const domain1 = await ResearchDomain.create({ name: 'PH11E_Domain_AI', description: 'Artificial Intelligence' });
      const domain2 = await ResearchDomain.create({ name: 'PH11E_Domain_Robotics', description: 'Robotics' });

      const faculty1 = await Faculty.create({
        facultyCode: 'PH11E_FAC_01',
        name: 'Dr. Alpha One',
        email: 'ph11e.fac1@university.edu',
        department: 'Computer Science',
        designation: 'Professor'
      });
      const faculty2 = await Faculty.create({
        facultyCode: 'PH11E_FAC_02',
        name: 'Dr. Beta Two',
        email: 'ph11e.fac2@university.edu',
        department: 'Electrical Engineering',
        designation: 'Associate Professor'
      });
      const faculty3 = await Faculty.create({
        facultyCode: 'PH11E_FAC_03',
        name: 'Dr. Gamma Three',
        email: 'ph11e.fac3@university.edu',
        department: 'Computer Science',
        designation: 'Assistant Professor'
      });

      const pubA = await Publication.create({
        title: 'PH11E_Federated Edge Robotics',
        year: 2024,
        authors: ['Dr. Alpha One', 'Dr. Beta Two'],
        facultyIds: [faculty1._id, faculty2._id],
        researchDomains: [domain1._id],
        citations: 10
      });

      const pubB = await Publication.create({
        title: 'PH11E_Federated Edge Robotics: An Empirical Study',
        year: 2024,
        authors: ['Dr. Beta Two', 'Dr. Gamma Three'],
        facultyIds: [faculty2._id, faculty3._id],
        researchDomains: [domain1._id, domain2._id],
        citations: 5
      });

      const review = await DuplicateReview.create({
        publicationId: pubA._id,
        potentialDuplicateId: pubB._id,
        similarityScore: 0.90,
        confidence: 'high',
        status: 'confirmed'
      });

      // Call merge service
      const mergeRes = await duplicateReviewService.mergeDuplicateReview(
        review._id.toString(),
        adminUser._id,
        { primaryPublicationId: pubA._id.toString() }
      );

      assert.ok(mergeRes.primaryPublication);
      const mergedFacIds = mergeRes.primaryPublication.facultyIds.map(f => f._id.toString());
      assert.strictEqual(mergedFacIds.length, 3, 'Should combine 3 unique faculty IDs without duplicates');
      assert.ok(mergedFacIds.includes(faculty1._id.toString()));
      assert.ok(mergedFacIds.includes(faculty2._id.toString()));
      assert.ok(mergedFacIds.includes(faculty3._id.toString()));

      const mergedDomainIds = mergeRes.primaryPublication.researchDomains.map(d => d._id.toString());
      assert.strictEqual(mergedDomainIds.length, 2, 'Should combine 2 unique research domain IDs without duplicates');
      assert.ok(mergedDomainIds.includes(domain1._id.toString()));
      assert.ok(mergedDomainIds.includes(domain2._id.toString()));
    });

    test('1.9 Safely handles missing body and missing primaryPublicationId (Task 4 fix verification)', async () => {
      const pubA = await Publication.create({ title: 'PH11E_NoBody Pub A', year: 2024, authors: ['Author A'] });
      const pubB = await Publication.create({ title: 'PH11E_NoBody Pub B', year: 2024, authors: ['Author B'] });

      const review = await DuplicateReview.create({
        publicationId: pubA._id,
        potentialDuplicateId: pubB._id,
        similarityScore: 0.92,
        confidence: 'high',
        status: 'confirmed'
      });

      // Request with no request body and no primaryPublicationId
      const res = await fetch(`${baseUrl}/api/publications/duplicates/${review._id}/merge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        }
      });

      assert.strictEqual(res.status, 200, 'Should not throw TypeError; should default primary publication');
      const body = await res.json();
      assert.strictEqual(body.success, true);

      // Verify that invalid primaryPublicationId returns 400 validation error
      const pubC = await Publication.create({ title: 'PH11E_InvalidPrimary Pub C', year: 2024, authors: ['Author C'] });
      const pubD = await Publication.create({ title: 'PH11E_InvalidPrimary Pub D', year: 2024, authors: ['Author D'] });
      const review2 = await DuplicateReview.create({
        publicationId: pubC._id,
        potentialDuplicateId: pubD._id,
        similarityScore: 0.92,
        confidence: 'high',
        status: 'confirmed'
      });

      const resInvalid = await fetch(`${baseUrl}/api/publications/duplicates/${review2._id}/merge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ primaryPublicationId: new mongoose.Types.ObjectId().toString() })
      });
      assert.strictEqual(resInvalid.status, 400);
      const invalidBody = await resInvalid.json();
      assert.ok(invalidBody.message.includes('primaryPublicationId must match one of the publications'));
    });
  });

  // =========================================================================
  // TASK 2: DUPLICATE REVIEW LIFECYCLE TESTS
  // =========================================================================
  describe('Task 2 — Duplicate Review Lifecycle Tests', () => {
    test('2.1 Admin confirms pending duplicate review successfully', async () => {
      const pubA = await Publication.create({ title: 'PH11E_Lifecycle Pub A', year: 2024, authors: ['Author A'] });
      const pubB = await Publication.create({ title: 'PH11E_Lifecycle Pub B', year: 2024, authors: ['Author B'] });

      const review = await DuplicateReview.create({
        publicationId: pubA._id,
        potentialDuplicateId: pubB._id,
        similarityScore: 0.89,
        confidence: 'medium',
        status: 'pending'
      });

      const res = await fetch(`${baseUrl}/api/publications/duplicates/${review._id}/confirm`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        }
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.status, 'confirmed');
      assert.ok(body.data.reviewedAt);
      assert.strictEqual(body.data.reviewedBy._id.toString(), adminUser._id.toString());
    });

    test('2.2 Admin rejects pending duplicate review successfully', async () => {
      const pubA = await Publication.create({ title: 'PH11E_Reject Lifecycle Pub A', year: 2024, authors: ['Author A'] });
      const pubB = await Publication.create({ title: 'PH11E_Reject Lifecycle Pub B', year: 2024, authors: ['Author B'] });

      const review = await DuplicateReview.create({
        publicationId: pubA._id,
        potentialDuplicateId: pubB._id,
        similarityScore: 0.76,
        confidence: 'low',
        status: 'pending'
      });

      const res = await fetch(`${baseUrl}/api/publications/duplicates/${review._id}/reject`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        }
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.status, 'rejected');
      assert.ok(body.data.reviewedAt);
      assert.strictEqual(body.data.reviewedBy._id.toString(), adminUser._id.toString());
    });

    test('2.3 Non-admin cannot confirm or reject duplicate review', async () => {
      const pubA = await Publication.create({ title: 'PH11E_NonAdmin Pub A', year: 2024, authors: ['Author A'] });
      const pubB = await Publication.create({ title: 'PH11E_NonAdmin Pub B', year: 2024, authors: ['Author B'] });

      const review = await DuplicateReview.create({
        publicationId: pubA._id,
        potentialDuplicateId: pubB._id,
        similarityScore: 0.85,
        confidence: 'medium',
        status: 'pending'
      });

      // Unauthenticated
      const resNoAuth = await fetch(`${baseUrl}/api/publications/duplicates/${review._id}/confirm`, {
        method: 'PATCH'
      });
      assert.strictEqual(resNoAuth.status, 401);

      // Faculty role (forbidden)
      const resFacultyConfirm = await fetch(`${baseUrl}/api/publications/duplicates/${review._id}/confirm`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${facultyToken}` }
      });
      assert.strictEqual(resFacultyConfirm.status, 403);

      const resFacultyReject = await fetch(`${baseUrl}/api/publications/duplicates/${review._id}/reject`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${facultyToken}` }
      });
      assert.strictEqual(resFacultyReject.status, 403);
    });

    test('2.4 Invalid review ID returns appropriate error status', async () => {
      // 1. Invalid MongoDB ObjectId format -> 400
      const resBadId = await fetch(`${baseUrl}/api/publications/duplicates/not-a-valid-id/confirm`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(resBadId.status, 400);

      // 2. Non-existent ObjectId -> 404
      const nonExistentId = new mongoose.Types.ObjectId();
      const resNotFound = await fetch(`${baseUrl}/api/publications/duplicates/${nonExistentId}/confirm`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(resNotFound.status, 404);
    });

    test('2.5 Invalid status transitions are rejected with 400', async () => {
      const pubA = await Publication.create({ title: 'PH11E_Transition Pub A', year: 2024, authors: ['Author A'] });
      const pubB = await Publication.create({ title: 'PH11E_Transition Pub B', year: 2024, authors: ['Author B'] });

      // Review is already confirmed
      const confirmedReview = await DuplicateReview.create({
        publicationId: pubA._id,
        potentialDuplicateId: pubB._id,
        similarityScore: 0.90,
        confidence: 'high',
        status: 'confirmed',
        reviewedBy: adminUser._id,
        reviewedAt: new Date()
      });

      // Confirming again -> 400
      const resReconfirm = await fetch(`${baseUrl}/api/publications/duplicates/${confirmedReview._id}/confirm`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(resReconfirm.status, 400);

      // Rejecting already confirmed -> 400
      const resRejectConfirmed = await fetch(`${baseUrl}/api/publications/duplicates/${confirmedReview._id}/reject`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(resRejectConfirmed.status, 400);

      // Review is already rejected
      const rejectedReview = await DuplicateReview.create({
        publicationId: pubA._id,
        potentialDuplicateId: pubB._id,
        similarityScore: 0.70,
        confidence: 'low',
        status: 'rejected',
        reviewedBy: adminUser._id,
        reviewedAt: new Date()
      });

      // Confirming already rejected -> 400
      const resConfirmRejected = await fetch(`${baseUrl}/api/publications/duplicates/${rejectedReview._id}/confirm`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(resConfirmRejected.status, 400);

      // Rejecting already rejected -> 400
      const resRereject = await fetch(`${baseUrl}/api/publications/duplicates/${rejectedReview._id}/reject`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(resRereject.status, 400);
    });

    test('2.6 Rejected pair is suppressed from future duplicate candidate queries', async () => {
      const pubA = await Publication.create({
        title: 'PH11E_Suppression Target Publication Title',
        year: 2024,
        authors: ['Dr. Suppression Test']
      });

      const pubB = await Publication.create({
        title: 'PH11E_Suppression Target Publication Title (Alternate Version)',
        year: 2024,
        authors: ['Dr. Suppression Test']
      });

      // Initially, candidate detection discovers pubB for pubA
      const beforeReject = await duplicateDetectionService.findDuplicatesForRecord(pubA);
      const isCandidateBefore = beforeReject.candidates.some(c => c.existingPublicationId.toString() === pubB._id.toString());
      assert.strictEqual(isCandidateBefore, true, 'Should initially detect pubB as candidate');

      // Create and reject the review record
      await DuplicateReview.create({
        publicationId: pubA._id,
        potentialDuplicateId: pubB._id,
        similarityScore: 0.88,
        confidence: 'medium',
        status: 'rejected',
        reviewedBy: adminUser._id,
        reviewedAt: new Date()
      });

      // Now query candidates for pubA: pubB should be suppressed
      const afterReject = await duplicateDetectionService.findDuplicatesForRecord(pubA);
      const isCandidateAfter = afterReject.candidates.some(c => c.existingPublicationId.toString() === pubB._id.toString());
      assert.strictEqual(isCandidateAfter, false, 'Rejected duplicate partner must be suppressed from candidates');

      // Also verify through GET /api/publications/:id/duplicates
      const resApi = await fetch(`${baseUrl}/api/publications/${pubA._id}/duplicates`);
      assert.strictEqual(resApi.status, 200);
      const apiBody = await resApi.json();
      const apiMatch = apiBody.candidates.some(c => c.existingPublicationId.toString() === pubB._id.toString());
      assert.strictEqual(apiMatch, false, 'Suppression must be active on HTTP API endpoint');
    });
  });

  // =========================================================================
  // TASK 3: POST-MERGE ANALYTICS TESTS
  // =========================================================================
  describe('Task 3 — Post-Merge Analytics Tests', () => {
    let deptFaculty1;
    let deptFaculty2;
    let deptFaculty3;
    let testDomain;
    let pubPrimary;
    let pubDuplicate;
    let baselineOverview;
    let baselineYearly;
    let baselineDepts;
    let baselineDomains;
    let baselineCollabs;

    before(async () => {
      // Create dedicated faculty for analytics tests
      deptFaculty1 = await Faculty.create({
        facultyCode: 'PH11E_ANALYTICS_FAC1',
        name: 'Dr. Analytics One',
        email: 'analytics1@university.edu',
        department: 'PH11E_Dept_Robotics',
        designation: 'Professor'
      });

      deptFaculty2 = await Faculty.create({
        facultyCode: 'PH11E_ANALYTICS_FAC2',
        name: 'Dr. Analytics Two',
        email: 'analytics2@university.edu',
        department: 'PH11E_Dept_Electronics',
        designation: 'Associate Professor'
      });

      deptFaculty3 = await Faculty.create({
        facultyCode: 'PH11E_ANALYTICS_FAC3',
        name: 'Dr. Analytics Three',
        email: 'analytics3@university.edu',
        department: 'PH11E_Dept_Robotics',
        designation: 'Assistant Professor'
      });

      testDomain = await ResearchDomain.create({
        name: 'PH11E_Domain_Quantum',
        description: 'Quantum Neural Networks and Computing'
      });

      // Primary Publication: 2024, 10 citations, Faculty 1 & Faculty 2
      pubPrimary = await Publication.create({
        title: 'PH11E_Quantum Deep Learning Architectures',
        year: 2024,
        authors: ['Dr. Analytics One', 'Dr. Analytics Two'],
        facultyIds: [deptFaculty1._id, deptFaculty2._id],
        researchDomains: [testDomain._id],
        citations: 10,
        source: 'manual',
        isDuplicate: false
      });

      // Duplicate Publication: 2024, 25 citations, Faculty 1 & Faculty 3
      pubDuplicate = await Publication.create({
        title: 'PH11E_Quantum Deep Learning Architectures: Comprehensive Survey',
        year: 2024,
        authors: ['Dr. Analytics One', 'Dr. Analytics Three'],
        facultyIds: [deptFaculty1._id, deptFaculty3._id],
        researchDomains: [testDomain._id],
        citations: 25,
        source: 'scopus',
        isDuplicate: false
      });

      // Capture pre-merge baseline analytics
      const [resOverview, resYearly, resDepts, resDomains, resCollabs] = await Promise.all([
        fetch(`${baseUrl}/api/analytics/overview`),
        fetch(`${baseUrl}/api/analytics/yearly`),
        fetch(`${baseUrl}/api/analytics/departments`),
        fetch(`${baseUrl}/api/analytics/research-domains`),
        fetch(`${baseUrl}/api/analytics/collaborations`)
      ]);

      baselineOverview = (await resOverview.json()).data;
      baselineYearly = (await resYearly.json()).data;
      baselineDepts = (await resDepts.json()).data;
      baselineDomains = (await resDomains.json()).data;
      baselineCollabs = (await resCollabs.json()).data;

      // Execute merge of pubDuplicate into pubPrimary
      const review = await DuplicateReview.create({
        publicationId: pubPrimary._id,
        potentialDuplicateId: pubDuplicate._id,
        similarityScore: 0.94,
        confidence: 'high',
        status: 'confirmed',
        reviewedBy: adminUser._id,
        reviewedAt: new Date()
      });

      await duplicateReviewService.mergeDuplicateReview(
        review._id.toString(),
        adminUser._id,
        { primaryPublicationId: pubPrimary._id.toString() }
      );
    });

    test('3.1 /api/analytics/overview does not count merged publication separately or double-count citations', async () => {
      const res = await fetch(`${baseUrl}/api/analytics/overview`);
      assert.strictEqual(res.status, 200);
      const { data } = await res.json();

      // Total publications must decrease by exactly 1
      assert.strictEqual(
        data.totalPublications,
        baselineOverview.totalPublications - 1,
        'Overview totalPublications must decrease by 1 after duplicate is merged'
      );

      // Pre-merge citations included both: 10 + 25 = 35.
      // Merged publication preserves highest citation count (25).
      // Therefore total citations should decrease by 10 (35 - 25 = 10).
      assert.strictEqual(
        data.totalCitations,
        baselineOverview.totalCitations - 10,
        'Overview totalCitations must not double-count (should preserve max citations 25 instead of 10+25)'
      );
    });

    test('3.2 /api/analytics/yearly does not double-count publication/citation totals', async () => {
      const res = await fetch(`${baseUrl}/api/analytics/yearly`);
      assert.strictEqual(res.status, 200);
      const { data } = await res.json();

      const year2024Pre = baselineYearly.find(y => y._id === 2024 || y.year === 2024);
      const year2024Post = data.find(y => y._id === 2024 || y.year === 2024);

      assert.ok(year2024Pre, '2024 must exist in pre-merge baseline');
      assert.ok(year2024Post, '2024 must exist in post-merge stats');

      assert.strictEqual(
        year2024Post.publications,
        year2024Pre.publications - 1,
        'Yearly 2024 publication count must decrease by exactly 1'
      );

      assert.strictEqual(
        year2024Post.citations,
        year2024Pre.citations - 10,
        'Yearly 2024 citations must decrease by 10 (not double counting 10 + 25)'
      );
    });

    test('3.3 /api/analytics/departments does not double-count the merged publication', async () => {
      const res = await fetch(`${baseUrl}/api/analytics/departments`);
      assert.strictEqual(res.status, 200);
      const { data } = await res.json();

      const deptRoboticsPre = baselineDepts.find(d => d.department === 'PH11E_Dept_Robotics');
      const deptRoboticsPost = data.find(d => d.department === 'PH11E_Dept_Robotics');

      assert.ok(deptRoboticsPre, 'Pre-merge department stats must include PH11E_Dept_Robotics');
      assert.ok(deptRoboticsPost, 'Post-merge department stats must include PH11E_Dept_Robotics');

      // Before merge, pubPrimary had Fac1 and pubDuplicate had Fac1 & Fac3 (both in PH11E_Dept_Robotics).
      // After merge, duplicate is excluded ({ isDuplicate: { $ne: true } }), so only pubPrimary is counted.
      assert.strictEqual(
        deptRoboticsPost.publicationCount,
        deptRoboticsPre.publicationCount - 1,
        'Department publicationCount must not double-count the merged publication'
      );
    });

    test('3.4 /api/analytics/research-domains does not double-count the merged publication', async () => {
      const res = await fetch(`${baseUrl}/api/analytics/research-domains`);
      assert.strictEqual(res.status, 200);
      const { data } = await res.json();

      const domainPre = baselineDomains.find(d => d.domain === 'PH11E_Domain_Quantum');
      const domainPost = data.find(d => d.domain === 'PH11E_Domain_Quantum');

      assert.ok(domainPre, 'Pre-merge research domain stats must include PH11E_Domain_Quantum');
      assert.ok(domainPost, 'Post-merge research domain stats must include PH11E_Domain_Quantum');

      assert.strictEqual(
        domainPost.publicationCount,
        domainPre.publicationCount - 1,
        'Research domain publicationCount must decrease by 1 (no double counting)'
      );
    });

    test('3.5 /api/analytics/collaborations does not create duplicate collaboration relationships because of the merged record', async () => {
      const res = await fetch(`${baseUrl}/api/analytics/collaborations`);
      assert.strictEqual(res.status, 200);
      const { data } = await res.json();

      // Collaborations are strictly built with isDuplicate: { $ne: true }.
      // pubDuplicate (which linked Fac1 and Fac3) has isDuplicate: true and was merged into pubPrimary (linking Fac1, Fac2, Fac3).
      // Verify that no collaboration edge in data has isDuplicate true or has ghost duplicate pair entries.
      const pairs = new Set();
      for (const edge of data) {
        const id1 = edge.faculty1 ? (edge.faculty1._id || edge.faculty1).toString() : '';
        const id2 = edge.faculty2 ? (edge.faculty2._id || edge.faculty2).toString() : '';
        const key = [id1, id2].sort().join('_');

        assert.strictEqual(pairs.has(key), false, `Collaboration network must have unique edges between faculty pairs (duplicate edge: ${key})`);
        pairs.add(key);
      }
    });
  });
});
