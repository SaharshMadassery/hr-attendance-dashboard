/* =====================================================================
   api.js — the only module that talks to the server.

   Keeping fetch in one place means every screen gets the same error
   handling, and a failed call surfaces as a readable message rather than
   a blank panel with a console entry nobody sees.
   ===================================================================== */
const BASE = '/api';

async function get(path, params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== null && v !== undefined && v !== '') qs.append(k, v);

  const url = `${BASE}${path}${qs.toString() ? '?' + qs : ''}`;
  let res;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch (cause) {
    throw new Error(`Could not reach the API at ${url}. Is the service running?`, { cause });
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} from ${url}${body ? ' — ' + body.slice(0, 300) : ''}`);
  }
  return res.json();
}

export const api = {
  year:            ()                 => get('/overview/year'),
  scopes:          ()                 => get('/overview/scopes'),
  overview:        (scope)            => get('/overview', { scope }),
  employees:       (p)                => get('/employees', p),
  employee:        (code)             => get(`/employees/${encodeURIComponent(code)}`),
  attendance:      (p)                => get('/attendance/summary', p),
  attendanceByEmp: (p)                => get('/attendance/by-employee', p),
  attendanceByDept:(p)                => get('/attendance/by-department', p),
  months:          (code, p)          => get(`/attendance/${encodeURIComponent(code)}/months`, p),
  exportColumns:   ()                 => get('/export/employees/columns'),

  /* Exports are a plain navigation so the browser handles the download
     and the file never has to be held in memory here. */
  exportEmployeesUrl(params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params))
      if (v !== null && v !== undefined && v !== '') qs.append(k, v);
    return `${BASE}/export/employees?${qs}`;
  },
  exportAttendanceUrl(params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params))
      if (v !== null && v !== undefined && v !== '') qs.append(k, v);
    return `${BASE}/export/attendance?${qs}`;
  }
};

export function showError(host, err) {
  const div = document.createElement('div');
  div.className = 'err';
  div.textContent = err && err.message ? err.message : String(err);
  host.prepend(div);
}
