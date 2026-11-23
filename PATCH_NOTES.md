# WritSpeak dashboard UX patch — 23 November 2026

Focused navigation and UX improvement for the student dashboard at `writspeak.com/app`,
built **from the live bundle itself** (all 35 app assets + the `/reading` page were fetched
and audited; every change is assertion-checked by `scripts/patch_dashboard.py` and verified
in a headless browser — 25/25 DOM assertions PASS, no page errors).

**Nothing has been deployed.** The files in this folder are drop-in replacements for the
same-named files in your hosting folder (`WritSpeak Maps\hosting\public\`). Copy them in,
then run `npx wrangler deploy`.

## What was audited (before any change)

- App shell (`/app`): sidebar markup, Quick access grid, tabs driven by `dashtabs.js`
  (home / skill / practice / plans / reports / mocks / contact), hash routing.
- Modules: `skills.js` renders Writing / Speaking / Listening; Reading is a separate page
  at `/reading` (own scripts). Mocks: `mocks.js` (four-skill mock, 60-minute Writing mock,
  full Speaking tests, full Listening tests — Listening m1 live, m2–m4 show "coming soon"
  for Listening); Reading papers open via `/reading?mock=mN`.
- Reports: server history table (Writing/Speaking), Reading+Listening progress card,
  recurring mistakes, trend, band calculator, device-only Studio drafts and downloadable
  reports. Credit system: server-counted ("N of X mock credits remaining", per-assessment
  Writing credits, refund on failure).

## Changes by requirement

### 1. Credit messages — only where a charge really happens
| Location | Before | After |
|---|---|---|
| Writing module · Practice Studio card (`skills.js`) | "No credit used while you practise" | "Drafting and timing are free" |
| Writing module · 60-minute Writing test card | "Uses one Writing credit when assessed" | kept in context, clearer: "Uses one Writing credit, only when assessed" |
| Listening module head (`skills.js`) | "…No credit is used." | note removed |
| Listening workspace how-to (`app.js`) | "Your Listening practice does not use an AI assessment credit." | removed |
| Listening mock result help (`app.js`) | "…with no AI and no credit used." | "Marked securely against the answer key." |
| Mock exams page, mock intro facts, Writing mock run screen (`mocks.js`) | credit wording | **unchanged — real-charge contexts** |

### 2. Main dashboard navigation
- Added a **"My reports"** button to the Quick access grid (`app.html` + routing in
  `dashtabs.js`), so scores/reports/progress are reachable from the dashboard itself.
- The existing "Mock exams" Quick access button stays as the single dashboard-level mock
  hub — with the sidebar item removed (below) there is no duplication left.
- "Where to start" unchanged (Your next task + Today's challenge preserved).

### 3. Sidebar
- Standalone **Mock exams item removed** from the sidebar (`app.html`), from the mobile
  "More" panel and from the shared section nav used by `/reading` (`sidebar.js`).
- The `#mocks` view, routes and all deep links still work: mocks are reached through each
  module (below) and the dashboard Quick access button.

### 4. Module structure — two primary options everywhere
- New **entry strip** at the top of Writing, Speaking and Listening (`skills.js`):
  **Practice tests** scrolls to the module's practice area; **Mock exams** opens the
  module's existing mock interface (Writing → the 60-minute Writing test card; Speaking →
  Full Speaking tests; Listening → Full Listening tests, or the Mock exams page if none are
  published yet). Styled in `skills.css`; uses existing handlers only — no duplicated systems.
- **Reading** (`reading.html`): same two options — "Practice tests" jumps to the test list,
  "Mock exams" opens `/app#mocks` where the 60-minute Reading paper lives inside the full mock.
- The Listening page now matches your reference screenshot's pattern on every module.

### 5. Reports (`dashtabs.js`)
- **Performance by IELTS skill**: four summary cards (Writing, Speaking, Listening, Reading)
  — latest band / raw score, assessment counts, best band. Every figure comes from recorded
  activity: server history for Writing/Speaking, server learning stats for Reading/Listening.
  Nothing invented, nothing duplicated (existing sections kept below it).
- **Mock exams section**: per-mock parts completed and status, read from the same on-device
  store the Mock exams page writes (`ws_mocks`); an "Open Mock exams" action is included.
  The Writing mock band continues to appear under Downloadable reports (existing flow).
- Reports **stays a standalone sidebar item** — it is the single aggregation point; the
  dashboard shows the mini trend and links to it. No second reporting system created.
- Lead text updated: "Every assessment across all four IELTS modules, newest first."

## Files in this folder (drop-in replacements)

`app.html`, `sidebar.js`, `skills.js`, `skills.css`, `app.js`, `dashtabs.js`, `reading.html`
— plus `_test_skills.html` / `_test_reports.html`, the headless-browser harnesses used for
verification (safe to delete; they are not part of the site).

## Verification performed

- Every replacement assertion-checked against pristine live files (mismatch = abort).
- `node --check` passes on all four patched JS files.
- Headless-browser DOM tests with a stubbed data layer: module entry strips render with
  exactly two options and scroll to the right sections; credit strings removed/kept exactly
  where intended; Reports renders the 4-skill summary exactly once with correct figures from
  history + learning stats, mock progress from the device store, existing table kept, correct
  section order. 25/25 PASS, zero page errors.

## Notes and limits

- The patched files come from the live bundle. If your hosting folder contains a newer
  version or a build step, re-apply equivalents there (the patch script's replacements are
  the spec) — or upload the hosting folder zip and I merge + verify in place (Path A).
- Server-side credit enforcement, the API, and Dodo Payments are untouched.
- One check only you can do after deploy: sign in, open each module, click both entry
  buttons, and scan the Reports tab on a phone width.
