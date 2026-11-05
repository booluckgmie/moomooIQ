const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let stocks=[];
function show(tab){
  document.querySelectorAll('nav button,main section').forEach(e=>e.classList.remove('on'));
  document.querySelector(`nav button[data-tab="${tab}"]`).classList.add('on');$(tab).classList.add('on');window.scrollTo(0,0);
}
let usageLoaded=false;
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{
  show(b.dataset.tab);
  if(b.dataset.tab==='usage'&&!usageLoaded){usageLoaded=true;loadUsage()}
});
function fillTickers(){
  const sec=$('sector').value;
  $('ticker').innerHTML=stocks.filter(s=>!sec||s.sector===sec)
    .map(s=>`<option value="${esc(s.ticker)}" data-name="${esc(s.name)}">${esc(s.ticker)} · ${esc(s.name)} (${esc(s.code)})</option>`).join('');
}
fetch('/api/stocks').then(r=>r.json()).then(d=>{
  stocks=d.stocks;
  $('sector').innerHTML='<option value="">All sectors</option>'+d.sectors.map(s=>`<option>${esc(s)}</option>`).join('');
  $('sector').onchange=fillTickers;fillTickers();renderWatch();fillCheckList();renderToday();
}).catch(()=>$('out').textContent='Could not load stock list.');
try{$('atok').value=localStorage.getItem('moomooiq.atok')||''}catch(e){}
$('atok').oninput=()=>{try{$('atok').value?localStorage.setItem('moomooiq.atok',$('atok').value):localStorage.removeItem('moomooiq.atok')}catch(e){}};
const SECTIONS={catalyst:'1 · Catalyst Breakdown',valuation:'2 · Financial Health & Valuation',scenarios:'3 · Sentiment, Scenarios & Trade Plan'};
let job=null;
const heldPrice=t=>{const p=state.positions.find(x=>x.ticker===t);return p&&p.price>0&&Today.priceIsFresh(p.priceAt,new Date())?p.price:null};
// Each section is its own request, so a slow or busy one doesn't sink the others and can be retried alone.
async function runSection(k,my=job){
  const el=$('sec-'+k);if(!el||my!==job)return;
  el.innerHTML=`<h3>${SECTIONS[k]}</h3><div class="mut"><span class="spin"></span> Working…</div>`;
  try{
    const r=await fetch('/api/analyze',{method:'POST',headers:{'x-access-token':$('atok').value},
      body:JSON.stringify({ticker:my.ticker,name:my.name,framework:k,price:my.price,slots:my.slots})});
    const d=await r.json().catch(()=>({error:'Unexpected response ('+r.status+')'}));
    if(!r.ok)throw new Error(d.error||'Error '+r.status);
    if(my!==job)return;
    el.innerHTML=`<h3>${SECTIONS[k]}</h3><div class="md">${Md.render(d.text)}</div><div class="small mut" style="margin-top:8px">${esc(d.model)}${d.headlines?` · ${d.headlines} recent headlines used`:''}${d.priceSource==='market'?` · price RM${d.price} (delayed quote)`:''}</div>`;
  }catch(e){
    if(my!==job)return;
    el.innerHTML=`<h3>${SECTIONS[k]}</h3><div class="errbox">${esc(e.message)}${/token/i.test(e.message)?' Re-enter it above; it is saved after you type it.':''}</div><button class="go sm" data-retry="${k}">Retry this section</button>`;
  }
  if(--my.pending<=0)$('run').disabled=false;
}
$('run').onclick=()=>{
  const o=$('ticker').selectedOptions[0];if(!o)return;
  const typed=+$('aprice').value||null,price=typed||heldPrice(o.value)||null;
  job={ticker:o.value,name:o.dataset.name,price,slots:Math.min(3,state.positions.length),pending:3};
  $('ainfo').textContent=price?`Working from RM${price} (${typed?'typed':'from your tracker'}). The AI has no live prices, so it only knows this one.`
    :"No price typed: the server uses the latest delayed market quote (about 15 minutes behind) when it can get one.";
  $('out').innerHTML=Object.keys(SECTIONS).map(k=>`<div class="card" id="sec-${k}"></div>`).join('')
    +'<p class="note">Educational only, not financial advice. The AI uses general knowledge plus recent Moomoo headlines. Treat anything marked "approx." as unverified.</p>';
  $('run').disabled=true;Object.keys(SECTIONS).forEach(k=>runSection(k));
};
$('out').addEventListener('click',e=>{
  const k=e.target.dataset.retry;if(!k||!job)return;
  job.pending++;$('run').disabled=true;runSection(k);
});
$('search').onclick=async()=>{
  const kw=$('kw').value.trim();if(!kw)return;
  $('nout').innerHTML='<div class="card mut">Searching…</div>';
  const r=await fetch(`/api/moomoo-news?keyword=${encodeURIComponent(kw)}&type=${encodeURIComponent($('ntype').value)}`);
  const d=await r.json();
  if(!r.ok){$('nout').innerHTML=`<div class="card">${esc(d.error)}</div>`;return}
  $('nout').innerHTML=d.items.length?d.items.map(i=>`<div class="card"><b>${i.url?`<a href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">${esc(i.title)}</a>`:esc(i.title)}</b><div class="mut">${i.published?esc(new Date(i.published).toLocaleString()):''}</div></div>`).join('')+`<div class="mut">${esc(d.disclaimer)}</div>`
    :'<div class="card mut">No results.</div>';
};
/* ---------- Usage ---------- */
const USAGE_REASONS={
  no_token:'Web Analytics is not connected yet.',
  no_project:'No Vercel project id found for this deployment.',
  api_error:'Could not reach Vercel Analytics right now.',
};
function renderUsage(d){
  if(!d||!d.connected){
    const why=USAGE_REASONS[d&&d.reason]||'Site usage is not available right now.';
    $('uout').innerHTML=`<div class="card"><p>${esc(why)}</p>
      <p class="small mut">Turn on Web Analytics in the Vercel dashboard → Analytics tab → Enable, then add <code>VERCEL_ANALYTICS_TOKEN</code> (a Vercel access token that can read this project) as an env var and redeploy.</p>
      ${d&&d.detail?`<p class="small mut">Detail: ${esc(d.detail)}</p>`:''}</div>`;
    return;
  }
  const max=Math.max(1,...d.daily.map(r=>r.views));
  const bars=d.daily.map(r=>`<div class="bar" style="height:${Math.max(2,Math.round(r.views/max*52))}px" title="${esc(r.key)}: ${r.views} views"></div>`).join('');
  const list=(rows,label)=>rows.length?`<ul class="ulist">${rows.map(r=>`<li><span>${esc(r.key)}</span><b>${r.views}</b></li>`).join('')}</ul>`
    :`<p class="small mut">No ${esc(label)} data yet.</p>`;
  $('uout').innerHTML=`
    <div class="card stats">
      <div class="stat"><div class="sv">${d.totals.views.toLocaleString()}</div><div class="sl mut">Page views · last ${d.days}d</div></div>
      <div class="stat"><div class="sv">${d.totals.visitors.toLocaleString()}</div><div class="sl mut">Visitors · last ${d.days}d</div></div>
    </div>
    <div class="card"><h3>Daily views</h3><div class="chart">${bars||'<span class="mut">No data yet.</span>'}</div><p class="small mut">${esc(d.since)} to ${esc(d.until)}</p></div>
    <div class="cols">
      <div class="card"><h3>Top pages</h3>${list(d.pages,'page')}</div>
      <div class="card"><h3>Countries</h3>${list(d.countries,'country')}</div>
    </div>
    <div class="cols">
      <div class="card"><h3>Devices</h3>${list(d.devices,'device')}</div>
      <div class="card"><h3>Referrers</h3>${list(d.referrers,'referrer')}</div>
    </div>`;
}
async function loadUsage(){
  $('uout').innerHTML='<div class="card mut">Loading…</div>';
  try{
    const r=await fetch('/api/analytics');
    renderUsage(await r.json());
  }catch(e){
    $('uout').innerHTML='<div class="card">Could not load site usage.</div>';
  }
}
const KEY='moomooiq.tracker';
let state={positions:[],cash:''};
try{state=Object.assign(state,JSON.parse(localStorage.getItem(KEY)||'{}'))}catch(e){}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}};
const pct=n=>n==null?'–':(n*100).toFixed(1)+'%';
const rm=n=>n==null?'–':'RM'+n.toFixed(2);
function renderTracker(){
  const p=Tracker.portfolio(state.positions,state.cash);
  const rows=p.rows.map((r,i)=>{
    const pos=state.positions[i];
    const bad=/SELL/.test(r.action),good=/TRIM|target/.test(r.action);
    return `<tr><td><b>${esc(r.ticker)}</b><br><span class="mut">${r.qty} @ ${r.cost}</span></td>
      <td><input data-i="${i}" data-f="price" type="number" step="0.001" value="${pos.price??''}" style="width:80px">${pos.priceSrc==='yahoo'?'<div class="small mut">delayed quote</div>':pos.priceSrc==='moomoo'?'<div class="small mut">from Moomoo</div>':''}</td>
      <td>${pct(r.gain)}<br><span class="mut">${rm(r.pl)}</span></td>
      <td>${rm(r.stop)}<br><span class="mut">${esc(r.stopWhy)}</span></td>
      <td>${rm(r.target)}</td>
      <td style="color:${bad?'#d6336c':good?'#2b8a3e':'inherit'}"><b>${esc(r.action)}</b></td>
      <td><input data-i="${i}" data-f="plan" placeholder="plan if −10%" value="${esc(pos.plan||'')}" size="12">
          <label class="mut"><input data-i="${i}" data-f="trimmed" type="checkbox" ${pos.trimmed?'checked':''}> trimmed</label>
          <button data-del="${i}" class="go" style="padding:2px 8px">✕</button></td></tr>`}).join('');
  $('pout').innerHTML=(p.alerts.length?`<div class="card" style="border-color:#d6336c">${p.alerts.map(a=>'⚠ '+esc(a)).join('<br>')}</div>`:'')
   +(rows?`<div class="card" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:14px">
     <tr class="mut" style="text-align:left"><th>Position</th><th>Price</th><th>P/L</th><th>Stop</th><th>Target</th><th>Action</th><th>Notes</th></tr>${rows}</table>
     <p>Invested ${rm(p.invested)} · P/L ${rm(p.pl)} (${pct(p.plPct)})</p></div>`:'<div class="card mut">No positions. Add one above - set the stop the same day you buy.</div>')
   +'<div class="mut">Educational only; not financial advice. Remember to place the actual trailing stop order in your broker.</div>';
  renderSizing();
  renderToday();
}
$('cash').value=state.cash;
$('cash').oninput=e=>{state.cash=e.target.value;save();renderTracker()};
$('padd').onclick=()=>{
  const t=$('pt').value.trim().toUpperCase().replace(/[^A-Z0-9.&-]/g,''),q=+$('pq').value,c=+$('pc').value;
  if(!t||!(q>0)||!(c>0))return;
  state.positions.push({ticker:t,qty:q,cost:c,type:$('py').value,high:c});save();renderTracker();
  $('pt').value=$('pq').value=$('pc').value='';
};
$('pout').addEventListener('change',e=>{
  const i=e.target.dataset.i,f=e.target.dataset.f;if(i==null)return;
  const pos=state.positions[i];
  if(f==='price'){pos.price=e.target.value===''?null:+e.target.value;if(pos.price){pos.high=Math.max(pos.high||0,pos.price);pos.priceAt=new Date().toISOString();pos.priceSrc=null}}
  else if(f==='trimmed')pos.trimmed=e.target.checked;else pos[f]=e.target.value;
  save();renderTracker();
});
$('pout').addEventListener('click',e=>{
  if(e.target.dataset.del==null)return;
  if(!confirm('Remove this position from the tracker?'))return;
  state.positions.splice(+e.target.dataset.del,1);save();renderTracker();
});
$('pfetch').onclick=async()=>{
  try{
    for(const [i,pos] of state.positions.entries()){
      const st=stocks.find(s=>s.ticker===pos.ticker);if(!st)continue;
      const r=await fetch('http://127.0.0.1:8787/snapshot?code=MY.'+st.code,{headers:{Authorization:'Bearer '+$('btok').value}});
      const d=await r.json();const px=d.data?.[0]?.last_price;
      if(px>0){pos.price=px;pos.high=Math.max(pos.high||0,px);pos.priceAt=new Date().toISOString()}
    }
    save();renderTracker();
  }catch(e){alert('Bridge not reachable. Is it running locally? (Safari blocks https→localhost.)')}
};
$('pexp').onclick=()=>{
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([Tracker.exportState(state)],{type:'application/json'}));
  a.download='moomooiq-positions-'+new Date().toISOString().slice(0,10)+'.json';
  a.click();URL.revokeObjectURL(a.href);
};
$('pimp').onclick=()=>$('pfile').click();
$('pfile').onchange=async e=>{
  const f=e.target.files[0];e.target.value='';if(!f)return;
  try{
    if(f.size>200000)throw new Error('File too large');
    const d=Tracker.parseImport(await f.text());
    if(state.positions.length&&!confirm(`Replace your ${state.positions.length} current position(s) with ${d.positions.length} from the file?`))return;
    state.positions=d.positions;state.cash=d.cash;$('cash').value=d.cash;save();renderTracker();
  }catch(err){alert('Import failed: '+err.message)}
};
function renderSizing(){
  const eq=Tracker.equityOf(state.positions,state.cash);
  const risk=(+$('sr').value||0)/100;
  const r=Tracker.sizeTrade({equity:eq,cash:state.cash,entry:$('se').value,openCount:state.positions.length,riskPct:risk});
  const head=`<span class="mut">Equity ${rm(eq)} (cash + holdings) · 100-share lots</span><br>`;
  $('sout').innerHTML=head+(r.qty?`<b>Buy ${r.qty} shares</b> = ${rm(r.cost)} (${pct(r.pctOfEquity)} of equity)<br>
    Stop ${rm(r.stop)} · max loss ${rm(r.maxLoss)} (${pct(r.maxLossPct)}) · target ${rm(r.target)}<br>
    <span class="mut">Limited by: ${esc(r.boundBy)}. Place the stop order the same day.</span>`
    :`<span style="color:#d6336c">${esc(r.reason)}</span>`);
}
try{$('sr').value=localStorage.getItem('moomooiq.risk')||'2'}catch(e){$('sr').value='2'}
$('sr').oninput=()=>{try{localStorage.setItem('moomooiq.risk',$('sr').value)}catch(e){}renderSizing()};
$('se').oninput=renderSizing;
/* ---------- Today ---------- */
const okTicker=t=>/^[A-Z0-9.&-]{1,20}$/.test(String(t));
const loadJSON=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v??d}catch(e){return d}};
const saveJSON=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const DEFAULT_WATCH=['GAMUDA','INARI','99SMART','SIME','NATGATE','YTLPOWR','MAYBANK','PCHEM'];
let watch=(loadJSON('moomooiq.watch',DEFAULT_WATCH)||[]).filter(t=>/^[A-Z0-9.&-]{1,20}$/.test(t)).slice(0,8);
const visit=Today.rollVisit(loadJSON('moomooiq.visit',null),Date.now());saveJSON('moomooiq.visit',visit);
let brief=null,briefState='idle',briefAt=0;
const nameOf=t=>(stocks.find(s=>s.ticker===t)||{}).name||'';
const clock=d=>new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kuala_Lumpur'}).format(d);

async function loadBrief(){
  const tickers=[...new Set([...state.positions.map(p=>p.ticker),...watch])].filter(okTicker).slice(0,12);
  if(!tickers.length){brief=null;briefState='ok';renderToday();return}
  briefState='loading';renderToday();
  try{
    const r=await fetch('/api/brief?tickers='+encodeURIComponent(tickers.join(',')));
    if(!r.ok)throw new Error('brief '+r.status);
    brief=await r.json();briefState='ok';briefAt=Date.now();
  }catch(e){brief=null;briefState='error'}
  renderToday();
}

function itemRow(it){
  const inner=`<span class="dot ${it.tone}"></span><span class="rt"><b>${esc(it.title)}${it.isNew?' <span class="new">NEW</span>':''}</b><span class="sub">${esc(it.sub||'')}</span></span>`;
  return it.url?`<a class="item" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
    :`<button class="item" data-go="${esc(it.go||'portfolio')}">${inner}</button>`;
}
function tier(label,n){return `<div class="tier"><h2>${label}</h2>${n?`<span class="n">${n}</span>`:''}</div>`}

function renderToday(){
  const now=new Date(),ms=Today.marketStatus(now),nc=Today.nextCheck(now);
  $('tdate').textContent=new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long',timeZone:'Asia/Kuala_Lumpur'}).format(now);
  $('tmkt').className='pill '+ms.state;$('tmkt').textContent=`${ms.label} · ${ms.detail}`;
  $('tnext').textContent=`Next look: ${nc.at}${nc.when==='today'?'':' '+nc.when} · ${nc.why}`;

  const p=Tracker.portfolio(state.positions,state.cash);
  const t=Today.buildToday({now,brief,positions:state.positions,portfolio:p,watch,sinceVisit:visit.since});
  let h='';
  if(briefState==='error')h+=`<div class="banner">News unavailable right now. Showing your own rules only. <button class="go sm" id="tretry" style="margin-left:6px">Retry</button></div>`;

  h+=tier('Needs action',t.attention.length)+(t.attention.length
    ?`<div class="box alert">${t.attention.map(itemRow).join('')}</div>`
    :'<div class="box calm">✓ Nothing needs action today.</div>');

  h+=tier('Best opportunities');
  if(briefState==='loading'&&!brief)h+='<div class="box"><div class="item"><span class="sub">Reading the latest headlines…</span></div></div>';
  else if(t.opportunities.length){
    h+='<div class="box">'+t.opportunities.map((o,i)=>`<div class="opp"><div class="rk">${i+1}</div><div class="ob">
      <div class="oh"><b class="tk">${esc(o.ticker)}</b><span class="nm">${esc(nameOf(o.ticker))}</span><span class="sig" title="Headline momentum">${'●'.repeat(o.dots)}${'○'.repeat(3-o.dots)}</span></div>
      ${o.url?`<a class="hl" href="${esc(o.url)}" target="_blank" rel="noopener noreferrer">${esc(o.title)}</a>`:`<span class="hl">${esc(o.title)}</span>`}
      <div class="sub">${esc(o.sub)}${o.isNew?' · <span class="new">NEW</span>':''}</div></div>
      <div class="obtn"><button class="go sm" data-an="${esc(o.ticker)}">Analyse</button><button class="go sm alt" data-ck="${esc(o.ticker)}">Check buy</button></div></div>`).join('')+'</div>';
    h+=`<p class="note">${t.slotsFull?'All 3 slots are used, so these are for watching only. ':''}Ranked by recent headlines only, not price or valuation. Run Analyse and check your rules before buying.</p>`;
  }else h+=`<div class="box"><div class="item"><span class="rt"><b>No standout setup today</b><span class="sub">Quiet is fine. One good stock beats five average ones.</span></span></div></div>`;

  if(t.headsUp.length)h+=tier('Heads-up')+`<div class="box">${t.headsUp.map(itemRow).join('')}</div>`;

  h+=tier('Your positions');
  h+=t.chips.length?'<div class="chips">'+t.chips.map(c=>`<button class="chip ${c.state}" data-go="portfolio"><b>${esc(c.ticker)}</b> ${c.gain==null?'no price':pct(c.gain)} <span>stop ${rm(c.stop)}${c.room!=null?(c.room<=0?' · hit':` · ${(c.room*100).toFixed(0)}% away`):''}</span></button>`).join('')+'</div>'
    :'<p class="note">No positions yet. Add them in Portfolio and this page will watch your stops.</p>';

  h+=`<p class="note" style="margin-top:20px">${briefAt?`Headlines from Moomoo, updated ${clock(new Date(briefAt))} MYT. `:''}${pricesAt?`Prices from Yahoo Finance (delayed), checked ${clock(new Date(pricesAt))} MYT. `:''}${/unavailable/.test(priceNote)?esc(priceNote)+' ':''}Market hours ignore public holidays. Educational only, not financial advice.</p>`;
  $('tbody').innerHTML=h;
}

function renderWatch(){
  $('wlchips').innerHTML=watch.map(t=>`<button data-rm="${esc(t)}" aria-label="Remove ${esc(t)}">${esc(t)} ✕</button>`).join('')||'<span class="mut">Empty</span>';
  $('wladd').innerHTML=stocks.filter(s=>!watch.includes(s.ticker)).map(s=>`<option value="${esc(s.ticker)}">${esc(s.ticker)} · ${esc(s.name)}</option>`).join('');
  $('wlbtn').disabled=watch.length>=8||!$('wladd').options.length;
}
function setWatch(next){watch=next;saveJSON('moomooiq.watch',watch);renderWatch();loadBrief()}
$('wlbtn').onclick=()=>{const v=$('wladd').value;if(v&&watch.length<8)setWatch([...watch,v])};
$('wlchips').onclick=e=>{const t=e.target.dataset.rm;if(t)setWatch(watch.filter(x=>x!==t))};
$('trefresh').onclick=()=>{loadBrief();refreshPrices()};
$('tbody').addEventListener('click',e=>{
  if(e.target.id==='tretry')return loadBrief();
  const go=e.target.closest('[data-go]'),an=e.target.closest('[data-an]'),ck=e.target.closest('[data-ck]');
  if(ck){show('portfolio');$('ct').value=ck.dataset.ck;$('cout').innerHTML='';$('cq').focus();}
  else if(an){
    show('analyse');$('sector').value='';fillTickers();$('ticker').value=an.dataset.an;window.scrollTo(0,0);
  }else if(go)show(go.dataset.go);
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-briefAt>10*60e3){loadBrief();refreshPrices()}else if(!document.hidden)renderToday()});
setInterval(()=>{if(!document.hidden)renderToday()},60e3);
/* ---------- Delayed prices (Yahoo via /api/quotes) ---------- */
let pricesAt=0,priceNote='';
// A fetched quote only replaces a stored price when it is newer than that price's timestamp (see Tracker.applyQuotes).
async function refreshPrices(manual){
  // stocks outside the built-in list carry their Bursa code ("TICKER@CODE") so they can still be priced
  const tickers=[...new Set(state.positions.filter(p=>okTicker(p.ticker)).map(p=>p.code&&/^[0-9A-Za-z]{1,6}$/.test(p.code)?`${p.ticker}@${p.code}`:p.ticker))].slice(0,12);
  if(!tickers.length){priceNote='';$('pnote').textContent=manual?'Add a position first.':'';return}
  if(manual){$('pyahoo').disabled=true;$('pnote').textContent='Fetching delayed prices…'}
  try{
    const r=await fetch('/api/quotes?tickers='+encodeURIComponent(tickers.join(',')));
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||'quotes '+r.status);
    const res=Tracker.applyQuotes(state.positions,d.quotes,Date.now());
    state.positions=res.positions;save();pricesAt=Date.now();
    priceNote=(d.failed&&d.failed.length?`No quote for ${d.failed.map(f=>f.ticker).join(', ')}. `:'')
      +(res.changed?`Updated ${res.changed} price${res.changed===1?'':'s'} (delayed about 15 minutes).`:'Prices already up to date.');
  }catch(e){priceNote='Live prices unavailable right now; your stored prices are unchanged.'}
  $('pnote').textContent=priceNote;$('pyahoo').disabled=false;
  renderTracker();
}
$('pyahoo').onclick=()=>refreshPrices(true);
loadBrief();refreshPrices();

/* ---------- Import from Moomoo (read-only, through the bridge on the user's own computer) ---------- */
let importPending=null;
$('pimport').onclick=async()=>{
  const env=$('ienv').value;
  $('pimport').disabled=true;$('ipreview').innerHTML='<div class="mut"><span class="spin"></span> Asking Moomoo (read-only)…</div>';
  try{
    let r,d;
    try{
      r=await fetch(`http://127.0.0.1:8787/portfolio?market=MY&trd_env=${env}`,{headers:{Authorization:'Bearer '+$('btok').value}});
      d=await r.json().catch(()=>({}));
    }catch(e){throw new Error(MoomooImport.explainBridgeError(0,null,true))}
    if(!r.ok)throw new Error(MoomooImport.explainBridgeError(r.status,d,false));
    showImportPreview(MoomooImport.parseBrokerPortfolio(d,stocks),env);
  }catch(e){$('ipreview').innerHTML=`<div class="errbox">${esc(e.message)}</div>`}
  $('pimport').disabled=false;
};
function showImportPreview(parsed,env){
  importPending={parsed,env};
  const m=MoomooImport.mergeBrokerPositions(state.positions,parsed.positions,{nowMs:Date.now()});
  const f=parsed.funds,myr=f&&(f.currency==='MYR'),cashDiffers=f&&Math.abs((+state.cash||0)-f.free)>0.005;
  const cashOffer=f&&cashDiffers&&(myr||!f.currency||f.currency==='N/A');
  let h=`<div class="card pv"><h4>Moomoo ${env==='REAL'?'real':'paper'} account: ${parsed.positions.length} Bursa position${parsed.positions.length===1?'':'s'}${f?`, cash ${f.currency||''} ${f.cash.toFixed(2)}`:''}</h4>`;
  if(m.added.length)h+=`<b>New</b><ul>${m.added.map(a=>`<li><b>${esc(a.ticker)}</b> ${a.qty} @ ${a.cost}<label style="display:inline">&nbsp;cap size <select data-newtype="${esc(a.ticker)}"><option value="small">small (12%)</option><option value="mid" selected>mid (9%)</option><option value="large">large (7%)</option></select></label></li>`).join('')}</ul>`;
  if(m.updated.length)h+=`<b>Updated</b><ul>${m.updated.map(u=>`<li><b>${esc(u.ticker)}</b> shares ${u.qtyFrom} → ${u.qtyTo}, cost ${u.costFrom} → ${u.costTo}</li>`).join('')}</ul>`;
  if(m.unchanged.length)h+=`<p class="small mut">Already matching: ${m.unchanged.map(esc).join(', ')}</p>`;
  if(m.missing.length)h+=`<p><b>Not in Moomoo:</b> ${m.missing.map(esc).join(', ')}<label><input type="checkbox" id="irm"> Remove these from my tracker (otherwise they are kept)</label></p>`;
  if(parsed.skipped.length)h+=`<details><summary class="small mut">${parsed.skipped.length} skipped</summary><ul>${parsed.skipped.map(x=>`<li>${esc(x.name)} (${esc(x.code)}): ${esc(x.reason)}</li>`).join('')}</ul></details>`;
  if(cashOffer)h+=`<label><input type="checkbox" id="icash" ${myr?'checked':''}> Set free cash to RM ${f.free.toFixed(2)} (cash ${f.cash.toFixed(2)}${f.frozen?` minus ${f.frozen.toFixed(2)} on hold`:''})${myr?'':' <span class="mut">(currency not reported, check it first)</span>'}</label>`;
  else if(f&&f.currency&&!myr&&f.currency!=='N/A')h+=`<p class="small mut">Cash not imported: the account reports ${esc(f.currency)}, not MYR.</p>`;
  const nothing=!m.added.length&&!m.updated.length&&!m.missing.length&&!cashOffer;
  h+=nothing?'<p><b>Already up to date.</b> Nothing to change.</p><div class="row"><button class="go" id="icancel">Close</button></div>'
    :'<div class="row"><button class="go" id="iapply">Apply</button><button class="go" id="icancel" style="background:var(--card);color:var(--fg);border:1px solid var(--bd)">Cancel</button></div>';
  $('ipreview').innerHTML=h+'</div>';
}
$('ipreview').addEventListener('click',e=>{
  if(e.target.id==='icancel'){importPending=null;$('ipreview').innerHTML='';return}
  if(e.target.id!=='iapply'||!importPending)return;
  const {parsed}=importPending,types={};
  document.querySelectorAll('#ipreview [data-newtype]').forEach(sel=>{types[sel.dataset.newtype]=sel.value});
  const res=MoomooImport.mergeBrokerPositions(state.positions,parsed.positions,{removeMissing:!!($('irm')&&$('irm').checked),nowMs:Date.now(),types});
  state.positions=res.positions;
  const cashOn=$('icash')&&$('icash').checked;
  if(cashOn){state.cash=String(parsed.funds.free);$('cash').value=state.cash}
  save();importPending=null;
  const bits=[res.added.length&&`${res.added.length} added`,res.updated.length&&`${res.updated.length} updated`,res.removed.length&&`${res.removed.length} removed`,cashOn&&'cash set'].filter(Boolean);
  $('ipreview').innerHTML=`<div class="card pv"><b>Imported from Moomoo:</b> ${bits.join(', ')||'no changes'}. Check each position's plan and cap size in the table below.</div>`;
  renderTracker();
});

/* ---------- Pre-trade check ---------- */
function fillCheckList(){$('ctl').innerHTML=stocks.map(s=>`<option value="${esc(s.ticker)}">${esc(s.name)}</option>`).join('')}
async function marketForCheck(t){
  try{
    const r=await fetch(`/api/odds?ticker=${encodeURIComponent(t)}&stop=${Tracker.RULES.initialStop}&target=${Tracker.RULES.target}&horizon=30`);
    return r.ok?await r.json():null;
  }catch(e){return null}
}
async function newsForCheck(t){
  try{
    const r=await fetch('/api/brief?tickers='+encodeURIComponent(t));
    if(!r.ok)return null;
    const d=await r.json();
    return Today.newsForCheck(d.tickers&&d.tickers[t],new Date());
  }catch(e){return null}
}
$('cp').oninput=()=>{$('cp').dataset.t='1'};
$('se').addEventListener('input',()=>{if(!$('cp').dataset.t)$('cp').value=$('se').value});
const CK_ICON={pass:'✓',warn:'⚠',block:'✕',info:'ℹ'};
const CK_TEXT={PASS:'Within your rules. Not a buy signal.',WARN:'Allowed, but read the warnings first.',BLOCK:'Breaks a rule. Fix it or skip this trade.'};
$('cgo').onclick=async()=>{
  const t=$('ct').value.trim().toUpperCase();
  if(!/^[A-Z0-9.&-]{1,20}$/.test(t)){$('cout').innerHTML='<div class="errbox">Enter a ticker, e.g. INARI.</div>';return}
  $('cgo').disabled=true;$('cout').innerHTML='<div class="mut"><span class="spin"></span> Checking your rules, news and price history…</div>';
  const [news,market]=await Promise.all([newsForCheck(t),marketForCheck(t)]);
  if(market&&market.price>0&&!+$('cp').value)$('cp').value=market.price;
  const r=Tracker.preTradeCheck({ticker:t,qty:+$('cq').value,price:+$('cp').value,positions:state.positions,cash:state.cash,riskPct:(+$('sr').value||2)/100,news,market});
  $('cout').innerHTML=`<div class="verdict ${r.verdict}">${r.verdict}: ${CK_TEXT[r.verdict]}</div>`
    +r.checks.map(c=>`<div class="ck ${c.level}"><span>${CK_ICON[c.level]}</span><span>${esc(c.text)}</span></div>`).join('')
    +'<p class="note">A rules check, not a recommendation. A PASS never means "buy".</p>';
  $('cgo').disabled=false;
};

renderTracker();
