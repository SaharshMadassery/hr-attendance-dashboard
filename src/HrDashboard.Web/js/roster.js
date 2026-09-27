/* =====================================================================
   roster.js — the full employee roster with one standing column.

   Version 1 carried two columns, STATUS and FLAG, that read from
   different sources; a row could show "Active" and "CONFLICT" together
   and look self-contradictory when it was not. One column, exhaustive
   over every record, replaced both.
   ===================================================================== */
import { api, showError } from './api.js';
import { renderTable, escapeHtml } from './table.js';

const STANDING_HELP = [
  ['On site - clear leaving date', 'warn', 'HR',
   'Attending now, but the record carries a leaving date that has already passed.',
   'Clear the leaving date so payroll, leave and visa tracking read this person as employed.'],
  ['Stopped attending - confirm', 'bad', 'HR',
   'Attended during the year, not seen for more than 20 school-open days.',
   'Confirm whether this is long leave, secondment or a departure before acting.'],
  ['Not on site - system still used', 'warn', 'HR and IT',
   'No turnstile activity this year, but the HR system account was used during the year.',
   'Confirm the role. If the person has left, close the account.'],
  ['On site', 'ok', '—',
   'Seen within the last 20 school-open days, nothing on the record to query.',
   'No action.'],
  ['Not on site this year', 'neutral', 'HR',
   'No turnstile activity and no HR system use during the academic year.',
   'Historical records. Review for archiving — not evidence that anyone is missing.'],
  ['Not enough information', 'neutral', 'HR',
   'No attendance, no system use and no joining date.',
   'Check the record exists as intended.']
];

export class RosterTab {
  constructor(root) {
    this.root  = root;
    this.q     = root.querySelector('#r-q');
    this.stand = root.querySelector('#r-standing');
    this.dept  = root.querySelector('#r-dept');
    this.type  = root.querySelector('#r-type');
    this.host  = root.querySelector('#roster');
    this.key   = root.querySelector('#standing-key');
    this.all   = [];
  }

  async init() {
    try {
      this.all = await api.employees({ scope: 'All' });
      this.fillFilters();
      [this.stand, this.dept, this.type].forEach(el => { el.onchange = () => this.paint(); });
      this.q.oninput = () => this.paint();
      this.root.querySelector('#r-reset').onclick = () => {
        this.q.value = ''; this.stand.value = ''; this.dept.value = ''; this.type.value = '';
        this.paint();
      };
      this.paint();
      this.explain();
    } catch (err) { showError(this.root, err); }
  }

  fillFilters() {
    const distinct = (fn) => [...new Set(this.all.map(fn).filter(Boolean))].sort();
    const fill = (el, values, allLabel) => {
      el.innerHTML = `<option value="">${allLabel}</option>` +
        values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    };
    const counts = {};
    this.all.forEach(p => { counts[p.standing] = (counts[p.standing] || 0) + 1; });
    this.stand.innerHTML = '<option value="">All standings</option>' +
      Object.entries(counts).sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `<option value="${escapeHtml(k)}">${escapeHtml(k)} (${n})</option>`).join('');
    fill(this.dept, distinct(p => p.department), 'All departments');
    fill(this.type, distinct(p => p.staffType), 'All staff types');
  }

  paint() {
    const q = (this.q.value || '').trim().toLowerCase();
    const rows = this.all.filter(p =>
      (!this.stand.value || p.standing === this.stand.value) &&
      (!this.dept.value  || p.department === this.dept.value) &&
      (!this.type.value  || p.staffType === this.type.value) &&
      (!q || [p.fullName, p.empCode, p.department, p.designation]
              .some(v => (v || '').toLowerCase().includes(q))));

    renderTable(this.host, {
      id: 'roster',
      title: 'Full employee roster',
      rows,
      search: false,
      limit: 500,
      columns: [
        { key: 'empCode',     label: 'Emp Code' },
        { key: 'fullName',    label: 'Name' },
        { key: 'designation', label: 'Designation' },
        { key: 'department',  label: 'Department' },
        { key: 'staffType',   label: 'Staff type' },
        { key: 'gender',      label: 'Gender' },
        { key: 'nationality', label: 'Nationality' },
        { key: 'dateOfJoin',  label: 'Date of join' },
        { key: 'lastSeen',    label: 'Last seen' },
        { key: 'attendancePct', label: 'Attendance %', numeric: true,
          pill: v => v === null || v === undefined
            ? ['neutral', 'no punches']
            : [v >= 80 ? 'ok' : v >= 50 ? 'warn' : 'bad', v + '%'] },
        { key: 'standing',    label: 'Standing',
          pill: (v, row) => [row.standingTone || 'neutral', v] },
        { key: 'lastLogin',   label: 'Last login' }
      ],
      exportUrl: cols => api.exportEmployeesUrl({ scope: 'All', columns: cols.join(',') }),
      empty: 'No records match these filters.'
    });
  }

  explain() {
    const counts = {};
    this.all.forEach(p => { counts[p.standing] = (counts[p.standing] || 0) + 1; });
    this.key.innerHTML = `
      <b>What each standing means.</b> Every record falls into exactly one. A record needing an
      update is not the same as a person who is unaccounted for — the first three are worth acting
      on, the last two are the ordinary state of a long-running file.
      <table style="margin-top:9px">
        <thead><tr><th>Standing</th><th>Records</th><th>Owner</th><th>Meaning</th><th>Next step</th></tr></thead>
        <tbody>
        ${STANDING_HELP.filter(([name]) => counts[name]).map(([name, tone, owner, meaning, next]) => `
          <tr>
            <td><span class="pill ${tone}">${escapeHtml(name)}</span></td>
            <td class="num">${counts[name]}</td>
            <td>${escapeHtml(owner)}</td>
            <td style="white-space:normal">${escapeHtml(meaning)}</td>
            <td style="white-space:normal">${escapeHtml(next)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <p style="margin-top:9px">Seen within <b>20 school-open days</b> counts as on site — about four
      school weeks, counted in days the school was open so that half-term and the summer break cannot
      make regular staff look like leavers. Two limits worth knowing: a leaving date is only visible
      for people who attended, so <i>Not on site this year</i> cannot be split into departed and
      still-employed; and nothing in the punch log separates approved long leave, maternity leave or
      secondment from an unexplained absence, so <i>Stopped attending</i> is a prompt to ask rather
      than a conclusion.</p>`;
  }
}
