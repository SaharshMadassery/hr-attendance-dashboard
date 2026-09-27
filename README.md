# HR & Attendance Dashboard

A single-file HR and attendance dashboard for a school of ~814 employee records and
28,416 staff-days of turnstile data — nine tabs, 27 tables, 44 embedded datasets, no
server, no build step, no external requests.

Open [`prototype/hr_dashboard.html`](prototype/hr_dashboard.html) directly in a browser.
It works offline because the data is inside the file.

> **The data in this repository is synthetic.** Names, dates of birth, mobile numbers and
> all document numbers were replaced with generated values before publication. Row counts,
> category distributions and every figure quoted in the documentation are preserved, so the
> dashboard behaves exactly as the original does. See [DATA.md](DATA.md).

---

## Why this repo is worth reading

The interesting part is not the dashboard. It is
[`docs/PULL_REQUEST.md`](docs/PULL_REQUEST.md) — the write-up of what was wrong with it and
how that was found.

Three defects were structural and announced themselves: a lost block of variable
declarations that blanked all nine tabs, a click handler that was defined but never called,
and a drill-down that listed 1,280 rows under a tile reading 1,688.

The rest did not announce themselves at all. Six attendance definitions each had two
defensible readings, and the wrong reading still produced a plausible number for most
staff:

| Definition | Correct | Reproduces | Wrong choice reproduces |
|---|---|---|---|
| Late arrival | first punch strictly `>` 08:00 | 211/211 | `>=` → 161/211 |
| Average arrival | truncate to the minute | 211/211 | rounding → 122/211 |
| Day eligibility | school-open days only | 211/211 | unrestricted → 20 differ |

None of those were found by reading code. They were found by recomputing every figure and
reconciling it against the HR system's own published output, one column at a time.

The same pass caught the dashboard's lead tile calling 814 records "active employees" when
only 211 had badged in all year, and CSV exports that silently honoured the on-screen row
cap — so a table drawing 60 of 814 rows produced a 60-row file that read as complete.

---

## Layout

| Path | What it is | Runs? |
|---|---|---|
| [`prototype/`](prototype/) | the dashboard — one self-contained HTML file | yes, open it |
| [`prototype/extracted/`](prototype/extracted/) | its CSS and JS split out for reading | reference only |
| [`docs/PULL_REQUEST.md`](docs/PULL_REQUEST.md) | the defects, the reconciliation, the verification | **start here** |
| [`docs/changelog.md`](docs/changelog.md) | full build log |  |
| [`docs/hr-reconciliation.md`](docs/hr-reconciliation.md) | where every figure comes from, with the queries |  |
| [`docs/standing-classification.md`](docs/standing-classification.md) | how each of 814 records is classified |  |
| [`sql/`](sql/) | stored procedures for a live version | not deployed |
| [`src/`](src/) | .NET 8 API + front end for a live version | needs .NET 8 + a database |

## The two designs, and why `src/` does not just open

The prototype **carries its data inside itself** — always works, always a snapshot.
`src/` deliberately **carries none** — it asks a server for it on load, so figures would
always be current, but it shows nothing until that server exists. Opening its `index.html`
gives you the layout and an error banner. That is the trade, not a fault.

## Verification

Checked under a scripted DOM after every change: script runs with no uncaught error, 9/9
tabs render, 27 tables carry export and a column manager, 814/814 records classified into
exactly one standing, 7/7 attendance tiles reconcile with their drill-downs, a table capped
at 5 rows still exports 814, no malformed CSV lines, empty date ranges produce empty states
rather than `NaN`, and the file makes zero external requests.

**Visual layout was never verified.** A scripted DOM is not a render — card proportions,
dialog sizing and dark mode still need a browser pass. Stated here because the test table
otherwise reads as complete coverage.

## Known limits

Carried deliberately rather than hidden:

- **Average hours cannot reproduce exactly** for 17 of 211 staff. The source stores each
  day's hours pre-rounded to one decimal, so averaging them cannot always land where
  averaging the underlying minutes did.
- **One HR figure does not reconcile at all.** An Emirates ID card reads "No Data 267";
  no population in the table produces 267, nearest is 306. Recorded as open rather than
  explained away.
- **589 records cannot be split** into departed versus still-employed from available data.
- **Document cards read almost entirely "No data"** — across the active population, one
  passport, two visas, one labour card and one contract carry expiry dates. That is the
  state of the record, not a rendering gap.
- **The embedded data is a snapshot.** It does not change on its own.

## Provenance

Built against a read-only replica. Only `SELECT` and catalog reads were ever issued,
enforced by a wrapper that rejected any statement containing `insert`, `update`, `delete`,
`merge`, `create`, `alter`, `drop`, `truncate`, `exec`, `grant`, `backup` or `into`. No
credential was written to disk. Host names and database identifiers have been replaced with
placeholders throughout this repository.

## Licence

[MIT](LICENSE) for the code. The synthetic dataset is provided for demonstration only.
