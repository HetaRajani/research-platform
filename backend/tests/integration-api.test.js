const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const express = require('express');

const healthRoutes = require('../routes/health.routes');
const facultyRoutes = require('../routes/faculty.routes');
const publicationRoutes = require('../routes/publication.routes');
const importRoutes = require('../routes/import.routes');
const integrationRoutes = require('../routes/integration.routes');
const { errorHandler } = require('../middleware/errorHandler');

const Publication = require('../models/Publication');
const DuplicateReview = require('../models/DuplicateReview');
const Faculty = require('../models/Faculty');

const { getTestDatabaseUri } = require('./testDatabase');
const TEST_DB_URI = getTestDatabaseUri();

describe('Phase 11D — Integration HTTP API & Deduplication Endpoints', () => {
  let app;
  let server;
  let baseUrl;
  let faculty;

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
    app.use('/api/import', importRoutes);
    app.use('/api/integrations', integrationRoutes);
    app.use(errorHandler);

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });

    // Cleanup & seed faculty
    await Publication.deleteMany({ title: { $regex: /^API_TEST_/ } });
    await DuplicateReview.deleteMany({});
    await Faculty.deleteMany({ facultyCode: 'API_FAC_001' });

    faculty = await Faculty.create({
      facultyCode: 'API_FAC_001',
      name: 'Dr. API Test Professor',
      email: 'api.test@university.edu',
      department: 'Electrical Engineering',
      designation: 'Associate Professor',
      orcidId: '0000-0002-1825-0097',
      scopusId: '57200000002',
      googleScholarId: 'QCxP0cAAAAAJ'
    });
  });

  after(async () => {
    await Publication.deleteMany({ title: { $regex: /^API_TEST_/ } });
    await DuplicateReview.deleteMany({});
    await Faculty.deleteMany({ facultyCode: 'API_FAC_001' });
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    await mongoose.connection.close();
  });

  test('GET /api/import/sources returns supported sources', async () => {
    const res = await fetch(`${baseUrl}/api/import/sources`);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.ok(json.data.includes('manual'));
    assert.ok(json.data.includes('orcid'));
    assert.ok(json.data.includes('scopus'));
    assert.ok(json.data.includes('google_scholar'));
  });

  test('POST /api/import/publications imports new publication and handles exact duplicates', async () => {
    // 1. Initial import of publication
    const res1 = await fetch(`${baseUrl}/api/import/publications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'manual',
        publications: [
          {
            title: 'API_TEST_Autonomous Swarm Robotics Optimization',
            year: 2024,
            authors: ['Grace Kelly'],
            doi: '10.2000/api.swarm.001',
            journal: 'Swarm Intelligence'
          }
        ]
      })
    });

    assert.strictEqual(res1.status, 201);
    const json1 = await res1.json();
    assert.strictEqual(json1.success, true);
    assert.strictEqual(json1.count, 1);
    assert.strictEqual(json1.duplicates.length, 0);

    // 2. Duplicate re-import of same publication
    const res2 = await fetch(`${baseUrl}/api/import/publications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'manual',
        publications: [
          {
            title: 'API_TEST_Autonomous Swarm Robotics Optimization',
            year: 2024,
            authors: ['G. Kelly'],
            doi: '10.2000/api.swarm.001',
            journal: 'Swarm Intelligence'
          }
        ]
      })
    });

    assert.strictEqual(res2.status, 200);
    const json2 = await res2.json();
    assert.strictEqual(json2.success, true);
    assert.strictEqual(json2.count, 0, 'No publication should be created');
    assert.strictEqual(json2.duplicates.length, 1);
    assert.strictEqual(json2.duplicates[0].isDuplicate, true);
    assert.strictEqual(json2.duplicates[0].confidence, 'high');
    assert.ok(json2.duplicates[0].matchingSignals.some(s => s.includes('IDENTICAL_DOI')));
  });

  test('POST /api/integrations/google-scholar/:facultyId/import imports with deduplication', async () => {
    const res = await fetch(`${baseUrl}/api/integrations/google-scholar/${faculty._id}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publications: [
          {
            title: 'API_TEST_Scholar Deep Reinforcement Learning',
            year: 2024,
            authors: ['Dr. API Test Professor'],
            venue: 'ICML 2024'
          }
        ]
      })
    });

    assert.strictEqual(res.status, 201);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.count, 1);
    assert.strictEqual(json.source, 'google_scholar');
  });

  test('POST /api/integrations/orcid/:facultyId/import imports with deduplication', async () => {
    const res = await fetch(`${baseUrl}/api/integrations/orcid/${faculty._id}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publications: [
          {
            title: 'API_TEST_ORCID Work on Quantum Circuits',
            year: 2024,
            authors: ['Dr. API Test Professor'],
            venue: 'IEEE Quantum'
          }
        ]
      })
    });

    assert.strictEqual(res.status, 201);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.count, 1);
    assert.strictEqual(json.source, 'orcid');
  });

  test('POST /api/integrations/scopus/:facultyId/import imports with deduplication', async () => {
    const res = await fetch(`${baseUrl}/api/integrations/scopus/${faculty._id}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publications: [
          {
            title: 'API_TEST_Scopus Publication on Edge AI',
            year: 2024,
            authors: ['Dr. API Test Professor'],
            venue: 'Elsevier Edge Computing'
          }
        ]
      })
    });

    assert.strictEqual(res.status, 201);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.count, 1);
    assert.strictEqual(json.source, 'scopus');
  });

  test('GET /api/integrations/orcid/:facultyId returns proper error when faculty not found', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await fetch(`${baseUrl}/api/integrations/orcid/${fakeId}`);
    assert.strictEqual(res.status, 404);
  });

  test('GET /api/integrations/scopus/:facultyId returns 503 when API key not configured', async () => {
    // Unless valid SCOPUS_API_KEY is configured in env, it should cleanly return 503 with configured: false
    const res = await fetch(`${baseUrl}/api/integrations/scopus/${faculty._id}`);
    assert.ok(res.status === 503 || res.status === 200 || res.status === 502);
    const json = await res.json();
    if (res.status === 503) {
      assert.strictEqual(json.configured, false);
      assert.strictEqual(json.code, 'SCOPUS_API_KEY_MISSING');
    }
  });

  test('GET /api/integrations/google-scholar/:facultyId returns 503 when provider not configured', async () => {
    const res = await fetch(`${baseUrl}/api/integrations/google-scholar/${faculty._id}`);
    assert.ok(res.status === 503 || res.status === 200 || res.status === 502);
    const json = await res.json();
    if (res.status === 503) {
      assert.strictEqual(json.configured, false);
      assert.strictEqual(json.code, 'SCHOLAR_PROVIDER_NOT_CONFIGURED');
    }
  });
});
