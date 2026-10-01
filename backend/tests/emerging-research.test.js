const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const analyticsRoutes = require('../routes/analytics.routes');
const emergingResearchService = require('../services/emergingResearch.service');

const analyze = emergingResearchService.analyzeEmergingResearch;
const publicationsFor = (domain, year, count) => Array.from({ length: count }, () => ({
  year,
  predictedResearchDomains: [{ name: domain }]
}));

describe('Phase 13A — Emerging Research Analysis', () => {
  test('aggregates predicted publication counts by year', () => {
    const results = analyze([
      { year: 2024, predictedResearchDomains: [{ name: 'Artificial Intelligence' }] },
      { year: 2024, predictedResearchDomains: [{ name: 'Artificial Intelligence' }] },
      { year: 2025, predictedResearchDomains: [{ name: 'Artificial Intelligence' }] }
    ]);

    assert.deepStrictEqual(results[0].yearlyCounts, [
      { year: 2024, count: 2 },
      { year: 2025, count: 1 }
    ]);
  });

  test('calculates year-over-year percentage growth', () => {
    const results = analyze([
      { year: 2024, predictedResearchDomains: [{ name: 'AI' }] },
      { year: 2024, predictedResearchDomains: [{ name: 'AI' }] },
      { year: 2024, predictedResearchDomains: [{ name: 'AI' }] },
      { year: 2024, predictedResearchDomains: [{ name: 'AI' }] },
      { year: 2025, predictedResearchDomains: [{ name: 'AI' }] },
      { year: 2025, predictedResearchDomains: [{ name: 'AI' }] },
      { year: 2025, predictedResearchDomains: [{ name: 'AI' }] },
      { year: 2025, predictedResearchDomains: [{ name: 'AI' }] },
      { year: 2025, predictedResearchDomains: [{ name: 'AI' }] },
      { year: 2025, predictedResearchDomains: [{ name: 'AI' }] },
      { year: 2025, predictedResearchDomains: [{ name: 'AI' }] },
      { year: 2025, predictedResearchDomains: [{ name: 'AI' }] }
    ]);

    assert.strictEqual(results[0].growthRate, 100);
    assert.strictEqual(results[0].latestCount, 8);
    assert.strictEqual(results[0].previousCount, 4);
    assert.strictEqual(results[0].latestYear, 2025);
    assert.strictEqual(results[0].previousYear, 2024);
    assert.strictEqual(results[0].trendDirection, 'growing');
  });

  test('reports a declining trend when the latest count is lower', () => {
    const results = analyze([
      ...Array.from({ length: 4 }, () => ({ year: 2024, predictedResearchDomains: [{ name: 'AI' }] })),
      ...Array.from({ length: 2 }, () => ({ year: 2025, predictedResearchDomains: [{ name: 'AI' }] }))
    ]);

    assert.strictEqual(results[0].trendDirection, 'declining');
    assert.strictEqual(results[0].growthRate, -50);
    assert.strictEqual(results[0].isEmerging, false);
  });

  test('reports a stable trend when latest and previous counts match', () => {
    const results = analyze([
      ...Array.from({ length: 3 }, () => ({ year: 2024, predictedResearchDomains: [{ name: 'AI' }] })),
      ...Array.from({ length: 3 }, () => ({ year: 2025, predictedResearchDomains: [{ name: 'AI' }] }))
    ]);

    assert.strictEqual(results[0].trendDirection, 'stable');
    assert.strictEqual(results[0].growthRate, 0);
    assert.strictEqual(results[0].isEmerging, false);
  });

  test('retains observed multi-year counts without inventing missing years', () => {
    const results = analyze([
      ...Array.from({ length: 2 }, () => ({ year: 2023, predictedResearchDomains: [{ name: 'AI' }] })),
      ...Array.from({ length: 4 }, () => ({ year: 2024, predictedResearchDomains: [{ name: 'AI' }] })),
      ...Array.from({ length: 7 }, () => ({ year: 2025, predictedResearchDomains: [{ name: 'AI' }] }))
    ]);

    assert.deepStrictEqual(results[0].yearlyCounts, [
      { year: 2023, count: 2 },
      { year: 2024, count: 4 },
      { year: 2025, count: 7 }
    ]);
    assert.strictEqual(results[0].latestYear, 2025);
    assert.strictEqual(results[0].latestCount, 7);
    assert.strictEqual(results[0].previousYear, 2024);
    assert.strictEqual(results[0].previousCount, 4);
    assert.strictEqual(results[0].growthRate, 75);
    assert.strictEqual(results[0].trendDirection, 'growing');
    assert.strictEqual(results[0].isEmerging, true);
  });

  test('generates a numeric emerging score within the 0–100 range', () => {
    const results = analyze([
      ...publicationsFor('AI', 2024, 4),
      ...publicationsFor('AI', 2025, 7)
    ]);

    assert.strictEqual(typeof results[0].emergingScore, 'number');
    assert.strictEqual(results[0].emergingScore, 78.5);
    assert.ok(results[0].emergingScore >= 0 && results[0].emergingScore <= 100);
  });

  test('ranks emerging domains by descending score and leaves other ranks null', () => {
    const results = analyze([
      ...publicationsFor('Artificial Intelligence', 2024, 4),
      ...publicationsFor('Artificial Intelligence', 2025, 7),
      ...publicationsFor('Robotics', 2024, 4),
      ...publicationsFor('Robotics', 2025, 6),
      ...publicationsFor('Data Science', 2024, 4),
      ...publicationsFor('Data Science', 2025, 5),
      ...publicationsFor('Stable Domain', 2024, 2),
      ...publicationsFor('Stable Domain', 2025, 2)
    ]);
    const byDomain = Object.fromEntries(results.map(item => [item.domain, item]));

    assert.deepStrictEqual(
      results.filter(item => item.isEmerging).map(item => item.domain),
      ['Artificial Intelligence', 'Robotics', 'Data Science']
    );
    assert.deepStrictEqual(
      results.filter(item => item.isEmerging).map(item => item.rank),
      [1, 2, 3]
    );
    assert.ok(byDomain['Artificial Intelligence'].emergingScore > byDomain.Robotics.emergingScore);
    assert.ok(byDomain.Robotics.emergingScore > byDomain['Data Science'].emergingScore);
    assert.strictEqual(byDomain['Stable Domain'].isEmerging, false);
    assert.strictEqual(byDomain['Stable Domain'].emergingScore, 0);
    assert.strictEqual(byDomain['Stable Domain'].rank, null);
    assert.strictEqual(byDomain['Artificial Intelligence'].trendDirection, 'growing');
    assert.strictEqual(byDomain['Artificial Intelligence'].growthRate, 75);
    assert.strictEqual(byDomain['Artificial Intelligence'].isEmerging, true);
  });

  test('marks a growing recent research domain as emerging', () => {
    const results = analyze([
      { year: 2024, predictedResearchDomains: [{ name: 'AI' }] },
      { year: 2024, predictedResearchDomains: [{ name: 'AI' }] },
      { year: 2025, predictedResearchDomains: [{ name: 'AI' }] },
      { year: 2025, predictedResearchDomains: [{ name: 'AI' }] },
      { year: 2025, predictedResearchDomains: [{ name: 'AI' }] }
    ]);

    assert.strictEqual(results[0].isEmerging, true);
  });

  test('does not mark a non-growing domain as emerging', () => {
    const results = analyze([
      { year: 2024, predictedResearchDomains: [{ name: 'AI' }] },
      { year: 2024, predictedResearchDomains: [{ name: 'AI' }] },
      { year: 2025, predictedResearchDomains: [{ name: 'AI' }] },
      { year: 2025, predictedResearchDomains: [{ name: 'AI' }] }
    ]);

    assert.strictEqual(results[0].isEmerging, false);
  });

  test('applies the minimum recent-publication threshold', () => {
    const results = analyze([
      { year: 2024, predictedResearchDomains: [{ name: 'AI' }] },
      { year: 2025, predictedResearchDomains: [{ name: 'AI' }] }
    ], { minimumPublications: 3 });

    assert.strictEqual(results[0].recentPublicationCount, 2);
    assert.strictEqual(results[0].isEmerging, false);
  });

  test('applies the minimum growth-rate threshold', () => {
    const results = analyze([
      { year: 2024, predictedResearchDomains: [{ name: 'AI' }] },
      { year: 2024, predictedResearchDomains: [{ name: 'AI' }] },
      { year: 2025, predictedResearchDomains: [{ name: 'AI' }] },
      { year: 2025, predictedResearchDomains: [{ name: 'AI' }] },
      { year: 2025, predictedResearchDomains: [{ name: 'AI' }] }
    ], { minimumGrowthRate: 60 });

    assert.strictEqual(results[0].growthRate, 50);
    assert.strictEqual(results[0].isEmerging, false);
  });

  test('handles a zero previous count with a finite growth baseline', () => {
    const results = analyze([
      { year: 2025, predictedResearchDomains: [{ name: 'New Domain' }] },
      { year: 2025, predictedResearchDomains: [{ name: 'New Domain' }] }
    ]);

    assert.strictEqual(results[0].previousCount, 0);
    assert.strictEqual(results[0].growthRate, 100);
    assert.strictEqual(results[0].trendDirection, 'growing');
    assert.strictEqual(results[0].isEmerging, true);
  });

  test('excludes duplicate publications from all counts', () => {
    const results = analyze([
      { year: 2024, predictedResearchDomains: [{ name: 'AI' }] },
      { year: 2025, predictedResearchDomains: [{ name: 'AI' }] },
      { year: 2025, isDuplicate: true, predictedResearchDomains: [{ name: 'AI' }] },
      { year: 2025, isDuplicate: true, predictedResearchDomains: [{ name: 'Duplicate Only' }] }
    ]);

    assert.deepStrictEqual(results.map(item => item.domain), ['AI']);
    assert.strictEqual(results[0].latestCount, 1);
    assert.strictEqual(results[0].isEmerging, false);
    assert.strictEqual(results[0].emergingScore, 0);
    assert.strictEqual(results[0].rank, null);
  });

  test('ignores missing and invalid publication years', () => {
    const results = analyze([
      { predictedResearchDomains: [{ name: 'AI' }] },
      { year: 'not-a-year', predictedResearchDomains: [{ name: 'AI' }] },
      { year: 1899, predictedResearchDomains: [{ name: 'AI' }] },
      { year: 2024.5, predictedResearchDomains: [{ name: 'AI' }] }
    ]);

    assert.deepStrictEqual(results, []);
  });

  test('ignores missing and blank predicted domain names', () => {
    const results = analyze([
      { year: 2024 },
      { year: 2025, predictedResearchDomains: [{}] },
      { year: 2025, predictedResearchDomains: [{ name: '   ' }] }
    ]);

    assert.deepStrictEqual(results, []);
  });

  test('aggregates multiple domains and counts each domain once per publication', () => {
    const results = analyze([
      { year: 2024, predictedResearchDomains: [{ name: 'AI' }, { name: 'Robotics' }, { name: 'AI' }] },
      { year: 2025, predictedResearchDomains: [{ name: 'AI' }, { name: 'Robotics' }] }
    ]);

    assert.deepStrictEqual(results.map(item => item.domain).sort(), ['AI', 'Robotics']);
    const byDomain = Object.fromEntries(results.map(item => [item.domain, item]));
    assert.deepStrictEqual(byDomain.AI.yearlyCounts, [
      { year: 2024, count: 1 },
      { year: 2025, count: 1 }
    ]);
    assert.strictEqual(byDomain.AI.trendDirection, 'stable');
    assert.strictEqual(byDomain.Robotics.trendDirection, 'stable');
  });

  test('serves the emerging research analytics endpoint and accepts threshold parameters', async () => {
    const app = express();
    app.use('/api/analytics', analyticsRoutes);
    const server = app.listen(0);
    const originalGetEmergingResearch = emergingResearchService.getEmergingResearch;
    let receivedOptions;

    emergingResearchService.getEmergingResearch = async options => {
      receivedOptions = options;
      return [{
        domain: 'AI',
        yearlyCounts: [{ year: 2024, count: 2 }, { year: 2025, count: 4 }],
        latestYear: 2025,
        previousYear: 2024,
        latestCount: 4,
        previousCount: 2,
        growthRate: 100,
        trendDirection: 'growing',
        recentPublicationCount: 6,
        isEmerging: true,
        emergingScore: 100,
        rank: 1
      }];
    };

    try {
      await new Promise(resolve => server.once('listening', resolve));
      const address = server.address();
      const response = await fetch(`http://127.0.0.1:${address.port}/api/analytics/emerging-research?minimumPublications=4&minimumGrowthRate=30&recentYears=2`);
      const body = await response.json();

      assert.strictEqual(response.status, 200);
      assert.deepStrictEqual(body, {
        success: true,
        data: [{
          domain: 'AI',
          yearlyCounts: [{ year: 2024, count: 2 }, { year: 2025, count: 4 }],
          latestYear: 2025,
          previousYear: 2024,
          latestCount: 4,
          previousCount: 2,
          growthRate: 100,
          trendDirection: 'growing',
          recentPublicationCount: 6,
          isEmerging: true,
          emergingScore: 100,
          rank: 1
        }]
      });
      assert.deepStrictEqual(receivedOptions, {
        minimumPublications: '4',
        minimumGrowthRate: '30',
        recentYears: '2'
      });
    } finally {
      emergingResearchService.getEmergingResearch = originalGetEmergingResearch;
      await new Promise(resolve => server.close(resolve));
    }
  });
});