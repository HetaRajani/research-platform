# Final Project Documentation

**Project:** Research Analytics & Faculty Profiling Platform  
**Documentation snapshot:** 2026-10-01  
**Scope:** Completed application through Phases 1–17D. This document describes current behavior, not future plans.

## 1. Overview

### Problem and objectives

Faculty and institutional research information can be distributed across profiles and publication indexes. This platform stores faculty records and publication records together and provides browser pages and API endpoints for reviewing research activity, citations, domains, duplicate candidates, and collaborations.

The project objectives are to maintain faculty/publication data in MongoDB; expose research analytics through a REST API; keep manual domains separate from rule-based predictions; support duplicate review and safe soft merge; provide explainable trend and forecast baselines; recommend collaborators from shared domains; answer supported research questions using existing data; and provide live report previews with browser export.

### Proposed solution

The static frontend calls the Express API. Controllers validate and shape requests; services perform persistence, integrations, deduplication, and analytics; Mongoose models represent MongoDB collections. Analytics and research-intelligence features use deterministic rules or conventional statistics. There is no external LLM, embedding service, vector database, or machine-learning model.

## 2. Architecture and Technology

```text
Browser frontend (HTML, CSS, vanilla JavaScript)
             |
             | JSON over HTTP
             v
Express API (/api/*)
             |
             +--> Controllers --> Domain services
             |                        |
             |                        +--> ORCID / Scopus / permitted Scholar provider
             v
      Mongoose models
             |
             v
         MongoDB
```

- **Frontend:** HTML5, CSS3, vanilla JavaScript; shared styles in `css/style.css`; API base configuration in `js/config.js`; hand-written SVG chart helpers in `js/charts.js`.
- **Backend:** Node.js, Express 4, Mongoose 8, `jsonwebtoken`, `bcryptjs`, `cors`, and `dotenv`.
- **Database:** MongoDB.
- **Testing:** Node.js built-in test runner (`node:test`) and HTTP integration tests.
- **Exports:** Browser Web APIs generate CSV; browser print supports Print / Save as PDF. No report-generation package is needed.

### Frontend pages

- `index.html`: sign-in form that calls the login API.
- `dashboard.html`: institution KPIs, yearly charts, department/domain analytics, faculty ranking, and source connection summary.
- `faculty.html`: live directory with search, department filtering, and sorting.
- `faculty-profile.html`: faculty details, yearly chart, source details, and linked publication records.
- `publications.html`: searchable/filterable paginated publication list.
- `insights.html`: emerging research, collaborator suggestions, productivity forecasts, and deterministic Research Assistant.
- `reports.html`: live institution/faculty report preview with CSV and print output.

`data/*.json` and `js/data.js` are reference/legacy mock data. The advanced live features and current Reports preview call backend APIs.

## 3. Database Structure

Models are registered in `backend/models/index.js`. Default Mongoose collection names are `users`, `faculties`, `publications`, `collaborations`, `researchdomains`, and `duplicatereviews`.

### User

Authentication account: `name`, unique `email`, hashed `password`, `role` (`admin` or `faculty`), optional `facultyId` reference, and timestamps. Password selection is disabled by default and JSON serialization removes the password.

### Faculty

Faculty profile/source summary: `name`, `email`, `designation`, `department`, `institution`, `researchInterests`, `skills`, source identifiers (`googleScholarId`, `scopusId`, `orcidId`), `hIndex`, `i10Index`, `citationCount`, `publicationCount`, and optional `facultyCode`.

Faculty `citationCount` and `publicationCount` are stored source/profile aggregates. They are not guaranteed to equal totals from the subset of publication documents linked through `Publication.facultyIds`.

### Publication

Indexed research record: `title`, `year`, `citations`, authors, venue/source fields, `facultyIds` (array of Faculty references), and `researchDomains` (manually assigned ResearchDomain references). `predictedResearchDomains` are embedded separately with domain name/reference, confidence, matched terms/evidence, classifier metadata, and prediction time.

`isDuplicate`, `mergedInto`, and `mergedAt` track soft merges. Duplicate records remain stored; analytics exclude records where `isDuplicate === true` where required.

### ResearchDomain

Canonical name and stored aggregate fields such as publication/citation/faculty counts, growth rate, emerging score, and yearly growth. Manual publication assignments reference this model; predicted-domain information remains separate.

### Collaboration

Stored pair-level relationship: `faculty1`, `faculty2`, publication count, common domains, collaboration strength, and last collaboration date. The collaboration analytics endpoint separately derives pairs from shared active publications, so this computed network can differ from the stored collection.

### DuplicateReview

Review record linking `publicationId` and `potentialDuplicateId`, with similarity score, confidence, matching signals, status (`pending`, `confirmed`, `rejected`), reviewer information, and soft-merge metadata.

## 4. API Reference

All routes are mounted under `/api`. Success payloads generally include `success: true`; errors include `success: false` and a message. Analytics routes are public in the current implementation.

### Health

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/api/health` | Public | Process health |
| GET | `/api/health/db` | Public | MongoDB connection health |
| GET | `/api/db-check` | Public | Alias for database health |

### Authentication

| Method | Endpoint | Access | Purpose/request |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Register with `name`, `email`, `password`, optional `role`, optional `facultyId` |
| POST | `/api/auth/login` | Public | Validate `email`/`password`; returns user data and JWT |
| GET | `/api/auth/me` | Bearer JWT | Return authenticated user/profile |

There is no backend logout route; browser logout clears locally stored credentials. **Security limitation:** registration currently accepts a client-supplied `admin` role. Do not expose this as a production service to untrusted users without changing role assignment. Set a strong `JWT_SECRET`; the development fallback is not suitable for deployment.

### Faculty

| Method | Endpoint | Access | Purpose/parameters |
|---|---|---|---|
| GET | `/api/faculty` | Public | List; optional `department`, `search` |
| GET | `/api/faculty/:id` | Public | Lookup by MongoDB ID or faculty code |
| POST | `/api/faculty` | Admin | Create faculty |
| PUT | `/api/faculty/:id` | Admin or faculty owner | Update profile |
| DELETE | `/api/faculty/:id` | Admin | Delete faculty |

### Publications

| Method | Endpoint | Access | Purpose/parameters |
|---|---|---|---|
| GET | `/api/publications` | Public | List/filter by `facultyId`, `year`, `source`, `type`, `researchDomain`, `search`; `page`, `limit`; excludes duplicates unless `includeDuplicates=true` |
| GET | `/api/publications/:id` | Public | Lookup by MongoDB ID or publication code |
| POST | `/api/publications` | Admin or faculty | Create publication; title/year required; deduplicates by default |
| PUT | `/api/publications/:id` | Admin or faculty | Update subject to authorization rules |
| DELETE | `/api/publications/:id` | Admin or faculty | Delete subject to authorization rules |
| POST | `/api/publications/check-duplicates` | Public | Check publication candidate data |
| GET | `/api/publications/:id/duplicates` | Public | Find duplicate candidates |
| GET | `/api/publications/:id/research-domains/predict` | Public | Read-only domain classification; classifier options supported |
| POST | `/api/publications/:id/research-domains/predict` | Admin or faculty | Store predictions |

### Analytics

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/api/analytics/overview` | Public | Faculty, non-duplicate publication, citation, domain, and stored-collaboration totals |
| GET | `/api/analytics/yearly` | Public | Publication/citation totals by valid year |
| GET | `/api/analytics/departments` | Public | Faculty/publication/citation statistics by department |
| GET | `/api/analytics/research-domains` | Public | Manual domains by default; supports `type=manual`, `type=predicted`, or `split=true` |
| GET | `/api/analytics/research-domains/predicted` | Public | Predicted-domain statistics |
| GET | `/api/analytics/collaborations` | Public | Pairs derived from shared non-duplicate publications |

### Deduplication and imports

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/api/publications/duplicates` | Admin | List duplicate reviews with optional status/confidence/pagination filters |
| PATCH | `/api/publications/duplicates/:id/confirm` | Admin | Confirm candidate review |
| PATCH | `/api/publications/duplicates/:id/reject` | Admin | Reject candidate review |
| POST | `/api/publications/duplicates/:id/merge` | Admin | Merge a confirmed pair; accepts `primaryPublicationId` |
| POST | `/api/import/publications` | Public | Import records through normalization/deduplication pipeline |
| GET | `/api/import/sources` | Public | List supported sources |

The merge service combines supported metadata and soft-flags the duplicate; it does not physically delete the duplicate document.

### Research data integrations

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/api/integrations/orcid/:facultyId` | Public | Retrieve normalized ORCID public works |
| POST | `/api/integrations/orcid/:facultyId/import` | Public | Import supplied/fetched ORCID works |
| GET | `/api/integrations/scopus/:facultyId` | Public | Retrieve normalized Scopus records |
| POST | `/api/integrations/scopus/:facultyId/import` | Public | Import supplied/fetched Scopus records |
| GET | `/api/integrations/google-scholar/:facultyId` | Public | Retrieve via permitted provider |
| POST | `/api/integrations/google-scholar/:facultyId/import` | Public | Import supplied Google Scholar records |

ORCID uses `ORCID_API_BASE_URL` (default public API). Scopus requires `SCOPUS_API_KEY`. Google Scholar has no direct official public API here; a permitted provider such as SerpApi or user-supplied import data is required. Credentials are not included in the repository.

### Emerging research

| Method | Endpoint | Access | Purpose/parameters |
|---|---|---|---|
| GET | `/api/analytics/emerging-research` | Public | Analyze predicted-domain publication growth; optional `recentYears`, `minimumPublications`, `minimumGrowthRate` |

The service counts predicted domains by year, excludes duplicates, compares adjacent years, and applies recency/count/growth thresholds. Defaults: three years, two publications, 20% growth. Ranking score for emerging domains is `clamp(growthRate + min(0.5 × latestCount, 10), 0, 100)`. This is a heuristic, not ML prediction.

### Collaborator recommendations

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/api/analytics/collaborator-recommendations/:facultyId` | Public | Rank other faculty by distinct shared manual/predicted domain names |

Score is one point per distinct shared domain. Existing collaboration is informational and does not raise score. Malformed IDs return 400; unknown faculty returns 404.

### Productivity forecast

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/api/analytics/productivity-forecast/:facultyId` | Public | Forecast next-year publications from faculty yearly history |

Uses least-squares linear regression; at least two observed years are required. Forecasts are non-negative and rounded to two decimals. The response includes trend, annual change, average, historical totals, and R² fit. R² is a statistical fit metric, not a probability or guarantee.

### Research Assistant

| Method | Endpoint | Access | Request |
|---|---|---|---|
| POST | `/api/analytics/research-assistant` | Public | `{ "question": "...", "facultyId": "optional MongoDB ID" }` |

Supported intents: `PUBLICATION_COUNT`, `CITATION_STATISTICS`, `RESEARCH_DOMAINS`, `EMERGING_RESEARCH`, `COLLABORATOR_RECOMMENDATIONS`, `PRODUCTIVITY_FORECAST`, `HELP`, and `UNKNOWN`. It routes by deterministic keywords and reuses existing analytics/services. Response includes intent, answer, structured data, and sources. It is not an LLM and calls no external AI API. It does not infer a faculty identity from free text.

### Reports

There is no `/api/reports` endpoint. `reports.html` builds institution/faculty views from existing faculty, publication, overview, yearly, department, domain, collaboration, emerging-research, and forecast APIs. CSV is generated in the browser; Print / Save as PDF uses the browser print dialog. Profile aggregates and linked-publication totals are labeled separately. Period selection applies to linked records/yearly data; some existing aggregate endpoints are all-time.

## 5. Analytics Methods

### Research-domain classification

`domainClassification.service.js` compares title, abstract, and keywords against `domainVocabulary.js` using phrase, keyword, acronym, location, and composite-evidence rules. Defaults include a raw score threshold of 2.0, confidence threshold 0.40, and maximum five domains. Predictions include confidence, matched evidence, and classifier metadata. It is explainable rules-based classification, not machine learning. Manual domains remain separate.

### Duplicate detection and merge

`duplicateDetection.service.js` normalizes DOI and titles and combines exact/fuzzy title, year, and author signals. Candidate records go through review. Only confirmed reviews can be merged. Merge combines supported metadata and marks the duplicate with `isDuplicate`, `mergedInto`, and `mergedAt`; analytics exclude flagged records where specified.

### Emerging research

Counts predicted-domain names by publication year on active records. Trend direction and growth compare the latest year with the prior calendar year. Emerging status uses recentness, increase, minimum recent count, and minimum growth rate. Score/rank are deterministic heuristics; not AI or forecasting.

### Collaborations and recommendations

The collaborations endpoint creates unique faculty pairs from each non-duplicate publication’s `facultyIds`. Recommendations compare distinct manual and predicted domain names; each shared domain adds one point. Existing collaboration is separately reported and does not boost the recommendation score.

### Productivity forecast

Yearly linked publication counts feed ordinary least-squares regression for the next year. The service excludes duplicate records and invalid years, requires two years, clamps negative forecasts to zero, and reports trend/average/annual change/R². Stable trend tolerance is 0.1 publications/year.

### Research Assistant

Keyword rules map questions to supported intents. The service invokes existing analytics handlers and Phase 13–15 services. Unsupported questions return help rather than unsupported claims. No LLM, embeddings, external AI API, or vector database is used.

## 6. Configuration and Local Run

Backend configuration is read from `backend/.env`; variable names and placeholders are in `backend/.env.example`. Do not commit credentials.

Important variables: `PORT` (default 5000), `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, optional `ORCID_API_BASE_URL`, `SCOPUS_API_KEY`, `SCOPUS_API_BASE_URL`, `SERPAPI_API_KEY` or `SCHOLAR_PROVIDER_API_KEY`, and optional provider base URL.

Run backend and frontend in separate terminals:

```sh
cd backend
npm install
npm start
```

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080/`. The API base defaults to `http://localhost:5000/api`; `js/config.js` supports `window.__API_BASE_URL__` override.

## 7. Testing and Verification

From `backend/`, run `npm test`. Final verified result: **152 passed, 0 failed, 0 skipped**. Coverage includes authentication/authorization, APIs, analytics, classification, deduplication/review/merge, duplicate exclusions, recommendations, emerging research, forecasting, and assistant behavior.

`tests/testDatabase.js` selects `TEST_MONGODB_URI` if supplied. Otherwise, it derives a database suffixed `_test` from `MONGODB_URI`; without an application URI it uses local `research_platform_test`. The final browser verification covered all seven pages, navigation/refresh, Insights/Reports requests, CSV payload, print styling, 375px/1280px widths, and browser console/resource errors. Browser verification is manual/Playwright; `npm test` is backend-focused.

## 8. Data Quality and Limitations (2026-10-01 Snapshot)

No live publication records were deleted, merged, or relinked during the audits.

### Duplicate candidates — manual review required

Snapshot: 181 Publication documents, 178 active and 3 flagged duplicates. Strict checks found 22 exact-DOI groups with 76 excess active records and 20 normalized-title/year groups with 99 excess records; groups overlap. Some titles look like synthetic test/validation fixtures, but the canonical records have not been selected. No automatic merge/delete was performed.

The live DuplicateReview collection currently contains zero records. Earlier test suites used the application database and included `DuplicateReview.deleteMany({})`; the prior collection state cannot be established. Test URI isolation has now been fixed for future runs.

### Unlinked publications — manual review required

There were 146 active publications without faculty links; 25 contained an author string matching a current faculty name, concentrated in repeated/synthetic-looking title families. Names alone are not enough evidence to create relationships, so no links were added.

### Profile aggregate versus linked data — manual source review required

Faculty profile counters are stored all-time profile aggregates (which may reflect broader source totals) and differ from the internal linked-publication subset. The Faculty schema stores aggregate counters, not separate per-provider publication/citation counters. Snapshot examples:

| Faculty | Profile publications / citations | Linked active records / linked citations |
|---|---:|---:|
| Dr. Anjali Mehta | 58 / 2,140 | 3 / 128 |
| Dr. Priya Nair | 22 / 410 | 2 / 37 |
| Dr. Rahul Verma | 24 / 680 | 20 / 452 |
| Dr. Rakesh Sharma | 37 / 980 | 3 / 79 |
| Dr. Sneha Kulkarni | 16 / 260 | 2 / 30 |
| Dr. Vikram Desai | 76 / 3,120 | 3 / 124 |

Forecast histories matched linked active records with valid years, so duplicate filtering does not explain the difference. Neither aggregate source was overwritten.

### Other limitations

- Manual-domain references validated and manual analytics reconcile. There are currently no active predicted-domain records; live confidence values cannot be checked against current predictions.
- Stored Collaboration records: zero. Publication-derived collaboration analytics has one valid pair, no self-pair, and matches linked active records.
- Four faculty have valid ORCID IDs; all reads returned 200. Three currently expose zero works and one exposes six.
- A Scopus ID is present, but `SCOPUS_API_KEY` is not configured. The API correctly returns 503 / `SCOPUS_API_KEY_MISSING`; this is configuration, not a code failure.

## 9. Known Finalization Fixes

1. **Reports configuration:** Added the missing existing `js/config.js` include after the report script failed with undefined `APP_CONFIG`.
2. **Test isolation:** Added `backend/tests/testDatabase.js` and updated eight suites to use a dedicated test database rather than application `MONGODB_URI`.
3. **Responsive layout:** Fixed narrow-screen overflow in `css/style.css`, verified at 375px and 1280px.

No analytics algorithm, API response structure, or live record was changed during documentation/finalization.

## 10. Recommended Demonstration Sequence

1. Sign in with an existing demonstration account.
2. Review dashboard KPIs, charts, departments, and domains.
3. Browse Faculty Directory and open one faculty profile.
4. Review linked publications and research domains.
5. Open Insights and select a faculty.
6. Show collaborator suggestions and explain shared-domain scoring.
7. Show Emerging Research; an empty state is expected when there are no predicted-domain trends.
8. Show productivity history, forecast, and R² fit metric.
9. Ask a supported Research Assistant question with optional faculty context.
10. Generate institution-wide and faculty Reports; explain all-time versus period-filtered fields.
11. Download CSV and use Print / Save as PDF.

The report preview presents existing API data and does not create new analytics.

## 11. Presentation Outline

1. **Problem:** Research activity spread across faculty/source records.
2. **Objective:** Link faculty and publication data and make current research activity reviewable.
3. **Architecture:** Static browser UI → Express REST API → controllers/services → Mongoose/MongoDB.
4. **Core modules:** Faculty, publications, source integrations, analytics, duplicate review.
5. **Domain analysis:** Manual assignments plus explainable rule-based predictions.
6. **Research intelligence:** Trend heuristic, shared-domain recommendations, regression forecast, deterministic assistant.
7. **Reports:** Live API data, preview, CSV, browser print.
8. **Verification:** 152 backend tests pass; frontend checked at mobile and desktop widths.
9. **Limitations:** Scopus credential, absent predicted data, incomplete faculty-publication links, duplicate groups awaiting review.
10. **Next work:** Data owner reviews duplicate candidates and unlinked publications; no automatic cleanup was performed.