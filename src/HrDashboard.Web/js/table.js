/* =====================================================================
   table.js — the shared table.

   Everything a table can do lives here so all of them behave the same:
   sort, search, reorder and hide columns, and export. Version 1 learned
   this the hard way — features added per tab drift apart.

   Two rules worth keeping:
     - the export writes every matching row, never just the page on
       screen; a truncated file that looks complete is worse than none
     - column layout persists per table, but a storage failure must never
       throw, because on some hosts localStorage is unavailable
   ===================================================================== */

const STORE_KEY = 'hrv2.columns';

const store = (() => {
  let mem = {};
  try { mem = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch { mem = {}; }
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(mem)); } catch { /* ignore */ } };
  return {
    get: id => mem[id] || null,
    set: (id, v) => { mem[id] = v; save(); },
    del: id => { delete mem[id]; save(); }
  };
})();

export function escapeHtml(s) {
  return s === null || s === undefined ? '' : String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* Modal with a focus trap: Escape closes, Tab cycles inside, focus goes
   back where it came from. */
function modal(title, subtitle, buildBody, buildFooter) {
  const previous = document.activeElement;
  const backdrop = document.createElement('div');
  backdrop.className = 'mbd';
  const box = document.createElement('div');
  box.className = 'mdl';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', title);
  box.innerHTML = `<h4>${escapeHtml(title)}</h4><div class="mh">${escapeHtml(subtitle)}</div>`;

  const body = document.createElement('div'); body.className = 'mb'; box.appendChild(body);
  const foot = document.createElement('div'); foot.className = 'mf'; box.appendChild(foot);
  backdrop.appendChild(box);
  document.body.appendChild(backdrop);

  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey, true);
    if (previous && previous.focus) previous.focus();
  };
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const focusable = [...box.querySelectorAll('button,input,select,[tabindex]:not([tabindex="-1"])')]
      .filter(el => !el.disabled && el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', onKey, true);
  backdrop.addEventListener('mousedown', e => { if (e.target === backdrop) close(); });

  buildBody(body, close);
  buildFooter(foot, close);
  const firstControl = box.querySelector('button,input');
  if (firstControl) firstControl.focus();
  return close;
}

const registry = [];

/**
 * Render a table.
 *
 * @param {HTMLElement} host
 * @param {object} opts
 *   id        stable key for the saved column layout
 *   title     shown in the dialogs and used for the file name
 *   rows      array of objects
 *   columns   [{ key, label, numeric?, pill?(value,row), format?(value,row) }]
 *   search    false to hide the search box
 *   limit     rows drawn on screen (export ignores this)
 *   onRow     called with the row object when a row is clicked
 *   exportUrl () => string — when set, Export navigates here instead of
 *             building the file in the browser, so the server can return
 *             the full set rather than only what was fetched
 */
export function renderTable(host, opts) {
  if (!host) return;
  const {
    id, title = 'Table', rows = [], columns = [],
    search = true, limit = 500, onRow = null, exportUrl = null, empty = 'No rows.'
  } = opts;

  if (!rows.length) { host.innerHTML = `<p class="cnt">${escapeHtml(empty)}</p>`; return; }

  const allKeys = columns.map(c => c.key);
  const byKey = Object.fromEntries(columns.map(c => [c.key, c]));
  const label = k => byKey[k]?.label ?? k;

  const saved = store.get(id) || {};
  let order = (saved.order || []).filter(k => allKeys.includes(k));
  allKeys.forEach(k => { if (!order.includes(k)) order.push(k); });
  let hidden = new Set((saved.hidden || []).filter(k => allKeys.includes(k)));
  if (hidden.size >= order.length) hidden = new Set();
  const visible = () => order.filter(k => !hidden.has(k));
  const persist = () => store.set(id, { order: [...order], hidden: [...hidden] });

  let sortKey = null, sortDir = 1, query = '';
  let matched = rows;

  const wrap = document.createElement('div');
  const ctl = document.createElement('div'); ctl.className = 'ctl';

  if (search) {
    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Filter…';
    input.oninput = e => { query = e.target.value.toLowerCase(); draw(); };
    ctl.appendChild(input);
  }
  const count = document.createElement('span'); count.className = 'cnt'; ctl.appendChild(count);

  const spacer = document.createElement('span'); spacer.className = 'sp'; ctl.appendChild(spacer);
  const colsBtn = document.createElement('button');
  colsBtn.className = 'tbtn'; colsBtn.type = 'button'; colsBtn.textContent = 'Columns';
  colsBtn.title = 'Reorder or hide columns';
  colsBtn.onclick = openColumns;
  spacer.appendChild(colsBtn);

  const expBtn = document.createElement('button');
  expBtn.className = 'tbtn'; expBtn.type = 'button'; expBtn.textContent = 'Export';
  expBtn.title = 'Choose columns, then download CSV';
  expBtn.onclick = openExport;
  spacer.appendChild(expBtn);

  wrap.appendChild(ctl);
  const tw = document.createElement('div'); tw.className = 'tw'; wrap.appendChild(tw);

  function cellText(row, key) {
    const col = byKey[key];
    const raw = row[key];
    return col?.format ? col.format(raw, row) : (raw ?? '');
  }

  function draw() {
    const cols = visible();
    let list = rows;

    if (query) {
      list = list.filter(r => allKeys.some(k =>
        String(cellText(r, k) ?? '').toLowerCase().includes(query)));
    }
    if (sortKey) {
      list = [...list].sort((a, b) => {
        const x = a[sortKey], y = b[sortKey];
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        const cmp = (typeof x === 'number' && typeof y === 'number')
          ? x - y : String(x).localeCompare(String(y));
        return cmp * sortDir;
      });
    }
    matched = list;

    const shown = list.slice(0, limit);
    count.textContent = `${list.length} ${list.length === 1 ? 'row' : 'rows'}`
      + (query ? ` (filtered from ${rows.length})` : '')
      + (list.length > limit ? ` — showing first ${limit}; export returns all` : '')
      + (hidden.size ? ` · ${hidden.size} column${hidden.size === 1 ? '' : 's'} hidden` : '');

    tw.innerHTML =
      '<table><thead><tr>' +
      cols.map(k => {
        const cls = [byKey[k]?.numeric ? 'num' : '', sortKey === k ? (sortDir === 1 ? 'asc' : 'desc') : '']
          .filter(Boolean).join(' ');
        return `<th class="${cls}" data-k="${escapeHtml(k)}">${escapeHtml(label(k))}</th>`;
      }).join('') +
      '</tr></thead><tbody>' +
      shown.map((row, i) => `<tr data-i="${i}"${onRow ? ' class="clk"' : ''}>` +
        cols.map(k => {
          const col = byKey[k];
          const text = cellText(row, k);
          const pill = col?.pill ? col.pill(row[k], row) : null;
          const inner = pill
            ? `<span class="pill ${escapeHtml(pill[0])}">${escapeHtml(pill[1])}</span>`
            : escapeHtml(text);
          return `<td class="${col?.numeric ? 'num' : ''}">${inner}</td>`;
        }).join('') + '</tr>').join('') +
      '</tbody></table>';

    tw.querySelectorAll('th').forEach(th => th.onclick = () => {
      const k = th.dataset.k;
      if (sortKey === k) sortDir = -sortDir;
      else { sortKey = k; sortDir = byKey[k]?.numeric ? -1 : 1; }
      draw();
    });

    if (onRow) tw.querySelectorAll('tbody tr').forEach(tr => tr.onclick = () => {
      tw.querySelectorAll('tbody tr').forEach(x => x.classList.remove('sel'));
      tr.classList.add('sel');
      onRow(shown[+tr.dataset.i]);
    });
  }

  function openExport() {
    const picked = new Map(order.map(k => [k, !hidden.has(k)]));
    modal(`Export ${title}`,
      `${matched.length} row${matched.length === 1 ? '' : 's'} match the current filters and sort. Choose the columns to include.`,
      (body) => {
        order.forEach(k => {
          const row = document.createElement('div'); row.className = 'crow';
          const cb = document.createElement('input');
          cb.type = 'checkbox'; cb.checked = picked.get(k); cb.id = `x-${id}-${k}`;
          cb.onchange = () => picked.set(k, cb.checked);
          const lb = document.createElement('label'); lb.htmlFor = cb.id; lb.textContent = label(k);
          row.append(cb, lb); body.appendChild(row);
        });
      },
      (foot, close) => {
        const sp = document.createElement('span'); sp.className = 'sp';
        ['All', 'None'].forEach(which => {
          const b = document.createElement('button');
          b.className = 'tbtn'; b.type = 'button'; b.textContent = which;
          b.onclick = () => {
            order.forEach(k => picked.set(k, which === 'All'));
            foot.parentNode.querySelectorAll('.mb input').forEach(x => { x.checked = which === 'All'; });
          };
          sp.appendChild(b);
        });
        foot.appendChild(sp);

        const cancel = document.createElement('button');
        cancel.className = 'btn'; cancel.style.background = 'transparent';
        cancel.style.color = 'var(--mut)'; cancel.style.border = '1px solid var(--line)';
        cancel.type = 'button'; cancel.textContent = 'Cancel'; cancel.onclick = close;
        foot.appendChild(cancel);

        const go = document.createElement('button');
        go.className = 'btn'; go.type = 'button'; go.textContent = 'Download CSV';
        go.onclick = () => {
          const chosen = order.filter(k => picked.get(k));
          if (!chosen.length) {
            go.textContent = 'Pick at least one column';
            setTimeout(() => { go.textContent = 'Download CSV'; }, 1600);
            return;
          }
          if (exportUrl) {
            window.location.href = exportUrl(chosen.map(k => label(k)));
          } else {
            const head = chosen.map(k => csvCell(label(k))).join(',');
            const lines = matched.map(r => chosen.map(k => csvCell(cellText(r, k))).join(','));
            download(`${id}.csv`, [head, ...lines].join('\n'));
          }
          close();
        };
        foot.appendChild(go);
      });
  }

  function openColumns() {
    const workOrder = [...order];
    const workHidden = new Set(hidden);
    modal(`Columns — ${title}`,
      'Reorder with the arrows, untick to hide. Applies to the table and to what the export offers.',
      (body) => {
        const paint = () => {
          body.innerHTML = '';
          workOrder.forEach((k, i) => {
            const row = document.createElement('div'); row.className = 'crow';
            const cb = document.createElement('input');
            cb.type = 'checkbox'; cb.checked = !workHidden.has(k); cb.id = `g-${id}-${k}`;
            cb.onchange = () => {
              if (cb.checked) workHidden.delete(k); else workHidden.add(k);
              if (workHidden.size >= workOrder.length) { workHidden.delete(k); cb.checked = true; }
            };
            const lb = document.createElement('label'); lb.htmlFor = cb.id; lb.textContent = label(k);
            const mv = document.createElement('span'); mv.className = 'mv';
            const left = document.createElement('button');
            left.type = 'button'; left.textContent = '←'; left.title = 'Move left';
            left.disabled = i === 0;
            left.onclick = () => { workOrder.splice(i - 1, 0, workOrder.splice(i, 1)[0]); paint(); };
            const right = document.createElement('button');
            right.type = 'button'; right.textContent = '→'; right.title = 'Move right';
            right.disabled = i === workOrder.length - 1;
            right.onclick = () => { workOrder.splice(i + 1, 0, workOrder.splice(i, 1)[0]); paint(); };
            mv.append(left, right);
            row.append(cb, lb, mv);
            body.appendChild(row);
          });
        };
        paint();
      },
      (foot, close) => {
        const sp = document.createElement('span'); sp.className = 'sp';
        const reset = document.createElement('button');
        reset.className = 'tbtn'; reset.type = 'button'; reset.textContent = 'Reset to original';
        reset.onclick = () => { order = [...allKeys]; hidden = new Set(); store.del(id); draw(); close(); };
        sp.appendChild(reset); foot.appendChild(sp);

        const cancel = document.createElement('button');
        cancel.className = 'tbtn'; cancel.type = 'button'; cancel.textContent = 'Cancel';
        cancel.onclick = close; foot.appendChild(cancel);

        const apply = document.createElement('button');
        apply.className = 'btn'; apply.type = 'button'; apply.textContent = 'Apply';
        apply.onclick = () => {
          order = [...workOrder]; hidden = new Set(workHidden);
          persist(); draw(); close();
        };
        foot.appendChild(apply);
      });
  }

  draw();
  host.innerHTML = '';
  host.appendChild(wrap);

  const existing = registry.findIndex(t => t.host === host);
  if (existing >= 0) registry.splice(existing, 1);
  registry.push({ host, title, openColumns, openExport });
}

/* Cmd+G / Ctrl+G opens the column manager for the table nearest the top of
   the viewport. It is the browser's own "find next", and preventDefault
   only holds while focus is in the page — once the native find bar has
   focus the keystroke never reaches us. The Columns button on every table
   is the dependable path; this is a convenience on top of it. */
document.addEventListener('keydown', e => {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || String(e.key).toLowerCase() !== 'g') return;
  if (document.querySelector('.mbd')) return;
  const pane = document.querySelector('.pane.on');
  if (!pane) return;

  let best = null, bestDistance = Infinity;
  for (const t of registry) {
    if (!pane.contains(t.host)) continue;
    const r = t.host.getBoundingClientRect();
    if (r.bottom < 60 || r.top > window.innerHeight - 40) continue;
    const d = Math.abs(r.top - 70);
    if (d < bestDistance) { bestDistance = d; best = t; }
  }
  if (!best) best = registry.find(t => pane.contains(t.host));
  if (!best) return;
  e.preventDefault();
  best.openColumns();
}, true);
