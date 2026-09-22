# AI-Powered Research Analytics & Faculty Profiling Platform
### SGP Project — Review 1 (Month 1 deliverable)

## 1. What this build covers

This is the **first-month prototype**, scoped to what's realistic to show at Review 1:
data modelling, UI/UX design, and a working front-end shell wired up to sample
("mock") data that stands in for records pulled from Google Scholar, Scopus and ORCID.

**Included in this build:**
- Login screen (UI only — no real auth yet)
- Dashboard with institution-wide KPIs and year-wise publication/citation trend charts
- Faculty directory with search, department filter and sorting
- Individual faculty profile page (metrics, source breakdown, publication list)
- Publications module with multi-filter search (faculty, year, type, source)
- Report builder screen — configures scope and previews a report on-screen
- Mock dataset for 5 faculty and 14 publications, structured the way real
  Google Scholar / Scopus / ORCID API responses would be shaped

**Not included yet (planned for later sprints):**
- Live API integration with Google Scholar, Scopus, ORCID and institutional repositories
- Real authentication / role-based access
- PDF / Excel export of reports
- AI modules: emerging-area detection, collaborator recommendation, productivity forecasting
- Collaboration network graph

These are flagged directly in the UI (greyed-out nav items, "planned" badges on the
dashboard roadmap card) so the scope is transparent during the review.

## 2. Tech stack

- HTML5 / CSS3 (custom design system, no framework)
- Vanilla JavaScript
- Hand-written SVG chart renderers (`js/charts.js`) — no external chart library,
  so the whole thing runs **fully offline**, which matters for a demo in a room
  without reliable Wi-Fi
- Data layer: `js/data.js` (mirrors `data/faculty.json` and `data/publications.json`,
  which are kept alongside as the reference schema for the real API integration)

## 3. How to run

No build step, no server, no npm install needed.

1. Unzip the folder.
2. Open `index.html` in any modern browser (Chrome/Edge/Firefox).
3. Click **Sign in** on the login screen to enter the dashboard.

If you'd rather serve it locally (optional):
```
cd research-platform
python3 -m http.server 8000
```
then open `http://localhost:8000`.

## 4. Folder structure

```
research-platform/
├── index.html              → Login / landing page
├── dashboard.html           → Main analytics dashboard
├── faculty.html              → Faculty directory
├── faculty-profile.html      → Individual faculty profile
├── publications.html         → Publications list + filters
├── reports.html               → Report builder / preview
├── css/style.css              → Design system (white + blue theme)
├── js/data.js                  → Mock dataset (mirrors data/*.json)
├── js/charts.js                 → Dependency-free SVG chart helpers
└── data/
    ├── faculty.json              → Reference schema for faculty records
    └── publications.json          → Reference schema for publication records
```

## 5. Data model (used to plan the real integration)

**Faculty record** — id, name, designation, department, email, ORCID iD,
h-index, i10-index, total citations, total publications, research areas,
per-source metrics (Google Scholar / Scopus / ORCID), year-wise
publication & citation counts.

**Publication record** — id, faculty id, title, year, venue, type
(journal/conference), citation count, source.

This mirrors the fields actually exposed by the Google Scholar (via
scraping/SerpAPI), Scopus (Elsevier API), and ORCID public API, so swapping
the mock data layer for live calls later shouldn't require reshaping the UI.

## 6. Next sprint (Month 2 preview)

1. Connect ORCID public API (no key required) for real publication pulls
2. Add Scopus API integration (institutional API key)
3. Persist data in a database (planned: PostgreSQL) instead of static JSON
4. Build the collaboration-network graph view
5. Start the AI module: trend/emerging-area detection on collected abstracts
# research-platform
