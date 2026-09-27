/* data payload lives in data.json */

function esc(s){return s==null?'':String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function fmt(v){return typeof v==='number'?v.toLocaleString(undefined,{maximumFractionDigits:2}):esc(v)}
function isNum(k,rows){const v=rows.filter(r=>r[k]!=null).map(r=>r[k]);return v.length&&v.every(x=>typeof x==='number')}

/* ======================================================================
   Shared table furniture: per-table column order/visibility, CSV export
   with a column chooser, and a column manager. Everything lives inside
   table() so all call sites gain it at once.
   ====================================================================== */

/* Column layouts persist across reloads where storage allows it. On file://
   URLs localStorage can be unavailable or throw; the in-memory copy is the
   source of truth either way, so a storage failure only costs persistence.
   It must never propagate — one throw here would blank the whole page. */
const TSTORE=(function(){
 let mem={};
 try{const s=localStorage.getItem('hrdash.cols');if(s)mem=JSON.parse(s)||{}}catch(e){mem={}}
 function save(){try{localStorage.setItem('hrdash.cols',JSON.stringify(mem))}catch(e){}}
 return {get:t=>mem[t]||null,set:(t,v)=>{mem[t]=v;save()},del:t=>{delete mem[t];save()}};
})();

/* Live registry of rendered tables, so the column-manager shortcut can find
   the one the user is actually looking at. Keyed by host element — tables are
   re-rendered in place, and a stale entry would target a detached node. */
const TABLES=[];
function regTable(host,api){
 const i=TABLES.findIndex(t=>t.host===host);
 if(i>=0)TABLES.splice(i,1);
 TABLES.push(Object.assign({host:host},api));
}

/* the three original Download CSV buttons keep their place but now open the
   shared chooser for the table they belong to */
function exportById(id){
 const t=TABLES.filter(x=>x.host&&x.host.id===id).pop();
 if(t)t.openExport();
}
function csvCell(v){const s=v==null?'':String(v);
 return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
function download(name,text){
 const a=document.createElement('a');
 a.href=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));
 a.download=name;a.click();URL.revokeObjectURL(a.href);
}

/* Modal shell: Escape closes, focus is trapped while open and returns to the
   trigger, and it inherits the page's light/dark variables. */
function modal(title,sub,build,footer){
 const prev=document.activeElement;
 const bd=document.createElement('div');bd.className='mbd';
 const md=document.createElement('div');md.className='mdl';
 md.setAttribute('role','dialog');md.setAttribute('aria-modal','true');
 md.setAttribute('aria-label',title);
 md.innerHTML='<h4>'+esc(title)+'</h4><div class="mh">'+esc(sub)+'</div>';
 const body=document.createElement('div');body.className='mb';md.appendChild(body);
 const foot=document.createElement('div');foot.className='mf';md.appendChild(foot);
 bd.appendChild(md);document.body.appendChild(bd);
 function close(){bd.remove();document.removeEventListener('keydown',onKey,true);
  if(prev&&prev.focus)prev.focus()}
 function onKey(e){
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return}
  if(e.key!=='Tab')return;
  const f=[...md.querySelectorAll('button,input,select,[tabindex]:not([tabindex="-1"])')]
    .filter(x=>!x.disabled&&x.offsetParent!==null);
  if(!f.length)return;
  const first=f[0],last=f[f.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
 }
 document.addEventListener('keydown',onKey,true);
 bd.onmousedown=e=>{if(e.target===bd)close()};
 build(body,close);footer(foot,close);
 const f1=md.querySelector('button,input');if(f1)f1.focus();
 return close;
}

function table(el,key,opts){if(!el)return;opts=opts||{};const d=opts.data?{cols:opts.dcols,rows:opts.data}:D[key];if(!d||!d.rows.length){el.innerHTML='<p class="cnt">'+(opts.empty||'No rows.')+'</p>';return}
 const allCols=(opts.cols||d.cols).slice(), labels=opts.labels||{}, rows=d.rows.slice();
 const tid=opts.tid||key||el.id||('t'+TABLES.length);
 const title=opts.title||'Table';
 const nums={};allCols.forEach(c=>nums[c]=isNum(c,rows));
 const lab=c=>labels[c]||c;

 /* stored layout, defensively reconciled against the columns that actually
    exist now — a saved layout must never hide a column out of existence or
    resurrect one that has gone */
 const saved=TSTORE.get(tid)||{};
 let order=(saved.order||[]).filter(c=>allCols.indexOf(c)>=0);
 allCols.forEach(c=>{if(order.indexOf(c)<0)order.push(c)});
 let hidden=new Set((saved.hidden||[]).filter(c=>allCols.indexOf(c)>=0));
 if(hidden.size>=order.length)hidden=new Set();      // never hide every column
 const visible=()=>order.filter(c=>!hidden.has(c));
 const persist=()=>TSTORE.set(tid,{order:order.slice(),hidden:[...hidden]});

 let sortK=opts.sort||null,sortD=opts.desc?-1:1,q='';
 let matched=rows;                 // full filtered+sorted set, ignores the display cap
 const wrap=document.createElement('div');
 const ctl=document.createElement('div');ctl.className='ctl';
 if(opts.search!==false){const inp=document.createElement('input');inp.type='search';
  inp.placeholder=opts.ph||'Filter…';inp.oninput=e=>{q=e.target.value.toLowerCase();draw()};ctl.appendChild(inp)}
 const cnt=document.createElement('span');cnt.className='cnt';ctl.appendChild(cnt);
 const sp=document.createElement('span');sp.className='sp';ctl.appendChild(sp);
 const bCols=document.createElement('button');bCols.className='tbtn';bCols.type='button';
 bCols.textContent='Columns';bCols.title='Reorder or hide columns (Cmd/Ctrl+G)';
 bCols.onclick=openCols;sp.appendChild(bCols);
 const bExp=document.createElement('button');bExp.className='tbtn';bExp.type='button';
 bExp.textContent='Export';bExp.title='Choose columns, then download CSV';
 bExp.onclick=openExport;sp.appendChild(bExp);
 wrap.appendChild(ctl);
 const tw=document.createElement('div');tw.className='tw';wrap.appendChild(tw);

 function draw(){
  const cols=visible();
  let r=rows;
  if(q)r=r.filter(x=>allCols.some(c=>String(x[c]==null?'':x[c]).toLowerCase().includes(q)));
  if(sortK)r=r.slice().sort((a,b)=>{const x=a[sortK],y=b[sortK];
   if(x==null)return 1;if(y==null)return -1;
   return (typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y)))*sortD});
  matched=r;
  cnt.textContent=r.length+(r.length===1?' row':' rows')+(q?' (filtered from '+rows.length+')':'');
  const lim=opts.limit||1200, shown=r.slice(0,lim);
  tw.innerHTML='<table><thead><tr>'+cols.map(c=>
    `<th class="${nums[c]?'num':''} ${sortK===c?(sortD===1?'asc':'desc'):''}" data-c="${esc(c)}">${esc(lab(c))}</th>`).join('')
   +'</tr></thead><tbody>'+shown.map((x,ri)=>`<tr data-i="${ri}"${opts.onRow?' class="clk"':''}>`+cols.map(c=>{
     let v=x[c];let cls=nums[c]?'num':'';let disp=fmt(v);
     if(opts.pills&&opts.pills[c]){const p=opts.pills[c](v,x);if(p)disp=`<span class="pill ${p[0]}">${esc(p[1])}</span>`}
     return `<td class="${cls}">${disp}</td>`}).join('')+'</tr>').join('')+'</tbody></table>';
  if(r.length>lim)cnt.textContent+=' — showing first '+lim+' of '+r.length+'; export returns all';
  if(hidden.size)cnt.textContent+=' · '+hidden.size+' column'+(hidden.size===1?'':'s')+' hidden';
  tw.querySelectorAll('th').forEach(th=>th.onclick=()=>{const c=th.dataset.c;
   if(sortK===c)sortD=-sortD;else{sortK=c;sortD=nums[c]?-1:1}draw()});
  if(opts.onRow)tw.querySelectorAll('tbody tr').forEach(tr=>tr.onclick=()=>{
    tw.querySelectorAll('tbody tr').forEach(x=>x.classList.remove('sel'));
    tr.classList.add('sel');opts.onRow(shown[+tr.dataset.i])});
 }

 /* Export always writes `matched` — the whole filtered, sorted set. Tables
    cap what they draw (60, 1000, 1200); a file that silently stopped at the
    cap would read as complete when it is not. */
 function openExport(){
  const pick=new Map();order.forEach(c=>pick.set(c,!hidden.has(c)));
  modal('Export '+title,
   matched.length+' row'+(matched.length===1?'':'s')+' match the current filters and sort. Choose the columns to include.',
   (body,close)=>{
    order.forEach(c=>{
     const row=document.createElement('div');row.className='crow';
     const cb=document.createElement('input');cb.type='checkbox';cb.checked=pick.get(c);
     cb.id='x-'+tid+'-'+c;cb.onchange=()=>pick.set(c,cb.checked);
     const l=document.createElement('label');l.htmlFor=cb.id;l.textContent=lab(c);
     row.appendChild(cb);row.appendChild(l);body.appendChild(row);
    });
   },
   (foot,close)=>{
    const s=document.createElement('span');s.className='sp';
    ['All','None'].forEach(t=>{const b=document.createElement('button');b.className='tbtn';b.type='button';
     b.textContent=t;b.onclick=()=>{order.forEach(c=>pick.set(c,t==='All'));
      foot.parentNode.querySelectorAll('.mb input').forEach(x=>x.checked=(t==='All'))};s.appendChild(b)});
    foot.appendChild(s);
    const cancel=document.createElement('button');cancel.className='btn sec';cancel.type='button';
    cancel.textContent='Cancel';cancel.onclick=close;foot.appendChild(cancel);
    const go=document.createElement('button');go.className='btn';go.type='button';go.textContent='Download CSV';
    go.onclick=()=>{
     const cs=order.filter(c=>pick.get(c));
     if(!cs.length){go.textContent='Pick at least one column';setTimeout(()=>go.textContent='Download CSV',1600);return}
     const head=cs.map(c=>csvCell(lab(c))).join(',');
     const body=matched.map(r=>cs.map(c=>csvCell(r[c])).join(',')).join('\n');
     const tag=opts.fileTag?opts.fileTag():'';
     download(tid+(tag?'-'+tag:'')+'.csv',head+'\n'+body);
     close();
    };
    foot.appendChild(go);
   });
 }

 function openCols(){
  const wOrder=order.slice(), wHidden=new Set(hidden);
  modal('Columns — '+title,
   'Reorder with the arrows, untick to hide. Applies to the table and to what the export offers.',
   (body,close)=>{
    function paint(){
     body.innerHTML='';
     wOrder.forEach((c,i)=>{
      const row=document.createElement('div');row.className='crow';
      const cb=document.createElement('input');cb.type='checkbox';cb.checked=!wHidden.has(c);
      cb.id='g-'+tid+'-'+c;
      cb.onchange=()=>{if(cb.checked)wHidden.delete(c);else wHidden.add(c);
       if(wHidden.size>=wOrder.length){wHidden.delete(c);cb.checked=true}};
      const l=document.createElement('label');l.htmlFor=cb.id;l.textContent=lab(c);
      const mv=document.createElement('span');mv.className='mv';
      const up=document.createElement('button');up.type='button';up.textContent='←';
      up.title='Move left';up.disabled=i===0;
      up.onclick=()=>{wOrder.splice(i-1,0,wOrder.splice(i,1)[0]);paint()};
      const dn=document.createElement('button');dn.type='button';dn.textContent='→';
      dn.title='Move right';dn.disabled=i===wOrder.length-1;
      dn.onclick=()=>{wOrder.splice(i+1,0,wOrder.splice(i,1)[0]);paint()};
      mv.appendChild(up);mv.appendChild(dn);
      row.appendChild(cb);row.appendChild(l);row.appendChild(mv);body.appendChild(row);
     });
    }
    paint();
   },
   (foot,close)=>{
    const s=document.createElement('span');s.className='sp';
    const rst=document.createElement('button');rst.className='tbtn';rst.type='button';
    rst.textContent='Reset to original';
    rst.onclick=()=>{order=allCols.slice();hidden=new Set();TSTORE.del(tid);draw();close()};
    s.appendChild(rst);foot.appendChild(s);
    const cancel=document.createElement('button');cancel.className='btn sec';cancel.type='button';
    cancel.textContent='Cancel';cancel.onclick=close;foot.appendChild(cancel);
    const go=document.createElement('button');go.className='btn';go.type='button';go.textContent='Apply';
    go.onclick=()=>{order=wOrder.slice();hidden=new Set(wHidden);persist();draw();close()};
    foot.appendChild(go);
   });
 }

 draw();el.innerHTML='';el.appendChild(wrap);
 regTable(el,{title:title,openCols:openCols,openExport:openExport});
}

/* Cmd+G / Ctrl+G opens the column manager for the table nearest the top of
   the viewport on the visible tab. preventDefault does suppress the browser's
   own "find next" while focus is in the page, which it is in normal use — but
   once the native find bar has focus the keystroke never reaches the page and
   cannot be intercepted. The "Columns" button on every table is the reliable
   path and the discoverable one; the shortcut is a convenience on top. */
document.addEventListener('keydown',e=>{
 if(!(e.metaKey||e.ctrlKey)||e.altKey||String(e.key).toLowerCase()!=='g')return;
 const pane=document.querySelector('.pane.on');if(!pane)return;
 if(document.querySelector('.mbd'))return;               // a dialog is already open
 let best=null,bestD=Infinity;
 TABLES.forEach(t=>{
  if(!pane.contains(t.host))return;
  const r=t.host.getBoundingClientRect();
  if(r.bottom<60||r.top>window.innerHeight-40)return;    // not on screen
  const dist=Math.abs(r.top-70);
  if(dist<bestD){bestD=dist;best=t}
 });
 if(!best){const first=TABLES.filter(t=>pane.contains(t.host))[0];if(first)best=first}
 if(!best)return;
 e.preventDefault();best.openCols();
},true);

/* ======================================================================
   One standing per employee record.

   This replaces the old STATUS + FLAG pair. Those two columns read from
   different sources — STATUS from turnstile punches in a trailing window,
   FLAG from a leaving date on the HR record — so a row could show "Active"
   and "CONFLICT" together and look self-contradictory when the two were
   simply answering different questions. Here every one of the 814 records
   falls into exactly one category, and the category names the situation.

   Threshold: 20 school-open days, about four school weeks, counted in days
   the school was actually open rather than calendar days. Counting calendar
   days would turn every regular member of staff into a leaver over the
   summer. The data supports the cut: 176 people were last seen within 20
   open days, exactly 1 falls between 21 and 60, and 34 sit beyond 60 — the
   line goes in the empty valley, not through a crowd.

   Limits worth stating: a leaving date is only visible here for people who
   attended, so "Not on site this year" cannot be split into departed versus
   still-employed from data in this page. And nothing in the turnstile log
   distinguishes approved long leave, maternity leave or secondment from an
   unexplained absence — "Stopped attending" is a prompt to ask, not a finding.
   ====================================================================== */
const STATUS=(function(){
 const opens=D.open_days.rows.map(r=>r.d).sort();
 const idx={};opens.forEach((d,i)=>{idx[d]=i});
 const LAST=opens.length-1, AYS=opens[0], GAP=20;
 const ae={};D.att_emp.rows.forEach(r=>{ae[r.empno]=r});
 /* the only per-person view of a leaving date the page carries */
 const left=new Set(D.dq_detail.rows.filter(r=>r.defect==='working_left').map(r=>r.empno));
 const CATS=[
  {k:'onsite_left',n:'On site — clear leaving date',p:'warn',own:'HR',
   d:'Attending now, but the HR record carries a leaving date that has already passed.',
   act:'Clear the leaving date so payroll, leave and visa tracking read this person as employed.'},
  {k:'stopped',n:'Stopped attending — confirm',p:'bad',own:'HR',
   d:'Attended during the year, but has not been seen for more than 20 school-open days.',
   act:'Confirm whether this is long leave, secondment or a departure before acting on it.'},
  {k:'nosite_sys',n:'Not on site — system still used',p:'warn',own:'HR and IT',
   d:'No turnstile activity this year, but the HR system account was used during the year.',
   act:'Confirm the role. If the person has left, close the account.'},
  {k:'onsite',n:'On site',p:'ok',own:'—',
   d:'Seen on the turnstile within the last 20 school-open days, with nothing on the record to query.',
   act:'No action.'},
  {k:'nosite',n:'Not on site this year',p:'no',own:'HR',
   d:'No turnstile activity and no HR system use during the academic year.',
   act:'Historical records. Review for archiving — this is not evidence that anyone is missing.'},
  {k:'unknown',n:'Not enough information',p:'no',own:'HR',
   d:'No attendance, no system use and no joining date, so no category can be justified.',
   act:'Check the record exists as intended.'}
 ];
 const byKey={};CATS.forEach(c=>{byKey[c.k]=c});
 function of(r){
  const a=ae[r.empno];
  if(a&&idx[a.last_seen]!=null)
   return (LAST-idx[a.last_seen])<=GAP?(left.has(r.empno)?'onsite_left':'onsite'):'stopped';
  if(r.last_login&&r.last_login>=AYS)return 'nosite_sys';
  if(r.joined||r.last_login)return 'nosite';
  return 'unknown';
 }
 return {of:of,cats:CATS,byKey:byKey,gap:GAP,
   name:r=>byKey[of(r)].n,
   att:e=>ae[e]||null};
})();

function bars(el,key,labelK,valK,opts){if(!el)return;opts=opts||{};
 const d=Array.isArray(key)?{rows:key}:D[key];
 if(!d)return;
 if(!d.rows.length){el.innerHTML='<p class="cnt">No data in this period.</p>';return}
 let rows=d.rows.slice().sort((a,b)=>b[valK]-a[valK]);
 if(opts.top)rows=rows.slice(0,opts.top);
 const max=Math.max(...rows.map(r=>r[valK]),1);
 el.innerHTML=rows.map(r=>`<div class="bar-row"><span class="lb" title="${esc(r[labelK])}">${esc(r[labelK])}</span>
  <span class="bt"><span class="bf" style="width:${Math.max(1,r[valK]/max*100)}%;${opts.color?'background:'+opts.color:''}"></span></span>
  <span class="vl">${fmt(r[valK])}</span></div>`).join('');
}

function line(el,key,xK,series,opts){if(!el)return;opts=opts||{};
 const d=Array.isArray(key)?{rows:key}:D[key];
 if(!d||!d.rows.length){el.innerHTML='<p class="cnt">No data in this period.</p>';return}
 const rows=d.rows, W=1000,H=opts.h||230,P={t:14,r:14,b:34,l:48};
 const maxY=Math.max(...rows.flatMap(r=>series.map(s=>r[s.k]||0)),1);
 const x=i=>P.l+i*(W-P.l-P.r)/Math.max(1,rows.length-1);
 const y=v=>H-P.b-(v/maxY)*(H-P.t-P.b);
 let g='';
 for(let i=0;i<=4;i++){const v=maxY*i/4,yy=y(v);
  g+=`<line x1="${P.l}" y1="${yy}" x2="${W-P.r}" y2="${yy}" stroke="var(--line)" stroke-width="1"/>
      <text x="${P.l-8}" y="${yy+4}" text-anchor="end" font-size="11" fill="var(--mut)">${Math.round(v).toLocaleString()}</text>`}
 series.forEach(s=>{
  const pts=rows.map((r,i)=>`${x(i)},${y(r[s.k]||0)}`).join(' ');
  g+=`<polyline points="${pts}" fill="none" stroke="${s.c}" stroke-width="2" stroke-linejoin="round"/>`;
  if(rows.length<=40)rows.forEach((r,i)=>{g+=`<circle cx="${x(i)}" cy="${y(r[s.k]||0)}" r="2.5" fill="${s.c}"><title>${esc(r[xK])}: ${fmt(r[s.k])}</title></circle>`});
 });
 const step=Math.ceil(rows.length/(opts.ticks||8));
 rows.forEach((r,i)=>{if(i%step===0||i===rows.length-1)
  g+=`<text x="${x(i)}" y="${H-12}" text-anchor="middle" font-size="10.5" fill="var(--mut)">${esc(r[xK])}</text>`});
 el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${g}</svg>
  <div class="lgd">${series.map(s=>`<span><i style="background:${s.c}"></i>${esc(s.n)}</span>`).join('')}</div>`;
}

document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{
 document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('on'));
 document.querySelectorAll('.pane').forEach(x=>x.classList.remove('on'));
 b.classList.add('on');document.getElementById(b.dataset.p).classList.add('on');window.scrollTo(0,0)});

const tog=document.getElementById('tog');
tog.onclick=()=>{const r=document.documentElement;
 const cur=r.getAttribute('data-theme')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');
 r.setAttribute('data-theme',cur==='dark'?'light':'dark')};


/* ======================================================================
   Overview: a permanent grid of category cards, in the shape of the HRMS
   HR Dashboard. Every count is a link — clicking one opens the people behind
   it in a table below the cards, and clicking a person opens their record.
   The cards stay on screen throughout, so you can move between categories
   without going back first.

   Cards are built only from fields the page holds per person. Four columns
   from the HRMS screen — nationality, mobile, email and date of birth — are
   not carried per employee anywhere in this page (nationality exists only as
   group totals), so they cannot appear in the table and are called out under
   the grid rather than shown as blank columns.

   The document cards from that screen are deliberately not reproduced as
   live counts: at source they hold 3 to 12 rows against 814 employees, so
   they are grouped as "not currently recorded" with the real row counts.
   ====================================================================== */
(function(){
 const cards=document.getElementById('over-cards'),
       listHost=document.getElementById('over-list'),
       kpi=document.getElementById('over-kpi');
 if(!cards||!listHost||!kpi)return;
 const ae={};D.att_emp.rows.forEach(r=>{ae[r.empno]=r});
 const dqBy={};D.dq_detail.rows.forEach(r=>{(dqBy[r.empno]=dqBy[r.empno]||[]).push(r)});
 const DQLAB={working_left:'Attending but recorded as left',no_bank:'No bank account on file',
  never_login:'System account never used',bad_dob:'Date of birth outside a plausible range',
  impossible_dates:'Leaving date earlier than joining date',dupe_name:'Duplicate name on file'};
 const AYS=D.open_days.rows.map(r=>r.d).sort()[0];

 const HR={};D.hrms.rows.forEach(r=>{HR[r.empno]=r});
 const STYPE={T:'Teaching',S:'Support',A:'Admin',V:'Visiting Staff',L:'Staff type L (undecoded)'};
 const TODAY=new Date();const TMD=('0'+(TODAY.getMonth()+1)).slice(-2)+'-'+('0'+TODAY.getDate()).slice(-2);
 /* a document is Valid / Expired / No data purely on its expiry date, which is
    how the HRMS screen counts and what makes the two reconcile */
 function docState(exp){if(!exp)return 'No data';
  return exp>TODAY.toISOString().slice(0,10)?'Valid':'Expired'}

 const ALL=D.roster.rows.map(r=>{const a=ae[r.empno],x=HR[r.empno]||{};
  return Object.assign({},r,x,{standing:STATUS.name(r),_k:STATUS.of(r),
   hr_status:x.status==='A'?'Active':x.status==='I'?'Ex-employee':null,
   svc_status:x.svc==='L'?'Left':x.svc==='V'?'In service':null,
   staff_type_full:STYPE[x.stype]||x.stype||null,
   nat:x.nat||null,
   eid_state:docState(x.eid_exp),pp_state:docState(x.pp_exp),
   visa_state:docState(x.visa_exp),lc_state:docState(x.lc_exp),
   ag_state:docState(x.ag_exp),
   birthday_today:x.dob&&x.dob.slice(5)===TMD,
   last_seen:a?a.last_seen:null,attend_pct:a?a.attend_pct:null,
   days_year:a?a.days_present:null,avg_arrival:a?a.avg_arrival:null,
   avg_hours:a?a.avg_hours:null,late_days:a?a.late_days:null,
   no_out_days:a?a.no_out_days:null});});

 /* The HRMS HR Dashboard draws one screen from three different populations —
    Active/Ex-employee over the whole file, gender over em_status='A' (344), and
    the staff-type and document cards over em_status='A' AND em_service_status='V'
    (341). All three are offered here so every figure on that screen can be
    reproduced and, unlike there, opened. */
 const SCOPES=[
  {k:'active',n:'Active employees',s:'badged in at least once during 2025-2026',f:r=>!!ae[r.empno]},
  {k:'all',n:'All employee records',s:'every record on file, including past staff',f:()=>true},
  {k:'hra',n:'HR status Active',s:"em_status='A' — the population behind the HRMS gender and attendance cards",
   f:r=>r.status==='A'},
  {k:'inservice',n:'HR status Active and in service',
   s:"em_status='A' and em_service_status='V' — the population behind the HRMS staff-type and document cards",
   f:r=>r.status==='A'&&r.svc==='V'},
  {k:'recent',n:'On site recently',s:'seen within the last '+STATUS.gap+' school-open days',
   f:r=>r._k==='onsite'||r._k==='onsite_left'}
 ];
 /* Default to the whole file: that is the population the HR system's own
    Active / Ex-employee counts describe, so the two agree on first sight.
    The tiles and the selector switch to the punch-based views. */
 let scope='all', sel=null;

 function pool(){return ALL.filter(SCOPES.find(x=>x.k===scope).f)}
 function band(y){return y==null?'Not recorded':y<1?'Under 1 year':y<=2?'1–2 years'
   :y<=5?'3–5 years':y<=10?'6–10 years':'Over 10 years'}
 /* All counts the population, then Valid / Expired / No data partition it by
    expiry date — the same shape the HRMS document cards use */
 function docCard(rows,numK,stateK){
  const st=k=>rows.filter(r=>r[stateK]===k).length;
  return [['All',rows.length],['Has a number',rows.filter(r=>r[numK]).length],
          ['Valid',st('Valid')],['Expired',st('Expired')],['No data',st('No data')]]
         .filter(x=>x[1]>0||x[0]==='Valid'||x[0]==='Expired');
 }
 /* Each card opens with the columns that belong to it — clicking Visa gives
    visa number, type, issue and expiry, not the full 23-column sheet. The
    identity block stays in front so the row is still recognisable. */
 const IDCOLS=['sr','empno','name','nat','mobile','dept','designation'];
 const DOCSET={
  visa:{cols:['visa_no','visa_type','visa_iss','visa_exp','visa_state'],
        labels:{visa_no:'Visa no',visa_type:'Visa type',visa_iss:'Visa issue date',
                visa_exp:'Visa expiry date',visa_state:'Visa status'}},
  pp:{cols:['pp_no','pp_iss','pp_exp','pp_state'],
      labels:{pp_no:'Passport no',pp_iss:'Passport issue date',
              pp_exp:'Passport expiry date',pp_state:'Passport status'}},
  eid:{cols:['eid_no','eid_iss','eid_exp','eid_state'],
       labels:{eid_no:'Emirates ID no',eid_iss:'Emirates ID issue date',
               eid_exp:'Emirates ID expiry date',eid_state:'Emirates ID status'}},
  lc:{cols:['lc_no','lc_iss','lc_exp','lc_state'],
      labels:{lc_no:'Labour card no',lc_iss:'Labour card issue date',
              lc_exp:'Labour card expiry date',lc_state:'Labour card status'}},
  ag:{cols:['ag_no','ag_iss','ag_exp','ag_state'],
      labels:{ag_no:'Contract ref',ag_iss:'Contract start date',
              ag_exp:'Contract expiry date',ag_state:'Contract status'}}
 };
 function group(rows,keyFn){const m=new Map();
  rows.forEach(r=>{const k=keyFn(r);if(k==null)return;m.set(k,(m.get(k)||0)+1)});
  return [...m.entries()].sort((a,b)=>b[1]-a[1])}

 /* low-alpha tints, one per card, readable over both themes */
 const TINT=['rgba(217,45,32,.07)','rgba(220,104,3,.08)','rgba(3,152,85,.07)',
             'rgba(37,99,235,.07)','rgba(105,65,198,.08)','rgba(2,132,199,.07)',
             'rgba(180,35,24,.06)'];
 let tint=0;
 function card(title,entries,pick){
  if(!entries.length)return '';
  const t=TINT[tint++%TINT.length];
  return '<div class="ccard" style="--t:'+t+'"><h5>'+esc(title)+'</h5>'
   +entries.map(([k,n])=>'<div class="cl" tabindex="0" role="button" data-p="'+esc(pick)
     +'" data-v="'+esc(k)+'"><span class="cn">'+esc(k)+'</span><span class="cv">'
     +n.toLocaleString()+'</span></div>').join('')+'</div>';
 }
 function muted(title,lines,note){
  return '<div class="ccard mute"><h5>'+esc(title)+'</h5>'
   +lines.map(l=>'<div class="cl"><span class="cn">'+esc(l[0])+'</span><span class="cv">'
     +esc(l[1])+'</span></div>').join('')
   +'<div class="d" style="margin:7px 0 0;font-size:11px">'+esc(note)+'</div></div>';
 }

 function grid(){
  const rows=pool(), sc=SCOPES.find(x=>x.k===scope);
  tint=0;
  const stand=STATUS.cats.filter(c=>rows.some(r=>r._k===c.k))
    .map(c=>[c.n,rows.filter(r=>r._k===c.k).length]);
  const dqCounts=Object.keys(DQLAB).map(k=>[DQLAB[k],
    rows.filter(r=>(dqBy[r.empno]||[]).some(x=>x.defect===k)).length]).filter(x=>x[1]);
  const acc=[
   ['Used the HR system this year',rows.filter(r=>r.last_login&&r.last_login>=AYS).length],
   ['Last used it before this year',rows.filter(r=>r.last_login&&r.last_login<AYS).length],
   ['No system login recorded',rows.filter(r=>!r.last_login).length]
  ].filter(x=>x[1]);

  cards.innerHTML='<div class="card"><div class="dhead"><div>'
   +'<h4>Employee breakdown — '+esc(sc.n)+', '+rows.length.toLocaleString()+' record'
   +(rows.length===1?'':'s')+'</h4>'
   +'<div class="d" style="margin:2px 0 0">'+esc(sc.s)
   +'. Click any number to list the people behind it.</div></div></div>'
   +'<div class="ctl" id="ov-scope"></div>'
   +'<div class="cgrid">'
   +card('Employee details',[
      ['Active',rows.filter(r=>r.status==='A').length],
      ['Ex-employee',rows.filter(r=>r.svc==='L').length],
      ['Female',rows.filter(r=>r.sex==='F').length],
      ['Male',rows.filter(r=>r.sex==='M').length],
      ['Birthday today',rows.filter(r=>r.birthday_today).length],
      ['Under probation',0]
    ].filter(x=>x[1]||x[0]==='Under probation'||x[0]==='Birthday today'),'hrms')
   +card('Staff type',group(rows,r=>r.staff_type_full||'Not recorded'),'stype')
   +card('Employee Emirates ID',docCard(rows,'eid_no','eid_state'),'eid')
   +card('Employee passport',docCard(rows,'pp_no','pp_state'),'pp')
   +card('Employee visa',docCard(rows,'visa_no','visa_state'),'visa')
   +card('Employee labour contract',docCard(rows,'lc_no','lc_state'),'lc')
   +card('Contract type',docCard(rows,'ag_no','ag_state'),'ag')
   +card('Nationality',group(rows,r=>r.nat||'Not recorded').slice(0,10),'nat')
   +card('Standing (attendance-based)',stand,'standing')
   +card('Gender',group(rows,r=>r.gender==='F'?'Female':r.gender==='M'?'Male':'Not recorded'),'gender')
   +card('Years of service',group(rows,r=>band(r.years)),'band')
   +card('Department',group(rows,r=>r.dept||'Not recorded'),'dept')
   +card('HR system use',acc,'access')
   +card('Record quality',dqCounts,'dq')
   +muted('Not currently recorded',
     [['Employee documents','3 of 814'],['Labour contracts','3 of 814'],
      ['Teacher approval (ADEC)','12 of 814'],['Occupational health cards','12 of 814']],
     'Emirates ID, passport, visa and contract cards would be almost entirely empty. The rows exist in the database but were never filled in, so this is a data-entry gap rather than anything about these staff.')
   +'</div>'
   +'<div class="scope">Mobile number, email address and date of birth are not carried per employee '
   +'in this page either, so they cannot appear in the list below. Everything else the HRMS screen '
   +'shows is here.</div></div>';

  const s2=document.createElement('select');
  SCOPES.forEach(x=>{const o=document.createElement('option');o.value=x.k;
   o.textContent=x.n+' ('+ALL.filter(x.f).length+')';s2.appendChild(o)});
  s2.value=scope;s2.onchange=()=>{scope=s2.value;sel=null;listHost.innerHTML='';grid()};
  const lb=document.createElement('span');lb.className='cnt';lb.textContent='Showing';
  const sw=document.getElementById('ov-scope');sw.appendChild(lb);sw.appendChild(s2);

  cards.querySelectorAll('.cl[data-p]').forEach(el=>{
   const go=()=>openList(el.dataset.p,el.dataset.v);
   el.onclick=go;
   el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}};
  });
  kpi.querySelectorAll('.kpi.clk').forEach(t=>
   t.classList[t.dataset.scope===scope?'add':'remove']('on'));
 }

 function openList(kind,val){
  const rows=pool().filter(r=>
   kind==='hrms'?(val==='Active'?r.status==='A':val==='Ex-employee'?r.svc==='L'
     :val==='Female'?r.sex==='F':val==='Male'?r.sex==='M'
     :val==='Birthday today'?r.birthday_today:false):
   kind==='stype'?(r.staff_type_full||'Not recorded')===val:
   kind==='nat'?(r.nat||'Not recorded')===val:
   (kind==='eid'||kind==='pp'||kind==='visa'||kind==='lc'||kind==='ag')?(function(){
     const nk={eid:'eid_no',pp:'pp_no',visa:'visa_no',lc:'lc_no',ag:'ag_no'}[kind];
     const sk={eid:'eid_state',pp:'pp_state',visa:'visa_state',lc:'lc_state',ag:'ag_state'}[kind];
     return val==='All'?true:val==='Has a number'?!!r[nk]:r[sk]===val;
   })():
   kind==='standing'?r.standing===val:
   kind==='stafftype'?(r.stafftype||'Not recorded')===val:
   kind==='gender'?(r.gender==='F'?'Female':r.gender==='M'?'Male':'Not recorded')===val:
   kind==='band'?band(r.years)===val:
   kind==='dept'?(r.dept||'Not recorded')===val:
   kind==='access'?(val==='Used the HR system this year'?(r.last_login&&r.last_login>=AYS)
     :val==='Last used it before this year'?(r.last_login&&r.last_login<AYS):!r.last_login):
   kind==='dq'?(dqBy[r.empno]||[]).some(x=>DQLAB[x.defect]===val):false);
  const doc=DOCSET[kind];
  sel={label:val,kind:kind,rows:rows.map((r,i)=>Object.assign({sr:i+1},r))};
  listHost.innerHTML='<div class="card">'
   +'<div class="dhead"><div><h4>'+esc(val)+' — '+sel.rows.length.toLocaleString()+' '
   +(sel.rows.length===1?'person':'people')+'</h4>'
   +'<div class="d" style="margin:2px 0 0">Click anyone to open their record. '
   +'Use Columns to reorder or hide, Export to download what you see.</div></div>'
   +'<button class="x" id="ov-x">✕ Clear selection</button></div>'
   +'<div id="ov-t"></div><div id="ov-d"></div></div>';
  document.getElementById('ov-x').onclick=()=>{sel=null;listHost.innerHTML=''};
  table(document.getElementById('ov-t'),null,{
   tid:'overview-'+kind,title:val,data:sel.rows,limit:1000,sort:'sr',
   ph:'Search these people…',fileTag:()=>val.replace(/[^\w]+/g,'-').toLowerCase(),
   dcols:doc?IDCOLS.concat(doc.cols)
             :['sr','empno','name','joined','nat','mobile','dob','gender','staff_type_full',
               'dept','designation','hr_status','svc_status','eid_state','pp_state','visa_state',
               'lc_state','ag_state','years','last_seen','attend_pct','standing','last_login'],
   labels:Object.assign({sr:'Sr No.',empno:'Emp Code',name:'Name',joined:'Date of join',
     nat:'Nationality',mobile:'Mobile',dob:'Birth date',gender:'Gender',
     staff_type_full:'Staff type',dept:'Department',designation:'Designation',
     hr_status:'HR status',svc_status:'Service status',eid_state:'Emirates ID',
     pp_state:'Passport',visa_state:'Visa',lc_state:'Labour card',ag_state:'Contract',
     years:'Yrs',last_seen:'Last seen',attend_pct:'Attendance %',standing:'Standing',
     last_login:'Last login'},doc?doc.labels:{}),
   empty:'Nobody in this group.',
   pills:{standing:(v,x)=>[STATUS.byKey[x._k].p,v],
     gender:v=>v==='F'?['no','Female']:v==='M'?['no','Male']:null,
     hr_status:v=>v==='Active'?['ok',v]:v?['no',v]:null,
     svc_status:v=>v==='In service'?['ok',v]:v?['no',v]:null,
     eid_state:v=>v==='Valid'?['ok',v]:v==='Expired'?['bad',v]:['no',v],
     pp_state:v=>v==='Valid'?['ok',v]:v==='Expired'?['bad',v]:['no',v],
     visa_state:v=>v==='Valid'?['ok',v]:v==='Expired'?['bad',v]:['no',v],
     lc_state:v=>v==='Valid'?['ok',v]:v==='Expired'?['bad',v]:['no',v],
     ag_state:v=>v==='Valid'?['ok',v]:v==='Expired'?['bad',v]:['no',v],
     attend_pct:v=>v==null?['no','no punches']:(v>=80?['ok',v+'%']:(v>=50?['warn',v+'%']:['bad',v+'%']))},
   onRow:r=>detail(r)});
  listHost.scrollIntoView({behavior:'smooth',block:'nearest'});
 }

 function detail(r){
  const c=STATUS.byKey[r._k], flags=dqBy[r.empno]||[];
  const row=(t,v)=>'<dt>'+esc(t)+'</dt><dd>'+(v==null||v===''?'—':esc(String(v)))+'</dd>';
  document.getElementById('ov-d').innerHTML=
   '<div class="drill"><div class="dhead"><div><h4>'+esc(r.name)+' · '+esc(r.empno)+'</h4>'
   +'<div class="m">'+esc(r.designation||'—')+' · '+esc(r.dept||'—')+'</div></div>'
   +'<span class="pill '+c.p+'">'+esc(c.n)+'</span></div>'
   +'<dl class="dl">'
   +row('Staff type',r.stafftype)+row('Gender',r.gender==='F'?'Female':r.gender==='M'?'Male':null)
   +row('Date of join',r.joined)+row('Years of service',r.years)
   +row('Last seen on site',r.last_seen)+row('Days present this year',r.days_year)
   +row('Attendance',r.attend_pct==null?null:r.attend_pct+'%')
   +row('Average arrival',r.avg_arrival)+row('Average hours',r.avg_hours)
   +row('Late arrivals',r.late_days)+row('Days with no out punch',r.no_out_days)
   +row('Last system login',r.last_login)
   +'</dl>'
   +'<p style="font-size:12.5px"><b>What this standing means.</b> '+esc(c.d)
   +' <b>Next step:</b> '+esc(c.act)+(c.own!=='—'?' <b>Owner:</b> '+esc(c.own):'')+'</p>'
   +(flags.length
     ?'<p style="font-size:12.5px;margin-top:9px"><b>Record notes.</b></p><ul style="font-size:12.5px;margin:4px 0 0 18px">'
       +flags.map(f=>'<li>'+esc(DQLAB[f.defect]||f.defect)+' — '+esc(f.detail||'')+'</li>').join('')+'</ul>'
     :'<p style="font-size:12.5px;margin-top:9px">No record-quality notes against this person.</p>');
  document.getElementById('ov-d').scrollIntoView({behavior:'smooth',block:'nearest'});
 }

 /* the two employee tiles switch which population the cards describe */
 kpi.querySelectorAll('.kpi.clk').forEach(t=>{
  const go=()=>{scope=t.dataset.scope;sel=null;listHost.innerHTML='';grid();
   cards.scrollIntoView({behavior:'smooth',block:'nearest'})};
  t.onclick=go;
  t.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}};
 });
 grid();
})();

bars(document.getElementById('c-deptbar'),'dept','dept','active',{top:12});
line(document.getElementById('c-sess'),'sessions','month_',[{k:'sessions',c:'#2563eb',n:'Sessions'},{k:'users',c:'#039855',n:'Distinct users'}],{ticks:8});
line(document.getElementById('c-punch'),'punch_trend','d',[{k:'punches',c:'#2563eb',n:'Punches'},{k:'people',c:'#dc6803',n:'People'}],{ticks:8,h:250});
line(document.getElementById('c-sess2'),'sessions','month_',[{k:'sessions',c:'#2563eb',n:'Sessions'},{k:'users',c:'#039855',n:'Users'}],{ticks:6});
bars(document.getElementById('c-nat'),'nationality','nationality','n',{top:12});
bars(document.getElementById('c-ten'),'tenure','band','n',{color:'#039855'});
bars(document.getElementById('c-acc'),'access','band','n',{color:'#dc6803'});
bars(document.getElementById('c-dq'),'quality','defect','n',{color:'#d92d20'});
bars(document.getElementById('c-lvsum'),'leave_summary','leave_type','total_entitlement',{color:'#039855'});

table(document.getElementById('t-dept'),'dept',{title:'Headcount by department',labels:{dept:'Department',headcount:'On file',active:'Attending',teaching:'Teaching',support:'Support',admin:'Admin',female:'F',male:'M'},sort:'active',desc:true});
/* ---------- Full employee roster: filters + the single standing column ---- */
(function(){
 const wQ=document.getElementById('w-q'),wSt=document.getElementById('w-stand'),
       wDep=document.getElementById('w-dept'),wT=document.getElementById('w-type'),
       wSex=document.getElementById('w-sex'),wCount=document.getElementById('w-count');
 if(!wQ)return;
 function o(v,t){const e=document.createElement('option');e.value=v;e.textContent=t;return e}

 /* every record carries its standing and, where known, the date last seen */
 const ROWS=D.roster.rows.map(r=>{
  const a=STATUS.att(r.empno);
  return Object.assign({},r,{standing:STATUS.name(r),_k:STATUS.of(r),
    last_seen:a?a.last_seen:null});
 });
 const counts={};ROWS.forEach(r=>{counts[r._k]=(counts[r._k]||0)+1});

 wSt.appendChild(o('all','All standings'));
 STATUS.cats.forEach(c=>{if(counts[c.k])wSt.appendChild(o(c.k,c.n+' ('+counts[c.k]+')'))});
 wDep.appendChild(o('all','All departments'));
 [...new Set(ROWS.map(r=>r.dept).filter(Boolean))].sort().forEach(d=>wDep.appendChild(o(d,d)));
 wT.appendChild(o('all','All staff types'));
 [...new Set(ROWS.map(r=>r.stafftype).filter(Boolean))].sort().forEach(t=>wT.appendChild(o(t,t)));
 wSex.appendChild(o('all','All'));wSex.appendChild(o('F','Female'));wSex.appendChild(o('M','Male'));

 function paint(){
  const q=(wQ.value||'').trim().toLowerCase();
  const rows=ROWS.filter(r=>{
   if(wSt.value!=='all'&&r._k!==wSt.value)return false;
   if(wDep.value!=='all'&&r.dept!==wDep.value)return false;
   if(wT.value!=='all'&&r.stafftype!==wT.value)return false;
   if(wSex.value!=='all'&&r.gender!==wSex.value)return false;
   if(q&&!(String(r.name)+' '+r.empno+' '+(r.designation||'')+' '+(r.dept||'')).toLowerCase().includes(q))return false;
   return true;
  });
  wCount.textContent=rows.length+' of '+ROWS.length+' records'
   +(rows.length!==ROWS.length?' — filtered':'');
  table(document.getElementById('t-roster'),null,{
   tid:'roster',title:'Full employee roster',search:false,sort:'name',limit:1200,
   data:rows,
   dcols:['empno','name','designation','dept','stafftype','gender','joined','years',
          'days_present','last_seen','standing','last_login'],
   labels:{empno:'Emp No',name:'Name',designation:'Designation',dept:'Department',
     stafftype:'Type',gender:'G',joined:'Joined',years:'Yrs',
     days_present:'Days present (recent)',last_seen:'Last seen',
     standing:'Standing',last_login:'Last login'},
   empty:'No records match these filters.',
   pills:{standing:(v,x)=>[STATUS.byKey[x._k].p,v]}});
 }
 [wSt,wDep,wT,wSex].forEach(x=>{x.onchange=paint});
 wQ.oninput=paint;
 document.getElementById('w-reset').onclick=()=>{
  wSt.value='all';wDep.value='all';wT.value='all';wSex.value='all';wQ.value='';paint()};
 paint();

 /* what each standing means, ranked by how soon somebody should look at it */
 document.getElementById('w-key').innerHTML=
  '<div class="scope"><b>What each standing means.</b> Every record falls into exactly one. '
  +'A record needing an update is not the same as a person who is unaccounted for — the first '
  +'three below are worth acting on, the last two are the ordinary state of a long-running file.'
  +'<table style="margin-top:9px"><thead><tr><th>Standing</th><th>Records</th><th>Owner</th>'
  +'<th>What it means</th><th>Next step</th></tr></thead><tbody>'
  +STATUS.cats.filter(c=>counts[c.k]).map(c=>
    '<tr><td><span class="pill '+c.p+'">'+esc(c.n)+'</span></td>'
    +'<td class="num">'+counts[c.k]+'</td><td>'+esc(c.own)+'</td>'
    +'<td style="white-space:normal">'+esc(c.d)+'</td>'
    +'<td style="white-space:normal">'+esc(c.act)+'</td></tr>').join('')
  +'</tbody></table>'
  +'<p style="margin-top:9px">Seen within <b>'+STATUS.gap+' school-open days</b> counts as on site — '
  +'about four school weeks, counted in days the school was open so that half-terms and the summer '
  +'break cannot make regular staff look like leavers. '
  +'Two limits worth knowing: a leaving date is only visible for people who attended, so '
  +'<i>Not on site this year</i> cannot be split into departed and still-employed from this data; '
  +'and nothing in the punch log separates approved long leave, maternity leave or secondment from '
  +'an unexplained absence, so <i>Stopped attending</i> is a prompt to ask rather than a conclusion.</p>'
  +'</div>';
})();
table(document.getElementById('t-top'),'topusers',{title:'Top system users',search:false,sort:'sessions',desc:true,
 labels:{usercode:'User code',name:'Name',designation:'Designation',sessions:'Sessions',last_seen:'Last seen'}});
table(document.getElementById('t-leave'),'leave',{title:'Leave register by year',search:false,labels:{yr:'Year',rows_:'Rows',employees:'Employees',taken:'Days taken',credited:'Days credited'}});
table(document.getElementById('t-cal'),'calendar',{title:'Holiday calendar',search:false,labels:{ay:'Academic year',entries:'Entries',first_:'First',last_:'Last',future_:'Future-dated'}});
table(document.getElementById('t-schema'),'schema_summary',{title:'Schemas',search:false,sort:'populated',desc:true,labels:{schema_:'Schema',populated:'Populated tables',total:'Total tables',rows_:'Rows'}});
table(document.getElementById('t-inv'),'inventory',{title:'Populated tables',ph:'Search for any table or concept…',sort:'rows_',desc:true,labels:{schema_:'Schema',tbl:'Table',rows_:'Rows'}});
table(document.getElementById('t-risk'),'acc_risk',{title:'Account risk',ph:'Search name, department or designation…',
 sort:'risk',desc:true,
 labels:{empno:'Emp No',name:'Employee',designation:'Designation',dept:'Department',user_group:'Account type',
   acct_status:'Account',permissions:'Permissions',last_login:'Last login',days_idle:'Days idle',
   attending:'On site?',hr_record:'HR record',risk:'Risk'},
 pills:{risk:v=>v>=8?['bad','High '+v]:(v>=5?['warn','Med '+v]:['no','Low '+v]),
        acct_status:v=>v==='Enabled'?['warn','Enabled']:['no',v],
        attending:v=>v==='Yes'?['ok','Yes']:['bad','No'],
        hr_record:v=>v==='Says left'?['bad',v]:['no',v],
        permissions:v=>v>=500?['bad',v]:null,
        last_login:v=>v==null?['bad','Never']:null,
        days_idle:v=>v==null?['bad','—']:null}});
table(document.getElementById('t-grp'),'acc_group',{title:'Accounts by group',search:false,sort:'accounts',desc:true,
 labels:{grp:'Account type',accounts:'Accounts',enabled:'Enabled',active_30d:'Used in last 30 days'}});

/* ---------- LEAVE ---------- */
table(document.getElementById('t-lvsum'),'leave_summary',{title:'Entitlement by leave type',search:false,sort:'employees',desc:true,
 labels:{leave_type:'Leave type',employees:'Employees',total_entitlement:'Total days',avg_per_head:'Avg per head'}});
table(document.getElementById('t-lvemp'),'leave_emp',{title:'Leave balance by employee',ph:'Search employee name or designation…',sort:'name',
 labels:{empno:'Emp No',name:'Employee',designation:'Designation',stafftype:'Type',yr:'Leave year',
   leave_type:'Leave type',entitlement:'Entitlement',taken:'Days taken',balance:'Balance',last_updated:'Updated'},
 pills:{taken:v=>v>0?['warn',v+' days']:['no','none recorded']}});

/* ---------- ATTENDANCE DRILL-DOWN ---------- */
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function ymLabel(ym){const p=ym.split('-');return MON[+p[1]-1]+' '+p[0].slice(2)}
const byEmp={};D.att_month.rows.forEach(r=>{(byEmp[r.empno]=byEmp[r.empno]||[]).push(r)});
const byDept={};D.att_dept_month.rows.forEach(r=>{(byDept[r.dept]=byDept[r.dept]||[]).push(r)});

line(document.getElementById('c-hour'),'att_hour','hr',[{k:'arrivals',c:'#039855',n:'Arrivals (in)'},{k:'departures',c:'#dc6803',n:'Departures (out)'}],{ticks:12,h:220});

/* ======================================================================
   Attendance analysis: everything above recomputed for a chosen period.

   The tab's own tables (att_kpi, att_dow, att_dept2, att_emp) are totals for
   the whole year and cannot be re-sliced, so anything that answers to the
   date range is rebuilt from att_day — one row per person per day — in a
   single pass over its 28,416 rows.

   Population. att_day covers the 211 people whose badge matches an employee
   record. The tab's published headline figures counted every badge holder,
   including the 95 badges with no employee record, which is why four of the
   six tiles now read lower: staff seen 238 -> 211, average arrival 07:08 ->
   07:06, late arrivals 1,931 -> 1,587, days with no out punch 3,888 -> 3,496.
   Matched employees is the population used here, so the tiles, the day-of-week
   chart and the per-person table below all count the same people. The note
   under the tiles says so on the page.

   Definitions verified against the published per-employee figures: days are
   restricted to school-open days; a late arrival is a first punch strictly
   after 08:00; hours exclude days with no out punch; and the average arrival
   time truncates to the minute rather than rounding. On the full-year range
   every column of the table below reproduces its published value exactly
   except average hours, which matches for 194 of 211 and is never more than
   0.1 away for the rest — att_day stores each day's hours already rounded to one decimal,
   so averaging them cannot always land on the same figure as averaging the
   underlying minutes.
   ====================================================================== */
(function(){
 const aQk=document.getElementById('a-quick');if(!aQk)return;
 const aFrom=document.getElementById('a-from'),aTo=document.getElementById('a-to'),
       aDep=document.getElementById('a-dept'),aT=document.getElementById('a-type'),
       aScope=document.getElementById('a-scope'),aKpi=document.getElementById('a-kpi'),
       aeQ=document.getElementById('ae-q'),aeBand=document.getElementById('ae-band'),
       aeCount=document.getElementById('ae-count');

 const OPEN=D.open_days.rows.map(r=>r.d).sort();
 const OPENI={};OPEN.forEach((d,i)=>{OPENI[d]=i});
 const YF=OPEN[0], YT=OPEN[OPEN.length-1];
 const AMON=[...new Set(OPEN.map(d=>d.slice(0,7)))].sort();
 const LATE=8*60, DOWN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
 const AEMP={};D.att_emp.rows.forEach(r=>{AEMP[r.empno]=r});
 const ADEPTS=[...new Set(D.att_emp.rows.map(r=>r.dept).filter(Boolean))].sort();
 const ATYPES=[...new Set(D.att_emp.rows.map(r=>r.stafftype).filter(Boolean))].sort();
 const PT={};D.punch_trend.rows.forEach(r=>{PT[r.d]=r});
 function amins(t){const p=t.split(':');return (+p[0])*60+(+p[1])}
 /* truncate, not round — that is what reproduces the published averages */
 function ahhmm(m){const v=Math.floor(m),h=Math.floor(v/60),n=v%60;
  return (h<10?'0':'')+h+':'+(n<10?'0':'')+n}
 function aopt(v,t){const o=document.createElement('option');o.value=v;o.textContent=t;return o}

 aQk.appendChild(aopt('all','Whole academic year'));
 AMON.forEach(m=>aQk.appendChild(aopt(m,MON[+m.slice(5,7)-1]+' '+m.slice(2,4))));
 aQk.appendChild(aopt('custom','Custom range…'));
 aDep.appendChild(aopt('all','All departments'));ADEPTS.forEach(d=>aDep.appendChild(aopt(d,d)));
 aT.appendChild(aopt('all','All staff types'));ATYPES.forEach(t=>aT.appendChild(aopt(t,t)));
 [['all','All'],['90','90% and above'],['75','75–89%'],['50','50–74%'],['lo','Below 50%']]
   .forEach(b=>aeBand.appendChild(aopt(b[0],b[1])));
 [aFrom,aTo].forEach(x=>{x.min=YF;x.max=YT});

 function aQuick(){
  const v=aQk.value;if(v==='custom')return;
  if(v==='all'){aFrom.value=YF;aTo.value=YT;return}
  const ds=OPEN.filter(d=>d.slice(0,7)===v);
  aFrom.value=ds[0]||(v+'-01');aTo.value=ds[ds.length-1]||(v+'-28');
 }
 function arange(){let a=aFrom.value||YF,b=aTo.value||YT;
  if(a>b){const t=a;a=b;b=t}return [a<YF?YF:a,b>YT?YT:b]}

 /* one pass over att_day builds every figure this tab needs */
 function build(){
  const rg=arange();
  const days=OPEN.filter(d=>d>=rg[0]&&d<=rg[1]);
  const dset=new Set(days), dpos={};days.forEach((d,i)=>{dpos[d]=i});
  const per={}, dowOn={}, dowSum={}, byDate={};
  let arrS=0,arrN=0,hrS=0,hrN=0,late=0,noOut=0,pdays=0;
  days.forEach(d=>{const w=new Date(d+'T00:00:00').getDay();dowOn[w]=(dowOn[w]||0)+1});
  D.att_day.rows.forEach(r=>{
   if(!dset.has(r.d))return;
   const m=AEMP[r.e];if(!m)return;
   if(aDep.value!=='all'&&m.dept!==aDep.value)return;
   if(aT.value!=='all'&&m.stafftype!==aT.value)return;
   pdays++;
   let p=per[r.e];if(!p)p=per[r.e]={d:0,ar:0,an:0,hr:0,hn:0,lt:0,no:0,pu:0,last:null,mo:{}};
   p.d++;p.pu+=r.n||0;if(!p.last||r.d>p.last)p.last=r.d;
   const ym=r.d.slice(0,7);const mm=p.mo[ym]||(p.mo[ym]={days:0,punches:0});
   mm.days++;mm.punches+=r.n||0;
   if(r.i){const v=amins(r.i);arrS+=v;arrN++;p.ar+=v;p.an++;if(v>LATE){late++;p.lt++}}
   if(r.o==null){noOut++;p.no++}
   if(r.h!=null){hrS+=r.h;hrN++;p.hr+=r.h;p.hn++}
   const w=new Date(r.d+'T00:00:00').getDay();dowSum[w]=(dowSum[w]||0)+1;
   byDate[r.d]=(byDate[r.d]||0)+1;
  });
  const rows=Object.keys(per).map(e=>{const p=per[e],m=AEMP[e];
   return {empno:e,name:m.name,dept:m.dept,designation:m.designation,stafftype:m.stafftype,
    days_present:p.d,open_days:days.length,
    attend_pct:days.length?Math.round(p.d/days.length*1000)/10:null,
    avg_arrival:p.an?ahhmm(p.ar/p.an):null,
    avg_hours:p.hn?Math.round(p.hr/p.hn*10)/10:null,
    no_out_days:p.no,late_days:p.lt,punches:p.pu,last_seen:p.last,
    /* calendar days, matching the published figure and the neighbouring
       "Staff absent from site" card. The old column header said "Open days
       since" while the number was always calendar days; the header is what
       was wrong, so it is the header that changes. */
    days_since:p.last!=null&&days.length
      ?Math.round((new Date(days[days.length-1]+'T00:00:00')-new Date(p.last+'T00:00:00'))/864e5):null,
    _mo:p.mo};});
  const dow=DOWN.map((n,w)=>({dow:n,avg_staff:dowOn[w]?Math.round((dowSum[w]||0)/dowOn[w]*10)/10:0}))
    .filter(x=>dowOn[DOWN.indexOf(x.dow)]);
  const trend=days.map(d=>PT[d]).filter(Boolean);
  return {rg:rg,days:days,rows:rows,dow:dow,trend:trend,
    seen:Object.keys(per).length,pdays:pdays,
    avgArr:arrN?ahhmm(arrS/arrN):null,
    avgHrs:hrN?Math.round(hrS/hrN*10)/10:null,late:late,noOut:noOut};
 }

 function render(){
  const b=build(), n=b.days.length;
  const tile=(cls,v,l,s)=>'<div class="kpi '+cls+'"><div class="n">'+v+'</div>'
    +'<div class="l">'+esc(l)+'</div><div class="s">'+esc(s)+'</div></div>';
  aKpi.innerHTML=
   tile('b',n.toLocaleString(),'School open days','in the selected period')
  +tile('g',b.seen.toLocaleString(),'Staff seen on site','distinct people with a punch')
  +tile('b',b.avgArr||'—','Average arrival time','first punch of the day')
  +tile('g',b.avgHrs==null?'—':b.avgHrs,'Average hours on site','days with no out punch excluded')
  +tile('a',b.late.toLocaleString(),'Late arrivals','first punch after 08:00')
  +tile('a',b.noOut.toLocaleString(),'Days with no out punch','out time unknown, excluded from hours');

  const whole=b.rg[0]===YF&&b.rg[1]===YT&&aDep.value==='all'&&aT.value==='all';
  aScope.innerHTML='Showing <b>'+b.seen+'</b> staff over <b>'+esc(b.rg[0])+'</b> to <b>'+esc(b.rg[1])
   +'</b> — <b>'+n+'</b> school open day'+(n===1?'':'s')+', <b>'+b.pdays.toLocaleString()
   +'</b> staff-days on site.'
   +' These figures count the <b>211 people whose badge matches an employee record</b>. '
   +'The badge system also holds 95 badges with no matching record; they are excluded here so that '
   +'the tiles, the day-of-week chart and the table below all describe the same group.'
   +(whole?' Across the whole year that reads 211 staff rather than the 238 badge holders this tab '
      +'reported before, with late arrivals 1,587 rather than 1,931 and days with no out punch 3,496 '
      +'rather than 3,888 — same punches, narrower population.':'');

  bars(document.getElementById('c-dow'),b.dow,'dow','avg_staff',{color:'#2563eb'});
  document.getElementById('c-dow-sub').textContent=
   'Average staff on site per open day, '+esc(b.rg[0])+' to '+esc(b.rg[1])+'.';
  line(document.getElementById('c-punch2'),b.trend,'d',
   [{k:'punches',c:'#2563eb',n:'Punches'},{k:'people',c:'#dc6803',n:'People'}],{ticks:10,h:260});
  document.getElementById('c-punch2-sub').textContent=
   'Punches and distinct people on site, '+esc(b.rg[0])+' to '+esc(b.rg[1])
   +'. This chart keeps every badge holder, so it runs slightly above the tiles.';

  document.getElementById('ae-sub').textContent=
   'Attendance % is days present out of the '+n+' school open day'+(n===1?'':'s')
   +' in the selected period. Average arrival is the mean first-punch time. '
   +'Late days count first punches after 08:00. '
   +'Average hours is rebuilt from each day\'s stored hours, which are themselves held to one decimal, '
   +'so for 17 of the 211 staff it lands 0.1 away from the figure published before. Every other column '
   +'reproduces its published value exactly when the range covers the whole year.';

  const q=(aeQ.value||'').trim().toLowerCase(), bandv=aeBand.value;
  const shown=b.rows.filter(x=>{
   const p=x.attend_pct;
   if(bandv==='90'&&!(p>=90))return false;
   if(bandv==='75'&&!(p>=75&&p<90))return false;
   if(bandv==='50'&&!(p>=50&&p<75))return false;
   if(bandv==='lo'&&!(p!=null&&p<50))return false;
   if(q&&!(String(x.name)+' '+x.empno+' '+(x.designation||'')+' '+(x.dept||'')).toLowerCase().includes(q))return false;
   return true;
  });
  aeCount.textContent=shown.length+' of '+b.rows.length+' staff'
   +(shown.length!==b.rows.length?' — filtered':'');
  document.getElementById('d-emp').innerHTML='';
  table(document.getElementById('t-attemp'),null,{
   tid:'att_emp',title:'Employee attendance and punctuality',search:false,
   fileTag:()=>b.rg[0]+'_to_'+b.rg[1],
   data:shown,sort:'attend_pct',desc:true,limit:1000,
   dcols:['empno','name','dept','designation','stafftype','days_present','open_days','attend_pct',
          'avg_arrival','avg_hours','no_out_days','late_days','punches','last_seen','days_since'],
   labels:{empno:'Emp No',name:'Employee',dept:'Department',designation:'Designation',stafftype:'Type',
     days_present:'Days present',open_days:'Open days',attend_pct:'Attendance %',avg_arrival:'Avg arrival',
     avg_hours:'Avg hours',no_out_days:'No out punch',late_days:'Late arrivals',punches:'Punches',
     last_seen:'Last seen',days_since:'Days since last seen'},
   empty:'Nobody was on site during this period.',
   pills:{attend_pct:v=>v==null?['no','—']:(v>=80?['ok',v+'%']:(v>=60?['warn',v+'%']:['bad',v+'%'])),
     late_days:v=>v>=5?['bad',v]:(v>0?['warn',v]:['no','0']),
     days_since:v=>v==null?null:(v>=14?['bad',v]:(v>=7?['warn',v]:['ok',v]))},
   onRow:r=>{
    const m=Object.keys(r._mo).sort().map(k=>({ym:k,days_present:r._mo[k].days,punches:r._mo[k].punches}));
    const el=document.getElementById('d-emp');
    if(!m.length){el.innerHTML='<div class="drill"><h4>'+esc(r.name)+'</h4>'
      +'<div class="m">No days on site in this period.</div></div>';return}
    const mx=Math.max(...m.map(x=>x.days_present));
    const tot=m.reduce((a,x)=>a+x.days_present,0);
    el.innerHTML='<div class="drill"><h4>'+esc(r.name)+' · '+esc(r.empno)+'</h4>'
     +'<div class="m">'+esc(r.designation)+' · '+esc(r.dept)+' · '+tot+' days present across '+m.length
     +' month'+(m.length===1?'':'s')+' · attendance '+r.attend_pct+'% · avg arrival '+esc(r.avg_arrival)
     +' · last seen '+esc(r.last_seen)+' · period '+esc(b.rg[0])+' to '+esc(b.rg[1])+'</div><div class="mgrid">'
     +m.map(x=>{const i=Math.round(x.days_present/mx*100);
       return '<div class="mcell" style="border-color:'+(i>60?'#2563eb':'var(--line)')+'">'
        +'<div class="mm">'+ymLabel(x.ym)+'</div><div class="md" style="color:'+(i>60?'#2563eb':'inherit')+'">'
        +x.days_present+'</div><div class="mp">days</div></div>'}).join('')
     +'</div><div id="dm-t"></div></div>';
    table(document.getElementById('dm-t'),null,{tid:'att-month',title:'Monthly detail',
      data:m.slice().reverse(),dcols:['ym','days_present','punches'],search:false,
      labels:{ym:'Month',days_present:'Days present',punches:'Punches'}});
   }});
 }

 aQk.onchange=()=>{aQuick();render()};
 [aFrom,aTo].forEach(x=>{x.onchange=()=>{aQk.value='custom';render()}});
 aDep.onchange=render;aT.onchange=render;
 aeQ.oninput=render;aeBand.onchange=render;
 document.getElementById('ae-reset').onclick=()=>{aeQ.value='';aeBand.value='all';render()};
 document.getElementById('a-reset').onclick=()=>{
  aQk.value='all';aQuick();aDep.value='all';aT.value='all';aeQ.value='';aeBand.value='all';render()};
 aQk.value='all';aQuick();render();
})();
table(document.getElementById('t-absent'),'att_absent',{title:'Not seen recently',search:false,sort:'days_absent',desc:true,
 labels:{empno:'Emp No',name:'Employee',dept:'Department',designation:'Designation',
   last_seen:'Last seen on site',days_absent:'Open days absent',hr_status:'HR record'},
 empty:'No staff have been absent for 14 or more open days — everyone on the badge system was seen recently.',
 pills:{days_absent:v=>['bad',v+' days'],hr_status:v=>v==='HR says left'?['warn',v]:['no',v]}});
table(document.getElementById('t-polsum'),'policy_summary',{title:'Weekend policy by staff type',search:false,sort:'staff',desc:true,
 labels:{stafftype:'Staff type',expected_pattern:'Expected pattern',staff:'Staff',
   follows_policy:'Follows policy',exceptions:'Exceptions',
   worked_a_sunday:'Worked a Sunday',worked_a_saturday:'Worked a Saturday'},
 pills:{expected_pattern:v=>v==='Mon-Fri + Sunday'?['warn',v]:['no',v],
        exceptions:v=>v>0?['bad',v]:['ok','0'],
        follows_policy:v=>v>0?['ok',v]:['bad','0']}});
table(document.getElementById('t-polemp'),'policy_emp',{title:'Working pattern by employee',ph:'Search employee, department or designation…',
 sort:'sunday_pct',desc:true,
 labels:{empno:'Emp No',name:'Employee',attend_pct:'Attendance %',dept:'Department',designation:'Designation',stafftype:'Type',
   expected_pattern:'Expected',weekdays_worked:'Weekdays',weekdays_open:'of',
   sundays_worked:'Sundays',sundays_open:'of',sunday_pct:'Sunday %',
   saturdays_worked:'Saturdays',saturdays_open:'of',
   sunday_verdict:'Sunday verdict',saturday_verdict:'Saturday verdict'},
 pills:{expected_pattern:v=>v==='Mon-Fri + Sunday'?['warn',v]:['no',v],
        sunday_verdict:v=>v==='Follows policy'?['ok',v]:['bad',v],
        saturday_verdict:v=>v==='Follows policy'?['ok',v]:['warn',v],
        attend_pct:v=>v>=80?['ok',v+'%']:(v>=60?['warn',v+'%']:['bad',v+'%']),
        sunday_pct:v=>v>=60?['ok',v+'%']:(v>=20?['warn',v+'%']:['no',(v||0)+'%'])}});
table(document.getElementById('t-sunsum'),'sunday_summary',{title:'Sunday working patterns',search:false,sort:'staff',desc:true,
 labels:{pattern:'Sunday pattern',staff:'Staff',teaching:'Teaching',support:'Support',admin_:'Admin'},
 pills:{pattern:v=>v==='Sunday is a working day'?['ok',v]:(v==='Sunday off'?['no',v]:['warn',v])}});
table(document.getElementById('t-empdow'),'emp_dow',{title:'Weekend working by employee',ph:'Search employee, department or designation…',
 sort:'sunday_pct',desc:true,
 labels:{empno:'Emp No',name:'Employee',attend_pct:'Attendance %',dept:'Department',designation:'Designation',stafftype:'Type',
   sundays_worked:'Sundays worked',sundays_open:'Sundays open',sunday_pct:'Sunday %',
   saturdays_worked:'Saturdays worked',saturdays_open:'Saturdays open',saturday_pct:'Saturday %',
   weekdays_worked:'Weekdays worked',weekdays_open:'Weekdays open',weekday_pct:'Weekday %',
   sunday_pattern:'Sunday pattern',saturday_pattern:'Saturday pattern'},
 pills:{sunday_pattern:v=>v==='Sunday is a working day'?['ok',v]:(v==='Sunday off'?['no',v]:['warn',v]),
        saturday_pattern:v=>v==='Saturday is a working day'?['ok',v]:(v==='Saturday off'?['no',v]:['warn',v]),
        attend_pct:v=>v>=80?['ok',v+'%']:(v>=60?['warn',v+'%']:['bad',v+'%']),
        sunday_pct:v=>v>=60?['ok',v+'%']:(v>=20?['warn',v+'%']:(v>0?['no',v+'%']:['no','0%']))}});
table(document.getElementById('t-shift'),'shift_config',{title:'Shift templates',search:false,
 labels:{template:'Template',shift_desc:'Shift',sun:'Sun',mon:'Mon',tue:'Tue',wed:'Wed',thu:'Thu',fri:'Fri',sat:'Sat'},
 pills:{sun:v=>v==='Yes'?['bad','Working']:null,fri:v=>v==='Yes'?['ok','Working']:null}});
table(document.getElementById('t-attdept2'),'att_dept2',{title:'Attendance by department',ph:'Search department…',sort:'staff',desc:true,
 labels:{dept:'Department',staff:'Staff',attendances:'Attendances',attend_pct:'Attendance %',
   avg_arrival:'Avg arrival',avg_hours:'Avg hours',no_out_days:'No out punch',late_days:'Late arrivals'},
 pills:{attend_pct:v=>v>=80?['ok',v+'%']:(v>=60?['warn',v+'%']:['bad',v+'%'])}});

table(document.getElementById('t-attdept'),'att_dept_month',{title:'Department by month',ph:'Search department…',sort:'ym',desc:true,
 labels:{dept:'Department',ym:'Month',staff:'Staff',total_days:'Total days',avg_days:'Avg days/person'},
 onRow:r=>{
  const m=(byDept[r.dept]||[]).slice().sort((a,b)=>a.ym.localeCompare(b.ym));
  const el=document.getElementById('d-dept');
  el.innerHTML='<div class="drill"><h4>'+esc(r.dept)+'</h4><div class="m">Average days present per person, last 12 months</div><div id="dd-c"></div></div>';
  D.__tmp={cols:['ym','avg_days','staff'],rows:m};
  line(document.getElementById('dd-c'),'__tmp','ym',[{k:'avg_days',c:'#2563eb',n:'Avg days present'},{k:'staff',c:'#dc6803',n:'Staff'}],{ticks:12,h:200});
 }});

/* ---------- EMPLOYEE ATTENDANCE CALENDAR ---------- */
const DAY={};D.att_day.rows.forEach(r=>{(DAY[r.e]=DAY[r.e]||{})[r.d]={i:r.i,o:r.o,h:r.h,n:r.n}});
const OPEN=new Set(D.open_days.rows.map(r=>r.d));
const HOL={};D.cal_ranges.rows.forEach(r=>{
  const s0=new Date(r.f+'T00:00:00'),e0=new Date(r.t+'T00:00:00');
  for(let dt=new Date(s0);dt<=e0;dt.setDate(dt.getDate()+1)){
    const key=dt.toISOString().slice(0,10); if(!HOL[key])HOL[key]=r.descr;}});
const OPENARR=D.open_days.rows.map(r=>r.d).sort();
const CALFROM=OPENARR[0], CALTO=OPENARR[OPENARR.length-1];
const DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function pad(n){return (n<10?'0':'')+n}
function drawCal(emp){
 const days=DAY[emp.empno]||{};
 const el=document.getElementById('d-cal');
 const from=new Date(CALFROM+'T00:00:00'), to=new Date(CALTO+'T00:00:00');
 // Days before someone joined are not absences. Bound the window by their
 // joining date so a new starter is not penalised for the months before.
 const joined = emp.joined || CALFROM;
 let preJoin=0;
 let present=0,absent=0,inMin=0,outMin=0,hrs=0,n=0,nH=0,nIn=0,single=0;
 const months=[];
 let cur=new Date(from.getFullYear(),from.getMonth(),1);
 while(cur<=to){months.push(new Date(cur));cur.setMonth(cur.getMonth()+1)}
 let html='';
 months.forEach(m=>{
  const y=m.getFullYear(),mo=m.getMonth();
  const first=new Date(y,mo,1), last=new Date(y,mo+1,0);
  let cells='';
  for(let i=0;i<first.getDay();i++)cells+='<div class="cd off"></div>';
  for(let dd=1;dd<=last.getDate();dd++){
   const key=y+'-'+pad(mo+1)+'-'+pad(dd);
   const rec=days[key], isOpen=OPEN.has(key), hol=HOL[key];
   let cls='off',body='';
   if(rec){cls='p';present++;
     const ip=rec.i.split(':'); inMin+=(+ip[0])*60+(+ip[1]); nIn++;
     // rec.o is the LAST punch flagged OUT. It is null when the day has no out
     // punch at all, in which case the leaving time is unknown, not zero.
     if(rec.o){
       body='<div class="tm">'+rec.i+'<br>'+rec.o+'</div>'
            +(rec.h!=null?'<div class="hr">'+rec.h+'h</div>':'');
       const op=rec.o.split(':'); outMin+=(+op[0])*60+(+op[1]); n++;
       if(rec.h!=null){hrs+=rec.h; nH++;}
     } else {
       body='<div class="tm">'+rec.i+'<br><span style="opacity:.6">no out</span></div>';
       single++;
     }}
   else if(isOpen && key>=joined){cls='a';absent++;body='<div class="tm">Absent</div>';}
   else if(isOpen){preJoin++;body='<div class="tm" style="opacity:.55">before joining</div>';}
   else if(hol){cls='h';body='<div class="tm">'+esc(hol.slice(0,22))+'</div>';}
   else {body='<div class="tm">&nbsp;</div>';}
   cells+='<div class="cd '+cls+'" title="'+key+(hol?' — '+esc(hol):'')+'"><div class="dn">'+dd+'</div>'+body+'</div>';
  }
  html+='<div class="mo"><h5>'+m.toLocaleString('en',{month:'long'})+' '+y+'</h5><div class="cal">'
   +DOW.map(d=>'<div class="dh">'+d+'</div>').join('')+cells+'</div></div>';
 });
 const preJoinNote = preJoin? preJoin+' school day(s) fell before their joining date and are excluded':'';
 const pct=present+absent?Math.round(present/(present+absent)*1000)/10:0;
 const avgIn=nIn?pad(Math.floor(inMin/nIn/60))+':'+pad(Math.round(inMin/nIn%60)):'—';
 const avgOut=n?pad(Math.floor(outMin/n/60))+':'+pad(Math.round(outMin/n%60)):'—';
 el.innerHTML='<div class="drill"><h4>'+esc(emp.name)+' · '+esc(emp.empno)+'</h4>'
  +'<div class="m">'+esc(emp.designation)+' · '+esc(emp.dept)+' · joined '+esc(emp.joined||'?')
  +' · calendar '+CALFROM+' to '+CALTO
  +(preJoinNote?' · '+preJoinNote:'')+'</div>'
  +'<div class="sum">'
  +'<div><div class="v" style="color:#039855">'+present+'</div><div class="t">Days present</div></div>'
  +'<div><div class="v" style="color:#d92d20">'+absent+'</div><div class="t">Days absent</div></div>'
  +'<div><div class="v">'+pct+'%</div><div class="t">Attendance</div></div>'
  +'<div><div class="v">'+avgIn+'</div><div class="t">Avg in</div></div>'
  +'<div><div class="v">'+avgOut+'</div><div class="t">Avg out</div></div>'
  +'<div><div class="v">'+(nH?Math.round(hrs/nH*10)/10:'—')+'</div><div class="t">Avg hours</div></div>'
  +'<div><div class="v" style="color:#dc6803">'+single+'</div><div class="t">Days with no out punch</div></div>'
  +'</div><p class="hint">Arrival is the first punch flagged IN; departure is the last punch flagged OUT. '
  +'Average out and average hours exclude the '+single
  +' day(s) with no out punch at all, where the leaving time is unknown rather than zero.</p>'
  +'<div class="calleg">'
  +'<span><i style="background:#ecfdf3;border-color:#a6f4c5"></i>Present (in / out / hours)</span>'
  +'<span><i style="background:#fef3f2;border-color:#fecdca"></i>Absent (school was open)</span>'
  +'<span><i style="background:#eff8ff;border-color:#b2ddff"></i>Holiday / calendar exception</span>'
  +'<span><i style="background:transparent"></i>Weekend or school closed</span>'+'<span><i style="background:#ecfdf3;border-color:#a6f4c5"></i>"no out" = single punch that day</span></div>'
  +html+'</div>';
}
table(document.getElementById('t-calemp'),'cal_emp',{title:'Attendance calendar — staff',ph:'Search employee, department or designation…',sort:'name',
 labels:{empno:'Emp No',name:'Employee',dept:'Department',designation:'Designation',stafftype:'Type'},
 onRow:drawCal});

/* ---------- DATA QUALITY DRILL-DOWN ---------- */
const DQMAP={'Working daily but HR records them as LEFT':'working_left',
 'Active staff with no bank account':'no_bank','Staff account never logged in':'never_login',
 'Leaving date earlier than joining date':'impossible_dates',
 'Implausible date of birth (age <15 or >75)':'bad_dob','Duplicate employee name on file':'dupe_name'};
table(document.getElementById('t-dq'),'quality',{title:'Integrity defect register',search:false,sort:'n',desc:true,
 labels:{defect:'Defect',n:'Records',impact:'Why it matters'},
 onRow:r=>{
  const el=document.getElementById('d-dq');const key=DQMAP[r.defect];
  if(!key){el.innerHTML='<div class="drill"><h4>'+esc(r.defect)+'</h4>'
    +'<div class="m">'+esc(r.impact)+' — '+fmt(r.n)+' records. '
    +(r.defect.indexOf('Dormant')===0?'See the <b>Access &amp; security</b> tab for the full named list.'
      :'This defect counts rows that cannot be traced back to a named employee.')+'</div></div>';return}
  const rows=D.dq_detail.rows.filter(x=>x.defect===key);
  el.innerHTML='<div class="drill"><h4>'+esc(r.defect)+'</h4><div class="m">'+esc(r.impact)
   +' — '+rows.length+' named records. Search or sort, then export by copy-paste.</div><div id="dq-t"></div></div>';
  table(document.getElementById('dq-t'),null,{title:'Affected employees',data:rows,
   dcols:['empno','name','designation','dept','detail','action'],ph:'Search these records…',
   labels:{empno:'Emp No',name:'Employee',designation:'Designation',dept:'Department',detail:'Finding',action:'What to do'}});
 }});

/* ---------- ATTENDANCE REPORT ----------------------------------------------
   An operational report rather than an analysis: choose a period, read the whole
   school off one sheet, then click a person only if you want their history.

   Everything is derived from DAY (the turnstile punch log, keyed employee->date)
   and OPENARR (the days the school was actually open), both built above. Nothing
   here touches pays_attendance_daily — that pipeline has produced no Present /
   Absent / Late marks since 2021-06-08.

   Absence rules, applied consistently:
     - only days the school was OPEN can count as absent (holidays never do)
     - only days on or after the person's joining date count (a starter is not
       marked absent for the months before they arrived)
     - a day with an IN punch but no OUT punch is PRESENT with an unknown leaving
       time; it is excluded from average-out and average-hours, never read as zero
--------------------------------------------------------------------------- */
(function(){
 const EMPS=D.cal_emp.rows.slice().sort((a,b)=>String(a.name).localeCompare(String(b.name)));
 const MONTHS=[...new Set(OPENARR.map(d=>d.slice(0,7)))].sort();
 const DEPTS=[...new Set(EMPS.map(e=>e.dept).filter(Boolean))].sort();
 const TYPES=[...new Set(EMPS.map(e=>e.stafftype).filter(Boolean))].sort();
 const LATE=8*60;   // first punch after 08:00 is late — same rule as the analysis tab

 /* SCHOOL DAYS versus merely OPEN days -------------------------------------
    open_days lists every date anyone badged in, which is not the same as a day
    the school was teaching. 79 of the 242 include only the ~20-strong support
    and facilities crew: all 32 Sundays (Support work Sundays, teachers do not)
    plus the winter, spring and Eid breaks. Counting those as school days marked
    every one of the 114 teachers absent on every Sunday and right through the
    breaks, which pushed March to a meaningless 9.9%.

    The split in the data is unambiguous, so the threshold is not a judgement
    call: 79 days have 2 or fewer teaching staff on site and 152 have between
    60 and 120. Only 2 days in the whole year sit anywhere in between. A day
    counts as a school day if at least 20% of teaching staff were on site.      */
 const STYPE={};EMPS.forEach(e=>{STYPE[e.empno]=e.stafftype});
 const TEACH_ON={};
 D.att_day.rows.forEach(r=>{if(STYPE[r.e]==='Teaching')TEACH_ON[r.d]=(TEACH_ON[r.d]||0)+1});
 const NTEACH=EMPS.filter(e=>e.stafftype==='Teaching').length;
 const SCHOOL_MIN=Math.max(1,Math.round(NTEACH*0.2));
 const SCHOOLDAY=new Set(OPENARR.filter(d=>(TEACH_ON[d]||0)>=SCHOOL_MIN));

 const fQk=document.getElementById('f-quick'),fFrom=document.getElementById('f-from'),
       fTo=document.getElementById('f-to'),
       fDep=document.getElementById('f-dept'),fT=document.getElementById('f-type'),
       fQ=document.getElementById('f-q'),fScope=document.getElementById('f-scope');
 if(!fQk)return;
 const repTitle=document.getElementById('rep-title'),
       repUnit=document.getElementById('rep-unit');
 /* the By-department card's own filter bar */
 const rdQ=document.getElementById('rd-q'),rdDep=document.getElementById('rd-dept'),
       rdBand=document.getElementById('rd-band'),rdCount=document.getElementById('rd-count');
 /* the second filter bar, over the employee table further down the tab */
 const eQ=document.getElementById('e-q'),eDep=document.getElementById('e-dept'),
       eT=document.getElementById('e-type'),eBand=document.getElementById('e-band'),
       eCount=document.getElementById('e-count'),
       eF=['e-f1','e-f2','e-f3','e-f4'].map(id=>document.getElementById(id));
 const YFROM=OPENARR[0], YTO=OPENARR[OPENARR.length-1];

 function opt(v,t){const o=document.createElement('option');o.value=v;o.textContent=t;return o}
 function mins(t){const p=t.split(':');return (+p[0])*60+(+p[1])}
 function hhmm(m){return pad(Math.floor(m/60))+':'+pad(Math.round(m%60))}
 function dlong(d){const t=new Date(d+'T00:00:00');
   return DOW[t.getDay()]+' '+(+d.slice(8))+' '+MON[t.getMonth()]+' '+d.slice(0,4)}

 fQk.appendChild(opt('all','Whole academic year'));
 MONTHS.forEach(m=>fQk.appendChild(opt(m,ymLabel(m))));
 fQk.appendChild(opt('custom','Custom range…'));
 fDep.appendChild(opt('all','All departments'));DEPTS.forEach(d=>fDep.appendChild(opt(d,d)));
 fT.appendChild(opt('all','All staff types'));TYPES.forEach(t=>fT.appendChild(opt(t,t)));
 rdDep.appendChild(opt('all','All departments'));DEPTS.forEach(d=>rdDep.appendChild(opt(d,d)));
 [['all','All'],['90','90% and above'],['75','75–89%'],['lo','Below 75%']]
   .forEach(b=>rdBand.appendChild(opt(b[0],b[1])));
 eDep.appendChild(opt('all','All departments'));DEPTS.forEach(d=>eDep.appendChild(opt(d,d)));
 eT.appendChild(opt('all','All staff types'));TYPES.forEach(t=>eT.appendChild(opt(t,t)));
 [['all','All'],['100','100%'],['90','90–99%'],['75','75–89%'],['lo','Below 75%']]
   .forEach(b=>eBand.appendChild(opt(b[0],b[1])));
 [fFrom,fTo].forEach(x=>{x.min=YFROM;x.max=YTO});

 /* the quick-range select is only a shortcut — From/To are the real inputs */
 function applyQuick(){
  const v=fQk.value;
  if(v==='custom')return;
  if(v==='all'){fFrom.value=YFROM;fTo.value=YTO;return}
  const days=OPENARR.filter(d=>d.slice(0,7)===v);
  fFrom.value=days[0]||(v+'-01');fTo.value=days[days.length-1]||(v+'-28');
 }
 function range(){
  let a=fFrom.value||YFROM, b=fTo.value||YTO;
  if(a>b){const t=a;a=b;b=t}                       // tolerate reversed dates
  return [a<YFROM?YFROM:a, b>YTO?YTO:b];
 }

 /* whether a date falls in the selected range at all, open day or not. Punch-days
    that fall on days the school was not recorded open still count as present, so
    presence is measured against this, not against the open-day list. */
 function inPeriod(d){const r=range();return d>=r[0]&&d<=r[1]}
 /* every day anyone was on site inside the range */
 function scopeDays(){const r=range();return OPENARR.filter(d=>d>=r[0]&&d<=r[1])}
 /* the subset that were actually teaching days — the denominator for absence.
    Nobody is marked absent on a Sunday or during a break. */
 function absenceDays(){return scopeDays().filter(d=>SCHOOLDAY.has(d))}
 /* calendar days spanned, which is what the HRMS "Total days" column counts and
    the reason it reports 100% for everyone: it includes weekends and breaks. */
 function calDays(){const r=range();
  return Math.round((new Date(r[1]+'T00:00:00')-new Date(r[0]+'T00:00:00'))/864e5)+1}

 /* Active on a date = already joined, OR seen on the turnstile that day. The
    punch clause matters because two staff (E1921, E1919) badge in for months
    before their recorded joining date; without it, present + absent would not
    equal the active headcount. em_left_date is deliberately NOT used to
    exclude anyone — it is corrupt, and 174 people who work daily carry a past
    leaving date. */
 function activeOn(e,d,punched){return punched||!e.joined||e.joined<=d}

 function build(){
  const rg=range(), one=rg[0]===rg[1], theDay=one?rg[0]:null;
  const allDays=scopeDays(), days=absenceDays(),
        q=(fQ.value||'').trim().toLowerCase();
  const isTeach=one?SCHOOLDAY.has(theDay):null;
  const rows=[], dept={}, pool=[];
  let tP=0,tPS=0,tA=0,tL=0,tN=0,tAct=0,tPres=0,tNotJoined=0,tEarly=0;
  EMPS.forEach(e=>{
   if(fDep.value!=='all'&&e.dept!==fDep.value)return;
   if(fT.value!=='all'&&e.stafftype!==fT.value)return;
   if(q&&!(String(e.name)+' '+e.empno+' '+(e.designation||'')+' '+(e.dept||'')).toLowerCase().includes(q))return;
   pool.push(e);
   const rec=DAY[e.empno]||{};
   let onSch=0,offSch=0,absent=0,inMin=0,nIn=0,outMin=0,nOut=0,hrs=0,nH=0,late=0,noOut=0,dIn=null,dOut=null,dH=null;
   // PRESENT: every day this person actually punched inside the period. Never
   // filtered by the open-day list or the joining date — a punch is proof they
   // were on site, whatever the calendar or the HR record says. Split into
   // teaching days and everything else (Sundays, breaks) so the two are never
   // added together against a teaching-day denominator.
   Object.keys(rec).forEach(d=>{
    if(!inPeriod(d))return;
    const r=rec[d];
    if(SCHOOLDAY.has(d))onSch++;else offSch++;
    if(r.i){inMin+=mins(r.i);nIn++;if(mins(r.i)>LATE)late++;if(one)dIn=r.i}
    if(r.o){outMin+=mins(r.o);nOut++;if(one)dOut=r.o}else{noOut++}
    if(r.h!=null){hrs+=r.h;nH++;if(one)dH=r.h}
   });
   // ABSENT: only teaching days, on or after their joining date.
   days.forEach(d=>{if(!rec[d]&&!(e.joined&&d<e.joined))absent++});
   const present=onSch+offSch;
   // single day: everything collapses to headcount — 1 or 0 per person
   const here=one&&present>0, act=one&&activeOn(e,theDay,here);
   if(one){
    if(act){tAct++;if(here)tPres++;if(here&&e.joined&&e.joined>theDay)tEarly++}
    else tNotJoined++;
   }
   if(!present&&!absent)return;                          // joined after this whole period
   tP+=present;tPS+=onSch;tA+=absent;tL+=late;tN+=noOut;
   const d=dept[e.dept||'(none)']||(dept[e.dept||'(none)']={dept:e.dept||'(none)',
     staff:0,present:0,absent:0,other:0,late:0,no_out:0,active:0,hc_present:0,hc_absent:0});
   d.staff++;d.present+=onSch;d.absent+=absent;d.other+=offSch;d.late+=late;d.no_out+=noOut;
   if(one&&act){d.active++;if(here)d.hc_present++;else d.hc_absent++}
   rows.push({empno:e.empno,name:e.name,dept:e.dept,designation:e.designation,stafftype:e.stafftype,
    joined:e.joined,
    status:one?(here?'Present':'Absent'):null,
    present:onSch,absent:absent,other:offSch,open_days:onSch+absent,
    pct:onSch+absent?Math.round(onSch/(onSch+absent)*1000)/10:null,
    abs_pct:onSch+absent?Math.round(absent/(onSch+absent)*1000)/10:null,
    first_in:one?dIn:(nIn?hhmm(inMin/nIn):null),
    last_out:one?dOut:(nOut?hhmm(outMin/nOut):null),
    hours:one?dH:(nH?Math.round(hrs/nH*10)/10:null),
    late:late,no_out:noOut});
  });
  rows.sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  rows.forEach((r,i)=>{r.sr=i+1});          // roster sequence, like the HRMS Sr.No.
  const drows=Object.values(dept).map(d=>Object.assign(d,{
    open_days:one?d.active:d.present+d.absent,
    pct:one?(d.active?Math.round(d.hc_present/d.active*1000)/10:0)
           :(d.present+d.absent?Math.round(d.present/(d.present+d.absent)*1000)/10:0),
    abs_pct:one?(d.active?Math.round(d.hc_absent/d.active*1000)/10:0)
            :(d.present+d.absent?Math.round(d.absent/(d.present+d.absent)*1000)/10:0)}));
  if(one)drows.forEach(d=>{d.present=d.hc_present;d.absent=d.hc_absent;d.staff=d.active});
  return {rows:rows,dept:drows,days:days,allDays:allDays,one:one,theDay:theDay,
          isTeach:isTeach,pool:pool,
          tP:tP,tPS:tPS,tA:tA,tL:tL,tN:tN,
          tAct:tAct,tPres:tPres,tAbs:tAct-tPres,tNotJoined:tNotJoined,tEarly:tEarly};
 }

 let CUR=null, TROWS=[], TILE=null;

 /* ---- filters that narrow the employee table inside the tab's filters ---- */
 function applyTableFilters(rows){
  const q=(eQ.value||'').trim().toLowerCase(), band=eBand.value;
  return rows.filter(x=>{
   if(eDep.value!=='all'&&x.dept!==eDep.value)return false;
   if(eT.value!=='all'&&x.stafftype!==eT.value)return false;
   if(band!=='all'){
    const p=x.pct;
    if(p==null)return false;
    if(band==='100'&&p<100)return false;
    if(band==='90'&&(p<90||p>=100))return false;
    if(band==='75'&&(p<75||p>=90))return false;
    if(band==='lo'&&p>=75)return false;
   }
   if(eF[0].checked&&!(x.absent>0))return false;
   if(eF[1].checked&&!(x.late>0))return false;
   if(eF[2].checked&&!(x.no_out>0))return false;
   if(eF[3].checked&&!(x.other>0))return false;
   if(q&&!(String(x.name)+' '+x.empno+' '+(x.designation||'')+' '+(x.dept||'')).toLowerCase().includes(q))return false;
   return true;
  });
 }

 function render(){
  const r=build();CUR=r;
  const one=r.one, rg=range(), cal=calDays();
  const periodLbl=one?dlong(r.theDay):(dlong(rg[0])+' to '+dlong(rg[1]));
  const skel=r.allDays.length-r.days.length;

  fScope.innerHTML='Showing <b>'+r.rows.length+'</b> employee'+(r.rows.length===1?'':'s')
   +' over <b>'+esc(periodLbl)+'</b>'
   +(fDep.value!=='all'?' · department <b>'+esc(fDep.value)+'</b>':'')
   +(fT.value!=='all'?' · staff type <b>'+esc(fT.value)+'</b>':'')
   +'.<br>That range spans <b>'+cal+'</b> calendar day'+(cal===1?'':'s')
   +', of which <b>'+r.days.length+'</b> '+(r.days.length===1?'is a teaching day':'are teaching days')
   +(skel?' and <b>'+skel+'</b> had staff on site but no teaching (Sundays, breaks)':'')
   +'. '+(cal!==r.days.length
     ?'<b>Total days uses the '+r.days.length+' teaching day'+(r.days.length===1?'':'s')+', not the '
      +cal+' calendar days</b> — counting the calendar span is what makes the HRMS report show 100% '
      +'for everyone. ':'')
   +'Absence is counted only on teaching days on or after each person’s joining date.';

  const tot=one?r.tAct:r.tPS+r.tA;
  const pres=one?r.tPres:r.tPS, abst=one?r.tAbs:r.tA;
  const pct=tot?Math.round(pres/tot*1000)/10:0;
  const avg=r.days.length?Math.round(r.tPS/r.days.length):0;
  const tile=(k,cls,n,label,sub)=>'<div class="kpi '+cls+' clk" data-k="'+k+'" tabindex="0" role="button" '
   +'aria-label="'+esc(label)+', '+n+'. Click to list the people."><div class="n">'+n+'</div>'
   +'<div class="l">'+label+'</div><div class="s">'+sub+'</div></div>';

  repTitle.textContent=one?('Attendance on '+dlong(r.theDay)):'Attendance report';

  document.getElementById('rep-kpi').innerHTML=
    tile('emp','b',one?r.tAct:r.rows.length,'Employees',
      one?'active on this date':(fDep.value==='all'?'all departments':esc(fDep.value)))
   +(one?''
     :tile('avg','b hl',avg,'Staff on site per day',
        'average headcount across '+r.days.length+' teaching days'))
   +tile('present','g',fmt(pres),one?'Present':'Present (staff-days)',
      one?'punched on this day':'one per person per day')
   +tile('absent','r',fmt(abst),one?'Absent':'Absent (staff-days)',
      one?(r.isTeach?'no punch on a teaching day':'not counted — no teaching')
         :'no punch on a teaching day')
   +(one?'':tile('total','',fmt(tot),'Total (staff-days)',
      r.rows.length+' staff × '+r.days.length+' teaching days'))
   +'<div class="kpi '+(pct>=80?'g':pct>=60?'a':'r')+'"><div class="n">'+pct+'%</div>'
     +'<div class="l">Attendance</div><div class="s">'
     +(one?'present ÷ '+r.tAct+' active':r.days.length+' teaching day'+(r.days.length===1?'':'s')+' in period')
     +'</div></div>'
   +tile('late','a',fmt(r.tL),'Late arrivals','first punch after 08:00')
   +tile('noout','a',fmt(r.tN),'No out punch','punched in, never punched out')
   +(one&&!r.isTeach
     ?'<div class="kpi a"><div class="n">—</div><div class="l">Not a teaching day</div>'
      +'<div class="s">absence is not counted</div></div>':'');

  repUnit.innerHTML=one
   ?(r.isTeach
      ?'<b>'+dlong(r.theDay)+' is a teaching day.</b> Every count here is <b>people</b>, not staff-days. '
       +'<b>'+r.tPres+'</b> present + <b>'+r.tAbs+'</b> absent = <b>'+r.tAct+'</b> employees active on '
       +'this date.'+(r.tNotJoined?' A further <b>'+r.tNotJoined+'</b> '
       +(r.tNotJoined===1?'employee is':'employees are')+' excluded because they had not joined yet.':'')
       +(r.tEarly?' <b>'+r.tEarly+'</b> were on site before their recorded joining date and are counted '
       +'as active anyway — the punch is the reliable record, not the joining date.':'')
      :'<b>'+dlong(r.theDay)+' is not a teaching day</b> — it is a Sunday, holiday or break period, when '
       +'only the support and facilities crew is on site. <b>Nobody is marked absent.</b> The '
       +'<b>'+r.tPres+'</b> shown as present did come in and are counted; the rest of the school is '
       +'simply not expected.')
   :'Present, absent and total are counted in <b>staff-days</b> — one employee on one day is one '
    +'staff-day. <b>'+r.rows.length+' staff × '+r.days.length+' teaching days = '
    +fmt(r.rows.length*r.days.length)+' possible staff-days</b>'
    +(r.rows.length*r.days.length!==tot?' ('+fmt(tot)+' after excluding days before people joined)':'')
    +'. That works out to about <b>'+avg+' people on site per day</b>. '
    +'Set From and To to the same date to switch the whole tab to headcount.';

  document.getElementById('rep-deptunit').innerHTML=one
   ?'Headcount for '+esc(dlong(r.theDay))+'. Present + absent equals the active staff in each row.'
   :'Counted in <b>staff-days</b> — one employee on one day. Not people.';

  /* the department table carries its own narrowing filters, applied on top of
     whatever the tab-level filter bar has already selected */
  const dRows=r.dept.filter(x=>{
   if(rdDep.value!=='all'&&x.dept!==rdDep.value)return false;
   const b=rdBand.value, p=x.pct;
   if(b==='90'&&!(p>=90))return false;
   if(b==='75'&&!(p>=75&&p<90))return false;
   if(b==='lo'&&!(p!=null&&p<75))return false;
   const qq=(rdQ.value||'').trim().toLowerCase();
   if(qq&&String(x.dept||'').toLowerCase().indexOf(qq)<0)return false;
   return true;
  });
  rdCount.textContent=dRows.length+' of '+r.dept.length+' departments'
   +(dRows.length!==r.dept.length?' — filtered':'');
  table(document.getElementById('t-repdept'),null,{title:'Attendance by department',fileTag:()=>range()[0]+'_to_'+range()[1],data:dRows,
   dcols:one?['dept','staff','present','absent','pct','late','no_out']
            :['dept','staff','absent','abs_pct','present','pct','open_days','other','late'],
   search:false,sort:'staff',desc:true,
   labels:{dept:'Department',staff:one?'Staff (active)':'Staff',
     absent:one?'Absent (people)':'Absent (staff-days)',abs_pct:'Absent %',
     present:one?'Present (people)':'Present (staff-days)',pct:'Attendance %',
     open_days:'Total (staff-days)',
     other:'Days on site out of term',late:'Late arrivals',no_out:'No out punch'},
   empty:'No employees match these filters.',
   pills:{pct:v=>v>=80?['ok',v+'%']:(v>=60?['warn',v+'%']:['bad',v+'%']),
     abs_pct:v=>v>=40?['bad',v+'%']:(v>=20?['warn',v+'%']:['no',v+'%']),
     other:v=>v>0?['warn',v]:['no','0']}});

  // column order follows the HRMS "Employee Attendance Percentage" report
  const cols=one
   ?['sr','empno','name','dept','designation','status','first_in','last_out','hours']
   :['sr','empno','name','dept','designation','absent','abs_pct','present','pct','open_days',
     'other','first_in','last_out','hours','late','no_out'];

  const shown=applyTableFilters(r.rows);
  TROWS=shown;
  eCount.textContent=shown.length+' of '+r.rows.length+' rows'
   +(shown.length!==r.rows.length?' — filtered':'');

  table(document.getElementById('t-rep'),null,{title:'Employee attendance',fileTag:()=>range()[0]+'_to_'+range()[1],data:shown,dcols:cols,search:false,
   sort:one?'sr':'pct',desc:!one,limit:1000,
   labels:{sr:'Sr.No.',empno:'Employee ID',name:'Employee name',dept:'Department',
     designation:'Designation',status:'Status',
     absent:'Absent days count',abs_pct:'Absent %',present:'Present count',pct:'Present %',
     open_days:'Total days',other:'Days on site out of term',
     first_in:one?'First punch in':'Avg first punch in',
     last_out:one?'Last punch out':'Avg last punch out',
     hours:one?'Hours':'Avg hours',late:'Late arrivals',no_out:'No out punch'},
   empty:'No employees match these filters.',
   pills:{status:v=>v==='Present'?['ok','Present']:['bad','Absent'],
     pct:v=>v==null?['no','—']:(v>=80?['ok',v+'%']:(v>=60?['warn',v+'%']:['bad',v+'%'])),
     abs_pct:v=>v==null?['no','—']:(v>=40?['bad',v+'%']:(v>=20?['warn',v+'%']:['no',v+'%'])),
     other:v=>v>0?['warn',v]:['no','0'],
     late:v=>v>=5?['bad',v]:(v>0?['warn',v]:['no','0']),
     no_out:v=>v>0?['warn',v]:['no','0'],
     first_in:v=>v==null?['no','—']:(mins(v)>LATE?['warn',v]:['ok',v]),
     last_out:v=>v==null?['no','no out punch']:null},
   onRow:drill});
  document.getElementById('d-rep').innerHTML='';
  wireTiles();
 }

 /* --- per-employee history: only ever reached by clicking a row --- */
 function drill(row){
  const emp=EMPS.find(e=>e.empno===row.empno)||{};
  const rec=DAY[row.empno]||{};
  // teaching days they could have attended, plus any day they actually punched
  const days=[...new Set(CUR.days.filter(d=>!(emp.joined&&d<emp.joined))
    .concat(Object.keys(rec).filter(inPeriod)))].sort();
  const hist=days.map(d=>{const x=rec[d], sch=SCHOOLDAY.has(d);
    return {date:d,day:DOW[new Date(d+'T00:00:00').getDay()],
      open:sch?'Teaching':'No teaching',
      status:x?'Present':(sch?'Absent':'—'),first_in:x?x.i:null,
      last_out:x&&x.o?x.o:null,hours:x&&x.h!=null?x.h:null,punches:x?x.n:0}}).reverse();
  document.getElementById('d-rep').innerHTML=
    '<div class="drill"><h4>'+esc(row.name)+' · '+esc(row.empno)+'</h4>'
   +'<div class="m">'+esc(row.designation||'')+' · '+esc(row.dept||'')
   +' · joined '+esc(emp.joined||'?')+' · '+row.open_days+' teaching days in the selected period'
   +(row.other?' · plus '+row.other+' day'+(row.other===1?'':'s')+' on site out of term':'')+'</div>'
   +'<div class="sum">'
   +'<div><div class="v" style="color:#039855">'+row.present+'</div><div class="t">Days present</div></div>'
   +'<div><div class="v" style="color:#d92d20">'+row.absent+'</div><div class="t">Days absent</div></div>'
   +'<div><div class="v">'+(row.pct==null?'—':row.pct+'%')+'</div><div class="t">Attendance</div></div>'
   +'<div><div class="v">'+(row.first_in||'—')+'</div><div class="t">'+(CUR.one?'First in':'Avg first in')+'</div></div>'
   +'<div><div class="v">'+(row.last_out||'—')+'</div><div class="t">'+(CUR.one?'Last out':'Avg last out')+'</div></div>'
   +'<div><div class="v">'+(row.hours==null?'—':row.hours)+'</div><div class="t">'+(CUR.one?'Hours':'Avg hours')+'</div></div>'
   +'<div><div class="v" style="color:#dc6803">'+row.late+'</div><div class="t">Late arrivals</div></div>'
   +'</div><p class="hint">Every open day in the selected period, most recent first. Days with an in punch '
   +'but no out punch are present with an unknown leaving time — they are excluded from hours, not counted as zero.</p>'
   +'<div id="rep-hist"></div></div>';
  table(document.getElementById('rep-hist'),null,{title:'Day-by-day history',data:hist,
   dcols:['date','day','open','status','first_in','last_out','hours','punches'],search:false,limit:400,
   labels:{date:'Date',day:'Day',open:'School',status:'Status',first_in:'First punch in',
     last_out:'Last punch out',hours:'Hours',punches:'Punches'},
   pills:{status:v=>v==='Present'?['ok','Present']:(v==='Absent'?['bad','Absent']:['no','not counted']),
     open:v=>v==='Teaching'?['no','Teaching']:['warn','No teaching'],
     first_in:v=>v==null?['no','—']:(mins(v)>LATE?['warn',v]:null),
     last_out:v=>v==null?['no','—']:null}});
  document.getElementById('d-rep').scrollIntoView({behavior:'smooth',block:'nearest'});
 }

 /* ---- KPI tile drill-downs: click a number, get the actual people ----------
    In multi-day mode the staff-day tiles drill to a person+date list — one row
    per staff-day — so the row count matches the tile exactly. In single-day
    mode every tile is already a headcount, so each drills to a person list. */
 function tileData(k){
  const r=CUR, one=r.one, rows=applyTableFilters(r.rows), keep=new Set(rows.map(x=>x.empno));
  const emp={};r.pool.forEach(e=>{emp[e.empno]=e});
  const per=[];                                   // person+date rows
  const each=(fn)=>{r.days.forEach(d=>{});};
  if(k==='emp'){
   if(one)return {cols:['empno','name','dept','designation','joined','status','first_in','last_out','hours'],
     rows:rows.slice(),
     labels:{empno:'Employee ID',name:'Employee name',dept:'Department',designation:'Designation',
       joined:'Date of joining',status:'Status',first_in:'First punch in',last_out:'Last punch out',hours:'Hours'}};
   return {cols:['empno','name','dept','designation','joined','present','absent','pct'],rows:rows.slice(),
     labels:{empno:'Employee ID',name:'Employee name',dept:'Department',designation:'Designation',
       joined:'Date of joining',present:'Days present',absent:'Days absent',pct:'Attendance %'}};
  }
  if(k==='avg'){                                   // per-day headcount, not people
   const out=r.days.map(d=>{let n=0;rows.forEach(x=>{if((DAY[x.empno]||{})[d])n++});
     return {date:d,day:DOW[new Date(d+'T00:00:00').getDay()],on_site:n,absent:rows.length-n}});
   return {cols:['date','day','on_site','absent'],rows:out,
     labels:{date:'Date',day:'Day',on_site:'Staff on site',absent:'Not on site'},
     note:'One row per teaching day. The tile is the average of the "staff on site" column.'};
  }
  if(one){
   const d=r.theDay;
   if(k==='present')return {cols:['empno','name','dept','designation','first_in','last_out','hours'],
     rows:rows.filter(x=>x.status==='Present'),
     labels:{empno:'Employee ID',name:'Employee name',dept:'Department',designation:'Designation',
       first_in:'First punch in',last_out:'Last punch out',hours:'Hours'}};
   if(k==='absent')return {cols:['empno','name','dept','designation','joined'],
     rows:rows.filter(x=>x.status==='Absent'),
     labels:{empno:'Employee ID',name:'Employee name',dept:'Department',designation:'Designation',
       joined:'Date of joining'}};
   if(k==='late')return {cols:['empno','name','dept','first_in','mins_late'],
     rows:rows.filter(x=>x.first_in&&mins(x.first_in)>LATE)
       .map(x=>Object.assign({mins_late:mins(x.first_in)-LATE},x)),
     labels:{empno:'Employee ID',name:'Employee name',dept:'Department',
       first_in:'First punch in',mins_late:'Minutes late'}};
   if(k==='noout')return {cols:['empno','name','dept','first_in','date'],
     rows:rows.filter(x=>x.no_out>0).map(x=>Object.assign({date:d},x)),
     labels:{empno:'Employee ID',name:'Employee name',dept:'Department',
       first_in:'Punch in',date:'Date affected'}};
   return null;
  }
  // multi-day: walk every staff-day so counts reconcile with the tiles
  const SD=new Set(r.days);
  rows.forEach(x=>{
   const rec=DAY[x.empno]||{}, e=emp[x.empno]||{};
   Object.keys(rec).forEach(d=>{
    if(!inPeriod(d))return;const rr=rec[d];
    per.push({empno:x.empno,name:x.name,dept:x.dept,designation:x.designation,
      date:d,day:DOW[new Date(d+'T00:00:00').getDay()],
      teaching:SD.has(d)?'Teaching':'No teaching',
      first_in:rr.i,last_out:rr.o||null,hours:rr.h==null?null:rr.h,
      mins_late:rr.i&&mins(rr.i)>LATE?mins(rr.i)-LATE:null});
   });
   /* the Total tile counts present + absent, so its drill needs the missed
      days too — without them the list came to 1,280 against a tile of 1,688 */
   if(k==='absent'||k==='total')r.days.forEach(d=>{
    if(!rec[d]&&!(e.joined&&d<e.joined))
      per.push({empno:x.empno,name:x.name,dept:x.dept,designation:x.designation,
        date:d,day:DOW[new Date(d+'T00:00:00').getDay()],joined:e.joined||null});
   });
  });
  const L={empno:'Employee ID',name:'Employee name',dept:'Department',designation:'Designation',
    date:'Date',day:'Day',teaching:'School',first_in:'First punch in',last_out:'Last punch out',
    hours:'Hours',mins_late:'Minutes late',joined:'Date of joining'};
  if(k==='present')return {cols:['empno','name','dept','designation','date','day','first_in','last_out','hours'],
    rows:per.filter(x=>x.first_in!==undefined&&SD.has(x.date)),labels:L,
    note:'One row per staff-day on a teaching day.'};
  if(k==='absent')return {cols:['empno','name','dept','designation','date','day','joined'],
    rows:per.filter(x=>x.first_in===undefined),labels:L,
    note:'One row per staff-day missed on a teaching day.'};
  if(k==='total')return {cols:['empno','name','dept','designation','date','day','first_in','last_out'],
    rows:per.filter(x=>SD.has(x.date)),labels:L,
    note:'Every staff-day in the period — present and absent together.'};
  if(k==='late')return {cols:['empno','name','dept','date','day','first_in','mins_late'],
    rows:per.filter(x=>x.mins_late!=null),labels:L,note:'One row per late arrival.'};
  if(k==='noout')return {cols:['empno','name','dept','date','day','first_in'],
    rows:per.filter(x=>x.first_in!==undefined&&!x.last_out),labels:L,
    note:'One row per day with an in punch but no out punch.'};
  return null;
 }

 const TITLES={emp:'Employees',avg:'Staff on site per day',present:'Present',absent:'Absent',
   total:'Total',late:'Late arrivals',noout:'No out punch'};

 function showTile(k){
  const host=document.getElementById('rep-tiledrill');
  if(TILE===k){closeTile();return}
  const d=tileData(k); if(!d){closeTile();return}
  TILE=k;
  const r=CUR, when=r.one?dlong(r.theDay):(dlong(range()[0])+' to '+dlong(range()[1]));
  host.innerHTML='<div class="drill"><div class="dhead"><div>'
   +'<h4>'+esc(TITLES[k])+' · '+esc(when)+' · '+fmt(d.rows.length)+' row'+(d.rows.length===1?'':'s')+'</h4>'
   +'<div class="m">'+(d.note||'Respects the department, staff-type and search filters currently applied.')
   +'</div></div><div><button class="btn sec" id="td-csv">Download CSV</button> '
   +'<button class="x" id="td-x">✕ Clear selection</button></div></div><div id="td-t"></div></div>';
  table(document.getElementById('td-t'),null,{data:d.rows,dcols:d.cols,labels:d.labels,
    tid:'tile-'+k,title:d.title||'Tile detail',fileTag:()=>range()[0]+'_to_'+range()[1],
    ph:'Search these '+d.rows.length+' rows…',limit:2000,
    empty:'Nobody falls into this bucket for the current filters.',
    pills:{status:v=>v==='Present'?['ok','Present']:['bad','Absent'],
      teaching:v=>v==='Teaching'?['no',v]:['warn',v],
      mins_late:v=>v==null?null:(v>=30?['bad',v+' min']:['warn',v+' min']),
      last_out:v=>v==null?['no','no out punch']:null,
      pct:v=>v==null?['no','—']:(v>=80?['ok',v+'%']:(v>=60?['warn',v+'%']:['bad',v+'%']))}});
  document.getElementById('td-x').onclick=closeTile;
  document.getElementById('td-csv').onclick=()=>exportById('td-t');
  markTiles();
  host.scrollIntoView({behavior:'smooth',block:'nearest'});
 }
 function closeTile(){TILE=null;document.getElementById('rep-tiledrill').innerHTML='';markTiles()}
 function markTiles(){
  document.querySelectorAll('#rep-kpi .kpi').forEach(t=>{
   if(t.dataset.k&&t.dataset.k===TILE)t.classList.add('on');else t.classList.remove('on')});
 }
 function wireTiles(){
  document.querySelectorAll('#rep-kpi .kpi.clk').forEach(t=>{
   t.onclick=()=>showTile(t.dataset.k);
   t.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();showTile(t.dataset.k)}};
  });
  markTiles();
 }

 function csv(){
  const r=CUR; if(!r||!TROWS.length)return;
  const cols=r.one
   ?['sr','empno','name','dept','designation','status','first_in','last_out','hours']
   :['sr','empno','name','dept','designation','absent','abs_pct','present','pct','open_days',
     'other','first_in','last_out','hours','late','no_out'];
  const head=cols.join(',');
  const body=r.rows.map(x=>cols.map(c=>{
    const v=x[c]==null?'':String(x[c]);
    return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(',')).join('\n');
  const rg=range(), per=rg[0]+'_to_'+rg[1];
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([head+'\n'+body],{type:'text/csv;charset=utf-8'}));
  a.download='attendance-'+per+'.csv';a.click();URL.revokeObjectURL(a.href);
 }

 fQk.onchange=()=>{applyQuick();render()};
 // editing a date directly means the range is no longer one of the presets
 [fFrom,fTo].forEach(x=>{x.onchange=()=>{fQk.value='custom';render()}});
 fDep.onchange=render; fT.onchange=render;
 fQ.oninput=render;
 document.getElementById('f-csv').onclick=()=>exportById('t-rep');
 document.getElementById('f-reset').onclick=()=>{
   fQk.value=MONTHS[MONTHS.length-1];applyQuick();
   fDep.value='all';fT.value='all';fQ.value='';render()};

 rdDep.onchange=render; rdBand.onchange=render; rdQ.oninput=render;
 document.getElementById('rd-reset').onclick=()=>{
   rdDep.value='all';rdBand.value='all';rdQ.value='';render()};

 eDep.onchange=render; eT.onchange=render; eBand.onchange=render;
 eQ.oninput=render;
 eF.forEach(x=>{x.onchange=render});
 document.getElementById('e-reset').onclick=()=>{
   eDep.value='all';eT.value='all';eBand.value='all';eQ.value='';
   eF.forEach(x=>{x.checked=false});render()};

 fQk.value=MONTHS[MONTHS.length-1];applyQuick();render();
})();

/* ---------- STAFF DIRECTORY -------------------------------------------------
   Consolidates the list / profile / distribution / joining family of HRMS
   reports into one filtered table with a switchable grouping. Source is the
   full 814-row roster, so it covers leavers and never-attended records too,
   unlike the attendance tab which is scoped to the 211 who badge in.
--------------------------------------------------------------------------- */
(function(){
 const R=D.roster.rows;
 const gBy=document.getElementById('g-by'),gDep=document.getElementById('g-dept'),
       gT=document.getElementById('g-type'),gS=document.getElementById('g-sex'),
       gSt=document.getElementById('g-stat'),gF=document.getElementById('g-from'),
       gTo=document.getElementById('g-to'),gQ=document.getElementById('g-q'),
       gScope=document.getElementById('g-scope');
 if(!gBy)return;
 function opt(v,t){const o=document.createElement('option');o.value=v;o.textContent=t;return o}
 const uniq=k=>[...new Set(R.map(x=>x[k]).filter(v=>v!=null&&v!==''))].sort();

 const GROUPS=[['dept','Department'],['designation','Designation'],['stafftype','Staff type'],
   ['gender','Gender'],['joinyear','Joining year'],['band','Tenure band'],['status','Attending status']];
 GROUPS.forEach(g=>gBy.appendChild(opt(g[0],g[1])));
 gDep.appendChild(opt('all','All departments'));uniq('dept').forEach(v=>gDep.appendChild(opt(v,v)));
 gT.appendChild(opt('all','All staff types'));uniq('stafftype').forEach(v=>gT.appendChild(opt(v,v)));
 gS.appendChild(opt('all','All'));uniq('gender').forEach(v=>gS.appendChild(opt(v,v==='F'?'Female':v==='M'?'Male':v)));
 gSt.appendChild(opt('all','All records'));
 gSt.appendChild(opt('Active','Attending'));
 gSt.appendChild(opt('other','Not attending'));
 gSt.appendChild(opt('conflict','Attending but HR says left'));

 function band(y){y=y==null?-1:y;
   return y<0?'(unknown)':y<1?'Under 1 year':y<3?'1-3 years':y<5?'3-5 years':y<10?'5-10 years':'10+ years'}

 function build(){
  const q=(gQ.value||'').trim().toLowerCase(), from=gF.value||'', to=gTo.value||'';
  const rows=R.filter(x=>{
   if(gDep.value!=='all'&&x.dept!==gDep.value)return false;
   if(gT.value!=='all'&&x.stafftype!==gT.value)return false;
   if(gS.value!=='all'&&x.gender!==gS.value)return false;
   if(gSt.value==='Active'&&x.status!=='Active')return false;
   if(gSt.value==='other'&&x.status==='Active')return false;
   if(gSt.value==='conflict'&&x.conflict!=='CONFLICT')return false;
   if(from&&(!x.joined||x.joined<from))return false;
   if(to&&(!x.joined||x.joined>to))return false;
   if(q&&!(String(x.name)+' '+x.empno+' '+(x.designation||'')+' '+(x.dept||'')).toLowerCase().includes(q))return false;
   return true;
  }).map(x=>Object.assign({},x,{
     joinyear:x.joined?String(x.joined).slice(0,4):'(unknown)', band:band(x.years)}));
  rows.sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  rows.forEach((x,i)=>{x.sr=i+1});
  const key=gBy.value, g={};
  rows.forEach(x=>{
   const k=x[key]==null||x[key]===''?'(not set)':x[key];
   const o=g[k]||(g[k]={grp:k,n:0,teaching:0,support:0,admin:0,female:0,male:0,attending:0,conflict:0,yrs:0,yn:0});
   o.n++;
   if(x.stafftype==='Teaching')o.teaching++;else if(x.stafftype==='Support')o.support++;
   else if(x.stafftype==='Administration')o.admin++;
   if(x.gender==='F')o.female++;else if(x.gender==='M')o.male++;
   if(x.status==='Active')o.attending++;
   if(x.conflict==='CONFLICT')o.conflict++;
   if(typeof x.years==='number'){o.yrs+=x.years;o.yn++}
  });
  const grp=Object.values(g).map(o=>Object.assign(o,{
    avg_years:o.yn?Math.round(o.yrs/o.yn*10)/10:null}));
  return {rows:rows,grp:grp};
 }

 let GCUR=null;
 function render(){
  const b=build();GCUR=b;
  const lbl=(GROUPS.find(x=>x[0]===gBy.value)||['','']) [1];
  const att=b.rows.filter(x=>x.status==='Active').length;
  const cf=b.rows.filter(x=>x.conflict==='CONFLICT').length;
  gScope.innerHTML='Showing <b>'+b.rows.length+'</b> of '+R.length+' employee records'
   +(gF.value||gTo.value?' · joined '+(gF.value||'any')+' to '+(gTo.value||'any'):'')
   +' · grouped by <b>'+esc(lbl)+'</b> into <b>'+b.grp.length+'</b> group'+(b.grp.length===1?'':'s')+'.';
  document.getElementById('dir-kpi').innerHTML=
    '<div class="kpi b"><div class="n">'+b.rows.length+'</div><div class="l">Employee records</div>'
     +'<div class="s">of '+R.length+' on file</div></div>'
   +'<div class="kpi g"><div class="n">'+att+'</div><div class="l">Attending</div>'
     +'<div class="s">punched during the year</div></div>'
   +'<div class="kpi"><div class="n">'+(b.rows.length-att)+'</div><div class="l">Not attending</div>'
     +'<div class="s">no punch on record</div></div>'
   +'<div class="kpi r"><div class="n">'+cf+'</div><div class="l">Attending, HR says left</div>'
     +'<div class="s">em_left_date conflict</div></div>'
   +'<div class="kpi b"><div class="n">'+b.grp.length+'</div><div class="l">'+esc(lbl)+' groups</div>'
     +'<div class="s">current grouping</div></div>';

  table(document.getElementById('t-dirgrp'),null,{title:'Directory grouping',data:b.grp,
   dcols:['grp','n','teaching','support','admin','female','male','attending','conflict','avg_years'],
   search:false,sort:'n',desc:true,
   labels:{grp:lbl,n:'Staff',teaching:'Teaching',support:'Support',admin:'Admin',
     female:'Female',male:'Male',attending:'Attending',conflict:'HR says left',avg_years:'Avg years'},
   empty:'No records match these filters.',
   pills:{conflict:v=>v>0?['bad',v]:['no','0']}});

  table(document.getElementById('t-dir'),null,{title:'Staff directory',data:b.rows,
   dcols:['sr','empno','name','dept','designation','stafftype','gender','joined','years',
     'days_present','last_punch','status','conflict'],
   ph:'Search this list…',sort:'sr',limit:1000,
   labels:{sr:'Sr.No.',empno:'Employee ID',name:'Employee name',dept:'Department',
     designation:'Designation',stafftype:'Staff type',gender:'Gender',joined:'Date of joining',
     years:'Years of service',days_present:'Days present',last_punch:'Last punch',
     status:'Status',conflict:'Flag'},
   empty:'No records match these filters.',
   pills:{status:v=>v==='Active'?['ok','Attending']:['no','No punch'],
     conflict:v=>v==='CONFLICT'?['bad','HR says left']:null,
     gender:v=>v==='F'?['no','Female']:(v==='M'?['no','Male']:null)}});
 }

 function csv(){
  const b=GCUR;if(!b||!b.rows.length)return;
  const cols=['sr','empno','name','dept','designation','stafftype','gender','joined','years',
    'days_present','last_punch','status','conflict'];
  const body=b.rows.map(x=>cols.map(c=>{const v=x[c]==null?'':String(x[c]);
    return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([cols.join(',')+'\n'+body],{type:'text/csv;charset=utf-8'}));
  a.download='staff-directory.csv';a.click();URL.revokeObjectURL(a.href);
 }

 [gBy,gDep,gT,gS,gSt,gF,gTo].forEach(x=>{x.onchange=render});
 gQ.oninput=render;
 document.getElementById('g-csv').onclick=()=>exportById('t-dir');
 document.getElementById('g-reset').onclick=()=>{
   gBy.value='dept';gDep.value='all';gT.value='all';gS.value='all';gSt.value='all';
   gF.value='';gTo.value='';gQ.value='';render()};
 render();

 /* ---- what happened to every report on the HRMS Reports menu ---- */
 const MAP=[
  ['6 Employee Punch Report','Attendance','Attendance report tab','Merged'],
  ['135 Employee Punch Report','Attendance','Attendance report tab — duplicate of #6','Merged'],
  ['35 MOE Employee Attendance Report','Attendance','Attendance report tab, single-day mode','Merged'],
  ['41 Employee Attendance Percentage','Attendance','Attendance report tab, date range','Merged'],
  ['8 Employee Attendance Present Report for year','Attendance','Attendance report tab, whole-year preset','Merged'],
  ['11 Employee List','Directory','Staff directory','Merged'],
  ['11 Employee List New','Directory','Staff directory — duplicate of #11','Merged'],
  ['42 Employee Profile','Directory','Staff directory','Merged'],
  ['129 Employee Profile Report','Directory','Staff directory — duplicate of #42','Merged'],
  ['34 Teacher Profile Report','Directory','Staff directory, staff type = Teaching','Merged'],
  ['15 Gender Wise Employee List','Directory','Staff directory, group by Gender','Merged'],
  ['21 Distribution of staff by Nationality,Designation','Directory','Staff directory, group by Designation','Partly merged'],
  ['15 Employee Joining Report','Directory','Staff directory, joined-between range','Merged'],
  ['20 Employee Joining Report','Directory','Staff directory — duplicate of #15','Merged'],
  ['45 Employee Joining Report','Directory','Staff directory — duplicate of #15','Merged'],
  ['19 Employee Resign Details Report','Lifecycle','Not merged — em_left_date is corrupt','Unreliable'],
  ['130 Employee Service Termination','Lifecycle','Not merged — same corrupt column, settlement tables empty','Unreliable'],
  ['9 Probation Report For Employee','Lifecycle','Nothing to merge','No data'],
  ['16 Employee Experience Report','Lifecycle','Derivable from joining date only','Partly merged'],
  ['6 Expiry Report','Documents','Nothing to merge','No data'],
  ['13 Immigration Document','Documents','Nothing to merge','No data'],
  ['17 Employee Document Report','Documents','Nothing to merge','No data'],
  ['16 Staff List based on Sponsorship','Documents','Nothing to merge','No data'],
  ['23 Distribution of staff by Qualification','Directory','Nothing to merge','No data'],
  ['22 Distribution of staff by Place of Residence','Directory','Nothing to merge','No data'],
  ['4 Employee ID Card','Print template','Not a report — per-employee printable','Out of scope'],
  ['128 Employee ID Card New','Print template','Not a report — duplicate of #4','Out of scope'],
  ['50 Teacher Label','Print template','Not a report — printable label','Out of scope'],
  ['131 Employee Certificate','Print template','Not a report — printable letter','Out of scope'],
  ['132 Employee experience certificate','Print template','Not a report — printable letter','Out of scope'],
  ['133 No Objection Certificate Report','Print template','Not a report — printable letter','Out of scope'],
  ['134 No Objection Certificate Version 2','Print template','Not a report — duplicate of #133','Out of scope']
 ].map(r=>({report:r[0],family:r[1],outcome:r[2],verdict:r[3]}));
 table(document.getElementById('t-map'),null,{title:'HRMS report coverage',data:MAP,
  dcols:['report','family','verdict','outcome'],sort:'family',ph:'Search the report list…',limit:60,
  labels:{report:'HRMS report',family:'Family',verdict:'Verdict',outcome:'Where it goes now'},
  pills:{verdict:v=>v==='Merged'?['ok',v]:(v==='Partly merged'?['warn',v]
    :(v==='No data'?['bad',v]:(v==='Unreliable'?['bad',v]:['no',v])))}});
})();
