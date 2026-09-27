/* =====================================================================
   app.js — wiring. Tabs, theme, and one load of the shared reference
   data the tabs need.
   ===================================================================== */
import { api, showError } from './api.js';
import { OverviewTab }   from './overview.js';
import { RosterTab }     from './roster.js';
import { AttendanceTab } from './attendance.js';

const $ = sel => document.querySelector(sel);

/* Tabs */
document.querySelectorAll('#tabs button').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.remove('on'));
    document.querySelectorAll('.pane').forEach(p => p.classList.remove('on'));
    btn.classList.add('on');
    document.getElementById(btn.dataset.pane).classList.add('on');
    window.scrollTo(0, 0);
  };
});

/* Theme: follow the system unless the reader overrides it. */
const theme = $('#theme');
theme.onclick = () => {
  const root = document.documentElement;
  const now = root.getAttribute('data-theme');
  const next = now === 'dark' ? 'light' : now === 'light' ? '' : 'dark';
  if (next) root.setAttribute('data-theme', next); else root.removeAttribute('data-theme');
  try { localStorage.setItem('hrv2.theme', next); } catch { /* ignore */ }
};
try {
  const saved = localStorage.getItem('hrv2.theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
} catch { /* ignore */ }

(async function start() {
  try {
    const year = await api.year();
    $('#sub').textContent =
      `Example School · HR_STAGING · academic year ${year.description ?? year.academicYear} ` +
      `(${year.startDate} to ${year.endDate}) · ${year.openDays} school-open days · ` +
      `punches to ${year.lastPunchDate ?? 'unknown'}`;

    const overview = new OverviewTab($('#p-overview'));
    await overview.init();

    const roster = new RosterTab($('#p-roster'));
    await roster.init();

    const departments = [...new Set(roster.all.map(p => p.department).filter(Boolean))].sort();
    const staffTypes  = [...new Set(roster.all.map(p => p.staffTypeCode).filter(Boolean))].sort();

    const attendance = new AttendanceTab($('#p-attendance'), year);
    await attendance.init(departments, staffTypes);
  } catch (err) {
    showError(document.querySelector('.wrap'), err);
    $('#sub').textContent = 'Example School · could not reach the API';
  }
})();
