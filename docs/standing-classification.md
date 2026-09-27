# Employee standing — one column in place of two

**Database** `HR_STAGING` (Example School) · **Academic year** 2025-2026 (25 Aug 2025 → 10 Jul 2026, 242 school-open days)
**Built** 5 Aug 2026 · **Applies to** the Full employee roster on the Workforce tab and the Employee details card on the Overview tab
**Method** read-only inspection; every count below was measured, not estimated

---

## Why it replaced the old pair

The roster used to carry two columns:

| Column | Values | Derived from |
|---|---|---|
| STATUS | Active / No recent punch | turnstile punches in a trailing ~3-week window |
| FLAG | CONFLICT or blank | a past date in `em_left_date` |

Three things made that hard to read:

1. **They answered different questions from different sources**, so a row could show
   "Active" and "CONFLICT" together and look self-contradictory when it was not.
2. **"Active" did not carry the meaning HR gives the word.** The HR system has its own
   `em_status` field, also showing "Active", which often differs.
3. **"No recent punch" was a windowed measure.** Someone who attended three days last
   October showed a blank last-punch and read as though they had never attended.

The pair was also **not exhaustive**. Employee E1889 was neither "Active" nor flagged, yet
warranted attention: three days on site between October and December, nothing since.
Nobody looking at either column would have found her.

---

## The six categories

Every one of the 814 records falls into exactly one. Ranked by how soon somebody should
look at it.

| Standing | Records | Owner | Meaning | Next step |
|---|---:|---|---|---|
| **On site — clear leaving date** | 173 | HR | Attending now, but the record carries a leaving date that has already passed | Clear the leaving date so payroll, leave and visa tracking read this person as employed |
| **Stopped attending — confirm** | 35 | HR | Attended during the year, not seen for more than 20 school-open days | Confirm whether this is long leave, secondment or a departure before acting |
| **Not on site — system still used** | 14 | HR and IT | No turnstile activity this year, but the HR system account was used during the year | Confirm the role. If the person has left, close the account |
| **On site** | 3 | — | Seen within the last 20 school-open days, nothing on the record to query | No action |
| **Not on site this year** | 589 | HR | No turnstile activity and no HR system use during the year | Historical records. Review for archiving — not evidence that anyone is missing |
| **Not enough information** | 0 | HR | No attendance, no system use and no joining date | Check the record exists as intended |

**173 + 35 + 14 + 3 + 589 + 0 = 814.** Verified in code on every render.

The last category holds nobody today. It exists so that a future record missing the fields
the rules depend on is placed honestly rather than forced into a category that does not fit.

---

## The rules

Applied in order; the first match wins.

```
if the person has any punch in AY 2025-2026:
    if school-open days since their last punch <= 20:
        "On site — clear leaving date"   when a leaving date precedes a later punch
        "On site"                        otherwise
    else:
        "Stopped attending — confirm"
else if the HR system account was used during the academic year:
    "Not on site — system still used"
else if a joining date or any login date exists:
    "Not on site this year"
else:
    "Not enough information"
```

### The 20-day threshold

Counted in **days the school was actually open**, never calendar days. Counting calendar
days would turn every regular member of staff into a leaver over the summer.

Twenty open days is about four school weeks — long enough to absorb a half-term without
reclassifying anyone. The data supports putting the line there:

| School-open days since last seen | People |
|---|---:|
| 0–5 | 163 |
| 6–10 | 11 |
| 11–20 | 2 |
| **21–60** | **1** |
| Over 60 | 34 |

The line falls in an empty valley rather than through a crowd. Anywhere between 21 and 60
would classify the same 176 people as on site. That insensitivity is the point — the
threshold is not doing delicate work.

---

## What this classification cannot tell you

Both limits are stated on the page itself, under the roster.

**A leaving date is only visible for people who attended.** The per-person view of
`em_left_date` available to the dashboard comes from the defect register, which is scoped to
staff with punches. So **"Not on site this year" cannot be split into departed and
still-employed** from data in the page. Those 589 records are not a finding; they are the
ordinary state of a file that has been running since 2005.

**Nothing in the punch log separates approved absence from unexplained absence.** Long leave,
maternity leave and secondment look identical to someone who stopped attending without
notice. **"Stopped attending — confirm" is a prompt to ask, never a conclusion**, and it is
named that way deliberately. HR should confirm the reason before any of those 35 records is
acted on.

**A record needing an update is not a person who is unaccounted for.** The largest category
by far — 589 — is record-keeping, not people. The classification is ordered so the three
categories worth acting on sit above the two that are simply the state of a long file.

---

## How it relates to the HR system's own status

`em_status` and this classification measure different things and disagree about a specific
group. Measured across all 814 records:

| | People |
|---|---:|
| HR says Active **and** badged in during the year | 205 |
| **HR says Active but never badged in all year** | **139** |
| Badged in but HR does not say Active | 6 |

Of the 176 people on site in the final 20 open days, **173 carry `em_status='A'`**. When the
HR record and the turnstile both speak, they agree almost perfectly. The disagreement runs
one way only: the HR list includes 139 people the turnstile never saw.

Some of those will be legitimate — staff without badges, remote or seconded roles. It is
still 40% of the HR "Active" list with no physical evidence behind it, and it is the most
useful thing to come out of comparing the two.

---

## Where to see it

- **Workforce → Full employee roster** — the Standing column, filterable, with the full
  definition table printed underneath.
- **Overview → Standing (attendance-based)** card — each category opens the people in it.
- **Any employee record** — opened from the Overview, shows the standing with its meaning,
  owner and next step, plus any record-quality notes against that person.
