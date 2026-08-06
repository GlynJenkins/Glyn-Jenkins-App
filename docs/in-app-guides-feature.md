# Feature Brief — In-app How-to Guides + PDF download

**Goal:** Put the how-to guides inside the app.
- **Foreman** sees a **"How-to Guide"** on their page (the foreman guide).
- **Management** has a **Guides / Help** area showing **both** the Management guide **and** the Foreman guide (so they can see what foremen see).
- Each guide has a **Download PDF** button.

**Already in the repo (done for you):**
- Guide text (Markdown): `src/content/guides/foreman-guide.md` and `src/content/guides/management-guide.md`.
- Branded PDFs: `public/guides/foreman-guide.pdf` and `public/guides/management-guide.pdf` (served at `/guides/foreman-guide.pdf` and `/guides/management-guide.pdf`).

So the download buttons just link to those static PDF URLs — no PDF generation needed. The on-screen text renders from the Markdown files.

**Repo context:** Next.js 15 App Router + Supabase. Foreman pages guard with `requireForemanAccess()`, admin pages with `requireAdminAccess()`.

**How to use:** Save as `docs/in-app-guides-feature.md`, do the tasks in order.

---

## Task 1 — Render the Markdown nicely

- Add a small Markdown renderer so the `.md` guides display cleanly (headings, numbered steps, bullets). `react-markdown` is the simplest (`npm i react-markdown`). Wrap it with Tailwind `prose` classes (or your own styles) so it reads well on a phone.
- Create a shared `GuideView` component that takes a guide's Markdown string + a PDF href and renders: the formatted guide with a **Download PDF** button at the top.
- Load the Markdown: import the file as a string (e.g. via a server component reading `src/content/guides/*.md`), or move the two files to wherever your build imports raw text most easily. Keep both the on-screen text and the PDF pointing at the **same content** so they don't drift.

## Task 2 — Foreman guide page

- New page **`/foreman/guide`** (guard `requireForemanAccess()`): render `foreman-guide.md` via `GuideView`, with **Download PDF** → `/guides/foreman-guide.pdf`.
- Add a **"How-to Guide"** link/tile on the foreman dashboard (`/foreman`) — near the top or in a footer, clearly labelled (a small "?" or "Help" icon works). It should be easy to find on a phone.

## Task 3 — Management guides area

- New page **`/admin/guides`** (guard `requireAdminAccess()`) with **two tabs or two sections**: **Management guide** and **Foreman guide**, each rendered via `GuideView` with its own **Download PDF** button (`/guides/management-guide.pdf` and `/guides/foreman-guide.pdf`).
- Add a **"Guides / Help"** tile to the admin dashboard (`/admin`) under a "System" or "Help" group, linking to `/admin/guides`.

## Task 4 — Verify

- As a **foreman**: the dashboard shows a How-to Guide link; opening it shows the foreman guide, and Download PDF downloads `foreman-guide.pdf`.
- As **management**: the dashboard has a Guides tile; the page shows both guides, each with a working Download PDF.
- Both guides read cleanly on a phone screen.

---

## Notes
- **Keeping guides current:** when the app changes, update the Markdown in `src/content/guides/` and regenerate the PDFs (or ask Claude to). If you'd rather the PDF always match the on-screen text automatically, swap the static PDF link for on-the-fly generation with `pdf-lib` from the same Markdown — more work, not needed for v1.
- **Supervisor roles:** if/when Contracts Manager & Site Supervisor get their cut-down area, you can drop the same `GuideView` (foreman or a tailored guide) onto their page too.

## Suggested order
Task 1 → 2 → 3 → 4. Commit each separately.
