# Research Analytics & Faculty Profiling Platform

An academic research data platform with faculty and publication management, MongoDB-backed analytics, source integrations, duplicate review, domain classification, emerging-research analysis, collaborator recommendations, productivity forecasting, a rule-based Research Assistant, and live report preview/export.

The frontend is static HTML/CSS/vanilla JavaScript. The backend is Node.js/Express with Mongoose and MongoDB. Research classification, recommendations, trend detection, forecasting, and assistant intent handling are explainable rules/statistics; there is no external LLM or generative AI API.

## Documentation

See [docs/FINAL_PROJECT_DOCUMENTATION.md](docs/FINAL_PROJECT_DOCUMENTATION.md) for architecture, database models, API reference, analytics methods, configuration, testing, data-review items, demo sequence, and presentation outline.

## Run Locally

Configure `backend/.env` from `backend/.env.example` without committing credentials, then start the API:

```sh
cd backend
npm install
npm start
```

Serve the frontend from the repository root in another terminal:

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080/`. The API defaults to `http://localhost:5001/api` because port 5000 is occupied on macOS by the system ControlCenter service.

## Tests

From `backend/`, run:

```sh
npm test
```

The final verified result is **152 passed, 0 failed, 0 skipped**. Tests use `TEST_MONGODB_URI` or an isolated database whose name ends in `_test`; see the detailed documentation for the resolver behavior.
