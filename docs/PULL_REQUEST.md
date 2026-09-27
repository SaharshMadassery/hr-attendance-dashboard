# Fix blank dashboard, wire KPI drill-downs, and reconcile attendance definitions against the HR system

## Summary

The HR/attendance dashboard is a single self-contained HTML file — no CDN, no external scripts, stylesheets, fonts or images, no build step. All data is embedded in one `const D` object (44 tables); nothing is fetched at runtime. It opens directly from disk.

This PR fixes two defects that made it unusable, fixes a third that surfaced once the first two were fixed, adds shared table tooling to all 27 tables at once, and — the substantive part — pins down six attendance definitions by reconciling computed output against the HR system's own published figures rather than trusting the code.

Database access was read-only throughout. Only `SELECT` and `sys.*` catalog reads were issued, enforced by a wrapper that refused any statement containing `insert`, `update`, `delete`, `merge`, `create`, `alter`, `drop`, `truncate`, `exec`, `grant`, `backup` or `into`. No credential was written to disk.

## The defects

**1. Every tab rendered blank.** Three `getElementById` declaration blocks had been lost — `repTitle` / `repUnit` (the `#rep-title` and `#rep-unit` elements) and the entire employee filter bar (`eQ`, `eDep`, `eT`, `eBand`, `eCount`, `eF[]`). The code that *used* them was fully present; only the declarations and event wiring were missing. Because the whole file is one `<script>`, the first undefined reference threw and every later section stopped executing. Restored the declarations and the matching wiring.

**2. The KPI tiles did nothing when clicked.** `wireTiles()` was defined but never called. Tiles render with `class="clk"`, `data-k` and `role="button"`, so they looked and focused like buttons while no handler was ever attached. It cannot be wired once at startup — tile markup is replaced on every render — so the call was added at the end of `render()`.

**3. A drill-down that disagreed with its own tile.** Once the tiles worked, the Total tile's drill-down promised "every staff-day in the period — present and absent together" but collected only days with punches: **1,280 rows listed against a tile reading 1,688**. Nothing threw, and both numbers were individually plausible. Absent staff-days are now collected for that tile. All seven tiles reconcile: 211 · 8 · 1,280 · 408 · 1,688 · 194 · 113.

## Definitions verified against published figures

Each of these had two defensible readings. Only reconciliation against the system of record settled them — in every case the wrong choice still produced a plausible number for most staff.

| Definition | Chosen | Reproduces | Alternative reproduces |
|---|---|---|---|
| Late arrival | first punch strictly `>` 08:00 | 211/211 | `>=` → 161/211 |
| Average arrival | **truncate** to the minute | 211/211 | rounding → 122/211 |
| Day eligibility | restricted to school-open days | 211/211 | unrestricted → 20 differ |
| Hours | exclude days with no out punch | — | — |

## Corrections to what the dashboard claimed

- **The lead tile called 814 records "active employees."** Only **211** badged in at least once during 2025-2026. 814 is now labelled *Employee records on file*, and 211 is the active figure. Labelling 814 as active overstated the workforce fourfold.
- **Exports respected the on-screen row cap.** Several tables draw only the first 60 or 1,000 rows, so a file that quietly stopped there would read as complete when it was not. Export now ignores the cap while respecting current search, filters and sort. Verified: a table capped at 5 rows exported all 814.
- **A header contradicted its data.** `days_since` was published as calendar days under a header reading "Open days since". The number is kept; the header now reads "Days since last seen".
- **The attendance tab silently changed population.** Published headline figures counted every badge holder, including 95 badges with no matching employee record. The per-day table covers only the 211 matched. Four of six tiles therefore read lower, and the tab now states this rather than presenting the old numbers under a new population.

| Tile | Was | Now |
|---|---:|---:|
| School open days | 242 | 242 |
| Average hours on site | 7.8 | 7.8 |
| Staff seen on site | 238 | 211 |
| Average arrival time | 07:08 | 07:05 |
| Late arrivals | 1,931 | 1,587 |
| Days with no out punch | 3,888 | 3,496 |

## Shared table features

Built inside the single `table(el, key, opts)` renderer, so all 27 tables gained them at once.

- Export on every table, replacing three ad-hoc CSV buttons.
- Column chooser on export — every column listed, all ticked, in current order.
- Column manager on a per-table "Columns" button (and `Cmd/Ctrl+G`). Reorder, show/hide, reset.
- Layouts persist per table via `localStorage`, wrapped in try/catch with an in-memory fallback, because storage behaves differently on `file://` pages and a throw would blank the page.

`Cmd/Ctrl+G` is the browser's own "find next". `preventDefault` suppresses it while focus is in the page, but once the native find bar has focus the keystroke never reaches the page. The per-table button is the reliable path; the shortcut sits on top of it.

## Overview tab

A permanent grid of 15 cards with 82 clickable counts. Clicking a count opens the people behind it below; cards stay on screen. Each card opens with its own columns — Visa gives visa number, type, issue date, expiry date and status alongside the identity block, not the full 23-column sheet — and each remembers its own layout.

A scope selector offers five populations so any figure on either screen can be reproduced and opened:

| Scope | Count | Definition |
|---|---:|---|
| All employee records | 814 | every employee row |
| HR status Active | 344 | `status = A` |
| Active and in service | 341 | `status = A` and `service = V` |
| Active employees | 211 | badged in at least once this year |
| On site recently | 176 | badged within the last 20 open days |

The first three are what the records claim; the last two are what the turnstile observed. 139 people are HR-Active with no attendance at any point in the year.

Two card groups are deliberately **not** clickable and say why: document coverage is near-empty at source (3 to 12 rows against 814), and rendering those as "0" would read as a finding about staff rather than a gap in what was entered.

## Reconciliation findings

- **Active 344 + Ex-employee 473 = 817 against a file of 814.** Three records are `status = A` *and* `service = L`, so they are counted on both cards. The HR system overshoots true headcount by exactly those three.
- **`staff_type = 'V'` decoded as Visiting Staff**, previously undecoded. The split confirms it: 160 Teaching + 95 Support + 83 Admin + 3 Visiting = 341. Code `L` (17 records) remains undecoded and contributes nobody to the active set.
- **One company, not two.** A single employee carrying a legacy third-party email domain is one record with an old address, not evidence of a second tenant.
- **Email is empty across all 814 employees and all 6,739 user accounts** — zero-length, not null — while bank accounts (342), mobiles (369) and passport numbers (76) survive. That pattern is not sparse data entry; it is consistent with email being blanked when the staging copy was taken. Stated as an inference, not a conclusion, and flagged for whoever maintains the environment.

## Verification

Run under a scripted DOM against the real file after every change.

| Check | Result |
|---|---|
| Script runs with no uncaught error | pass |
| All 9 tabs render content | 9/9 |
| Tables with export and column manager | 27, none untitled |
| Every record classified into exactly one standing | 814/814 |
| Overview cards and clickable counts | 15 cards, 82 counts |
| Attendance tiles wired and reconciling | 7/7 |
| Export of a table capped at 5 rows | 814 rows written |
| CSV quoting | no malformed lines |
| Empty date range | empty states, no NaN, no throw |
| Modal closes and returns focus | pass |
| External references in the file | 0 |

Full-year acceptance test across 211 employees: `days_present`, `open_days`, `attend_pct`, `avg_arrival`, `no_out_days`, `late_days`, `punches`, `last_seen`, `days_since` all 211/211 exact. `avg_hours` 194/211 exact, the remainder exactly 0.1 out.

**Not verified: visual layout.** Everything above was checked under a scripted DOM, not a real render, so card grid proportions, dialog sizing and dark mode still need a browser pass.

## Known limits

- **`avg_hours` cannot reproduce exactly** for 17 of 211 staff. The per-day table stores each day's hours already rounded to one decimal, so averaging them cannot always land where averaging the underlying minutes did. The page states this rather than hiding a 0.1 discrepancy.
- **Emirates ID "No Data 267" on the HR screen matches no population in the table.** Nearest candidate is 306. Either that card applies a filter not visible from the data, or the screen predates a change. Recorded as open rather than explained away.
- **"Not on site this year" (589 records) cannot be split** into departed versus still-employed from data available in the page.
- **Document cards read almost entirely "No data"** — across the active population, 1 passport, 2 visas, 1 labour card and 1 contract carry expiry dates. That is the state of the record, not a rendering gap.
- **The embedded data is a snapshot.** Figures do not change on their own; the file must be regenerated.

## Test plan

1. Open the file directly from disk — no server. Confirm all nine tabs render.
2. Click each of the seven attendance tiles; confirm each drill-down row count equals its tile.
3. Filter a table to fewer rows than its cap, export, confirm the file honours filters but not the cap.
4. Open the column manager, reorder and hide columns, reload, confirm the layout persisted.
5. Set an empty date range; confirm empty states with no `NaN` and no throw.
6. Review card grid proportions, dialog sizing and dark mode in a real browser — not covered by the scripted DOM run.
