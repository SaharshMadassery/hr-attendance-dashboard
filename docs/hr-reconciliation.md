# Reconciling the dashboard against the HRMS "HR Dashboard" screen

**Database** `HR_STAGING`, server `db.example.internal` · **Queried** 5 Aug 2026
**Access** read-only. Only `SELECT` and `sys.*` catalog reads were issued. The query wrapper
refused any statement containing `insert`, `update`, `delete`, `merge`, `create`, `alter`,
`drop`, `truncate`, `exec`, `grant`, `backup` or `into`. No credential was written to disk.

The question this answers: the HRMS HR Dashboard and this report describe the same school,
so why do the numbers differ? **They do not conflict — the two screens count different
populations, and the HRMS screen uses three of them at once.**

---

## The table that explains almost everything

```sql
SELECT em_status, em_service_status, em_company_code, COUNT(*) AS n
FROM pays.pays_employee
GROUP BY em_status, em_service_status, em_company_code;
```

| `em_status` | `em_service_status` | Count |
|---|---|---:|
| `I` | `L` | 470 |
| `A` | `V` | 341 |
| `A` | `L` | 3 |

Total 814.

---

## Card by card

| HRMS card | Their figure | Source | Match |
|---|---:|---|:--:|
| Employee Details → Active | 344 | `em_status='A'` → 341 + 3 | exact |
| Employee Details → Ex-employee | 473 | `em_service_status='L'` → 470 + 3 | exact |
| Employee Details → Female / Male | 249 / 95 | gender within `em_status='A'` | exact |
| Employee Details → Under Probation | 0 | `em_probation_completion_date` is null in all 731 rows of `pays_employee_other_details` | exact |
| Staff Type → All | 341 | `em_status='A' AND em_service_status='V'` | exact |
| Staff Type → Teaching / Support / Admin / Visiting | 160 / 95 / 83 / 3 | same 341, by `em_staff_type` | exact |
| Employee Passport | All 341, Valid 0, Expired 1, No Data 340 | same 341, by `em_passport_expiry_date` | exact |
| Employee Visa | All 341, Valid 0, Expired 1, No Data 340 | same 341, by `em_visa_expiry_date` | exact |
| Employee Labour Contract | All 341, Valid 0, Expired 1, No Data 340 | same 341, by `en_labour_card_expiry_date` | exact |
| Contract Type | All 341, No Data 340 | same 341, by `em_agreement_exp_date` | exact |
| Employee Emirates ID → All | 35 | records holding a value in `em_national_id` | exact |
| Employee Emirates ID → No Data | 267 | **no population in the table produces this** | unresolved |

### Why 344 + 473 = 817 against a file of 814

Three records are `em_status='A'` **and** `em_service_status='L'`. They are counted on the
Active card and on the Ex-employee card. The HRMS overshoots the true headcount by exactly
those three.

### The one figure that does not reconcile

Emirates ID "No Data 267". Its companion "All 35" matches exactly, but 267 corresponds to no
slice of the table. Counts of records with no Emirates ID number:

| Population | Records | Without an Emirates ID |
|---|---:|---:|
| All employees | 814 | 684 |
| `em_status='A'` | 344 | 309 |
| `em_status='A'` and `em_service_status='V'` | 341 | 306 |
| `em_status='I'` | 470 | 375 |
| `em_status='A'`, staff types T/S/A only | 341 | 307 |

Nearest is 306. Either that card applies a filter not visible from the data, or the screen
predates a change. Recorded as open rather than explained away.

---

## Three findings from the queries

### `em_staff_type = 'V'` means Visiting Staff

[hr_schema_notes.md](hr_schema_notes.md) §5 lists `V` (7 records) and `L` (17 records) as
undecoded. The HRMS Staff Type card decodes `V`, and its split confirms it:

| Code | On file | Within the active 341 | HRMS label |
|---|---:|---:|---|
| `T` | 476 | 160 | Teaching |
| `S` | 176 | 95 | Support |
| `A` | 138 | 83 | Admin |
| `V` | 7 | 3 | **Visiting Staff** |
| `L` | 17 | 0 | not shown — no active records |

160 + 95 + 83 + 3 = 341. `L` remains undecoded and contributes nobody to the active set.

### There is only one company

```sql
SELECT em_company_code, COUNT(*), MIN(em_number), MAX(em_number)
FROM pays.pays_employee GROUP BY em_company_code;
```

One row: company `1`, 814 employees, codes spanning `AHO101` to `E1959`.

The employee `AHO102 (name withheld)` carrying an `legacy-domain.example` address is therefore a
Example School record with a legacy email domain, not evidence of a second tenant. The
`AHO###` series is a normal part of this file.

### Email is absent throughout, and the pattern suggests it was removed

| Field | Records | Populated |
|---|---:|---:|
| `pays_employee.em_email` | 814 | **0** (zero-length, not null) |
| `pays_employee.em_personalemail` | 814 | **0** |
| `comn.comn_user.comn_user_email` | 6,739 | **0** |
| `pays_employee.em_mobile` | 814 | 369 |
| `pays_employee.em_bank_ac_no` | 814 | 342 |
| `pays_employee.em_passport_number` | 814 | 76 |

The HRMS employee list does display email addresses, and it is reading this database — only
two visa numbers exist anywhere in `HR_STAGING`, and they are exactly the two rows showing visa
data on that screen (`AHO101` and `AHO102`).

Every email column empty across every table, while bank accounts, mobiles and passport
numbers survive, is not the shape of sparse data entry. The likely explanation is that
**email was blanked when this staging copy was taken**, which is common practice for
non-production environments. This is an inference from the pattern, not something the
database states; worth confirming with whoever maintains the environment.

**Consequence for the dashboard:** email cannot be shown or exported, and the Mobile column
is blank for 445 of 814. Contact details would have to come from production.

---

## Document coverage, measured

Across all 814 records:

| Document | Records holding a number | Records holding an expiry date |
|---|---:|---:|
| Emirates ID | 130 | 5 |
| Passport | 76 | 1 |
| Visa | 2 | 1 |
| Labour card | 1 | 1 |
| Contract | 1 | 1 |

Within the 341 the HRMS document cards count, exactly one record in each category carries an
expiry date, and it is in the past. This is why those cards read Valid 0 / Expired 1 /
No Data 340. The columns exist and the product supports them; the entry never happened.

---

## The five populations now available in the dashboard

The Overview scope selector offers all of them so any figure on either screen can be
reproduced and opened.

| Scope | Count | Definition | Use it for |
|---|---:|---|---|
| All employee records | 814 | every row in `pays_employee` | record cleanup; matches HRMS Active / Ex-employee |
| HR status Active | 344 | `em_status='A'` | matches the HRMS gender card |
| HR status Active and in service | 341 | `em_status='A'` and `em_service_status='V'` | payroll, visas, contracts, documents — matches the HRMS document cards |
| Active employees | 211 | badged in at least once during 2025-2026 | who actually works here |
| On site recently | 176 | badged within the last 20 school-open days | who is here now |

The first three are what the records claim. The last two are what the turnstile observed.
See [hr_standing_classification.md](hr_standing_classification.md) for how far apart they sit
— 139 people are HR-Active with no attendance at any point in the year.

---

## Queries used

All read-only. Reproducible against `HR_STAGING`.

```sql
-- population reconciliation
SELECT em_status, em_service_status, em_company_code, COUNT(*) AS n
FROM pays.pays_employee GROUP BY em_status, em_service_status, em_company_code;

-- staff type, on file and within the active set
SELECT em_staff_type, COUNT(*) AS on_file,
       SUM(CASE WHEN em_status='A' AND em_service_status='V' THEN 1 ELSE 0 END) AS active_v
FROM pays.pays_employee GROUP BY em_staff_type;

-- gender, on file and within em_status='A'
SELECT em_sex, COUNT(*) AS on_file,
       SUM(CASE WHEN em_status='A' THEN 1 ELSE 0 END) AS status_a
FROM pays.pays_employee GROUP BY em_sex;

-- document coverage for one card; repeat per document column
SELECT COUNT(*) AS pop,
  SUM(CASE WHEN DATALENGTH(em_visa_number)>0 THEN 1 ELSE 0 END)          AS has_number,
  SUM(CASE WHEN em_visa_expiry_date >  CAST(GETDATE() AS date) THEN 1 ELSE 0 END) AS valid,
  SUM(CASE WHEN em_visa_expiry_date <= CAST(GETDATE() AS date) THEN 1 ELSE 0 END) AS expired,
  SUM(CASE WHEN em_visa_expiry_date IS NULL THEN 1 ELSE 0 END)           AS no_data
FROM pays.pays_employee WHERE em_status='A' AND em_service_status='V';

-- the per-person extract now embedded in the dashboard
SELECT e.em_number, e.em_status, e.em_service_status, e.em_staff_type, e.em_sex,
       n.sims_nationality_name_en, e.em_mobile, CAST(e.em_date_of_birth AS date),
       e.em_national_id, e.em_national_id_issue_date, e.em_national_id_expiry_date,
       e.em_passport_number, e.em_passport_issue_date, e.em_passport_expiry_date,
       e.em_visa_number, e.em_visa_issue_date, e.em_visa_expiry_date, e.em_visa_type,
       e.en_labour_card_no, e.en_labour_card_issue_date, e.en_labour_card_expiry_date,
       e.em_agreement, e.em_agreement_start_date, e.em_agreement_exp_date
FROM pays.pays_employee e
LEFT JOIN sims.sims_nationality n ON n.sims_nationality_code = e.em_nation_code;
```
