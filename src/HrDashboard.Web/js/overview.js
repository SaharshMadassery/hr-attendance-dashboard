/* =====================================================================
   overview.js — the card grid and the people behind each count.

   The cards stay on screen when a count is opened, so you can move
   between categories without going back first.
   ===================================================================== */
import { api, showError } from './api.js';
import { renderTable, escapeHtml } from './table.js';

const TINTS = [
  'rgba(217,45,32,.07)', 'rgba(220,104,3,.08)', 'rgba(3,152,85,.07)',
  'rgba(37,99,235,.07)', 'rgba(105,65,198,.08)', 'rgba(2,132,199,.07)'
];

/* Each card opens with the columns that belong to it. Clicking Visa should
   give visa fields, not a 20-column sheet to scroll sideways through. */
const DOC_COLUMNS = {
  visa:       [['visa.number','Visa no'],['visa.type','Visa type'],['visa.issueDate','Visa issue date'],['visa.expiryDate','Visa expiry date'],['visa.state','Visa status']],
  passport:   [['passport.number','Passport no'],['passport.issueDate','Passport issue date'],['passport.expiryDate','Passport expiry date'],['passport.state','Passport status']],
  eid:        [['emiratesId.number','Emirates ID no'],['emiratesId.issueDate','Emirates ID issue date'],['emiratesId.expiryDate','Emirates ID expiry date'],['emiratesId.state','Emirates ID status']],
  labourcard: [['labourCard.number','Labour card no'],['labourCard.issueDate','Labour card issue date'],['labourCard.expiryDate','Labour card expiry date'],['labourCard.state','Labour card status']],
  contract:   [['contract.number','Contract ref'],['contract.issueDate','Contract start'],['contract.expiryDate','Contract expiry'],['contract.state','Contract status']]
};

const IDENTITY = [
  ['empCode', 'Emp Code'], ['fullName', 'Name'], ['nationality', 'Nationality'],
  ['mobile', 'Mobile'], ['department', 'Department'], ['designation', 'Designation']
];

const dig = (row, path) => path.split('.').reduce((o, k) => (o ? o[k] : undefined), row);

export class OverviewTab {
  constructor(root) {
    this.root      = root;
    this.scopeSel  = root.querySelector('#scope');
    this.scopeNote = root.querySelector('#scope-note');
    this.cardsHost = root.querySelector('#cards');
    this.peopleHost= root.querySelector('#people');
    this.scope     = 'All';
    this.scopes    = [];
  }

  async init() {
    try {
      this.scopes = await api.scopes();
      this.scopeSel.innerHTML = this.scopes
        .map(s => `<option value="${escapeHtml(s.key)}">${escapeHtml(s.name)} (${s.count})</option>`).join('');
      this.scopeSel.value = this.scope;
      this.scopeSel.onchange = () => {
        this.scope = this.scopeSel.value;
        this.peopleHost.innerHTML = '';
        this.load();
      };
      await this.load();
    } catch (err) { showError(this.root, err); }
  }

  describeScope() {
    const s = this.scopes.find(x => x.key === this.scope);
    if (!s) return;
    this.scopeNote.innerHTML =
      `<b>${escapeHtml(s.name)}</b> — ${escapeHtml(s.definition)} <b>Use it for:</b> ${escapeHtml(s.UseItFor || s.useItFor || '')}
       <br>The HR system draws its own dashboard from three of these populations at once, which is why
       its cards do not add up to a single headcount. Each view here is internally consistent.`;
  }

  async load() {
    try {
      const data = await api.overview(this.scope);
      this.scopes = data.scopes || this.scopes;
      this.describeScope();
      this.renderCards(data.cards || []);
    } catch (err) { showError(this.root, err); }
  }

  renderCards(cards) {
    this.cardsHost.innerHTML = cards.map((card, i) => `
      <div class="ccard" style="--t:${TINTS[i % TINTS.length]}">
        <h5>${escapeHtml(card.title)}</h5>
        ${card.lines.map(l => `
          <button class="cl" data-facet="${escapeHtml(l.facet)}" data-value="${escapeHtml(l.value)}">
            <span class="cn">${escapeHtml(l.label)}</span>
            <span class="cv">${l.count.toLocaleString()}</span>
          </button>`).join('')}
        ${card.note ? `<div class="note">${escapeHtml(card.note)}</div>` : ''}
      </div>`).join('');

    this.cardsHost.querySelectorAll('.cl').forEach(btn => {
      btn.onclick = () => this.openPeople(btn.dataset.facet, btn.dataset.value);
    });
  }

  async openPeople(facet, value) {
    try {
      const people = await api.employees({ scope: this.scope, facet, value });
      const docCols = DOC_COLUMNS[facet];

      this.peopleHost.innerHTML = `
        <div class="card">
          <div class="dhead">
            <div>
              <h4>${escapeHtml(value)} — <b>${people.length.toLocaleString()}</b>
                  ${people.length === 1 ? 'person' : 'people'}</h4>
              <div class="d" style="margin:2px 0 0">Click anyone to open their record.</div>
            </div>
            <button class="tbtn" id="clear-people">✕ Clear selection</button>
          </div>
          <div id="people-table"></div>
          <div id="person-detail"></div>
        </div>`;
      this.peopleHost.querySelector('#clear-people').onclick = () => { this.peopleHost.innerHTML = ''; };

      const spec = docCols
        ? [...IDENTITY, ...docCols]
        : [...IDENTITY, ['dateOfJoin','Date of join'], ['gender','Gender'], ['staffType','Staff type'],
           ['standing','Standing'], ['lastSeen','Last seen'], ['attendancePct','Attendance %']];

      renderTable(this.peopleHost.querySelector('#people-table'), {
        id: `overview-${facet}`,
        title: value,
        rows: people.map((p, i) => ({ ...p, sr: i + 1 })),
        columns: [
          { key: 'sr', label: 'Sr No.', numeric: true },
          ...spec.map(([key, label]) => ({
            key, label,
            numeric: key === 'attendancePct',
            format: (_, row) => dig(row, key) ?? '',
            pill: key === 'standing'
              ? (_, row) => [row.standingTone || 'neutral', row.standing]
              : /\.state$/.test(key)
                ? (_, row) => {
                    const s = dig(row, key);
                    return [s === 'Valid' ? 'ok' : s === 'Expired' ? 'bad' : 'neutral', s];
                  }
                : undefined
          }))
        ],
        limit: 500,
        exportUrl: cols => api.exportEmployeesUrl({
          scope: this.scope, facet, value, columns: cols.join(',')
        }),
        onRow: person => this.showPerson(person)
      });
    } catch (err) { showError(this.peopleHost, err); }
  }

  showPerson(p) {
    const host = this.peopleHost.querySelector('#person-detail');
    const row = (t, v) => `<dt>${escapeHtml(t)}</dt><dd>${v === null || v === undefined || v === '' ? '—' : escapeHtml(v)}</dd>`;
    const doc = (name, d) => d && (d.number || d.expiryDate)
      ? row(name, `${d.number || 'no number'}${d.expiryDate ? ' · expires ' + d.expiryDate : ''} · ${d.state}`)
      : row(name, 'not recorded');

    host.innerHTML = `
      <div class="drill">
        <div class="dhead">
          <div>
            <h4>${escapeHtml(p.fullName)} · ${escapeHtml(p.empCode)}</h4>
            <div class="m">${escapeHtml(p.designation || '—')} · ${escapeHtml(p.department || '—')}</div>
          </div>
          <span class="pill ${escapeHtml(p.standingTone || 'neutral')}">${escapeHtml(p.standing)}</span>
        </div>
        <dl class="dl">
          ${row('Staff type', p.staffType)}
          ${row('Gender', p.gender)}
          ${row('Nationality', p.nationality)}
          ${row('Mobile', p.mobile)}
          ${row('Date of birth', p.dateOfBirth)}
          ${row('Date of join', p.dateOfJoin)}
          ${row('Last seen on site', p.lastSeen)}
          ${row('Days present', p.daysPresent)}
          ${row('Attendance', p.attendancePct === null || p.attendancePct === undefined ? null : p.attendancePct + '%')}
          ${row('Average arrival', p.avgArrival)}
          ${row('Average hours', p.avgHours)}
          ${row('Late arrivals', p.lateDays)}
          ${row('Days with no out punch', p.noOutDays)}
          ${row('Last system login', p.lastLogin)}
          ${doc('Emirates ID', p.emiratesId)}
          ${doc('Passport', p.passport)}
          ${doc('Visa', p.visa)}
          ${doc('Labour card', p.labourCard)}
          ${doc('Contract', p.contract)}
        </dl>
      </div>`;
    host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}
