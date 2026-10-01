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
const Collaboration = require('../models/Collaboration');
const recommendationService = require('../services/collaboratorRecommendation.service');

const TEST_DB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/research_platform_test';

describe('Phase 14A — Collaborator Recommendations', () => {
  let server;
  let baseUrl;
  let target;
  let alpha;
  let beta;
  let gamma;
  let delta;
  let zeta;
  let duplicateOnly;
  let unmatched;
  let aiDomain;
  let mlDomain;

  const createFaculty = (code, name) => Faculty.create({
    facultyCode: `PH14A_${code}`,
    name,
    email: `ph14a_${code.toLowerCase()}@university.edu`,
    designation: 'Professor',
    department: 'Computer Science'
  });

  const cleanFixtures = async () => {
    const fixtureFaculty = await Faculty.find({ facultyCode: { $regex: /^PH14A_/ } }).select('_id').lean();
    const fixtureIds = fixtureFaculty.map(item => item._id);
    if (fixtureIds.length) {
      await Collaboration.deleteMany({
        $or: [
          { faculty1: { $in: fixtureIds } },
          { faculty2: { $in: fixtureIds } }
        ]
      });
    }
    await Publication.deleteMany({ title: { $regex: /^PH14A_/ } });
    await Faculty.deleteMany({ facultyCode: { $regex: /^PH14A_/ } });
    await ResearchDomain.deleteMany({ name: { $regex: /^PH14A_/ } });
  };

  before(async () => {
    if (mongoose.connection.readyState === 0) await mongoose.connect(TEST_DB_URI);

    const app = express();
    app.use('/api/analytics', analyticsRoutes);
    app.use(errorHandler);
    await new Promise(resolve => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}/api/analytics`;
        resolve();
      });
    });

    await cleanFixtures();

    [target, alpha, beta, gamma, delta, zeta, duplicateOnly, unmatched] = await Promise.all([
      createFaculty('TARGET', 'Target Faculty'),
      createFaculty('ALPHA', 'Alpha Collaborator'),
      createFaculty('BETA', 'Beta Collaborator'),
      createFaculty('GAMMA', 'Gamma Collaborator'),
      createFaculty('DELTA', 'Delta Collaborator'),
      createFaculty('ZETA', 'Zeta Collaborator'),
      createFaculty('DUPLICATE', 'Duplicate-Only Collaborator'),
      createFaculty('UNMATCHED', 'Unmatched Faculty')
    ]);
    [aiDomain, mlDomain] = await Promise.all([
      ResearchDomain.create({ name: 'PH14A_Artificial Intelligence' }),
      ResearchDomain.create({ name: 'PH14A_Machine Learning' })
    ]);

    await Publication.create([
      {
        title: 'PH14A_Target_Profile', year: 2024, facultyIds: [target._id],
        researchDomains: [aiDomain._id, mlDomain._id],
        predictedResearchDomains: [{ name: 'PH14A_Predicted Domain' }]
      },
      {
        title: 'PH14A_Alpha_Profile', year: 2024, facultyIds: [alpha._id],
        researchDomains: [aiDomain._id, mlDomain._id],
        predictedResearchDomains: [{ name: 'PH14A_Predicted Domain' }]
      },
      {
        title: 'PH14A_Beta_Profile_1', year: 2024, facultyIds: [beta._id, beta._id],
        researchDomains: [aiDomain._id, aiDomain._id],
        predictedResearchDomains: [{ name: 'PH14A_Artificial Intelligence' }, { name: 'PH14A_Artificial Intelligence' }]
      },
      {
        title: 'PH14A_Beta_Profile_2', year: 2025, facultyIds: [beta._id],
        researchDomains: [aiDomain._id]
      },
      {
        title: 'PH14A_Gamma_Profile', year: 2024, facultyIds: [gamma._id],
        predictedResearchDomains: [{ name: 'PH14A_Predicted Domain' }]
      },
      {
        title: 'PH14A_Delta_Profile', year: 2024, facultyIds: [delta._id],
        researchDomains: [aiDomain._id],
        predictedResearchDomains: [{ name: 'PH14A_Predicted Domain' }]
      },
      {
        title: 'PH14A_Zeta_Profile', year: 2024, facultyIds: [zeta._id],
        researchDomains: [aiDomain._id]
      },
      {
        title: 'PH14A_Duplicate_Only_Profile', year: 2024,
        facultyIds: [target._id, duplicateOnly._id],
        predictedResearchDomains: [{ name: 'PH14A_Duplicate Only Domain' }],
        isDuplicate: true
      },
      {
        title: 'PH14A_Duplicate_Score_Inflation', year: 2025,
        facultyIds: [target._id, beta._id],
        predictedResearchDomains: [{ name: 'PH14A_Duplicate Only Domain' }],
        isDuplicate: true
      }
    ]);

    await Collaboration.create({
      faculty1: target._id,
      faculty2: alpha._id,
      commonDomains: ['PH14A_Artificial Intelligence'],
      publicationCount: 3
    });
  });

  after(async () => {
    await cleanFixtures();
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.connection.close();
  });

  test('a valid faculty receives recommendations without private profile fields', async () => {
    const recommendations = await recommendationService.getCollaboratorRecommendations(target._id);
    assert.ok(recommendations.length > 0);
    assert.ok(recommendations.every(item => item.facultyId && item.name && item.score > 0));
    assert.ok(recommendations.every(item => !Object.hasOwn(item, 'email')));
  });

  test('the target faculty is never recommended to themselves', async () => {
    const recommendations = await recommendationService.getCollaboratorRecommendations(target._id);
    assert.ok(recommendations.every(item => item.facultyId !== target._id.toString()));
  });

  test('shared research domains produce a recommendation', async () => {
    const recommendations = await recommendationService.getCollaboratorRecommendations(target._id);
    const betaRecommendation = recommendations.find(item => item.facultyId === beta._id.toString());
    assert.ok(betaRecommendation);
    assert.ok(betaRecommendation.sharedDomains.includes('PH14A_Artificial Intelligence'));
  });

  test('multiple distinct shared domains increase the score', async () => {
    const recommendations = await recommendationService.getCollaboratorRecommendations(target._id);
    const alphaRecommendation = recommendations.find(item => item.facultyId === alpha._id.toString());
    const betaRecommendation = recommendations.find(item => item.facultyId === beta._id.toString());
    assert.strictEqual(alphaRecommendation.score, 3);
    assert.strictEqual(alphaRecommendation.sharedDomainCount, 3);
    assert.strictEqual(betaRecommendation.score, 1);
    assert.strictEqual(betaRecommendation.sharedDomainCount, 1);
  });

  test('repeated domain entries do not increase the score twice', async () => {
    const recommendations = await recommendationService.getCollaboratorRecommendations(target._id);
    const betaRecommendation = recommendations.find(item => item.facultyId === beta._id.toString());
    assert.strictEqual(betaRecommendation.score, 1);
    assert.deepStrictEqual(betaRecommendation.sharedDomains, ['PH14A_Artificial Intelligence']);
    assert.strictEqual(betaRecommendation.sharedDomainCount, 1);
    assert.strictEqual(betaRecommendation.existingCollaboration, false);
    assert.strictEqual(betaRecommendation.collaborationCount, 0);
    assert.strictEqual(
      betaRecommendation.recommendationReason,
      'Shares research domains (PH14A_Artificial Intelligence) but has no recorded collaboration.'
    );
  });

  test('duplicate publications do not add shared domains or inflate scores', async () => {
    const recommendations = await recommendationService.getCollaboratorRecommendations(target._id);
    const betaRecommendation = recommendations.find(item => item.facultyId === beta._id.toString());
    assert.strictEqual(betaRecommendation.score, 1);
    assert.ok(!recommendations.some(item => item.facultyId === duplicateOnly._id.toString()));
    assert.ok(!betaRecommendation.sharedDomains.includes('PH14A_Duplicate Only Domain'));
  });

  test('repeated faculty IDs and publications produce one recommendation per faculty', async () => {
    const recommendations = await recommendationService.getCollaboratorRecommendations(target._id);
    assert.strictEqual(recommendations.filter(item => item.facultyId === beta._id.toString()).length, 1);
  });

  test('manual research domains produce recommendations', async () => {
    const recommendations = await recommendationService.getCollaboratorRecommendations(target._id);
    const alphaRecommendation = recommendations.find(item => item.facultyId === alpha._id.toString());
    assert.ok(alphaRecommendation.sharedDomains.includes('PH14A_Machine Learning'));
    const machineLearning = alphaRecommendation.sharedDomainDetails.find(domain => domain.name === 'PH14A_Machine Learning');
    assert.deepStrictEqual(machineLearning.targetSources, ['manual']);
    assert.deepStrictEqual(machineLearning.candidateSources, ['manual']);
  });

  test('predicted research domains produce recommendations and retain their source', async () => {
    const recommendations = await recommendationService.getCollaboratorRecommendations(target._id);
    const gammaRecommendation = recommendations.find(item => item.facultyId === gamma._id.toString());
    assert.ok(gammaRecommendation.sharedDomains.includes('PH14A_Predicted Domain'));
    const predictedDomain = gammaRecommendation.sharedDomainDetails.find(domain => domain.name === 'PH14A_Predicted Domain');
    assert.deepStrictEqual(predictedDomain.targetSources, ['predicted']);
    assert.deepStrictEqual(predictedDomain.candidateSources, ['predicted']);
  });

  test('a faculty member with no matching domains receives an empty list', async () => {
    assert.deepStrictEqual(await recommendationService.getCollaboratorRecommendations(unmatched._id), []);
  });

  test('malformed faculty IDs return HTTP 400', async () => {
    const response = await fetch(`${baseUrl}/collaborator-recommendations/abcdefghijkl`);
    assert.strictEqual(response.status, 400);
    assert.strictEqual((await response.json()).success, false);
  });

  test('valid but missing faculty IDs return HTTP 404', async () => {
    const missingId = new mongoose.Types.ObjectId();
    const response = await fetch(`${baseUrl}/collaborator-recommendations/${missingId}`);
    assert.strictEqual(response.status, 404);
    assert.strictEqual((await response.json()).success, false);
  });

  test('recommendations are sorted by score descending', async () => {
    const recommendations = await recommendationService.getCollaboratorRecommendations(target._id);
    assert.deepStrictEqual(recommendations.map(item => item.score), [3, 2, 1, 1, 1]);
  });

  test('equal scores use faculty name ascending as a deterministic tie-breaker', async () => {
    const recommendations = await recommendationService.getCollaboratorRecommendations(target._id);
    const tied = recommendations.filter(item => item.score === 1).map(item => item.name);
    assert.deepStrictEqual(tied, ['Beta Collaborator', 'Gamma Collaborator', 'Zeta Collaborator']);
  });

  test('existing collaboration is reported separately and does not change score', async () => {
    const recommendations = await recommendationService.getCollaboratorRecommendations(target._id);
    const alphaRecommendation = recommendations.find(item => item.facultyId === alpha._id.toString());
    assert.strictEqual(alphaRecommendation.existingCollaboration, true);
    assert.strictEqual(alphaRecommendation.collaborationCount, 3);
    assert.strictEqual(alphaRecommendation.score, 3);
    assert.strictEqual(
      alphaRecommendation.recommendationReason,
      'Shares research domains (PH14A_Artificial Intelligence, PH14A_Machine Learning, PH14A_Predicted Domain) and has an existing collaboration.'
    );
  });

  test('the analytics endpoint returns structured recommendation results', async () => {
    const response = await fetch(`${baseUrl}/collaborator-recommendations/${target._id}`);
    const body = await response.json();
    assert.strictEqual(response.status, 200);
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.deepStrictEqual(Object.keys(body.data[0]).sort(), [
      'collaborationCount', 'existingCollaboration', 'facultyId', 'name', 'reason', 'recommendationReason',
      'score', 'sharedDomainCount', 'sharedDomainDetails', 'sharedDomains'
    ].sort());
    const alphaRecommendation = body.data.find(item => item.facultyId === alpha._id.toString());
    assert.strictEqual(alphaRecommendation.score, 3);
    assert.strictEqual(alphaRecommendation.sharedDomainCount, 3);
    assert.strictEqual(alphaRecommendation.collaborationCount, 3);
    assert.strictEqual(alphaRecommendation.existingCollaboration, true);
  });
});