# hr_dashboard.html — build log, 4–5 Aug 2026

**Prototype** [hr_dashboard.html](hr_dashboard.html) — one self-contained file, ~3.9 MB,
opened directly from disk. No CDN, no external scripts, stylesheets, fonts or images, no
build step. All data is embedded in a single `const D` object (44 tables); nothing is fetched
at runtime.

**Database access** read-only throughout. Only `SELECT` and `sys.*` catalog reads were
issued, enforced by a wrapper that refused any statement containing `insert`, `update`,
`delete`, `merge`, `create`, `alter`, `drop`, `truncate`, `exec`, `grant`, `backup` or
`into`. The client was a throwaway virtualenv, deleted afterwards; no credential was written
to any file.

---

## 1. Two defects found and fixed

### The page was blank

Three variable declarations were missing from the Attendance report section, referencing
elements that exist in the markup: `repTitle`, `repUnit` (the `#rep-title` and `#rep-unit`
elements) and the whole employee filter bar (`eQ`, `eDep`, `eT`, `eBand`, `eCount`, `eF[]`
for `#e-q`, `#e-dept`, `#e-type`, `#e-band`, `#e-count`, `#e-f1`–`4`).

The code that *used* them was present; only the `getElementById` block and the event wiring
had been lost. The whole file is one `<script>`, so the first use threw and every later
section stopped running — every tab blank. Added the declarations and the matching wiring.

### The KPI tiles did nothing when clicked

`wireTiles()` was defined but never called. The tiles render with `class="clk"`, `data-k`
and `role="button"`, so they looked and focused like buttons, but no handler was ever
attached. It cannot be wired once at startup — the tile markup is replaced on every render —
so the call was added at the end of `render()`.

**A second defect surfaced once the tiles worked.** The Total tile's drill-down promised
"every staff-day in the period — present and absent together" but collected only days with
punches, listing 1,280 against a tile reading 1,688. The absent staff-days are now collected
for that tile too. All seven tiles reconcile: 211 · 8 · 1,280 · 408 · 1,688 · 194 · 113.

---

## 2. Shared table features

Built inside the single `table(el, key, opts)` renderer, so all 27 tables gained them at once.

- **Export on every table**, replacing the three ad-hoc CSV buttons, which keep their places
  but now open the shared dialog.
- **Column chooser on export** — every column listed with a checkbox, all ticked, in current
  order. The file respects the current search, filters and sort, and **ignores the on-screen
  row cap**: several tables draw only the first 60 or 1,000 rows, and a file that quietly
  stopped there would read as complete when it was not. Verified — a table capped at 5 rows
  exported all 814.
- **Column manager on Cmd+G / Ctrl+G**, and on a "Columns" button on every table. Reorder
  left and right, show or hide, reset to original. Changes apply to the table immediately and
  become what the export offers.
- **Layouts persist** per table via `localStorage`, wrapped in try/catch with an in-memory
  fallback, because storage behaves differently on `file://` pages and a throw would blank
  the page.

**On the shortcut:** Cmd+G / Ctrl+G is the browser's own "find next". `preventDefault`
suppresses it while focus is in the page, which it is in normal use, but once the native find
bar has focus the keystroke never reaches the page and cannot be intercepted. The Columns
button on each table is the reliable and discoverable path; the shortcut sits on top of it.

---

## 3. Overview tab

The first tile now reads **Total active employees 211** (badged during 2025-2026) and 814
moved to a second tile as **Employee records on file**. Labelling 814 as active would have
overstated it fourfold.

Below the tiles, a **permanent grid of 15 cards with 82 clickable counts**, in the shape of
the HRMS HR Dashboard. Clicking any count opens the people behind it in a table below; the
cards stay on screen, so you can move between categories without going back. Clicking a
person opens their record.

**Each card opens with its own columns.** Clicking Visa gives visa number, type, issue date,
expiry date and status alongside the identity block — not the full 23-column sheet. Same for
Passport, Emirates ID, Labour card and Contract, each remembering its own layout.

**A scope selector offers five populations** so any figure on either screen can be reproduced
and opened. Default is All employee records (814), which agrees with the HR system's own
Active / Ex-employee counts on sight. See
[hr_hrms_reconciliation.md](hr_hrms_reconciliation.md).

Two card groups are deliberately not clickable and say why: document coverage is near-empty
at source (3 to 12 rows against 814), and rendering those as "0" would read as a finding
about staff rather than a gap in what was entered.

---

## 4. Workforce tab

Filters added to the Full employee roster (standing, department, staff type, gender, search)
plus the shared export.

The STATUS and FLAG columns were replaced by **one Standing column**, exhaustive over all 814
records, with the full definition table printed underneath.
See [hr_standing_classification.md](hr_standing_classification.md).

---

## 5. Attendance report tab

Dropdown filters and export added to the By department card. Export added to the Employee
attendance table. The row click opening a person's day-by-day history still works.

---

## 6. Attendance analysis tab

A From/To date range now drives the six KPI tiles, the day-of-week chart, the daily punch
volume chart and the per-employee table, all recomputed in one pass over the 28,416-row
per-day table.

### Definitions, verified against the published figures

- Days restricted to school-open days. With this restriction, days present and punch counts
  reproduce the published per-employee figures for all 211 staff; without it, 20 differ.
- A late arrival is a first punch **strictly after** 08:00. `>` reproduces the published late
  counts for all 211; `>=` reproduces only 161.
- Average arrival **truncates** to the minute rather than rounding. Truncation reproduces all
  211; rounding reproduces 122.
- Hours exclude days with no out punch.

### Population change, stated on the page

The per-day table covers the 211 people whose badge matches an employee record. The tab's
published headline figures counted every badge holder, including the 95 badges with no
matching record. Four of six tiles therefore read lower, and the tab says so:

| Tile | Was | Now |
|---|---:|---:|
| School open days | 242 | 242 |
| Average hours on site | 7.8 | 7.8 |
| Staff seen on site | 238 | 211 |
| Average arrival time | 07:08 | 07:05 |
| Late arrivals | 1,931 | 1,587 |
| Days with no out punch | 3,888 | 3,496 |

Matched employees is the population used, so the tiles, the day-of-week chart and the
per-person table all describe the same group. The daily punch volume chart keeps every badge
holder and is labelled as running slightly above the tiles.

### One chart the date range cannot reach

"When staff arrive and leave" counts every punch, not one per person per day — 34,114
arrivals against 28,416 person-days. The individual punch rows are not embedded in the page,
so it cannot be rebuilt for a sub-period. It is left as a full-year chart and labelled as
such, rather than silently redefined under its existing title.

### Acceptance test — full academic year, 211 employees

| Column | Result |
|---|---|
| days_present, open_days, attend_pct, avg_arrival | 211/211 exact |
| no_out_days, late_days, punches, last_seen, days_since | 211/211 exact |
| avg_hours | 194/211 exact; the rest exactly 0.1 out |

**Average hours cannot reproduce exactly.** The per-day table stores each day's hours already
rounded to one decimal, so averaging them cannot always land where averaging the underlying
minutes did. The page states this.

**One header was corrected.** `days_since` was published as calendar days while its column
header read "Open days since". The number is kept, matching the neighbouring "Staff absent
from site" card; the header now reads "Days since last seen".

---

## 7. Leave & calendar tab

Export with the column chooser on every table, including the 668-row per-employee leave
table. No date range: leave is recorded per academic year rather than per date, so a From/To
range has nothing to bind to.

---

## 8. Data added

A 44th table, `hrms`, holding 814 rows × 24 fields extracted read-only: `em_status`,
`em_service_status`, `em_staff_type`, gender, nationality (joined to `sims_nationality`, 57
distinct), mobile (369 populated), date of birth (all 814), and number, issue date and expiry
date for Emirates ID, passport, visa, labour card and contract.

---

## 9. Verification

Run under a scripted DOM against the real file after every change.

| Check | Result |
|---|---|
| Script runs with no uncaught error | pass |
| All 9 tabs render content | 9/9 |
| Tables with export and column manager | 27, none untitled |
| Every record classified into exactly one standing | 814/814 |
| Overview cards and clickable counts | 15 cards, 82 counts |
| Attendance report tiles wired and reconciling | 7/7 |
| Export of a table capped at 5 rows | 814 rows written |
| CSV quoting | no malformed lines |
| Empty date range | empty states, no NaN, no throw |
| Modal closes and returns focus | pass |
| External references in the file | 0 |

**Not verified:** visual layout. Everything above was checked under a scripted DOM, not a
real render, so card grid proportions, dialog sizing and dark mode should be reviewed in a
browser.

---

## 10. Known limits

- **Average hours** differs from the previously published figure by 0.1 for 17 of 211 staff,
  for the rounding reason above.
- **Emirates ID "No Data 267"** on the HRMS screen matches no population in the table. Open.
- **Email cannot be shown or exported** — empty across all 814 employees and all 6,739 user
  accounts. **Mobile is blank for 445 of 814.** See
  [hr_hrms_reconciliation.md](hr_hrms_reconciliation.md).
- **"Not on site this year" (589 records) cannot be split** into departed and still-employed
  from data in the page.
- **Document cards will read almost entirely "No data"** — 1 passport, 2 visas, 1 labour
  card, 1 contract with expiry dates across the active population. That is the state of the
  record, not a rendering gap.

---

## Files

| File | What it is |
|---|---|
| [hr_dashboard.html](hr_dashboard.html) | the prototype — open it directly, no server needed |
| [hr_standing_classification.md](hr_standing_classification.md) | the standing scheme: categories, rules, threshold, limits |
| [hr_hrms_reconciliation.md](hr_hrms_reconciliation.md) | where every HRMS figure comes from, with the queries |
| [hr_dashboard_changelog.md](hr_dashboard_changelog.md) | this file |
| [hr_schema_notes.md](hr_schema_notes.md) | earlier schema discovery (1 Aug) |
| [hr_enhancement_backlog.md](hr_enhancement_backlog.md) | earlier proposals, none built (3 Aug) |
| [hr_consolidated_report.sql](hr_consolidated_report.sql), [hr_report_views.sql](hr_report_views.sql) | the query set behind the embedded data |
| [hr_report_output.html](hr_report_output.html) | the earlier static report, superseded by the dashboard |
