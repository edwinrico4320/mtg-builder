(() => {
  const setCodes = Array.from(new Set((window.RECOMMENDED_SETS || []).map(s => String(s).toUpperCase())));
  let discoveredSets = [];
  let loadedManifest = null;

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

  function getGitHubRepoInfo(){
    const host = location.hostname.toLowerCase();
    const parts = location.pathname.split('/').filter(Boolean);
    if(host.endsWith('.github.io') && parts.length){
      return { owner: host.replace('.github.io',''), repo: parts[0], branch: 'main' };
    }
    return { owner: 'edwinrico4320', repo: 'mtg-builder', branch: 'main' };
  }

  async function listRepoJsonCodes(){
    const {owner, repo, branch} = getGitHubRepoInfo();
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/data/json?ref=${encodeURIComponent(branch)}`;
    const res = await fetch(url, { headers:{'Accept':'application/vnd.github+json'}, cache:'no-store' });
    if(!res.ok) throw new Error(`GitHub folder scan failed (HTTP ${res.status})`);
    const items = await res.json();
    if(!Array.isArray(items)) throw new Error('GitHub returned an unexpected folder response.');
    return items
      .filter(item => item.type === 'file' && /\.json$/i.test(item.name))
      .map(item => ({
        code: item.name.replace(/\.json$/i,'').toUpperCase(),
        sha: item.sha || '',
        sourceBytes: Number(item.size || 0)
      }))
      .sort((a,b) => a.code.localeCompare(b.code));
  }

  async function scanCatalogSets(){
    const select = $('catalogSetSelect');
    select.innerHTML = '<option value="">Scanning GitHub data/json...</option>';
    discoveredSets = [];
    log('catalogSummary','Reading the current data/json folder from GitHub...');
    let codes;
    try{
      codes = await listRepoJsonCodes();
    }catch(err){
      console.warn(err);
      codes = setCodes.map(code => ({code, sha:'', sourceBytes:0}));
      log('catalogSummary', `Automatic GitHub scan failed; checking the fallback list instead. ${err.message}`);
    }
    if(!codes.length){
      select.innerHTML = '<option value="">No JSON files found</option>';
      log('catalogSummary','No .json files were found in data/json.');
      return;
    }
    let checked=0;
    for(const entry of codes){
      const code = typeof entry === 'string' ? entry : entry.code;
      try{
        const data = await fetchSet(code);
        const cards = getCards(data);
        discoveredSets.push({ code, name: data.name || code, releaseDate: data.releaseDate || '', cardCount: cards.length, sourceSha: entry.sha || '', sourceBytes: entry.sourceBytes || 0 });
      }catch(err){ console.warn(`Skipped ${code}`, err); }
      checked++;
      log('catalogSummary', `Reading set metadata ${checked}/${codes.length}...`);
    }
    select.innerHTML = '';
    if(!discoveredSets.length){
      select.innerHTML = '<option value="">No readable sets found</option>';
      log('catalogSummary','JSON filenames were found, but none could be read as MTGJSON set files.');
      return;
    }
    discoveredSets.sort((a,b)=> (a.name||a.code).localeCompare(b.name||b.code));
    for(const s of discoveredSets){
      const opt = document.createElement('option'); opt.value = s.code; opt.textContent = `${s.name} (${s.code})`; select.appendChild(opt);
    }
    log('jsonStatus', `${discoveredSets.length} sets discovered automatically`);
    renderBatchSetList();
    await loadBuildManifest();
    log('catalogSummary', `Discovered ${discoveredSets.length} sets from the live GitHub data/json folder.`);
  }

  function renderBatchSetList(){
    const box = $('batchSetList');
    if(!box) return;
    if(!discoveredSets.length){ box.innerHTML = '<p class="hint">No sets discovered.</p>'; return; }
    box.innerHTML = discoveredSets.map(s => `<label class="batch-set-item"><input class="batch-set-checkbox" type="checkbox" value="${esc(s.code)}" checked><span><strong>${esc(s.name)}</strong><small>${esc(s.code)} · ${esc(s.cardCount)} cards</small></span></label>`).join('');
  }

  function setAllBatchChecks(checked){
    document.querySelectorAll('.batch-set-checkbox').forEach(cb => { cb.checked = checked; });
  }

  function getCheckedSets(){
    const selected = new Set(Array.from(document.querySelectorAll('.batch-set-checkbox:checked')).map(cb => cb.value));
    return discoveredSets.filter(s => selected.has(s.code));
  }

  function byteLength(text){ return new Blob([text]).size; }
  function formatBytes(bytes){
    if(bytes < 1024) return `${bytes} B`;
    if(bytes < 1024*1024) return `${(bytes/1024).toFixed(1)} KB`;
    return `${(bytes/(1024*1024)).toFixed(2)} MB`;
  }

  function compatibilityForSize(bytes){
    if(bytes < 750*1024) return {label:'Excellent', cls:'status-good'};
    if(bytes < 2*1024*1024) return {label:'Likely compatible', cls:'status-good'};
    if(bytes < 5*1024*1024) return {label:'Test on device', cls:'status-warn'};
    return {label:'Large file', cls:'status-large'};
  }

  function optionsSignature(opts=getOptions()){
    return JSON.stringify({
      textSize:opts.textSize, fieldMode:opts.fieldMode, navMode:opts.navMode,
      symbolMode:opts.symbolMode, duplicateMode:opts.duplicateMode,
      generatorVersion:'6.0'
    });
  }

  async function loadBuildManifest(){
    try{
      const res = await fetch('data/output/build-manifest.json', {cache:'no-store'});
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      loadedManifest = await res.json();
    }catch{
      loadedManifest = null;
    }
  }

  function previousManifestEntry(code){
    if(!loadedManifest) return null;
    if(Array.isArray(loadedManifest.sets)) return loadedManifest.sets.find(s => s.setCode === code) || null;
    return loadedManifest.sets?.[code] || null;
  }

  function isChangedOrNew(set, opts=getOptions()){
    const previous = previousManifestEntry(set.code);
    if(!previous) return true;
    if(previous.optionsSignature !== optionsSignature(opts)) return true;
    if(set.sourceSha && previous.sourceSha) return set.sourceSha !== previous.sourceSha;
    return false;
  }

  async function analyzeSets(sets){
    if(!sets.length){ log('catalogSummary','Select at least one set to analyze.'); return []; }
    const report = $('sizeReport');
    report.innerHTML = '<p class="hint">Analyzing selected sets...</p>';
    const rows=[];
    let i=0;
    for(const s of sets){
      i++;
      log('catalogSummary', `Analyzing ${i}/${sets.length}: ${s.name}`);
      try{
        const data = await fetchSet(s.code);
        const html = generateSetHtml(data, {...getOptions(), code:s.code});
        const bytes = byteLength(html);
        rows.push({...s, outputBytes:bytes, compatibility:compatibilityForSize(bytes)});
      }catch(err){
        rows.push({...s, outputBytes:0, error:err.message, compatibility:{label:'Error',cls:'status-large'}});
      }
    }
    report.innerHTML = `<table class="report-table"><thead><tr><th>Set</th><th>Cards</th><th>Source JSON</th><th>Output HTML</th><th>Compatibility</th></tr></thead><tbody>${rows.map(r=>`<tr><td><strong>${esc(r.name)}</strong><br><small>${esc(r.code)}</small></td><td>${esc(r.cardCount)}</td><td>${formatBytes(r.sourceBytes||0)}</td><td>${r.error?'—':formatBytes(r.outputBytes)}</td><td class="${r.compatibility.cls}">${esc(r.compatibility.label)}${r.error?`<br><small>${esc(r.error)}</small>`:''}</td></tr>`).join('')}</tbody></table>`;
    log('catalogSummary', `Analyzed ${rows.length} set(s).`);
    return rows;
  }

  function manaToHtml(text, embedded){
    const raw = esc(text || '');
    if(!embedded) return raw;
    const symbols = window.MTG_SYMBOLS || {};
    return raw.replace(/\{([^}]+)\}/g, (_, sym) => {
      const key = String(sym).toUpperCase();
      const src = symbols[key];
      if(src) return `<img class="mana" alt="{${esc(key)}}" src="${src}">`;
      return `<span class="mana-fallback">${esc(key.replace('/', '⁄'))}</span>`;
    });
  }

  function faceFromCard(c, index){
    return {
      name: c.faceName || c.name || `Face ${index + 1}`,
      manaCost: c.manaCost || '',
      type: c.type || '',
      text: cardText(c),
      flavorText: c.flavorText || '',
      power: c.power || '',
      toughness: c.toughness || '',
      loyalty: c.loyalty || '',
      defense: c.defense || '',
      side: c.side || '',
      number: c.number || ''
    };
  }

  function collectCardFaces(c, linkedCards){
    const explicit = c.cardFaces || c.faces;
    if(Array.isArray(explicit) && explicit.length){
      return explicit.map((f,i)=>faceFromCard(f,i));
    }
    if(linkedCards && linkedCards.length > 1){
      return linkedCards
        .slice()
        .sort((a,b)=>String(a.side||'').localeCompare(String(b.side||'')) || String(a.number||'').localeCompare(String(b.number||''),undefined,{numeric:true}))
        .map((f,i)=>faceFromCard(f,i));
    }
    return [];
  }

  function groupLinkedCards(cards){
    const byId = new Map();
    cards.forEach(c => {
      const id = c.uuid || c.identifiers?.mtgjsonV4Id || c.identifiers?.scryfallId;
      if(id) byId.set(id,c);
    });
    const visited = new Set();
    const groups = [];
    cards.forEach(c => {
      if(visited.has(c)) return;
      const ids = Array.isArray(c.otherFaceIds) ? c.otherFaceIds : [];
      const linked = [c, ...ids.map(id=>byId.get(id)).filter(Boolean)];
      const unique = [...new Set(linked)];
      unique.forEach(x=>visited.add(x));
      groups.push(unique);
    });
    return groups;
  }

  function normalizeCards(cards, duplicateMode){
    const out=[]; const seen = new Map();
    groupLinkedCards(cards).forEach((group, idx) => {
      const c = group[0];
      const faces = collectCardFaces(c, group);
      const n = {
        number: c.number || c.identifiers?.mtgjsonV4Id || idx+1,
        name: c.name || (faces.length ? faces.map(f=>f.name).join(' // ') : c.faceName) || 'Unnamed Card',
        manaCost: c.manaCost || '',
        manaValue: c.manaValue ?? c.convertedManaCost ?? '',
        type: c.type || '',
        text: cardText(c),
        flavorText: c.flavorText || '',
        power: c.power || '', toughness: c.toughness || '', loyalty: c.loyalty || '', defense: c.defense || '',
        rarity: c.rarity || '', artist: c.artist || '', layout: c.layout || '',
        faces,
        original: c
      };
      const faceKey = faces.map(f=>[f.name,f.manaCost,f.type,f.text,f.power,f.toughness,f.loyalty,f.defense].join('~')).join('||');
      const key = [n.name,n.manaCost,n.type,n.text,n.power,n.toughness,n.loyalty,n.defense,faceKey].join('|');
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

  function renderStats(face){
    const stats=[];
    if(face.power || face.toughness) stats.push(`<span><b>Power/Toughness:</b> ${esc(face.power)}/${esc(face.toughness)}</span>`);
    if(face.loyalty) stats.push(`<span><b>Loyalty:</b> ${esc(face.loyalty)}</span>`);
    if(face.defense) stats.push(`<span><b>Defense:</b> ${esc(face.defense)}</span>`);
    return stats.length ? `<div class="stats-panel">${stats.join('')}</div>` : '';
  }

  function renderFace(face, symbolImages, index){
    const title = face.name ? `<h3>${esc(face.name)}</h3>` : `<h3>Face ${index+1}</h3>`;
    const identity = `<div class="identity-panel">${face.manaCost?`<div><b>Mana Cost:</b> <span class="mana-line">${manaToHtml(face.manaCost,symbolImages)}</span></div>`:''}${face.type?`<div><b>Type:</b> ${esc(face.type)}</div>`:''}</div>`;
    const rules = face.text ? `<div class="rules-panel"><b>Rules Text</b><div>${manaToHtml(face.text,symbolImages).replace(/\n/g,'<br>')}</div></div>` : '';
    const flavor = face.flavorText ? `<div class="flavor-panel"><b>Flavor Text</b><div><i>${esc(face.flavorText).replace(/\n/g,'<br>')}</i></div></div>` : '';
    return `<section class="face-panel">${title}${identity}${rules}${renderStats(face)}${flavor}</section>`;
  }

  function generateSetHtml(data, opts){
    const setCode = (data.code || opts.code || '').toUpperCase();
    const setName = data.name || setCode || 'Magic Set';
    let cards = normalizeCards(getCards(data), opts.duplicateMode).map((c,i)=>({...c,id:safeId(c.name,i)}));
    const symbolImages = opts.symbolMode === 'embedded';
    const bodyClass = `size-${opts.textSize}`;
    const full = opts.fieldMode === 'full';
    const nav = buildNav(cards, opts.navMode);
    const cardBlocks = cards.map(c => {
      const hasFaces = Array.isArray(c.faces) && c.faces.length > 1;
      const identity = `<div class="identity-panel">${c.manaCost?`<div><b>Mana Cost:</b> <span class="mana-line">${manaToHtml(c.manaCost,symbolImages)}</span></div>`:''}${c.type?`<div><b>Type:</b> ${esc(c.type)}</div>`:''}${c.layout?`<div><b>Layout:</b> ${esc(c.layout)}</div>`:''}</div>`;
      const rules = c.text ? `<div class="rules-panel"><b>Rules Text</b><div>${manaToHtml(c.text,symbolImages).replace(/\n/g,'<br>')}</div></div>` : '';
      const flavor = c.flavorText ? `<div class="flavor-panel"><b>Flavor Text</b><div><i>${esc(c.flavorText).replace(/\n/g,'<br>')}</i></div></div>` : '';
      const faces = hasFaces ? `<div class="faces-wrap"><h3 class="faces-heading">Card Faces</h3>${c.faces.map((f,i)=>renderFace(f,symbolImages,i)).join('')}</div>` : '';
      const details = full && (c.rarity || c.artist || c.number) ? `<div class="details-panel"><b>Printing Details</b>${c.rarity?`<div>Rarity: ${esc(c.rarity)}</div>`:''}${c.artist?`<div>Artist: ${esc(c.artist)}</div>`:''}${c.number?`<div>Collector Number: ${esc(c.number)}</div>`:''}</div>` : '';
      const printings = c.printings.length > 1 ? `<details class="printings-panel" open><summary>Alternate printings in this set (${c.printings.length})</summary><ul>${c.printings.map(p=>`<li>#${esc(p.number)}${p.artist?` — ${esc(p.artist)}`:''}${p.rarity?` — ${esc(p.rarity)}`:''}</li>`).join('')}</ul></details>` : '';
      return `<article class="card" id="${c.id}"><header class="card-header"><h2>${esc(c.name)}</h2></header>${identity}${hasFaces?'':rules}${hasFaces?'':renderStats(c)}${hasFaces?'':flavor}${faces}${details}${printings}<p class="back-link"><a href="#top">Back to top</a></p></article>`;
    }).join('\n');
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(setName)}</title><style>body{font-family:Arial,Helvetica,sans-serif;margin:0;background:#ececec;color:#111;line-height:1.48}.wrap{max-width:900px;margin:0 auto;padding:16px}.title{text-align:center;font-size:2.2em;margin:.5em 0}.meta{text-align:center;color:#444;margin-bottom:1.5em}.nav,.card{background:#fff;border:1px solid #aaa;border-radius:8px;margin:14px 0}.nav{padding:14px}.nav a{display:inline-block;margin:4px 8px 4px 0;padding:4px 7px;border:1px solid #bbb;border-radius:4px;text-decoration:none;color:#0645ad;background:#fafafa}.letters a{font-weight:bold}.card{overflow:hidden;border-left:6px solid #444}.card-header{background:#e1e1e1;padding:12px 14px;border-bottom:1px solid #aaa}.card-header h2{margin:0}.identity-panel,.rules-panel,.stats-panel,.flavor-panel,.details-panel,.printings-panel{margin:10px 14px;padding:10px 12px;border:1px solid #bbb;border-radius:6px}.identity-panel{background:#f7f7f7}.identity-panel>div+div{margin-top:6px}.rules-panel{background:#f1ead8}.rules-panel>b,.flavor-panel>b,.details-panel>b{display:block;margin-bottom:6px}.stats-panel{background:#e5edf5;display:flex;flex-wrap:wrap;gap:12px}.flavor-panel{background:#eee8f1;border-left:5px solid #8d7896}.details-panel{background:#edf2e8}.face-panel{margin:12px 14px;padding:10px;border:2px solid #999;border-radius:7px;background:#fafafa}.face-panel h3{margin:0 0 8px;padding-bottom:6px;border-bottom:1px solid #bbb}.face-panel .identity-panel,.face-panel .rules-panel,.face-panel .stats-panel,.face-panel .flavor-panel{margin:8px 0}.faces-heading{margin:12px 14px 0}.mana{width:22px;height:22px;vertical-align:middle;margin:0 1px}.mana-fallback{display:inline-block;min-width:20px;height:20px;line-height:20px;text-align:center;border:1px solid #333;border-radius:50%;background:#ddd;font-size:11px;font-weight:bold;margin:0 1px}.back-link{margin:12px 14px 14px}.size-compact{font-size:14px}.size-comfortable{font-size:17px}.size-large{font-size:20px}summary{font-weight:bold}a{color:#0645ad}</style></head><body class="${bodyClass}"><div class="wrap" id="top"><h1 class="title">${esc(setName)}</h1><div class="meta">${setCode?`Set Code: ${esc(setCode)} · `:''}${cards.length} cards${data.releaseDate?` · Released ${esc(data.releaseDate)}`:''}</div>${nav}<main>${cardBlocks}</main></div></body></html>`;
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
    await delay(400);
    const setMeta = discoveredSets.find(s=>s.code===code) || {code,name:data.name||code,sourceSha:'',sourceBytes:0};
    saveTextFile('build-manifest.json', JSON.stringify(makeManifest([manifestEntryFor(setMeta,data,cards,html)]),null,2), 'application/json');
    log('catalogSummary', `Built ${data.name || code}. Upload ${code}.html, ${code}.index.json, and build-manifest.json to data/output.`);
  }

  async function ensureDiscovered(){ if(!discoveredSets.length) await scanCatalogSets(); return discoveredSets.length; }

  function manifestEntryFor(set, data, cards, html){
    return {
      setCode:set.code,
      setName:data.name || set.name || set.code,
      sourceFile:`data/json/${set.code}.json`,
      sourceSha:set.sourceSha || '',
      sourceBytes:set.sourceBytes || 0,
      outputFile:`${set.code}.html`,
      outputBytes:byteLength(html),
      cardCount:cards.length,
      releaseDate:data.releaseDate || '',
      optionsSignature:optionsSignature(),
      builtAt:new Date().toISOString()
    };
  }

  function makeManifest(entries){
    const previousSets = loadedManifest && loadedManifest.sets && !Array.isArray(loadedManifest.sets)
      ? loadedManifest.sets
      : {};
    const sets={...previousSets};
    entries.forEach(e => { sets[e.setCode]=e; });
    return { generator:'MTG Builder', generatorVersion:'6.0', builtAt:new Date().toISOString(), options:getOptions(), sets };
  }

  async function buildSetBatch(sets, label='selected'){
    if(!sets.length){ log('catalogSummary', `No ${label} sets to build.`); return; }
    log('catalogSummary', `Building ${sets.length} ${label} set(s). Chrome may ask to allow multiple downloads.`);
    const built=[]; let i=0;
    for(const s of sets){
      i++;
      try{
        const data=await fetchSet(s.code);
        const html=generateSetHtml(data,{...getOptions(),code:s.code});
        const cards=normalizeCards(getCards(data),getOptions().duplicateMode);
        saveTextFile(`${s.code}.html`,html,'text/html');
        built.push(manifestEntryFor(s,data,cards,html));
        log('catalogSummary',`Built ${i}/${sets.length}: ${data.name||s.code}`);
        await delay(800);
      }catch(err){
        console.error(err);
        log('catalogSummary',`Error building ${s.code}: ${err.message}`);
        await delay(500);
      }
    }
    const librarySets=built.map(e=>({setCode:e.setCode,setName:e.setName,cardCount:e.cardCount,releaseDate:e.releaseDate,htmlFile:e.outputFile}));
    await delay(500);
    saveTextFile('library-index.html',generateLibraryIndexHtml(librarySets),'text/html');
    await delay(400);
    saveTextFile('library-index.json',JSON.stringify({builtAt:new Date().toISOString(),sets:librarySets},null,2),'application/json');
    await delay(400);
    saveTextFile('build-manifest.json',JSON.stringify(makeManifest(built),null,2),'application/json');
    log('catalogSummary',`Done. Built ${built.length}/${sets.length} set file(s), library index files, and build-manifest.json.`);
  }

  async function buildChecked(){
    await ensureDiscovered();
    await buildSetBatch(getCheckedSets(),'checked');
  }

  async function buildChanged(){
    await ensureDiscovered();
    await loadBuildManifest();
    const changed=discoveredSets.filter(s=>isChangedOrNew(s));
    if(!changed.length){ log('catalogSummary','No new or changed sets were detected for the current output settings.'); return; }
    setAllBatchChecks(false);
    const changedCodes=new Set(changed.map(s=>s.code));
    document.querySelectorAll('.batch-set-checkbox').forEach(cb=>{ cb.checked=changedCodes.has(cb.value); });
    await buildSetBatch(changed,'changed/new');
  }

  async function buildAll(){
    const count = await ensureDiscovered();
    if(!count){ log('catalogSummary','No discovered sets to build.'); return; }
    setAllBatchChecks(true);
    await buildSetBatch(discoveredSets,'discovered');
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
    $('selectAllSetsBtn')?.addEventListener('click', ()=>setAllBatchChecks(true));
    $('selectNoSetsBtn')?.addEventListener('click', ()=>setAllBatchChecks(false));
    $('buildCheckedCatalogsBtn')?.addEventListener('click', buildChecked);
    $('buildChangedCatalogsBtn')?.addEventListener('click', buildChanged);
    $('analyzeCheckedSetsBtn')?.addEventListener('click', async()=>{ await ensureDiscovered(); await analyzeSets(getCheckedSets()); });
    $('buildAllCatalogsBtn')?.addEventListener('click', buildAll);
    $('buildLibraryIndexBtn')?.addEventListener('click', buildLibraryIndexOnly);
    console.log('MTG Builder v6 loaded');
  }
  document.addEventListener('DOMContentLoaded', bind);
})();
