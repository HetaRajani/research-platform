const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const express = require('express');

const analyticsRoutes = require('../routes/analytics.routes');
const { errorHandler } = require('../middleware/errorHandler');
const Faculty = require('../models/Faculty');
const Publication = require('../models/Publication');
const ResearchDomain = require('../models/ResearchDomain');
const { detectIntent } = require('../services/researchAssistant.service');

const TEST_DB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/research_platform_test';

describe('Phase 16A — Rule-Based Research Assistant', () => {
  let server;
  let baseUrl;
  let faculty;
  let partner;
  let domain;

  const createFaculty = (code, name) => Faculty.create({
    facultyCode: `PH16A_${code}`,
    name,
    email: `ph16a_${code.toLowerCase()}@university.edu`,
    designation: 'Professor',
    department: 'Computer Science'
  });

  const cleanFixtures = async () => {
    const facultyDocs = await Faculty.find({ facultyCode: { $regex: /^PH16A_/ } }).select('_id').lean();
    const facultyIds = facultyDocs.map(item => item._id);
    if (facultyIds.length) await Publication.deleteMany({ facultyIds: { $in: facultyIds } });
    await Faculty.deleteMany({ facultyCode: { $regex: /^PH16A_/ } });
    await ResearchDomain.deleteMany({ name: { $regex: /^PH16A_/ } });
  };

  const postQuestion = (question, extra = {}) => fetch(`${baseUrl}/research-assistant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, ...extra })
  });

  before(async () => {
    if (mongoose.connection.readyState === 0) await mongoose.connect(TEST_DB_URI);

    const app = express();
    app.use(express.json());
    app.use('/api/analytics', analyticsRoutes);
    app.use(errorHandler);
    await new Promise(resolve => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}/api/analytics`;
        resolve();
      });
    });

    await cleanFixtures();
    [faculty, partner] = await Promise.all([
      createFaculty('TARGET', 'Assistant Test Faculty'),
      createFaculty('PARTNER', 'Assistant Test Partner')
    ]);
    domain = await ResearchDomain.create({ name: 'PH16A_Research Domain' });
    await Publication.create([
      {
        title: 'PH16A_Target_2024', year: 2024, facultyIds: [faculty._id],
        citations: 10, researchDomains: [domain._id],
        predictedResearchDomains: [{ name: 'PH16A_Predicted Domain' }]
      },
      {
        title: 'PH16A_Target_2025', year: 2025, facultyIds: [faculty._id],
        citations: 20, researchDomains: [domain._id],
        predictedResearchDomains: [{ name: 'PH16A_Predicted Domain' }]
      },
      {
        title: 'PH16A_Partner_2025', year: 2025, facultyIds: [partner._id],
        researchDomains: [domain._id],
        predictedResearchDomains: [{ name: 'PH16A_Predicted Domain' }]
      },
      {
        title: 'PH16A_Duplicate_2025', year: 2025, facultyIds: [faculty._id],
        citations: 10000, researchDomains: [domain._id],
        predictedResearchDomains: [{ name: 'PH16A_Duplicate Domain' }],
        isDuplicate: true
      }
    ]);
  });

  after(async () => {
    await cleanFixtures();
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.connection.close();
  });

  test('detects publication-count questions', () => {
    assert.strictEqual(detectIntent('Show publications of faculty X'), 'PUBLICATION_COUNT');
  });

  test('detects citation-statistics questions', () => {
    assert.strictEqual(detectIntent('How many citations do we have?'), 'CITATION_STATISTICS');
  });

  test('detects research-domain questions', () => {
    assert.strictEqual(detectIntent('What research domains are represented?'), 'RESEARCH_DOMAINS');
  });

  test('detects emerging-research questions', () => {
    assert.strictEqual(detectIntent('What are the emerging research areas?'), 'EMERGING_RESEARCH');
  });

  test('detects collaborator questions', () => {
    assert.strictEqual(detectIntent('Who can collaborate with this faculty?'), 'COLLABORATOR_RECOMMENDATIONS');
  });

  test('detects productivity-forecast questions', () => {
    assert.strictEqual(detectIntent('What is the productivity forecast?'), 'PRODUCTIVITY_FORECAST');
  });

  test('detects help and returns unknown for unsupported questions', () => {
    assert.strictEqual(detectIntent('Help, what can you do?'), 'HELP');
    assert.strictEqual(detectIntent('What is the weather tomorrow?'), 'UNKNOWN');
  });

  test('missing question returns HTTP 400', async () => {
    const response = await fetch(`${baseUrl}/research-assistant`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.strictEqual(response.status, 400);
  });

  test('empty question returns HTTP 400', async () => {
    assert.strictEqual((await postQuestion('   ')).status, 400);
  });

  test('non-string question returns HTTP 400', async () => {
    const response = await fetch(`${baseUrl}/research-assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 42 })
    });
    assert.strictEqual(response.status, 400);
  });

  test('faculty context is used for collaborator recommendations', async () => {
    const response = await postQuestion('Who can collaborate with me?', { facultyId: faculty._id.toString() });
    const body = await response.json();
    assert.strictEqual(body.data.intent, 'COLLABORATOR_RECOMMENDATIONS');
    assert.ok(body.data.data.some(item => item.facultyId === partner._id.toString()));
  });

  test('faculty context is used for productivity forecasts', async () => {
    const response = await postQuestion('What is my productivity forecast?', { facultyId: faculty._id.toString() });
    const body = await response.json();
    assert.strictEqual(body.data.intent, 'PRODUCTIVITY_FORECAST');
    assert.strictEqual(body.data.data.facultyId, faculty._id.toString());
  });

  test('faculty-specific wording requests an ID rather than guessing a person', async () => {
    const response = await postQuestion('Show publications of faculty X');
    const body = await response.json();
    assert.strictEqual(response.status, 200);
    assert.strictEqual(body.data.intent, 'PUBLICATION_COUNT');
    assert.match(body.data.answer, /provide a facultyId/);
    assert.strictEqual(body.data.data, null);
  });

  test('malformed facultyId returns HTTP 400', async () => {
    assert.strictEqual((await postQuestion('Who can collaborate with me?', { facultyId: 'bad-id' })).status, 400);
    assert.strictEqual((await postQuestion('Who can collaborate with me?', { facultyId: '' })).status, 400);
  });

  test('missing faculty returns HTTP 404', async () => {
    const response = await postQuestion('What is my productivity forecast?', {
      facultyId: new mongoose.Types.ObjectId().toString()
    });
    assert.strictEqual(response.status, 404);
  });

  test('answer response contains intent, readable answer, structured data, and sources', async () => {
    const response = await postQuestion('What is the productivity forecast?', { facultyId: faculty._id.toString() });
    const body = await response.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.intent, 'PRODUCTIVITY_FORECAST');
    assert.strictEqual(typeof body.data.answer, 'string');
    assert.ok(body.data.data && typeof body.data.data === 'object');
    assert.deepStrictEqual(body.data.sources, ['productivityForecast.service']);
  });

  test('publication and citation answers reuse current overview analytics data', async () => {
    const overviewResponse = await fetch(`${baseUrl}/overview`);
    const overview = (await overviewResponse.json()).data;
    const publicationsResponse = await postQuestion('How many publications are in the platform?');
    const citationsResponse = await postQuestion('How many citations are in the platform?');
    const publicationsAnswer = (await publicationsResponse.json()).data;
    const citationsAnswer = (await citationsResponse.json()).data;

    assert.strictEqual(publicationsAnswer.data.totalPublications, overview.totalPublications);
    assert.strictEqual(citationsAnswer.data.totalCitations, overview.totalCitations);
    assert.strictEqual(citationsAnswer.data.averageCitations, overview.averageCitations);
  });

  test('research-domain answer reuses existing split analytics data', async () => {
    const analyticsResponse = await fetch(`${baseUrl}/research-domains?format=split`);
    const existingDomains = (await analyticsResponse.json()).data;
    const assistantResponse = await postQuestion('What research domains are represented?');
    const assistantDomains = (await assistantResponse.json()).data.data;
    assert.deepStrictEqual(assistantDomains, existingDomains);
  });

  test('emerging-research answers summarize only the returned result data', async () => {
    const response = await postQuestion('What are the emerging research areas?');
    const body = await response.json();
    const emergingCount = body.data.data.filter(item => item.isEmerging).length;
    assert.match(body.data.answer, new RegExp(`identified ${emergingCount} emerging research`));
    assert.deepStrictEqual(body.data.sources, ['emergingResearch.service']);
  });

  test('unsupported questions return helpful guidance without analytics claims', async () => {
    const response = await postQuestion('What is the weather tomorrow?');
    const body = await response.json();
    assert.strictEqual(body.data.intent, 'UNKNOWN');
    assert.match(body.data.answer, /publications, citations, research domains/);
    assert.strictEqual(body.data.data, null);
    assert.deepStrictEqual(body.data.sources, []);
  });
});