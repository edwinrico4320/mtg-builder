(() => {
  const setCodes = Array.from(new Set((window.RECOMMENDED_SETS || []).map(s => String(s).toUpperCase())));
  let discoveredSets = [];

  const $ = id => document.getElementById(id);
  const log = (id, msg) => { const el = $(id); if (el) el.textContent = msg; };
  const delay = ms => new Promise(r => setTimeout(r, ms));

  function initTabs(){
    document.querySelectorAll('.tab-button').forEach(btn => btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $(btn.dataset.tab).classList.add('active');
    }));
  }

  async function existsInRepo(code){
    try{
      const res = await fetch(`data/json/${code}.json`, { cache:'no-store' });
      return res.ok;
    }catch{return false;}
  }

  async function checkInstalledSets(){
    const list = $('setList');
    list.innerHTML = '';
    let installed = 0;
    log('downloadSummary', 'Checking installed sets...');
    for(const code of setCodes){
      const ok = await existsInRepo(code);
      if(ok) installed++;
      const row = document.createElement('div');
      row.className = 'set-row';
      row.innerHTML = `<strong>${code}</strong><span>data/json/${code}.json</span><span class="${ok?'ok':'missing'}">${ok?'Installed':'Missing'}</span>`;
      list.appendChild(row);
    }
    log('jsonStatus', `${installed} installed / ${setCodes.length} checked`);
    log('downloadSummary', `${installed} installed, ${setCodes.length-installed} missing.`);
  }

  function saveTextFile(filename, text, type='text/plain'){
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function downloadMissingSets(){
    log('downloadSummary','Checking for missing sets...');
    const missing=[];
    for(const code of setCodes){ if(!(await existsInRepo(code))) missing.push(code); }
    if(!missing.length){ log('downloadSummary','No missing recommended sets found.'); return; }
    log('downloadSummary', `Downloading ${missing.length} missing sets. Chrome may ask you to allow multiple downloads.`);
    let done=0, failed=0;
    for(const code of missing){
      try{
        const res = await fetch(`https://mtgjson.com/api/v5/${code}.json`);
        if(!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        saveTextFile(`${code}.json`, text, 'application/json');
        done++;
      }catch(err){
        failed++;
        console.warn('Failed download', code, err);
        window.open(`https://mtgjson.com/api/v5/${code}.json`, '_blank');
      }
      log('downloadSummary', `Downloaded ${done}/${missing.length}. Failed/fallback: ${failed}. Current: ${code}`);
      await delay(900);
    }
    log('downloadSummary', `Done. Downloaded ${done}. Failed/fallback: ${failed}. Upload downloaded JSON files to data/json.`);
  }

  function getSetPayload(json){ return json && json.data ? json.data : json; }
  function getCards(data){ return Array.isArray(data.cards) ? data.cards : []; }
  function esc(v){ return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function cardText(card){ return card.text || card.oracleText || card.faceName || ''; }
  function safeId(s, i){ return 'card-' + String(s || i).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') + '-' + i; }

  async function fetchSet(code){
    const res = await fetch(`data/json/${code}.json`, { cache:'no-store' });
    if(!res.ok) throw new Error(`${code}.json not found in data/json`);
    const json = await res.json();
    return getSetPayload(json);
  }

  async function scanCatalogSets(){
    const select = $('catalogSetSelect');
    select.innerHTML = '<option value="">Scanning...</option>';
    discoveredSets = [];
    log('catalogSummary','Scanning known set codes against data/json...');
    for(const code of setCodes){
      try{
        const data = await fetchSet(code);
        const cards = getCards(data);
        discoveredSets.push({ code, name: data.name || code, releaseDate: data.releaseDate || '', cardCount: cards.length });
      }catch{}
    }
    select.innerHTML = '';
    if(!discoveredSets.length){
      select.innerHTML = '<option value="">No sets found</option>';
      log('catalogSummary','No JSON files found. Make sure files are uploaded to data/json and listed in recommended-sets.js.');
      return;
    }
    discoveredSets.sort((a,b)=> (a.name||a.code).localeCompare(b.name||b.code));
    for(const s of discoveredSets){
      const opt = document.createElement('option'); opt.value = s.code; opt.textContent = `${s.name} (${s.code})`; select.appendChild(opt);
    }
    log('jsonStatus', `${discoveredSets.length} sets discovered`);
    log('catalogSummary', `Discovered ${discoveredSets.length} sets.`);
  }

  function manaToHtml(text, embedded){
    const raw = esc(text || '');
    if(!embedded) return raw;
    // Tiny inline SVG circles with symbol text, self-contained and basic-viewer friendly.
    return raw.replace(/\{([^}]+)\}/g, (_, sym) => {
      const s = esc(sym.toUpperCase().replace('/', '⁄'));
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"><circle cx="11" cy="11" r="10" fill="#eee" stroke="#222"/><text x="11" y="15" font-size="10" text-anchor="middle" font-family="Arial" fill="#111">${s}</text></svg>`;
      return `<img class="mana" alt="{${s}}" src="data:image/svg+xml;utf8,${encodeURIComponent(svg)}">`;
    });
  }

  function normalizeCards(cards, duplicateMode){
    const out=[]; const seen = new Map();
    cards.forEach((c, idx) => {
      const n = {
        number: c.number || c.identifiers?.mtgjsonV4Id || idx+1,
        name: c.name || c.faceName || 'Unnamed Card',
        manaCost: c.manaCost || '',
        manaValue: c.manaValue ?? c.convertedManaCost ?? '',
        type: c.type || '',
        text: cardText(c),
        flavorText: c.flavorText || '',
        power: c.power || '', toughness: c.toughness || '', loyalty: c.loyalty || '', defense: c.defense || '',
        rarity: c.rarity || '', artist: c.artist || '',
        original: c
      };
      const key = [n.name,n.manaCost,n.type,n.text,n.power,n.toughness,n.loyalty,n.defense].join('|');
      if(duplicateMode === 'collapse' && seen.has(key)){
        seen.get(key).printings.push({ number:n.number, artist:n.artist, rarity:n.rarity });
      }else{
        n.printings = [{ number:n.number, artist:n.artist, rarity:n.rarity }];
        seen.set(key,n); out.push(n);
      }
    });
    return out.sort((a,b)=> a.name.localeCompare(b.name) || String(a.number).localeCompare(String(b.number), undefined, {numeric:true}));
  }

  function buildNav(cards, navMode){
    if(navMode === 'plain') return '<nav class="nav"><h2>Cards</h2>' + cards.map((c,i)=>`<a href="#${c.id}">${esc(c.name)}</a>`).join('') + '</nav>';
    const groups = {};
    cards.forEach(c => { const l = (c.name[0] || '#').toUpperCase(); (groups[l] ||= []).push(c); });
    const letters = Object.keys(groups).sort();
    return `<nav class="nav" id="top"><h2>Cards</h2><div class="letters">${letters.map(l=>`<a href="#letter-${esc(l)}">${esc(l)}</a>`).join('')}</div>` + letters.map(l => `<h3 id="letter-${esc(l)}">${esc(l)}</h3>${groups[l].map(c=>`<a href="#${c.id}">${esc(c.name)}</a>`).join('')}`).join('') + '</nav>';
  }

  function generateSetHtml(data, opts){
    const code = data.code || data.baseSetSize ? (data.code || '') : '';
    const setCode = (data.code || opts.code || '').toUpperCase();
    const setName = data.name || setCode || 'Magic Set';
    let cards = normalizeCards(getCards(data), opts.duplicateMode).map((c,i)=>({...c,id:safeId(c.name,i)}));
    const symbolImages = opts.symbolMode === 'embedded';
    const bodyClass = `size-${opts.textSize}`;
    const full = opts.fieldMode === 'full';
    const nav = buildNav(cards, opts.navMode);
    const cardBlocks = cards.map(c => {
      const pt = c.power || c.toughness ? `<p><b>Power/Toughness:</b> ${esc(c.power)}/${esc(c.toughness)}</p>` : '';
      const loyalty = c.loyalty ? `<p><b>Loyalty:</b> ${esc(c.loyalty)}</p>` : '';
      const defense = c.defense ? `<p><b>Defense:</b> ${esc(c.defense)}</p>` : '';
      const fullFields = full ? `${c.rarity?`<p><b>Rarity:</b> ${esc(c.rarity)}</p>`:''}${c.artist?`<p><b>Artist:</b> ${esc(c.artist)}</p>`:''}${c.flavorText?`<p><b>Flavor:</b> <i>${esc(c.flavorText)}</i></p>`:''}` : '';
      const printings = c.printings.length > 1 ? `<details open><summary>Alternate printings in this set (${c.printings.length})</summary><ul>${c.printings.map(p=>`<li>#${esc(p.number)}${p.artist?` — ${esc(p.artist)}`:''}${p.rarity?` — ${esc(p.rarity)}`:''}</li>`).join('')}</ul></details>` : '';
      return `<article class="card" id="${c.id}"><h2>${esc(c.name)}</h2>${c.manaCost?`<p><b>Mana Cost:</b> <span class="mana-line">${manaToHtml(c.manaCost, symbolImages)}</span></p>`:''}${c.type?`<p><b>Type:</b> ${esc(c.type)}</p>`:''}${c.text?`<p class="rules"><b>Text:</b><br>${manaToHtml(c.text, symbolImages).replace(/\n/g,'<br>')}</p>`:''}${pt}${loyalty}${defense}${fullFields}${printings}<p><a href="#top">Back to top</a></p></article>`;
    }).join('\n');
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(setName)}</title><style>body{font-family:Arial,Helvetica,sans-serif;margin:0;background:#f6f6f6;color:#111;line-height:1.45}.wrap{max-width:900px;margin:0 auto;padding:16px}.title{text-align:center;font-size:2.2em;margin:.5em 0}.meta{text-align:center;color:#444;margin-bottom:1.5em}.nav,.card{background:#fff;border:1px solid #bbb;border-radius:8px;margin:12px 0;padding:14px}.nav a{display:inline-block;margin:4px 8px 4px 0;padding:3px 6px;border:1px solid #ccc;border-radius:4px;text-decoration:none;color:#0645ad}.letters a{font-weight:bold}.card{border-left:6px solid #444}.card:nth-child(even){background:#fbfbfb}.card h2{margin-top:0;border-bottom:1px solid #ddd;padding-bottom:6px}.rules{white-space:normal}.mana{width:22px;height:22px;vertical-align:middle;margin:0 1px}.size-compact{font-size:14px}.size-comfortable{font-size:17px}.size-large{font-size:20px}summary{font-weight:bold}a{color:#0645ad}</style></head><body class="${bodyClass}"><div class="wrap" id="top"><h1 class="title">${esc(setName)}</h1><div class="meta">${setCode?`Set Code: ${esc(setCode)} · `:''}${cards.length} cards${data.releaseDate?` · Released ${esc(data.releaseDate)}`:''}</div>${nav}<main>${cardBlocks}</main></div></body></html>`;
  }

  function getOptions(){
    return {
      textSize: $('textSizeSelect').value,
      fieldMode: $('fieldModeSelect').value,
      navMode: $('navModeSelect').value,
      symbolMode: $('symbolModeSelect').value,
      duplicateMode: $('duplicateModeSelect').value
    };
  }

  async function buildSelected(){
    const code = $('catalogSetSelect').value;
    if(!code){ log('catalogSummary','Pick a set first.'); return; }
    log('catalogSummary', `Building ${code}...`);
    const data = await fetchSet(code);
    const html = generateSetHtml(data, {...getOptions(), code});
    const cards = normalizeCards(getCards(data), getOptions().duplicateMode);
    const idx = { setCode: code, setName: data.name || code, cardCount: cards.length, releaseDate: data.releaseDate || '', htmlFile: `${code}.html`, builtAt: new Date().toISOString() };
    saveTextFile(`${code}.html`, html, 'text/html');
    await delay(500);
    saveTextFile(`${code}.index.json`, JSON.stringify(idx,null,2), 'application/json');
    log('catalogSummary', `Built ${data.name || code}. Upload ${code}.html and ${code}.index.json to data/output.`);
  }

  async function ensureDiscovered(){ if(!discoveredSets.length) await scanCatalogSets(); return discoveredSets.length; }

  async function buildAll(){
    const count = await ensureDiscovered();
    if(!count){ log('catalogSummary','No discovered sets to build. Run Scan Available Sets first or add set codes to recommended-sets.js.'); return; }
    log('catalogSummary', `Building ${count} discovered sets. Chrome may ask to allow multiple downloads.`);
    const built=[]; let i=0;
    for(const s of discoveredSets){
      i++;
      try{
        const data = await fetchSet(s.code);
        const html = generateSetHtml(data, {...getOptions(), code:s.code});
        const cards = normalizeCards(getCards(data), getOptions().duplicateMode);
        saveTextFile(`${s.code}.html`, html, 'text/html');
        built.push({ setCode:s.code, setName:data.name||s.name||s.code, cardCount:cards.length, releaseDate:data.releaseDate||'', htmlFile:`${s.code}.html` });
        log('catalogSummary', `Built ${i}/${count}: ${data.name || s.code}`);
        await delay(800);
      }catch(err){
        console.error(err);
        log('catalogSummary', `Error building ${s.code}: ${err.message}`);
        await delay(800);
      }
    }
    await delay(800);
    saveTextFile('library-index.html', generateLibraryIndexHtml(built), 'text/html');
    await delay(500);
    saveTextFile('library-index.json', JSON.stringify({ builtAt:new Date().toISOString(), sets:built }, null, 2), 'application/json');
    log('catalogSummary', `Done. Built ${built.length}/${count} set files plus library-index.html/json.`);
  }

  function generateLibraryIndexHtml(sets){
    sets.sort((a,b)=>(a.setName||a.setCode).localeCompare(b.setName||b.setCode));
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MTG Library</title><style>body{font-family:Arial,Helvetica,sans-serif;margin:0;background:#f6f6f6;color:#111}.wrap{max-width:800px;margin:0 auto;padding:16px}h1{text-align:center}.set{background:white;border:1px solid #bbb;border-radius:8px;margin:10px 0;padding:12px}a{font-size:1.2em;font-weight:bold;color:#0645ad}</style></head><body><div class="wrap"><h1>MTG Library</h1><p>${sets.length} generated sets</p>${sets.map(s=>`<div class="set"><a href="${esc(s.htmlFile)}">${esc(s.setName)}</a><br><small>${esc(s.setCode)} · ${esc(s.cardCount)} cards${s.releaseDate?` · ${esc(s.releaseDate)}`:''}</small></div>`).join('')}</div></body></html>`;
  }

  async function buildLibraryIndexOnly(){
    const count = await ensureDiscovered();
    if(!count){ log('catalogSummary','No discovered sets found.'); return; }
    const sets = discoveredSets.map(s => ({ setCode:s.code, setName:s.name, cardCount:s.cardCount, releaseDate:s.releaseDate, htmlFile:`${s.code}.html` }));
    saveTextFile('library-index.html', generateLibraryIndexHtml(sets), 'text/html');
    await delay(500);
    saveTextFile('library-index.json', JSON.stringify({ builtAt:new Date().toISOString(), sets }, null, 2), 'application/json');
    log('catalogSummary', `Built library-index files for ${sets.length} discovered sets.`);
  }

  function bind(){
    initTabs();
    $('checkSetsBtn')?.addEventListener('click', checkInstalledSets);
    $('downloadMissingBtn')?.addEventListener('click', downloadMissingSets);
    $('scanCatalogSetsBtn')?.addEventListener('click', scanCatalogSets);
    $('buildCatalogBtn')?.addEventListener('click', buildSelected);
    $('buildAllCatalogsBtn')?.addEventListener('click', buildAll);
    $('buildLibraryIndexBtn')?.addEventListener('click', buildLibraryIndexOnly);
    console.log('MTG Builder v4.1 loaded');
  }
  document.addEventListener('DOMContentLoaded', bind);
})();
