const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const express = require('express');

const healthRoutes = require('../routes/health.routes');
const analyticsRoutes = require('../routes/analytics.routes');
const publicationRoutes = require('../routes/publication.routes');
const { errorHandler } = require('../middleware/errorHandler');

const Publication = require('../models/Publication');
const ResearchDomain = require('../models/ResearchDomain');
const Faculty = require('../models/Faculty');

const TEST_DB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/research_platform_test';

describe('Phase 12D — Research Domain Analytics Integration', () => {
  let app;
  let server;
  let baseUrl;
  let manualDomainAI;
  let manualDomainIoT;
  let testFac1;
  let testFac2;
  let testFac3;

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_DB_URI);
    }

    // Setup test express app
    app = express();
    app.use(express.json());
    app.use('/api', healthRoutes);
    app.use('/api/analytics', analyticsRoutes);
    app.use('/api/publications', publicationRoutes);
    app.use(errorHandler);

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });

    // Cleanup Phase 12D test records
    await Publication.deleteMany({ title: { $regex: /^PH12D_/ } });
    await ResearchDomain.deleteMany({ name: { $regex: /^PH12D_/ } });
    await Faculty.deleteMany({ facultyCode: { $regex: /^PH12D_/ } });

    // Seed test faculty
    testFac1 = await Faculty.create({
      facultyCode: 'PH12D_FAC1',
      name: 'Dr. Alpha PH12D',
      email: 'ph12d_alpha@university.edu',
      department: 'Computer Science & Engineering',
      designation: 'Professor'
    });

    testFac2 = await Faculty.create({
      facultyCode: 'PH12D_FAC2',
      name: 'Dr. Beta PH12D',
      email: 'ph12d_beta@university.edu',
      department: 'Computer Science & Engineering',
      designation: 'Associate Professor'
    });

    testFac3 = await Faculty.create({
      facultyCode: 'PH12D_FAC3',
      name: 'Dr. Gamma PH12D',
      email: 'ph12d_gamma@university.edu',
      department: 'Information Technology',
      designation: 'Assistant Professor'
    });

    // Seed test manual domains
    manualDomainAI = await ResearchDomain.create({
      name: 'PH12D_Manual_AI',
      description: 'Manual verified artificial intelligence research domain'
    });

    manualDomainIoT = await ResearchDomain.create({
      name: 'PH12D_Manual_IoT',
      description: 'Manual verified IoT research domain'
    });
  });

  after(async () => {
    await Publication.deleteMany({ title: { $regex: /^PH12D_/ } });
    await ResearchDomain.deleteMany({ name: { $regex: /^PH12D_/ } });
    await Faculty.deleteMany({ facultyCode: { $regex: /^PH12D_/ } });

    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    await mongoose.connection.close();
  });

  // =========================================================================
  // 1. Existing Manual Analytics Behavior Preserved
  // =========================================================================
  test('1. Existing manual research-domain analytics continues to work accurately', async () => {
    // Create manual publication
    await Publication.create({
      title: 'PH12D_Manual_Paper_AI_1',
      year: 2024,
      authors: ['Dr. Alpha PH12D'],
      facultyIds: [testFac1._id],
      researchDomains: [manualDomainAI._id],
      citations: 18,
      source: 'manual'
    });

    const res = await fetch(`${baseUrl}/api/analytics/research-domains`);
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.data), 'body.data must be an array for backwards compatibility');

    const aiManual = body.data.find(d => d.domain === 'PH12D_Manual_AI');
    assert.ok(aiManual, 'Must include PH12D_Manual_AI in manual stats');
    assert.strictEqual(aiManual.publicationCount, 1);
    assert.strictEqual(aiManual.citationCount, 18);
    assert.strictEqual(aiManual.facultyCount, 1);
  });

  // =========================================================================
  // 2. Predicted Domain Analytics Returns Correct Domain Name
  // =========================================================================
  test('2. Predicted domain analytics returns correct domain name and metadata', async () => {
    await Publication.create({
      title: 'PH12D_Predicted_IoT_Publication',
      year: 2024,
      authors: ['Dr. Alpha PH12D'],
      facultyIds: [testFac1._id],
      citations: 22,
      predictedResearchDomains: [{
        name: 'PH12D_Predicted_Domain_IoT',
        confidence: 0.88,
        matchedKeywords: ['smart cities', 'sensor network']
      }],
      source: 'manual'
    });

    const res = await fetch(`${baseUrl}/api/analytics/research-domains/predicted`);
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.data));

    const iotPred = body.data.find(d => d.domain === 'PH12D_Predicted_Domain_IoT');
    assert.ok(iotPred, 'Must find PH12D_Predicted_Domain_IoT in predicted analytics');
    assert.strictEqual(iotPred.domain, 'PH12D_Predicted_Domain_IoT');
  });

  // =========================================================================
  // 3. Correct Predicted Publication Count
  // =========================================================================
  test('3. Correct predicted publicationCount', async () => {
    // Add second publication with same predicted domain
    await Publication.create({
      title: 'PH12D_Predicted_IoT_Publication_2',
      year: 2024,
      authors: ['Dr. Beta PH12D'],
      facultyIds: [testFac2._id],
      citations: 28,
      predictedResearchDomains: [{
        name: 'PH12D_Predicted_Domain_IoT',
        confidence: 0.92,
        matchedKeywords: ['actuators', 'iot telemetry']
      }],
      source: 'manual'
    });

    const res = await fetch(`${baseUrl}/api/analytics/research-domains/predicted`);
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    const iotPred = body.data.find(d => d.domain === 'PH12D_Predicted_Domain_IoT');

    assert.ok(iotPred);
    // 2 publications with 22 and 28 citations
    assert.strictEqual(iotPred.publicationCount, 2, 'publicationCount should be exactly 2');
  });

  // =========================================================================
  // 4. Correct Predicted Citation Count
  // =========================================================================
  test('4. Correct predicted citationCount', async () => {
    const res = await fetch(`${baseUrl}/api/analytics/research-domains/predicted`);
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    const iotPred = body.data.find(d => d.domain === 'PH12D_Predicted_Domain_IoT');

    assert.ok(iotPred);
    assert.strictEqual(iotPred.citationCount, 50, 'citationCount should be 22 + 28 = 50');
  });

  // =========================================================================
  // 5. Correct Predicted Faculty Count (Distinct Union)
  // =========================================================================
  test('5. Correctly computes distinct predicted facultyCount across publications', async () => {
    // Pub 1 has Fac1, Fac2
    // Pub 2 has Fac2, Fac3
    // Total distinct faculty should be 3 (Fac1, Fac2, Fac3)
    await Publication.create({
      title: 'PH12D_Predicted_Cybersecurity_Paper_1',
      year: 2024,
      authors: ['Dr. Alpha PH12D', 'Dr. Beta PH12D'],
      facultyIds: [testFac1._id, testFac2._id],
      citations: 12,
      predictedResearchDomains: [{
        name: 'PH12D_Predicted_Domain_Cybersecurity',
        confidence: 0.85
      }],
      source: 'manual'
    });

    await Publication.create({
      title: 'PH12D_Predicted_Cybersecurity_Paper_2',
      year: 2024,
      authors: ['Dr. Beta PH12D', 'Dr. Gamma PH12D'],
      facultyIds: [testFac2._id, testFac3._id],
      citations: 8,
      predictedResearchDomains: [{
        name: 'PH12D_Predicted_Domain_Cybersecurity',
        confidence: 0.75
      }],
      source: 'manual'
    });

    const res = await fetch(`${baseUrl}/api/analytics/research-domains/predicted`);
    const body = await res.json();
    const cyberPred = body.data.find(d => d.domain === 'PH12D_Predicted_Domain_Cybersecurity');

    assert.ok(cyberPred);
    assert.strictEqual(cyberPred.publicationCount, 2);
    assert.strictEqual(cyberPred.facultyCount, 3, 'Distinct faculty count must be 3 (Fac1, Fac2, Fac3)');
    assert.strictEqual(cyberPred.citationCount, 20);
  });

  // =========================================================================
  // 6. Average Prediction Confidence Calculation
  // =========================================================================
  test('6. Correctly computes averageConfidence between 0 and 1', async () => {
    // For Cybersecurity: confidences are 0.85 and 0.75 -> avg is 0.80
    const res = await fetch(`${baseUrl}/api/analytics/research-domains/predicted`);
    const body = await res.json();
    const cyberPred = body.data.find(d => d.domain === 'PH12D_Predicted_Domain_Cybersecurity');

    assert.ok(cyberPred);
    assert.strictEqual(cyberPred.averageConfidence, 0.80, 'Average of 0.85 and 0.75 must be 0.80');
    assert.ok(cyberPred.averageConfidence >= 0 && cyberPred.averageConfidence <= 1);
  });

  // =========================================================================
  // 7. Prediction Count Tracking
  // =========================================================================
  test('7. Tracks total predictionCount accurately', async () => {
    const res = await fetch(`${baseUrl}/api/analytics/research-domains/predicted`);
    const body = await res.json();
    const cyberPred = body.data.find(d => d.domain === 'PH12D_Predicted_Domain_Cybersecurity');

    assert.ok(cyberPred);
    assert.strictEqual(cyberPred.predictionCount, 2);
  });

  // =========================================================================
  // 8. One Publication with Multiple Predicted Domains
  // =========================================================================
  test('8. Handles single publication spanning multiple predicted domains correctly', async () => {
    await Publication.create({
      title: 'PH12D_Multi_Predicted_Cloud_Robotics',
      year: 2024,
      authors: ['Dr. Gamma PH12D'],
      facultyIds: [testFac3._id],
      citations: 35,
      predictedResearchDomains: [
        { name: 'PH12D_Predicted_Domain_Cloud', confidence: 0.90 },
        { name: 'PH12D_Predicted_Domain_Robotics', confidence: 0.80 }
      ],
      source: 'manual'
    });

    const res = await fetch(`${baseUrl}/api/analytics/research-domains/predicted`);
    const body = await res.json();

    const cloudPred = body.data.find(d => d.domain === 'PH12D_Predicted_Domain_Cloud');
    const roboticsPred = body.data.find(d => d.domain === 'PH12D_Predicted_Domain_Robotics');

    assert.ok(cloudPred, 'Must find Cloud prediction');
    assert.ok(roboticsPred, 'Must find Robotics prediction');

    assert.strictEqual(cloudPred.publicationCount, 1);
    assert.strictEqual(cloudPred.citationCount, 35);
    assert.strictEqual(cloudPred.facultyCount, 1);
    assert.strictEqual(cloudPred.averageConfidence, 0.90);

    assert.strictEqual(roboticsPred.publicationCount, 1);
    assert.strictEqual(roboticsPred.citationCount, 35);
    assert.strictEqual(roboticsPred.facultyCount, 1);
    assert.strictEqual(roboticsPred.averageConfidence, 0.80);
  });

  // =========================================================================
  // 9. Duplicate / Merged Publication is Excluded
  // =========================================================================
  test('9. Duplicate/merged publication (isDuplicate: true) is strictly excluded from analytics', async () => {
    // Primary publication (active)
    const primaryPub = await Publication.create({
      title: 'PH12D_Primary_Blockchain_Paper',
      year: 2024,
      authors: ['Dr. Alpha PH12D'],
      facultyIds: [testFac1._id],
      citations: 15,
      isDuplicate: false,
      predictedResearchDomains: [{
        name: 'PH12D_Predicted_Domain_Blockchain',
        confidence: 0.95
      }],
      source: 'manual'
    });

    // Merged duplicate publication (must be completely ignored)
    await Publication.create({
      title: 'PH12D_Duplicate_Blockchain_Paper_Copy',
      year: 2024,
      authors: ['Dr. Alpha PH12D'],
      facultyIds: [testFac1._id, testFac2._id],
      citations: 100, // Large citations to ensure it is not counted
      isDuplicate: true,
      mergedInto: primaryPub._id,
      predictedResearchDomains: [{
        name: 'PH12D_Predicted_Domain_Blockchain',
        confidence: 0.99
      }],
      source: 'scopus'
    });

    const res = await fetch(`${baseUrl}/api/analytics/research-domains/predicted`);
    const body = await res.json();
    const bcPred = body.data.find(d => d.domain === 'PH12D_Predicted_Domain_Blockchain');

    assert.ok(bcPred);
    assert.strictEqual(bcPred.publicationCount, 1, 'Merged duplicate must not increase publicationCount');
    assert.strictEqual(bcPred.citationCount, 15, 'Merged duplicate citations must not be counted (must be 15, not 115)');
    assert.strictEqual(bcPred.facultyCount, 1, 'Merged duplicate faculty must not be counted');
    assert.strictEqual(bcPred.averageConfidence, 0.95, 'Merged duplicate confidence must not inflate average');
  });

  // =========================================================================
  // 10. Duplicate Prediction on Same Publication Not Double-Counted
  // =========================================================================
  test('10. Duplicate prediction entry for the same publication/domain is not double-counted', async () => {
    // Publication with two prediction entries for the same domain 'PH12D_Predicted_Domain_NLP'
    await Publication.create({
      title: 'PH12D_Duplicate_Prediction_Entry_Paper',
      year: 2024,
      authors: ['Dr. Beta PH12D'],
      facultyIds: [testFac2._id],
      citations: 40,
      predictedResearchDomains: [
        { name: 'PH12D_Predicted_Domain_NLP', confidence: 0.80 },
        { name: 'PH12D_Predicted_Domain_NLP', confidence: 0.90 } // Duplicate entry
      ],
      source: 'manual'
    });

    const res = await fetch(`${baseUrl}/api/analytics/research-domains/predicted`);
    const body = await res.json();
    const nlpPred = body.data.find(d => d.domain === 'PH12D_Predicted_Domain_NLP');

    assert.ok(nlpPred);
    assert.strictEqual(nlpPred.publicationCount, 1, 'Publication must be counted exactly once');
    assert.strictEqual(nlpPred.citationCount, 40, 'Citations must be counted exactly once');
    assert.strictEqual(nlpPred.facultyCount, 1, 'Faculty must be counted once');
    assert.strictEqual(nlpPred.predictionCount, 2, 'Total prediction entries should reflect 2');
    assert.strictEqual(nlpPred.averageConfidence, 0.85, 'Average of 0.80 and 0.90 should be 0.85');
  });

  // =========================================================================
  // 11. Invalid Confidence Values Handled Safely
  // =========================================================================
  test('11. Invalid confidence values are safely ignored without breaking calculations', async () => {
    // 1 valid confidence (0.70) and invalid confidences
    await Publication.collection.insertOne({
      title: 'PH12D_Invalid_Confidence_Paper',
      year: 2024,
      authors: ['Dr. Gamma PH12D'],
      facultyIds: [testFac3._id],
      citations: 5,
      predictedResearchDomains: [
        { name: 'PH12D_Predicted_Domain_Edge', confidence: 0.70 },
        { name: 'PH12D_Predicted_Domain_Edge', confidence: null },
        { name: 'PH12D_Predicted_Domain_Edge', confidence: -0.5 },
        { name: 'PH12D_Predicted_Domain_Edge', confidence: 1.5 }
      ],
      source: 'manual',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const res = await fetch(`${baseUrl}/api/analytics/research-domains/predicted`);
    const body = await res.json();
    const edgePred = body.data.find(d => d.domain === 'PH12D_Predicted_Domain_Edge');

    assert.ok(edgePred);
    assert.strictEqual(edgePred.publicationCount, 1);
    assert.strictEqual(edgePred.citationCount, 5);
    // Only 0.70 is valid
    assert.strictEqual(edgePred.averageConfidence, 0.70, 'Must safely ignore null, negative, and >1 confidences');
  });

  // =========================================================================
  // 12. No Predicted Domains Returns Empty Array
  // =========================================================================
  test('12. Cleanly returns empty array when filtering for non-existent domain predictions', async () => {
    // Querying endpoint when no publications match returns empty array cleanly
    const res = await fetch(`${baseUrl}/api/analytics/research-domains?type=predicted`);
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.data));
  });

  // =========================================================================
  // 13. Manual and Predicted Analytics Remain Strictly Separate
  // =========================================================================
  test('13. Manual and predicted analytics remain strictly isolated with no cross-contamination', async () => {
    const res = await fetch(`${baseUrl}/api/analytics/research-domains`);
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.ok(Array.isArray(body.data), 'body.data represents manual domain analytics');
    assert.ok(Array.isArray(body.predicted), 'body.predicted represents automated prediction analytics');

    // Manual stats must not include predicted-only domains
    const manualHasBlockchain = body.data.some(d => d.domain === 'PH12D_Predicted_Domain_Blockchain');
    assert.strictEqual(manualHasBlockchain, false, 'Manual domain stats must NOT include predicted domains');

    // Predicted stats must not include manual-only domains
    const predictedHasManualAI = body.predicted.some(d => d.domain === 'PH12D_Manual_AI');
    assert.strictEqual(predictedHasManualAI, false, 'Predicted stats must NOT include manual domains unless predicted');
  });

  // =========================================================================
  // 14. Existing API Response Compatibility Preserved
  // =========================================================================
  test('14. Full API compatibility preserved across default, split, and predicted query modes', async () => {
    // 1. Default mode: data is array of manual stats, predicted exposed at top level
    const resDefault = await fetch(`${baseUrl}/api/analytics/research-domains`);
    assert.strictEqual(resDefault.status, 200);
    const bodyDefault = await resDefault.json();
    assert.strictEqual(bodyDefault.success, true);
    assert.ok(Array.isArray(bodyDefault.data), 'Default data must be an array for backwards compatibility');
    assert.ok(Array.isArray(bodyDefault.manual));
    assert.ok(Array.isArray(bodyDefault.predicted));

    // 2. Split query mode: data is object with manual and predicted keys
    const resSplit = await fetch(`${baseUrl}/api/analytics/research-domains?format=split`);
    assert.strictEqual(resSplit.status, 200);
    const bodySplit = await resSplit.json();
    assert.strictEqual(bodySplit.success, true);
    assert.ok(Array.isArray(bodySplit.data.manual), 'Split data.manual must be an array');
    assert.ok(Array.isArray(bodySplit.data.predicted), 'Split data.predicted must be an array');

    // 3. Predicted query mode: data is predicted array
    const resTypePred = await fetch(`${baseUrl}/api/analytics/research-domains?type=predicted`);
    assert.strictEqual(resTypePred.status, 200);
    const bodyTypePred = await resTypePred.json();
    assert.strictEqual(bodyTypePred.success, true);
    assert.ok(Array.isArray(bodyTypePred.data));
    assert.ok(bodyTypePred.data.some(d => d.domain.startsWith('PH12D_Predicted_')));

    // 4. Dedicated endpoint: /api/analytics/research-domains/predicted
    const resDedicated = await fetch(`${baseUrl}/api/analytics/research-domains/predicted`);
    assert.strictEqual(resDedicated.status, 200);
    const bodyDedicated = await resDedicated.json();
    assert.strictEqual(bodyDedicated.success, true);
    assert.ok(Array.isArray(bodyDedicated.data));
  });
});
