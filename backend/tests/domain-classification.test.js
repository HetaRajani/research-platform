const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const express = require('express');

const healthRoutes = require('../routes/health.routes');
const publicationRoutes = require('../routes/publication.routes');
const { errorHandler } = require('../middleware/errorHandler');

const Publication = require('../models/Publication');
const ResearchDomain = require('../models/ResearchDomain');
const {
  classifyPublicationResearchDomains,
  predictDomainsForPublicationId,
  extractPublicationText,
  normalizeText,
  CLASSIFIER_VERSION,
  CLASSIFICATION_METHOD
} = require('../services/domainClassification.service');
const { DOMAIN_VOCABULARY, getDomainByName, getAllDomains } = require('../config/domainVocabulary');

const TEST_DB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/research_platform_test';

describe('Phase 12A — Research Domain Classification Foundation', () => {
  let app;
  let server;
  let baseUrl;
  let testDomainAI;
  let testDomainIoT;
  let testDomainCyber;
  let testDomainBlockchain;

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_DB_URI);
    }

    // Set up test Express server
    app = express();
    app.use(express.json());
    app.use('/api', healthRoutes);
    app.use('/api/publications', publicationRoutes);
    app.use(errorHandler);

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });

    // Cleanup Phase 12A test records
    await Publication.deleteMany({ title: { $regex: /^PH12A_/ } });
    await ResearchDomain.deleteMany({ name: { $regex: /^PH12A_/ } });

    // Seed domain records
    testDomainAI = await ResearchDomain.create({
      name: 'Artificial Intelligence',
      description: 'Foundational artificial intelligence and intelligent systems'
    }).catch(() => ResearchDomain.findOne({ name: 'Artificial Intelligence' }));

    testDomainIoT = await ResearchDomain.create({
      name: 'Internet of Things',
      description: 'Smart sensing and connected edge devices'
    }).catch(() => ResearchDomain.findOne({ name: 'Internet of Things' }));

    testDomainCyber = await ResearchDomain.create({
      name: 'Cybersecurity',
      description: 'Information security and defense'
    }).catch(() => ResearchDomain.findOne({ name: 'Cybersecurity' }));

    testDomainBlockchain = await ResearchDomain.create({
      name: 'Blockchain',
      description: 'Decentralized ledgers and smart contracts'
    }).catch(() => ResearchDomain.findOne({ name: 'Blockchain' }));
  });

  after(async () => {
    await Publication.deleteMany({ title: { $regex: /^PH12A_/ } });
    await ResearchDomain.deleteMany({ name: { $regex: /^PH12A_/ } });

    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    await mongoose.connection.close();
  });

  // =========================================================================
  // 1. Text Normalization and Extraction
  // =========================================================================
  test('1. Normalize text and extract components from publication correctly', () => {
    const raw = {
      title: '  Deep   Learning  for Medical Imaging!!  ',
      abstract: 'Convolutional neural networks achieved HIGH ACCURACY on datasets.',
      keywords: ['Deep Learning', 'CNN', 'Medical AI']
    };

    const extracted = extractPublicationText(raw);
    assert.strictEqual(extracted.title, 'deep learning for medical imaging!!');
    assert.strictEqual(extracted.abstract, 'convolutional neural networks achieved high accuracy on datasets.');
    assert.strictEqual(extracted.keywords.length, 3);
    assert.strictEqual(extracted.keywords[0], 'deep learning');
    assert.strictEqual(extracted.hasText, true);

    const emptyExtracted = extractPublicationText({});
    assert.strictEqual(emptyExtracted.hasText, false);
    assert.strictEqual(emptyExtracted.title, '');
    assert.strictEqual(emptyExtracted.keywords.length, 0);
  });

  // =========================================================================
  // 2. AI / ML Related Publication Classification
  // =========================================================================
  test('2. Accurately classifies AI/ML-related publication with high confidence', () => {
    const pub = {
      title: 'Deep Residual Learning for Image Classification using Convolutional Neural Networks',
      abstract: 'We introduce a deep neural network architecture trained with backpropagation and supervised learning for complex visual representations.',
      keywords: ['Machine Learning', 'Deep Learning', 'Neural Networks', 'Artificial Intelligence']
    };

    const result = classifyPublicationResearchDomains(pub);

    assert.ok(result.domains && result.domains.length > 0, 'Should return at least one predicted domain');

    // Both Machine Learning and Artificial Intelligence are valid matches
    const mlMatch = result.domains.find(d => d.name === 'Machine Learning');
    assert.ok(mlMatch, 'Must predict Machine Learning domain');
    assert.ok(mlMatch.confidence >= 0.70, `Confidence should be >= 0.70 (got ${mlMatch.confidence})`);
    assert.ok(mlMatch.confidence <= 1.0, 'Confidence must be <= 1.0');
    assert.ok(mlMatch.matchedKeywords.length >= 2, 'Should match multiple domain keywords');
    assert.ok(
      mlMatch.matchedKeywords.some(k => k.includes('deep learning') || k.includes('neural network') || k.includes('machine learning'))
    );
  });

  // =========================================================================
  // 3. IoT Related Publication Classification
  // =========================================================================
  test('3. Accurately classifies IoT-related publication', () => {
    const pub = {
      title: 'Energy-Efficient Wireless Sensor Networks for Smart Cities and Connected Devices',
      abstract: 'This paper evaluates an Internet of Things architecture with low-power sensor networks and actuators deployed in municipal environments.',
      keywords: ['Internet of Things', 'Wireless Sensor Network', 'Smart City']
    };

    const result = classifyPublicationResearchDomains(pub);

    assert.ok(result.domains.length > 0);
    const topDomain = result.domains[0];
    assert.strictEqual(topDomain.name, 'Internet of Things');
    assert.ok(topDomain.confidence >= 0.75, `Confidence should be >= 0.75 (got ${topDomain.confidence})`);
    assert.ok(
      topDomain.matchedKeywords.some(k => k.includes('internet of things') || k.includes('smart city') || k.includes('sensor network'))
    );
  });

  // =========================================================================
  // 4. Cybersecurity Related Publication Classification
  // =========================================================================
  test('4. Accurately classifies Cybersecurity-related publication', () => {
    const pub = {
      title: 'Zero-Trust Architecture and Intrusion Detection Against Ransomware Attacks',
      abstract: 'We propose a network security defense utilizing public key cryptography, encryption, and threat intelligence to identify malware and botnets.',
      keywords: ['Cybersecurity', 'Intrusion Detection', 'Cryptography']
    };

    const result = classifyPublicationResearchDomains(pub);

    assert.ok(result.domains.length > 0);
    const cyberMatch = result.domains.find(d => d.name === 'Cybersecurity');
    assert.ok(cyberMatch, 'Must predict Cybersecurity domain');
    assert.ok(cyberMatch.confidence >= 0.75, `Confidence should be >= 0.75 (got ${cyberMatch.confidence})`);
    assert.ok(
      cyberMatch.matchedKeywords.some(k => k.includes('intrusion detection') || k.includes('ransomware') || k.includes('cryptography'))
    );
  });

  // =========================================================================
  // 5. Multi-Domain Publication Classification
  // =========================================================================
  test('5. Accurately predicts multiple domains when publication spans multiple disciplines', () => {
    const pub = {
      title: 'IoT-Enabled Blockchain Framework for Decentralized Smart City Data Management',
      abstract: 'We integrate smart contracts on Ethereum with wireless sensor networks to ensure transparent distributed ledger operations for connected devices.',
      keywords: ['Internet of Things', 'Blockchain', 'Smart Contracts']
    };

    const result = classifyPublicationResearchDomains(pub);

    assert.ok(result.domains.length >= 2, 'Should match at least 2 distinct domains');
    const domainNames = result.domains.map(d => d.name);

    assert.ok(domainNames.includes('Internet of Things'), 'Should include Internet of Things');
    assert.ok(domainNames.includes('Blockchain'), 'Should include Blockchain');

    const iotMatch = result.domains.find(d => d.name === 'Internet of Things');
    const bcMatch = result.domains.find(d => d.name === 'Blockchain');

    assert.ok(iotMatch.confidence >= 0.50);
    assert.ok(bcMatch.confidence >= 0.50);

    // Each domain should have its own matched keywords
    assert.ok(bcMatch.matchedKeywords.some(k => k.includes('blockchain') || k.includes('smart contract')));
    assert.ok(iotMatch.matchedKeywords.some(k => k.includes('internet of things') || k.includes('connected device')));
  });

  // =========================================================================
  // 6. Insufficient Information / Generic Text (Avoids False Positives)
  // =========================================================================
  test('6. Avoids assigning domains when text contains insufficient domain evidence', () => {
    const genericPub = {
      title: 'A Comparative Investigation of General System Factors in Contemporary Environments',
      abstract: 'This study presents an analysis of qualitative dimensions, standard benchmarks, and contextual evaluation parameters observed across initial tests.',
      keywords: ['Investigation', 'Evaluation', 'Study']
    };

    const result = classifyPublicationResearchDomains(genericPub);

    assert.strictEqual(result.domains.length, 0, 'Should not assign any domain for generic text without domain evidence');
  });

  // =========================================================================
  // 7. Empty Title / Abstract / Keywords Handling
  // =========================================================================
  test('7. Handles empty or missing title/abstract/keywords gracefully without errors', () => {
    const emptyPub1 = { title: '', abstract: '', keywords: [] };
    const res1 = classifyPublicationResearchDomains(emptyPub1);
    assert.strictEqual(res1.domains.length, 0);
    assert.strictEqual(res1.reason, 'insufficient_text');

    const emptyPub2 = null;
    const res2 = classifyPublicationResearchDomains(emptyPub2);
    assert.strictEqual(res2.domains.length, 0);

    const emptyPub3 = { title: 'abc', abstract: '   ' };
    const res3 = classifyPublicationResearchDomains(emptyPub3);
    assert.strictEqual(res3.domains.length, 0);
  });

  // =========================================================================
  // 8. Confidence Values Are Strict Numbers in Range [0.0, 1.0]
  // =========================================================================
  test('8. All predicted confidence scores are valid finite numbers between 0.0 and 1.0', () => {
    const samplePubs = [
      {
        title: 'Cloud Computing and Microservices Architecture in Docker',
        abstract: 'Serverless computing and Kubernetes orchestration for cloud infrastructure.'
      },
      {
        title: 'Robotics Kinematics and Autonomous Motion Planning',
        abstract: 'SLAM algorithm applied to humanoid mobile robots and robotic arms.'
      },
      {
        title: 'Natural Language Processing and Sentiment Analysis with Transformers',
        abstract: 'BERT language models evaluated on large text corpora for machine translation.'
      }
    ];

    for (const pub of samplePubs) {
      const result = classifyPublicationResearchDomains(pub);
      assert.ok(result.domains.length > 0);

      for (const d of result.domains) {
        assert.strictEqual(typeof d.name, 'string');
        assert.ok(d.name.length > 0);
        assert.strictEqual(typeof d.confidence, 'number');
        assert.strictEqual(isNaN(d.confidence), false, 'Confidence must not be NaN');
        assert.ok(d.confidence >= 0.0 && d.confidence <= 1.0, `Confidence must be between 0.0 and 1.0 (got ${d.confidence})`);
        assert.ok(Array.isArray(d.matchedKeywords), 'matchedKeywords must be an array');
        assert.ok(d.matchedKeywords.length > 0, 'Must have at least one matched keyword');
      }
    }
  });

  // =========================================================================
  // 9. HTTP Endpoint: GET /api/publications/:id/research-domains/predict
  // =========================================================================
  test('9. HTTP API predicts domains without modifying the publication in MongoDB', async () => {
    // Create publication in MongoDB with existing verified manual domain
    const pub = await Publication.create({
      title: 'PH12A_Deep Convolutional Networks for Autonomous Robotics Navigation',
      year: 2024,
      authors: ['Dr. Test Classifier'],
      abstract: 'We implement deep learning computer vision algorithms and SLAM on autonomous mobile robots.',
      keywords: ['Deep Learning', 'Robotics', 'Computer Vision'],
      researchDomains: testDomainAI ? [testDomainAI._id] : [],
      source: 'manual'
    });

    const originalUpdatedAt = pub.updatedAt.getTime();

    // Call prediction API endpoint
    const res = await fetch(`${baseUrl}/api/publications/${pub._id}/research-domains/predict`);
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.publicationId, pub._id.toString());
    assert.ok(Array.isArray(body.data.predictions), 'predictions must be an array');
    assert.ok(body.data.predictions.length > 0, 'Must predict at least one domain');

    // Verify prediction payload format
    const topPred = body.data.predictions[0];
    assert.ok(topPred.name);
    assert.ok(typeof topPred.confidence === 'number');
    assert.ok(Array.isArray(topPred.matchedKeywords));
    assert.ok(topPred.signals);

    // Verify manual domains remain preserved in response
    assert.ok(Array.isArray(body.data.manualResearchDomains));
    if (testDomainAI) {
      assert.strictEqual(body.data.manualResearchDomains[0].id, testDomainAI._id.toString());
    }

    // Verify database record was NOT modified (read-only prediction)
    const pubInDb = await Publication.findById(pub._id);
    assert.strictEqual(pubInDb.updatedAt.getTime(), originalUpdatedAt, 'Publication in MongoDB must not be modified');
    if (testDomainAI) {
      assert.strictEqual(pubInDb.researchDomains.length, 1);
      assert.strictEqual(pubInDb.researchDomains[0].toString(), testDomainAI._id.toString());
    }
  });

  // =========================================================================
  // 10. HTTP Endpoint: 404 for Non-Existent Publication
  // =========================================================================
  test('10. HTTP API returns 404 for non-existent publication ID', async () => {
    const nonExistentId = new mongoose.Types.ObjectId();
    const res = await fetch(`${baseUrl}/api/publications/${nonExistentId}/research-domains/predict`);

    assert.strictEqual(res.status, 404);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.message, 'Publication not found');
  });

  // =========================================================================
  // 11. Domain Vocabulary Extensibility Verification
  // =========================================================================
  test('11. Vocabulary is configurable and extensible with custom domains', () => {
    const customVocabulary = [
      ...DOMAIN_VOCABULARY,
      {
        name: 'Quantum Information Science',
        description: 'Quantum circuits, qubits, quantum key distribution, and algorithms',
        phrases: ['quantum computing', 'quantum circuit', 'quantum key distribution'],
        keywords: ['qubit', 'qubits', 'entanglement'],
        acronyms: ['qkd', 'qis']
      }
    ];

    const pub = {
      title: 'Fault-Tolerant Quantum Circuit Architecture with Superconducting Qubits',
      abstract: 'We present a quantum computing processor leveraging topological error correction on physical qubits.',
      keywords: ['Quantum Computing', 'Qubits']
    };

    const result = classifyPublicationResearchDomains(pub, { vocabulary: customVocabulary });
    const quantumMatch = result.domains.find(d => d.name === 'Quantum Information Science');

    assert.ok(quantumMatch, 'Should classify custom domain when provided in vocabulary');
    assert.ok(quantumMatch.confidence >= 0.70);
  });

  // =========================================================================
  // 12. Ambiguous Keywords and Weak Signals (Avoids False Positives)
  // =========================================================================
  test('12. Ambiguous keywords and isolated terms do not cause false positive domain assignments', () => {
    // Mentions "reasoning", "workflow", "operations" in a non-AI medical study
    const nonAIPub = {
      title: 'Clinical Reasoning and Patient Workflow Analysis in Regional Hospitals',
      abstract: 'We conducted an observational study assessing doctor decision times, staff coordination, and operational bottlenecks across pediatric clinics.',
      keywords: ['Clinical Practice', 'Hospital Workflow', 'Operations']
    };

    const result = classifyPublicationResearchDomains(nonAIPub);
    const aiMatch = result.domains.find(d => d.name === 'Artificial Intelligence');
    assert.strictEqual(aiMatch, undefined, 'Should not predict Artificial Intelligence for clinical reasoning study');

    // Mentions generic attendance and performance without Data Science computational evidence
    const nonDSPub = {
      title: 'An Investigation of Student Attendance and Grade Performance Trends',
      abstract: 'This paper examines classroom engagement benchmarks and evaluates general statistical trends without computational methods.',
      keywords: ['Education', 'Attendance']
    };

    const dsResult = classifyPublicationResearchDomains(nonDSPub);
    const dsMatch = dsResult.domains.find(d => d.name === 'Data Science');
    assert.strictEqual(dsMatch, undefined, 'Should not predict Data Science for generic attendance study');

    // Isolated single word in abstract without composite evidence
    const singleWordPub = {
      title: 'A Field Study on Community Workshop Attendance',
      abstract: 'The team noted high usability in the paper forms distributed during registration.',
      keywords: ['Community', 'Workshop']
    };

    const singleResult = classifyPublicationResearchDomains(singleWordPub);
    assert.strictEqual(singleResult.domains.length, 0, 'Isolated single keyword in abstract must not trigger domain match');
  });

  // =========================================================================
  // 13. Multiple-Domain Evidence Structure
  // =========================================================================
  test('13. Predicted domains retain matchedPhrases, matchedAcronyms, matchedKeywords, and detailed signals', () => {
    const pub = {
      title: 'Intrusion Detection and DDoS Mitigation using Convolutional Neural Networks on SDN',
      abstract: 'We apply CNN architectures to detect distributed denial of service attacks within software defined networks, evaluating packet forwarding and quality of service.',
      keywords: ['Cybersecurity', 'DDoS', 'CNN', 'Deep Learning', 'SDN']
    };

    const result = classifyPublicationResearchDomains(pub);
    assert.ok(result.domains.length >= 2, 'Should predict multiple domains');

    // Check Cybersecurity domain evidence
    const cyberMatch = result.domains.find(d => d.name === 'Cybersecurity');
    assert.ok(cyberMatch, 'Must match Cybersecurity');
    assert.ok(Array.isArray(cyberMatch.matchedPhrases), 'matchedPhrases must be an array');
    assert.ok(Array.isArray(cyberMatch.matchedAcronyms), 'matchedAcronyms must be an array');
    assert.ok(Array.isArray(cyberMatch.matchedKeywords), 'matchedKeywords must be an array');
    assert.ok(cyberMatch.matchedAcronyms.includes('DDOS'), 'Should identify DDOS acronym');
    assert.ok(cyberMatch.matchedPhrases.some(p => p.includes('intrusion detection') || p.includes('denial of service')));
    assert.ok(cyberMatch.signals.titleMatches.length > 0 || cyberMatch.signals.keywordMatches.length > 0);

    // Check Computer Networks domain evidence
    const netMatch = result.domains.find(d => d.name === 'Computer Networks');
    assert.ok(netMatch, 'Must match Computer Networks');
    assert.ok(netMatch.matchedAcronyms.includes('SDN'));
    assert.ok(netMatch.signals.abstractMatches.some(s => s.includes('packet forwarding') || s.includes('quality of service') || s.includes('software defined')));
  });

  // =========================================================================
  // 14. Configurable Minimum Confidence Threshold
  // =========================================================================
  test('14. Configurable minConfidence filters predictions appropriately', () => {
    const pub = {
      title: 'Decentralized Blockchain Ledgers for Internet of Things Sensor Networks',
      abstract: 'We integrate smart contracts and wireless sensor networks for distributed telemetry.',
      keywords: ['Blockchain', 'Internet of Things']
    };

    // Standard threshold: returns both domains
    const standard = classifyPublicationResearchDomains(pub, { minConfidence: 0.40 });
    assert.ok(standard.domains.length >= 2);

    // High threshold: filters out lower-evidence matches
    const strict = classifyPublicationResearchDomains(pub, { minConfidence: 0.85 });
    for (const d of strict.domains) {
      assert.ok(d.confidence >= 0.85, `Domain ${d.name} confidence ${d.confidence} must be >= 0.85`);
    }

    // Ultra-strict threshold: yields empty list if none reach threshold
    const ultraStrict = classifyPublicationResearchDomains(pub, { minConfidence: 0.99 });
    assert.strictEqual(ultraStrict.domains.length, 0);
  });

  // =========================================================================
  // 15. Configurable Maximum Predicted Domains / TopK
  // =========================================================================
  test('15. Configurable maxDomains / topK limits the number of returned domains', () => {
    const multiPub = {
      title: 'Deep Learning and Computer Vision for Autonomous Mobile Robots with Edge Cloud IoT',
      abstract: 'We combine convolutional neural networks, object detection, SLAM navigation, and Kubernetes microservices on connected devices.',
      keywords: ['Deep Learning', 'Computer Vision', 'Robotics', 'Cloud Computing', 'Internet of Things']
    };

    const defaultLimit = classifyPublicationResearchDomains(multiPub);
    assert.ok(defaultLimit.domains.length > 1, 'Default should allow multiple domains');

    const top1 = classifyPublicationResearchDomains(multiPub, { maxDomains: 1 });
    assert.strictEqual(top1.domains.length, 1, 'Should return exactly 1 domain when maxDomains=1');

    const top2 = classifyPublicationResearchDomains(multiPub, { maxDomains: 2 });
    assert.strictEqual(top2.domains.length, 2, 'Should return exactly 2 domains when maxDomains=2');
    assert.strictEqual(top2.domains[0].name, top1.domains[0].name, 'Top ranked domain should be identical');

    // Backwards compatibility with topK
    const topKResult = classifyPublicationResearchDomains(multiPub, { topK: 1 });
    assert.strictEqual(topKResult.domains.length, 1);
    assert.strictEqual(topKResult.domains[0].name, top1.domains[0].name);
  });

  // =========================================================================
  // 16. Classification Metadata Structure
  // =========================================================================
  test('16. Service and API returns complete classification metadata', () => {
    const pub = {
      title: 'Reinforcement Learning for Autonomous Drone Navigation',
      abstract: 'Deep reinforcement learning policy optimization for quadrotor path planning.',
      keywords: ['Machine Learning', 'Robotics']
    };

    const result = classifyPublicationResearchDomains(pub, { minConfidence: 0.45, maxDomains: 3 });
    assert.ok(result.metadata, 'Result must include metadata');
    assert.strictEqual(result.metadata.classifierVersion, CLASSIFIER_VERSION);
    assert.strictEqual(result.metadata.classificationMethod, CLASSIFICATION_METHOD);
    assert.strictEqual(typeof result.metadata.predictedAt, 'string');
    assert.ok(!isNaN(Date.parse(result.metadata.predictedAt)), 'predictedAt must be valid ISO date string');
    assert.strictEqual(result.metadata.confidenceThreshold, 0.45);
    assert.strictEqual(result.metadata.maxDomainsLimit, 3);
    assert.strictEqual(result.metadata.totalDomainsEvaluated, 15);
  });

  // =========================================================================
  // 17. Suppression of Evidence with includeEvidence=false
  // =========================================================================
  test('17. Configurable includeEvidence=false suppresses detailed evidence appropriately', () => {
    const pub = {
      title: 'Natural Language Processing and Sentiment Analysis with Transformers',
      abstract: 'BERT language models evaluated on large text corpora for machine translation.',
      keywords: ['NLP', 'Sentiment Analysis']
    };

    const result = classifyPublicationResearchDomains(pub, { includeEvidence: false });
    assert.ok(result.domains.length > 0);
    for (const d of result.domains) {
      assert.ok(d.name);
      assert.ok(typeof d.confidence === 'number');
      assert.strictEqual(d.signals, undefined, 'Signals should be omitted when includeEvidence=false');
      assert.strictEqual(d.matchedKeywords, undefined, 'matchedKeywords should be omitted when includeEvidence=false');
      assert.strictEqual(d.matchedPhrases, undefined, 'matchedPhrases should be omitted when includeEvidence=false');
      assert.strictEqual(d.matchedAcronyms, undefined, 'matchedAcronyms should be omitted when includeEvidence=false');
    }
  });

  // =========================================================================
  // 18. HTTP API Query Parameters
  // =========================================================================
  test('18. HTTP API exposes classification metadata and supports query parameters', async () => {
    const pub = await Publication.create({
      title: 'PH12A_Cloud Native Microservices and Container Orchestration with Kubernetes',
      year: 2024,
      authors: ['Dr. Cloud Expert'],
      abstract: 'Evaluating serverless computing and Docker virtual machine architectures for high-throughput cloud infrastructure.',
      keywords: ['Cloud Computing', 'Kubernetes', 'Microservices', 'Docker'],
      source: 'manual'
    });

    // Query with custom minConfidence, maxDomains, and includeEvidence
    const res = await fetch(`${baseUrl}/api/publications/${pub._id}/research-domains/predict?minConfidence=0.50&maxDomains=1&includeEvidence=true`);
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(body.data.metadata, 'API response must include metadata');
    assert.strictEqual(body.data.metadata.classifierVersion, CLASSIFIER_VERSION);
    assert.strictEqual(body.data.metadata.confidenceThreshold, 0.50);
    assert.strictEqual(body.data.metadata.maxDomainsLimit, 1);
    assert.strictEqual(body.data.predictions.length, 1, 'Should return at most 1 prediction');

    const topPred = body.data.predictions[0];
    assert.strictEqual(topPred.name, 'Cloud Computing');
    assert.ok(topPred.confidence >= 0.50);
    assert.ok(Array.isArray(topPred.matchedPhrases));
    assert.ok(Array.isArray(topPred.matchedKeywords));
    assert.ok(topPred.signals);

    // Query with includeEvidence=false
    const resNoEv = await fetch(`${baseUrl}/api/publications/${pub._id}/research-domains/predict?includeEvidence=false`);
    assert.strictEqual(resNoEv.status, 200);
    const bodyNoEv = await resNoEv.json();
    assert.strictEqual(bodyNoEv.success, true);
    assert.ok(bodyNoEv.data.predictions.length > 0);
    assert.strictEqual(bodyNoEv.data.predictions[0].signals, undefined);
    assert.strictEqual(bodyNoEv.data.predictions[0].matchedKeywords, undefined);
  });

  // =========================================================================
  // 19. Vocabulary Aliases and Lookup Helpers
  // =========================================================================
  test('19. Domain vocabulary metadata includes aliases, descriptions, and lookup helpers', () => {
    assert.strictEqual(DOMAIN_VOCABULARY.length, 15, 'Must contain 15 research domains');

    for (const domain of DOMAIN_VOCABULARY) {
      assert.ok(domain.name, 'Domain must have name');
      assert.ok(domain.description, 'Domain must have description');
      assert.ok(Array.isArray(domain.aliases), 'Domain must have aliases array');
      assert.ok(domain.aliases.length > 0, 'Domain aliases should not be empty');
      assert.ok(Array.isArray(domain.phrases), 'Domain must have phrases array');
      assert.ok(Array.isArray(domain.keywords), 'Domain must have keywords array');
      assert.ok(Array.isArray(domain.acronyms), 'Domain must have acronyms array');
    }

    // Lookup by canonical name
    const aiDomain = getDomainByName('Artificial Intelligence');
    assert.ok(aiDomain);
    assert.strictEqual(aiDomain.name, 'Artificial Intelligence');

    // Lookup by alias
    const aiAlias = getDomainByName('AI');
    assert.ok(aiAlias);
    assert.strictEqual(aiAlias.name, 'Artificial Intelligence');

    const mlAlias = getDomainByName('Deep Learning');
    assert.ok(mlAlias);
    assert.strictEqual(mlAlias.name, 'Machine Learning');

    const iotAlias = getDomainByName('IoT');
    assert.ok(iotAlias);
    assert.strictEqual(iotAlias.name, 'Internet of Things');

    const all = getAllDomains();
    assert.strictEqual(all.length, 15);
  });
});
