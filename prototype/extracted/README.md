# Extracted for reading

The dashboard ships as one file. These are its parts, split out so they can be read and
diffed — they are **reference copies, not a build**. Editing them changes nothing; the
dashboard that runs is `../hr_dashboard.html`.

| File | What it is |
|---|---|
| `dashboard.code-only.js` | the application code, with the dataset stripped out |
| `dashboard.css` | the stylesheet |
| `data.json` | the synthetic dataset — 44 tables, 36,448 rows |

The original bundle also contained a `dashboard.js` combining the code and the real dataset
in one 3.9 MB file. It is not published, because that dataset was real. See [../../DATA.md](../../DATA.md).
