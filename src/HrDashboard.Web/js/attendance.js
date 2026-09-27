/* =====================================================================
   attendance.js — the period view.

   Every figure here is measured against school-open days rather than
   calendar days, so term breaks and the summer gap never read as
   absence. A late arrival is a first punch strictly after 08:00.
   ===================================================================== */
import { api, showError } from './api.js';
import { renderTable, escapeHtml } from './table.js';
import { barList, lineChart } from './charts.js';

export class AttendanceTab {
  constructor(root, year) {
    this.root = root;
    this.year = year;
    this.from = root.querySelector('#a-from');
    this.to   = root.querySelector('#a-to');
    this.dept = root.querySelector('#a-dept');
    this.type = root.querySelector('#a-type');
    this.note = root.querySelector('#a-note');
  }

  async init(departments, staffTypes) {
    this.dept.innerHTML = '<option value="">All departments</option>' +
      departments.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
    this.type.innerHTML = '<option value="">All staff types</option>' +
      staffTypes.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');

    if (this.year) {
      this.from.min = this.to.min = this.year.startDate;
      this.from.max = this.to.max = this.year.endDate;
    }
    [this.from, this.to, this.dept, this.type].forEach(el => { el.onchange = () => this.load(); });
    this.root.querySelector('#a-reset').onclick = () => {
      this.from.value = ''; this.to.value = ''; this.dept.value = ''; this.type.value = '';
      this.load();
    };
    await this.load();
  }

  params() {
    return {
      from: this.from.value || null, to: this.to.value || null,
      department: this.dept.value || null, staffType: this.type.value || null
    };
  }

  async load() {
    const p = this.params();
    try {
      const [summary, byEmp, byDept] = await Promise.all([
        api.attendance(p), api.attendanceByEmp(p), api.attendanceByDept({ from: p.from, to: p.to })
      ]);
      this.renderKpis(summary.kpis);
      this.note.textContent = summary.kpis.populationNote;
      barList(this.root.querySelector('#a-dow'), summary.byDayOfWeek, 'dayName', 'avgStaffOnSite');
      lineChart(this.root.querySelector('#a-volume'), summary.dailyVolume, 'punchDate',
        [{ key: 'punches', color: '#2563eb', name: 'Punches' },
         { key: 'people',  color: '#dc6803', name: 'People'  }], { ticks: 10 });
      this.renderByDept(byDept);
      this.renderByEmp(byEmp);
    } catch (err) { showError(this.root, err); }
  }

  renderKpis(k) {
    const tile = (cls, value, label, sub) =>
      `<div class="kpi ${cls}"><div class="n">${escapeHtml(value)}</div>
        <div class="l">${escapeHtml(label)}</div><div class="s">${escapeHtml(sub)}</div></div>`;
    this.root.querySelector('#a-kpis').innerHTML =
      tile('b', (k.openDays || 0).toLocaleString(), 'School open days', 'in the selected period') +
      tile('g', (k.staffSeen || 0).toLocaleString(), 'Staff seen on site', 'distinct people with a punch') +
      tile('b', k.avgArrival || '—', 'Average arrival time', 'first punch of the day') +
      tile('g', k.avgHours ?? '—', 'Average hours on site', 'days with no out punch excluded') +
      tile('a', (k.lateArrivals || 0).toLocaleString(), 'Late arrivals', 'first punch after 08:00') +
      tile('a', (k.noOutPunchDays || 0).toLocaleString(), 'Days with no out punch', 'out time unknown');
  }

  renderByDept(rows) {
    renderTable(this.root.querySelector('#a-bydept'), {
      id: 'attendance-by-department',
      title: 'Attendance by department',
      rows, limit: 100,
      columns: [
        { key: 'department',       label: 'Department' },
        { key: 'staff',            label: 'Staff', numeric: true },
        { key: 'presentStaffDays', label: 'Present (staff-days)', numeric: true },
        { key: 'totalStaffDays',   label: 'Total (staff-days)', numeric: true },
        { key: 'attendancePct',    label: 'Attendance %', numeric: true,
          pill: v => v === null ? null : [v >= 80 ? 'ok' : v >= 60 ? 'warn' : 'bad', v + '%'] },
        { key: 'avgArrival',       label: 'Avg arrival' },
        { key: 'avgHours',         label: 'Avg hours', numeric: true },
        { key: 'lateArrivals',     label: 'Late arrivals', numeric: true },
        { key: 'noOutPunchDays',   label: 'No out punch', numeric: true }
      ],
      empty: 'No department had anyone on site in this period.'
    });
  }

  renderByEmp(rows) {
    const p = this.params();
    renderTable(this.root.querySelector('#a-byemp'), {
      id: 'attendance-by-employee',
      title: 'Employee attendance and punctuality',
      rows, limit: 500,
      columns: [
        { key: 'empCode',           label: 'Emp Code' },
        { key: 'fullName',          label: 'Employee' },
        { key: 'department',        label: 'Department' },
        { key: 'designation',       label: 'Designation' },
        { key: 'staffType',         label: 'Staff type' },
        { key: 'daysPresent',       label: 'Days present', numeric: true },
        { key: 'openDays',          label: 'Open days', numeric: true },
        { key: 'attendancePct',     label: 'Attendance %', numeric: true,
          pill: v => v === null ? null : [v >= 80 ? 'ok' : v >= 60 ? 'warn' : 'bad', v + '%'] },
        { key: 'avgArrival',        label: 'Avg arrival' },
        { key: 'avgHours',          label: 'Avg hours', numeric: true },
        { key: 'lateArrivals',      label: 'Late arrivals', numeric: true,
          pill: v => v >= 5 ? ['bad', v] : v > 0 ? ['warn', v] : ['neutral', 0] },
        { key: 'noOutPunchDays',    label: 'No out punch', numeric: true },
        { key: 'punches',           label: 'Punches', numeric: true },
        { key: 'lastSeen',          label: 'Last seen' },
        { key: 'daysSinceLastSeen', label: 'Days since last seen', numeric: true }
      ],
      exportUrl: () => api.exportAttendanceUrl(p),
      onRow: row => this.showMonths(row),
      empty: 'Nobody was on site during this period.'
    });
  }

  async showMonths(row) {
    const host = this.root.querySelector('#a-months');
    try {
      const p = this.params();
      const months = await api.months(row.empCode, { from: p.from, to: p.to });
      if (!months.length) {
        host.innerHTML = `<div class="drill"><h4>${escapeHtml(row.fullName)}</h4>
          <div class="m">No days on site in this period.</div></div>`;
        return;
      }
      const max = Math.max(...months.map(m => m.daysPresent));
      const total = months.reduce((a, m) => a + m.daysPresent, 0);
      host.innerHTML = `
        <div class="drill">
          <h4>${escapeHtml(row.fullName)} · ${escapeHtml(row.empCode)}</h4>
          <div class="m">${escapeHtml(row.designation || '—')} · ${escapeHtml(row.department || '—')} ·
            ${total} days present across ${months.length} month${months.length === 1 ? '' : 's'} ·
            attendance ${row.attendancePct}% · last seen ${escapeHtml(row.lastSeen)}</div>
          <div class="mgrid">
            ${months.map(m => {
              const strong = m.daysPresent / max > 0.6;
              return `<div class="mcell" style="border-color:${strong ? '#2563eb' : 'var(--line)'}">
                <div class="mm">${escapeHtml(m.yearMonth)}</div>
                <div class="md" style="color:${strong ? '#2563eb' : 'inherit'}">${m.daysPresent}</div>
                <div class="mm">days</div></div>`;
            }).join('')}
          </div>
        </div>`;
      host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) { showError(host, err); }
  }
}
