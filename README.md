# Prashnakosh

An exam-preparation and question-paper generation platform for Indian competitive examinations. A structured question bank (Exam → Subject → Chapter → Topic → Question) drives a paper generator that follows each examination's blueprint: subjects, chapters, difficulty mix and marking scheme.

This is the **browser build**: plain static files, no server and no build step. It runs on GitHub Pages or any static host.

## Try it

Open the site and use a demo account on the sign-in screen:

| Account | Email | Password |
|---|---|---|
| Administrator | admin@prashnakosh.demo | Admin@123 |
| Content reviewer | reviewer@prashnakosh.demo | Review@123 |
| Student, Premium plan, with sample history | student@prashnakosh.demo | Student@123 |
| Student, Free plan | arjun@prashnakosh.demo | Student@123 |

You can also register a new student account.

## Publish on GitHub Pages

1. Create a new **public** repository on GitHub, for example `prashnakosh`.
2. Upload every file in this package to the repository root. All files sit in one folder, so there is no folder structure to keep. On github.com: **Add file → Upload files**, select all the unzipped files, drag them in, then **Commit changes**.
3. Go to **Settings → Pages**. Under **Build and deployment**, set **Source** to *Deploy from a branch*, choose branch `main` and folder `/ (root)`, then **Save**.
4. After a minute or two the site is live at `https://<your-username>.github.io/prashnakosh/`. Share that link.

## Run locally

```
python3 -m http.server 8765
```

Then open http://localhost:8765. (Opening `index.html` directly from disk will not work, because browsers block ES modules on `file://`.)

## How data is stored

Every visitor gets their own private copy of the platform, with the sample content loaded on first visit, saved in that browser's local storage. Nothing is shared between visitors, so a public demo link is safe: one visitor's edits never affect another's. Clearing site data, or **System checks → Reset workspace** as administrator, restores the sample content.

When the same files run inside Claude as an artifact, data is saved to the viewer's Claude account instead, and AI drafting becomes available.

## What works without Claude

Everything except **AI drafting** and the AI helpers in the question editor (explanations, distractors, topic suggestions), which need the Claude connection. Downloads (PDF and CSV) use normal browser downloads.

## Tests

```
npm test                  # engine, scoring, generation, storage (Node 20+)
python3 e2e_browser.py    # browser journeys; needs Playwright and a local server on :8765 (or set PK_URL)
```

## Limits of this build

- No shared backend: roles and accounts live inside each visitor's copy, so real students cannot sign up to a common platform yet. Passwords are hashed (PBKDF2), but this is a demo, not production authentication.
- Scoring runs in the browser. The exam screen never receives the answer key, but a determined user could find it in local storage. Server-side scoring removes this.
- Payments are not connected. Upgrade requests are granted manually by the administrator; no transaction is ever simulated.
- All questions are original **sample** content and exam patterns are **unverified samples**, labelled as such in the app. Review both before any launch.
- PDF exports use built-in Latin fonts, so Hindi text is replaced with a note.

## Structure

All files live in one folder so the site works however it is uploaded.

```
index.html, app.css       app shell and styles (light and dark)
engine.js                 paper generation, scoring, validation, analytics, entitlements (pure, tested)
domain.js                 workspace-level helpers (blueprint → paper spec, readiness)
seed.js, seed-questions.js  sample exams, taxonomy and questions
store.js                  state, storage adapters, permission-checked actions, audit log
selftest.js               in-app system checks
app.js, core.js, auth.js, student.js, runner.js, results.js, pdf.js,
admin.js, admin-content.js, admin-exams.js   Preact + htm views
preact-htm.js             Preact 10 + htm standalone bundle
*.test.mjs, e2e_browser.py  tests
```
