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
const { forecastFromHistoricalData } = require('../services/productivityForecast.service');

const { getTestDatabaseUri } = require('./testDatabase');
const TEST_DB_URI = getTestDatabaseUri();

describe('Phase 15A — Productivity Forecasting Baseline', () => {
  let server;
  let baseUrl;
  let faculty;
  let insufficientFaculty;

  const createFaculty = (code, name) => Faculty.create({
    facultyCode: `PH15A_${code}`,
    name,
    email: `ph15a_${code.toLowerCase()}@university.edu`,
    designation: 'Professor',
    department: 'Computer Science'
  });

  const cleanFixtures = async () => {
    const fixtures = await Faculty.find({ facultyCode: { $regex: /^PH15A_/ } }).select('_id').lean();
    const facultyIds = fixtures.map(item => item._id);
    if (facultyIds.length) await Publication.deleteMany({ facultyIds: { $in: facultyIds } });
    await Faculty.deleteMany({ facultyCode: { $regex: /^PH15A_/ } });
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
    [faculty, insufficientFaculty] = await Promise.all([
      createFaculty('VALID', 'Forecast Test Faculty'),
      createFaculty('INSUFFICIENT', 'Insufficient History Faculty')
    ]);

    const publications = [];
    for (const [year, count] of [[2022, 3], [2023, 4], [2024, 5], [2025, 7]]) {
      for (let index = 0; index < count; index += 1) {
        publications.push({
          title: `PH15A_VALID_${year}_${index}`,
          year,
          facultyIds: [faculty._id]
        });
      }
    }
    publications.push(
      {
        title: 'PH15A_VALID_DUPLICATE_2025',
        year: 2025,
        facultyIds: [faculty._id],
        isDuplicate: true
      },
      {
        title: 'PH15A_INSUFFICIENT_2025',
        year: 2025,
        facultyIds: [insufficientFaculty._id]
      }
    );
    await Publication.create(publications);
  });

  after(async () => {
    await cleanFixtures();
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.connection.close();
  });

  test('calculates a normal least-squares forecast from historical counts', () => {
    const result = forecastFromHistoricalData([
      { year: 2022, publicationCount: 3 },
      { year: 2023, publicationCount: 4 },
      { year: 2024, publicationCount: 5 },
      { year: 2025, publicationCount: 7 }
    ]);

    assert.strictEqual(result.forecastPublicationCount, 8);
    assert.strictEqual(result.forecastAvailable, true);
  });

  test('identifies an increasing publication trend', () => {
    const result = forecastFromHistoricalData([
      { year: 2022, publicationCount: 1 },
      { year: 2023, publicationCount: 2 },
      { year: 2024, publicationCount: 4 }
    ]);
    assert.strictEqual(result.trendDirection, 'growing');
  });

  test('identifies a decreasing publication trend', () => {
    const result = forecastFromHistoricalData([
      { year: 2022, publicationCount: 8 },
      { year: 2023, publicationCount: 5 },
      { year: 2024, publicationCount: 2 }
    ]);
    assert.strictEqual(result.trendDirection, 'declining');
  });

  test('identifies a stable trend within the configured tolerance', () => {
    const result = forecastFromHistoricalData([
      { year: 2020, publicationCount: 1 },
      { year: 2040, publicationCount: 2 }
    ]);
    assert.strictEqual(result.trendDirection, 'stable');
  });

  test('generates a forecast with the two-year minimum history', () => {
    const result = forecastFromHistoricalData([
      { year: 2024, publicationCount: 2 },
      { year: 2025, publicationCount: 5 }
    ]);
    assert.strictEqual(result.forecastAvailable, true);
    assert.strictEqual(result.forecastYear, 2026);
    assert.strictEqual(result.forecastPublicationCount, 8);
  });

  test('returns a clear unavailable result with insufficient history', () => {
    const result = forecastFromHistoricalData([{ year: 2025, publicationCount: 3 }]);
    assert.strictEqual(result.forecastAvailable, false);
    assert.strictEqual(result.forecastYear, 2026);
    assert.strictEqual(result.forecastPublicationCount, null);
    assert.match(result.message, /two historical publication years/);
    assert.strictEqual(result.rSquared, null);
    assert.strictEqual(result.forecastSummary, 'Insufficient historical publication data for forecasting.');
  });

  test('clamps a negative linear projection to zero', () => {
    const result = forecastFromHistoricalData([
      { year: 2022, publicationCount: 100 },
      { year: 2023, publicationCount: 0 }
    ]);
    assert.strictEqual(result.forecastPublicationCount, 0);
    assert.strictEqual(result.trendDirection, 'declining');
  });

  test('rounds forecast values to two decimal places', () => {
    const result = forecastFromHistoricalData([
      { year: 2022, publicationCount: 1 },
      { year: 2023, publicationCount: 2 },
      { year: 2024, publicationCount: 2 }
    ]);
    assert.strictEqual(result.forecastPublicationCount, 2.67);
  });

  test('calculates forecast year as one after the latest historical year', () => {
    const result = forecastFromHistoricalData([
      { year: 2021, publicationCount: 1 },
      { year: 2024, publicationCount: 4 }
    ]);
    assert.strictEqual(result.forecastYear, 2025);
  });

  test('reports historical counts, average, and rounded annual change', () => {
    const result = forecastFromHistoricalData([
      { year: 2022, publicationCount: 3 },
      { year: 2023, publicationCount: 4 },
      { year: 2024, publicationCount: 5 },
      { year: 2025, publicationCount: 7 }
    ]);

    assert.strictEqual(result.historicalYearCount, 4);
    assert.strictEqual(result.historicalPublicationCount, 19);
    assert.strictEqual(result.averageAnnualPublications, 4.75);
    assert.strictEqual(result.annualChange, 1.3);
  });

  test('reports R-squared as a rounded value between zero and one', () => {
    const result = forecastFromHistoricalData([
      { year: 2022, publicationCount: 3 },
      { year: 2023, publicationCount: 4 },
      { year: 2024, publicationCount: 5 },
      { year: 2025, publicationCount: 7 }
    ]);

    assert.strictEqual(result.rSquared, 0.97);
    assert.ok(result.rSquared >= 0 && result.rSquared <= 1);
  });

  test('a perfectly linear historical trend has R-squared of one', () => {
    const result = forecastFromHistoricalData([
      { year: 2022, publicationCount: 1 },
      { year: 2023, publicationCount: 2 },
      { year: 2024, publicationCount: 3 }
    ]);

    assert.strictEqual(result.rSquared, 1);
  });

  test('constant and zero-count histories safely use an R-squared of zero', () => {
    const result = forecastFromHistoricalData([
      { year: 2022, publicationCount: 0 },
      { year: 2023, publicationCount: 0 },
      { year: 2024, publicationCount: 0 }
    ]);

    assert.strictEqual(result.rSquared, 0);
    assert.strictEqual(result.historicalPublicationCount, 0);
    assert.strictEqual(result.averageAnnualPublications, 0);
    assert.strictEqual(result.annualChange, 0);
    assert.strictEqual(result.trendDirection, 'stable');
  });

  test('summarizes growing, declining, and stable trends deterministically', () => {
    const growing = forecastFromHistoricalData([
      { year: 2022, publicationCount: 1 }, { year: 2023, publicationCount: 2 }
    ]);
    const declining = forecastFromHistoricalData([
      { year: 2022, publicationCount: 2 }, { year: 2023, publicationCount: 1 }
    ]);
    const stable = forecastFromHistoricalData([
      { year: 2022, publicationCount: 2 }, { year: 2023, publicationCount: 2 }
    ]);

    assert.strictEqual(growing.forecastSummary, 'Historical publication activity shows a growing trend.');
    assert.strictEqual(declining.forecastSummary, 'Historical publication activity shows a declining trend.');
    assert.strictEqual(stable.forecastSummary, 'Historical publication activity is relatively stable.');
  });

  test('ignores missing and invalid years when calculating historical metadata', () => {
    const result = forecastFromHistoricalData([
      { year: 2022, publicationCount: 2 },
      { year: null, publicationCount: 100 },
      { year: 'invalid', publicationCount: 100 },
      { year: 1899, publicationCount: 100 },
      { year: 2023, publicationCount: 4 }
    ]);

    assert.deepStrictEqual(result.historicalData, [
      { year: 2022, publicationCount: 2 },
      { year: 2023, publicationCount: 4 }
    ]);
    assert.strictEqual(result.historicalYearCount, 2);
    assert.strictEqual(result.historicalPublicationCount, 6);
  });

  test('groups faculty publications by year and excludes duplicate records', async () => {
    const response = await fetch(`${baseUrl}/productivity-forecast/${faculty._id}`);
    const body = await response.json();
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(body.data.historicalData, [
      { year: 2022, publicationCount: 3 },
      { year: 2023, publicationCount: 4 },
      { year: 2024, publicationCount: 5 },
      { year: 2025, publicationCount: 7 }
    ]);
    assert.strictEqual(body.data.historicalPublicationCount, 19);
    assert.strictEqual(body.data.historicalYearCount, 4);
  });

  test('malformed faculty IDs return HTTP 400', async () => {
    const response = await fetch(`${baseUrl}/productivity-forecast/abcdefghijkl`);
    assert.strictEqual(response.status, 400);
    assert.strictEqual((await response.json()).success, false);
  });

  test('missing faculty IDs return HTTP 404', async () => {
    const missingId = new mongoose.Types.ObjectId();
    const response = await fetch(`${baseUrl}/productivity-forecast/${missingId}`);
    assert.strictEqual(response.status, 404);
    assert.strictEqual((await response.json()).success, false);
  });

  test('returns a valid faculty forecast using only public faculty fields', async () => {
    const response = await fetch(`${baseUrl}/productivity-forecast/${faculty._id}`);
    const body = await response.json();
    assert.strictEqual(response.status, 200);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.facultyId, faculty._id.toString());
    assert.strictEqual(body.data.facultyName, 'Forecast Test Faculty');
    assert.strictEqual(body.data.forecastYear, 2026);
    assert.strictEqual(body.data.forecastPublicationCount, 8);
    assert.strictEqual(body.data.trendDirection, 'growing');
    assert.strictEqual(body.data.forecastAvailable, true);
    assert.strictEqual(Object.hasOwn(body.data, 'email'), false);
    for (const field of [
      'facultyId', 'facultyName', 'historicalData', 'forecastYear',
      'forecastPublicationCount', 'trendDirection', 'forecastAvailable'
    ]) {
      assert.ok(Object.hasOwn(body.data, field), `Existing response field ${field} remains present`);
    }
    for (const field of [
      'historicalYearCount', 'historicalPublicationCount', 'averageAnnualPublications',
      'annualChange', 'rSquared', 'forecastSummary'
    ]) {
      assert.ok(Object.hasOwn(body.data, field), `New response field ${field} is present`);
    }
    assert.strictEqual(body.data.forecastSummary, 'Historical publication activity shows a growing trend.');
    assert.ok(body.data.rSquared >= 0 && body.data.rSquared <= 1);
  });

  test('returns an explicit insufficient-history response for a valid faculty', async () => {
    const response = await fetch(`${baseUrl}/productivity-forecast/${insufficientFaculty._id}`);
    const body = await response.json();
    assert.strictEqual(response.status, 200);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.forecastAvailable, false);
    assert.strictEqual(body.data.forecastPublicationCount, null);
    assert.strictEqual(body.data.historicalYearCount, 1);
    assert.strictEqual(body.data.historicalPublicationCount, 1);
    assert.strictEqual(body.data.rSquared, null);
    assert.match(body.data.message, /two historical publication years/);
    assert.strictEqual(body.data.forecastSummary, 'Insufficient historical publication data for forecasting.');
  });
});