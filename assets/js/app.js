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

  function formatRulesText(text, symbolImages){
    return manaToHtml(text, symbolImages)
      .replace(/\(([^()]+)\)/g, '<span class="reminder">($1)</span>')
      .replace(/\n/g,'<br>');
  }

  function renderStats(face){
    const stats=[];
    if(face.power || face.toughness) stats.push(`<span class="stat-badge"><small>P/T</small><strong>${esc(face.power)}/${esc(face.toughness)}</strong></span>`);
    if(face.loyalty) stats.push(`<span class="stat-badge"><small>Loyalty</small><strong>${esc(face.loyalty)}</strong></span>`);
    if(face.defense) stats.push(`<span class="stat-badge"><small>Defense</small><strong>${esc(face.defense)}</strong></span>`);
    return stats.length ? `<div class="stats-panel">${stats.join('')}</div>` : '';
  }

  function renderFace(face, symbolImages, index){
    const title = face.name ? esc(face.name) : `Face ${index+1}`;
    const mana = face.manaCost ? `<span class="header-mana">${manaToHtml(face.manaCost,symbolImages)}</span>` : '';
    const identity = (face.type || face.side) ? `<div class="identity-panel">${face.type?`<div class="type-line">${esc(face.type)}</div>`:''}${face.side?`<div class="layout-line">Face: ${esc(face.side)}</div>`:''}</div>` : '';
    const rules = face.text ? `<div class="rules-panel"><div class="section-label">Oracle Text</div><div>${formatRulesText(face.text,symbolImages)}</div></div>` : '';
    const flavor = face.flavorText ? `<div class="flavor-panel"><div class="section-label">Flavor Text</div><div>${esc(face.flavorText).replace(/\n/g,'<br>')}</div></div>` : '';
    return `<section class="face-panel"><div class="face-title"><h3>${title}</h3>${mana}</div>${identity}${rules}${renderStats(face)}${flavor}</section>`;
  }


  const RARITY_ICONS = {"common":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAABj0lEQVR42u2YPa6CQBDH/7s8D2FBQjiADZ2hI6Gj9w6egdByBYw1Z9AL0BlvQOiMhc1WG5v3Kt+HAZZlP0SfUxGyGX7M7H92Z4C3vbgRVQe+73+K1tR1TawDDgHTAUp0gAVB0Ln+cDgogZKxYH1QQ2GHgBJZuDFgfaAiSGob7t6PaC+TIXC6wPqi2RVJqlOlJsoVlUmHCRP5p49KbRtkWxQpJm700dETRXHyEfzQodwoihDHMTjn4Jxjs9ngcrkoKfpWdqiqcheLBcIwRJqmyLIMu90O6/Vam6KVU5wkCcqyxPV6BQAcj0ecz2c4jqM/xWPMdV00TfPnXVEU5lQs7YBSu2VG1k6nEzzP+zncCRm9B40A7vd7rFYrzGYzAMByufx+nsQerKoK8/kceZ6DMQbGGLbbrZmmycTdT/UiS3V1XzrtN8fzXRZu9G3dmI303mfx+SL4iCj29SVURlmmlStVqG0ruut7QghTtXFo805l/kxXumUmC68xmxG1BZOYbumYPFiZD44BncoZ/z/tC8eXw3YOsxLPAAAAAElFTkSuQmCC","uncommon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAABNklEQVR42u2YOwrCQBCG/x29RzQ5lKCCItpo6V1sBLEQewvBc/jCKjdxtRIkJPtIZjcPnS4QJl/+yT/ZGeAfDQ9RNEEYhi/dPXEcC++AJmAcoIIDbLXZZ94/n/QLgYq8YCooU1gTUGELlwdMBaqDJN9wyTy6b1mYwHGBqdTMUpI4XeqiXZFNOVyELj+VVdo0yDQVCRUPKls9nYr1UjCvc5eLqfK6iKOpDOfaOLp+JvkDlgEoSEBKCQCQ8glqUbUAg06Ex+0CALhfzwi6ERtgmyNJbzDCbrvG6XgAAAzHMzdDk4uzX9GDLHFNX5zxzVE/F3/o06YxH+VNVrGefdC3iqq5hGyc5dq5Vo3at6OznqeFcNUbTYd3snkzrnLbbBaasZvRjQWV2G5xbB687AfzgFblH/+b8QZj7KBjyHZ92AAAAABJRU5ErkJggg==","rare":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAABgklEQVR42mNgGAXDHDBSaoCSktJ/Qmru3bvHSHcHEuMwajiUkRoO29QrilO9X/FrihzKSK7D8DmKWMcS41BGUh1HjsPwOZSQI5no7Th0cwilZUZiHEcth+ELTVwhyUTNXEqL4oqJlOigBSBkPtNARS02R2ILRSaGQQ6YBjr0CIXioA9BFmrlXE3fgwzf319jYGRkYGBi4WZ4cbmf4eub82TnaFixw0StnPv/32+GB0cyGe4fzmR4eraRQUKvhCo5miZR/OPTPQZWDlHaZBJqAB4xc4avb85QPw1S1PJlYmVQsJnOwMjEwsDOI89wZ1/k4HIgLA0yMDAwiKjGMgjIeTO8ubVocEbxl1cnGTgFtQZvGvz15REDB58qAwMj5cYz0rrtR2lDlolavS9qAmR3DL3GAsz12Hpj9Ihe9FgceiE4EKGIr1/CRErOonXOJakcpHeOxmUfQUfQqmwktvPORIrPqBXdpIwsDI+xGULdgkExukWNkQe6jA+S49DBUsePTAAAlQW4DX6EuWcAAAAASUVORK5CYII=","mythic":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAABj0lEQVR42u2YvU7DMBSFjy/iTxkYEEKFoVJYqgplRlSCF2Bh4SEY2HiPLux9CGb+kRhLiYS6RIgnYHAEtCphgEpQJXHs2IlTuGNkOV/Ozbn2vcB/THmwvBu4rhuJ1gRBwAoHzAKmA5TpADvdGiWu37ubyQXKVMHSoLLCZgFlsnAqYGmgIkgqGm5yH9G/zLLA6QJLUzNJSdLpUhPlimTSYSJE+1NZqY2DjFORYHlQ2eqJVKyWgirObXT6WD86+fVs7bCNRqevxdGU17nRcID52gZA36cDY5hbrSMaDrQ4WkuK3558LLoeAGCh3sT786M5k6gE713C8XYBAI63A967sgswfLiGs9n6AmxuI/Rv7AIc8RcgijC7XAMAfLxyuwABgN9fYOXgGKF/a7ZQKwN2z7DU2gfvnptrmkzc/fJeZElX96UzfnJU77Iwpo/rxopI72QWq6dgGSqm9SUk4yzTzpWqg0U7Oul9QghTtTFr804yX6Yr3TKThemYzYjaAiumWzomD4XMB1VAbTnj/2Z8Ar4XvXoDbk0QAAAAAElFTkSuQmCC","special":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAABxklEQVR42u2Yv0sCYRjHv/d6iFgoRC1BDQYRQUMURUON/aCtKYeGiMbGmqJo6R8QmqKlxSVpjMSgyRQMSagovMUIooaMtJK8axJC9N778dx5Wt/5eP3c8/X73Ps8wL9aXILZAwKBgMJ7RpIkwXZALWAUoAIF2OLQTt3nw5ltU6CCUTA1KK2wWkAFvXBGwNRAeZDMbrjqc3j/ZUELHBWYWjXrVZJRptSKdsX02GGFeOezRllbC7JWFRkcLtbo6vGq6PgKilTJ7e7rwMzSMFwig1yWcRSKI/9SNJzoStthVMldWJtAJBTH/mYUiZN7zC2PkCRapLKi3e+B6HYBAG6TDyjkP+ktNqPTwzRWd6dxl3pE+lyClHlyFuDlWRY3yRwGx3swvzKK64scYuEr+jZjRG0+D3oHuvDxXkIqlsXBVgxjs/3W9EEjUqAguD4Jf6cXAOD1ufH6XHCOxcW3LxzvJRDcmMJ3qQxZVhAJxemHJivufmYvsoxq+qLUb47muyxU6GtNY3bYW+1i81WwEVVUm0uYnmRZnVxdjdruRNf7PS6EVb1R6/DO9LwZld16NgutsZvhjQWO2G5RbB5s2Q8aAXXKN/5v6gdo2tXhZKLjPwAAAABJRU5ErkJggg==","bonus":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAABfklEQVR42mNgGAXDHDBSaoCSktJ/Qmru3bvHSHcHEuMwajiUkRoOi9BtxKl+xeV6ihzKSK7D8DmKWMcS41BGUh1HjsPwOZSQI5no7Th0cwilZUZiHEcth+ELTVwhyUTNXEqL4oqJlOigBSBkPtNARS02R2ILRSaGQQ6YBjr0CIXioA9BFmrl3IZVkQxPbr9hYGRgZGDnYmXYs+wiw43TT8jO0bBih4VaOffvn38Mc6p3MzAwMDBIKggyxFQ7kOzACN1GjOqQJlH84uF7hn///tMmk1Cl0NWVYNg65wz10yAlgJmFiSGl1ZWBhYWZQVpVmOHepRdkp0GaOBA5DYrLCzCktbsP3ij+/vknw7vnnwdnFP//B+FvmH6S+p0mWrT9KG3IMlGr90VNgOyOoddYgLkeW2+MHtGLHotDLwQHIhTx9UuYSMlZtM65JBXU9M7RuOwj6AhalY3Edt6ZSPEZtaKblJGF4TE2Q6hbMChGt6gx8kCX8UFyHDpY6viRCQD/wcC0IwEUhwAAAABJRU5ErkJggg=="};

  function rarityIcon(rarity){
    const key = String(rarity || '').toLowerCase();
    const src = RARITY_ICONS[key] || RARITY_ICONS.special;
    if(!rarity) return '';
    return `<img class="rarity-icon" src="${src}" alt="${esc(rarity)}" title="${esc(rarity)}">`;
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
      const mana = c.manaCost ? `<span class="header-mana">${manaToHtml(c.manaCost,symbolImages)}</span>` : '';
      const identity = (c.type || c.layout) ? `<div class="identity-panel">${c.type?`<div class="type-line">${esc(c.type)}</div>`:''}${c.layout?`<div class="layout-line">Layout: ${esc(c.layout)}</div>`:''}</div>` : '';
      const rules = c.text ? `<div class="rules-panel"><div class="section-label">Oracle Text</div><div>${formatRulesText(c.text,symbolImages)}</div></div>` : '';
      const flavor = c.flavorText ? `<div class="flavor-panel"><div class="section-label">Flavor Text</div><div>${esc(c.flavorText).replace(/\n/g,'<br>')}</div></div>` : '';
      const faces = hasFaces ? `<div class="faces-wrap"><h3 class="faces-heading">Card Faces</h3>${c.faces.map((f,i)=>renderFace(f,symbolImages,i)).join('')}</div>` : '';
      const rarity = c.rarity ? rarityIcon(c.rarity) : '';
      const footerParts = [];
      if(c.number) footerParts.push(`#${esc(c.number)}`);
      if(c.artist) footerParts.push(`Artist: ${esc(c.artist)}`);
      const footer = (rarity || footerParts.length) ? `<footer class="card-footer"><span class="rarity-wrap">${rarity}</span><span class="footer-text">${footerParts.join(' · ')}</span></footer>` : '';
      const printings = c.printings.length > 1 ? `<details class="printings-panel" open><summary>Alternate printings in this set (${c.printings.length})</summary><ul>${c.printings.map(p=>`<li>${p.rarity?rarityIcon(p.rarity):''}<span>#${esc(p.number)}${p.artist?` · ${esc(p.artist)}`:''}</span></li>`).join('')}</ul></details>` : '';
      return `<article class="card" id="${c.id}"><header class="card-header"><h2>${esc(c.name)}</h2>${mana}</header>${identity}${hasFaces?'':rules}${hasFaces?'':renderStats(c)}${hasFaces?'':flavor}${faces}${footer}${printings}<p class="back-link"><a href="#top">Back to top</a></p></article>`;
    }).join('\n');
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(setName)}</title><style>
body{font-family:Arial,Helvetica,sans-serif;margin:0;background:#ececec;color:#111;line-height:1.38}.wrap{max-width:900px;margin:0 auto;padding:14px}.title{text-align:center;font-size:2.2em;margin:.4em 0 .15em}.meta{text-align:center;color:#444;margin-bottom:1.1em}.nav,.card{background:#fff;border:1px solid #aaa;border-radius:8px;margin:12px 0}.nav{padding:12px}.nav h2{margin:.1em 0 .45em}.nav h3{margin:.7em 0 .25em}.nav a{display:inline-block;margin:3px 6px 3px 0;padding:3px 6px;border:1px solid #bbb;border-radius:4px;text-decoration:none;color:#0645ad;background:#fafafa}.letters a{font-weight:bold}.card{overflow:hidden;border-left:6px solid #444;scroll-margin-top:8px}.card:target{border-color:#315d87;box-shadow:0 0 0 3px rgba(49,93,135,.22)}.card:target .card-header{background:#d7e7f4}.card-header{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#e1e1e1;padding:9px 12px;border-bottom:1px solid #aaa}.card-header h2{margin:0;font-size:1.22em;line-height:1.2}.header-mana{white-space:nowrap;flex:0 0 auto}.identity-panel,.rules-panel,.stats-panel,.flavor-panel,.printings-panel{margin:6px 12px;padding:7px 10px;border:1px solid #bbb;border-radius:6px}.identity-panel{background:#f7f7f7;padding-top:6px;padding-bottom:6px}.type-line{font-weight:bold}.layout-line{margin-top:2px;color:#555;font-size:.88em}.rules-panel{background:#f1ead8}.section-label{font-size:.78em;font-weight:bold;letter-spacing:.05em;text-transform:uppercase;color:#4b4b4b;border-bottom:1px solid rgba(0,0,0,.16);padding-bottom:3px;margin-bottom:5px}.reminder{font-size:.88em;font-style:italic;color:#555}.stats-panel{background:#e5edf5;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:7px;padding:6px 8px}.stat-badge{display:inline-flex;align-items:baseline;gap:6px;border:1px solid #71869a;border-radius:999px;background:#fff;padding:3px 9px}.stat-badge small{font-size:.7em;text-transform:uppercase;color:#536779}.stat-badge strong{font-size:1.05em}.flavor-panel{background:#eee8f1;border-left:5px solid #8d7896;font-style:italic}.card-footer{display:flex;align-items:center;gap:7px;margin:5px 12px 2px;padding:4px 8px;border-top:1px solid #bbb;color:#555;font-size:.76em;line-height:1.2}.rarity-wrap{display:inline-flex;align-items:center;min-width:18px}.rarity-icon{width:18px;height:18px;vertical-align:middle;flex:0 0 auto}.footer-text{white-space:normal}.printings-panel li{display:flex;align-items:center;gap:6px;margin:3px 0}.face-panel{margin:8px 12px;padding:8px;border:2px solid #999;border-radius:7px;background:#fafafa}.face-title{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:5px;border-bottom:1px solid #bbb}.face-title h3{margin:0}.face-panel .identity-panel,.face-panel .rules-panel,.face-panel .stats-panel,.face-panel .flavor-panel{margin:6px 0}.faces-heading{margin:9px 12px 3px}.mana{width:21px;height:21px;vertical-align:middle;margin:0 1px}.mana-fallback{display:inline-block;min-width:19px;height:19px;line-height:19px;text-align:center;border:1px solid #333;border-radius:50%;background:#ddd;font-size:10px;font-weight:bold;margin:0 1px}.printings-panel{padding:7px 10px}.printings-panel ul{margin:.4em 0 .1em;padding-left:1.3em}.back-link{margin:7px 12px 10px}.size-compact{font-size:14px}.size-comfortable{font-size:17px}.size-large{font-size:20px}summary{font-weight:bold}a{color:#0645ad}
</style></head><body class="${bodyClass}"><div class="wrap" id="top"><h1 class="title">${esc(setName)}</h1><div class="meta">${setCode?`Set Code: ${esc(setCode)} · `:''}${cards.length} cards${data.releaseDate?` · Released ${esc(data.releaseDate)}`:''}</div>${nav}<main>${cardBlocks}</main></div></body></html>`;
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
