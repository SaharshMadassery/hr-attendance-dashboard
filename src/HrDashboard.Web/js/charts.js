/* =====================================================================
   charts.js — two small charts drawn as inline SVG.

   No charting library: the page needs a bar list and one line chart, and
   a dependency for that would cost more than it saves. Colours come from
   CSS variables so both themes work without a second palette.
   ===================================================================== */
import { escapeHtml } from './table.js';

export function barList(host, rows, labelKey, valueKey, opts = {}) {
  if (!host) return;
  if (!rows || !rows.length) { host.innerHTML = '<p class="cnt">No data in this period.</p>'; return; }
  const max = Math.max(...rows.map(r => Number(r[valueKey]) || 0), 1);
  host.innerHTML = rows.map(r => {
    const v = Number(r[valueKey]) || 0;
    const pct = Math.max(1, (v / max) * 100);
    return `<div class="bar-row">
      <span class="lb" title="${escapeHtml(r[labelKey])}">${escapeHtml(r[labelKey])}</span>
      <span class="bt"><span class="bf" style="width:${pct}%${opts.color ? ';background:' + opts.color : ''}"></span></span>
      <span class="vl">${escapeHtml(v)}</span></div>`;
  }).join('');
}

export function lineChart(host, rows, xKey, series, opts = {}) {
  if (!host) return;
  if (!rows || !rows.length) { host.innerHTML = '<p class="cnt">No data in this period.</p>'; return; }

  const W = 1000, H = opts.height || 250;
  const pad = { top: 14, right: 14, bottom: 34, left: 52 };
  const maxY = Math.max(...rows.flatMap(r => series.map(s => Number(r[s.key]) || 0)), 1);
  const x = i => pad.left + i * (W - pad.left - pad.right) / Math.max(1, rows.length - 1);
  const y = v => H - pad.bottom - (v / maxY) * (H - pad.top - pad.bottom);

  let g = '';
  for (let i = 0; i <= 4; i++) {
    const v = maxY * i / 4, yy = y(v);
    g += `<line x1="${pad.left}" y1="${yy}" x2="${W - pad.right}" y2="${yy}"
            stroke="var(--line)" stroke-width="1"/>
          <text x="${pad.left - 8}" y="${yy + 4}" text-anchor="end" font-size="11"
            fill="var(--mut)">${Math.round(v).toLocaleString()}</text>`;
  }
  for (const s of series) {
    const pts = rows.map((r, i) => `${x(i)},${y(Number(r[s.key]) || 0)}`).join(' ');
    g += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`;
  }
  const step = Math.ceil(rows.length / (opts.ticks || 8));
  rows.forEach((r, i) => {
    if (i % step === 0 || i === rows.length - 1)
      g += `<text x="${x(i)}" y="${H - 12}" text-anchor="middle" font-size="10.5"
              fill="var(--mut)">${escapeHtml(r[xKey])}</text>`;
  });

  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${g}</svg>
    <div class="lgd">${series.map(s =>
      `<span><i style="background:${s.color}"></i>${escapeHtml(s.name)}</span>`).join('')}</div>`;
}
