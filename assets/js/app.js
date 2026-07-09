(() => {
  const $ = (id) => document.getElementById(id);
  const sets = window.RECOMMENDED_SETS || [];
  const state = { installed: new Map(), discovered: [], setMeta: new Map() };

  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $(btn.dataset.tab).classList.add('active');
    });
  });

  $('checkSetsBtn')?.addEventListener('click', checkInstalledSets);
  $('downloadMissingBtn')?.addEventListener('click', downloadMissingSets);
  $('scanCatalogSetsBtn')?.addEventListener('click', scanCatalogSets);
  $('buildCatalogBtn')?.addEventListener('click', buildSelectedCatalog);

  async function checkInstalledSets() {
    const summary = $('downloaderSummary');
    const list = $('setList');
    summary.textContent = 'Checking data/json...';
    list.innerHTML = '';
    state.installed.clear();

    let installedCount = 0;
    for (const code of sets) {
      const exists = await fileExists(`data/json/${code}.json`);
      state.installed.set(code, exists);
      if (exists) installedCount++;
      const row = document.createElement('div');
      row.className = 'set-row';
      row.innerHTML = `<strong>${escapeHtml(code)}</strong><span class="${exists ? 'ok' : 'missing'}">${exists ? 'Installed' : 'Missing'}</span>`;
      list.appendChild(row);
    }
    $('jsonCount').textContent = `${installedCount} / ${sets.length}`;
    summary.textContent = `Found ${installedCount} installed set files. Missing ${sets.length - installedCount}.`;
  }

  async function downloadMissingSets() {
    if (!state.installed.size) await checkInstalledSets();
    const missing = sets.filter(code => !state.installed.get(code));
    const summary = $('downloaderSummary');
    if (!missing.length) { summary.textContent = 'No missing recommended sets.'; return; }
    summary.textContent = `Downloading ${missing.length} missing sets. Chrome may ask to allow multiple downloads.`;
    for (let i = 0; i < missing.length; i++) {
      const code = missing[i];
      summary.textContent = `Downloading ${code}.json (${i + 1}/${missing.length})...`;
      try {
        await forcedDownload(`https://mtgjson.com/api/v5/${code}.json`, `${code}.json`);
        await delay(900);
      } catch (err) {
        console.error(err);
        window.open(`https://mtgjson.com/api/v5/${code}.json`, '_blank');
        await delay(1200);
      }
    }
    summary.textContent = 'Download queue finished. Upload downloaded JSON files to data/json in GitHub.';
  }

  async function scanCatalogSets() {
    const summary = $('catalogSummary');
    const select = $('catalogSetSelect');
    summary.textContent = 'Scanning recommended set files in data/json and reading set names...';
    select.innerHTML = '<option value="">Scanning...</option>';
    const found = [];
    state.setMeta.clear();
    for (const code of sets) {
      if (await fileExists(`data/json/${code}.json`)) {
        const meta = await readSetMetadata(code);
        found.push(meta);
        state.setMeta.set(code, meta);
        summary.textContent = `Found ${found.length} sets. Latest: ${meta.name}`;
      }
    }
    found.sort((a, b) => a.name.localeCompare(b.name));
    state.discovered = found;
    select.innerHTML = found.length
      ? '<option value="">Choose a set...</option>' + found.map(meta => `<option value="${escapeHtml(meta.code)}">${escapeHtml(meta.name)}${meta.code ? ` (${escapeHtml(meta.code)})` : ''}</option>`).join('')
      : '<option value="">No set JSON files found</option>';
    summary.textContent = `Found ${found.length} available set files.`;
    $('jsonCount').textContent = `${found.length} / ${sets.length}`;
  }

  async function readSetMetadata(code) {
    try {
      const json = await fetchJson(`data/json/${code}.json`);
      const data = json.data || json;
      return {
        code: (data.code || code).toUpperCase(),
        name: data.name || code,
        releaseDate: data.releaseDate || '',
        cardCount: Array.isArray(data.cards) ? data.cards.length : 0
      };
    } catch {
      return { code, name: code, releaseDate: '', cardCount: 0 };
    }
  }

  async function buildSelectedCatalog() {
    const code = $('catalogSetSelect').value;
    const symbolMode = $('manaSymbolMode')?.value || 'embedded';
    const duplicateMode = $('duplicateMode')?.value || 'collapse';
    const textSizeMode = $('textSizeMode')?.value || 'comfortable';
    const fieldMode = $('fieldMode')?.value || 'essential';
    const navigatorMode = $('navigatorMode')?.value || 'alphabetical';
    const summary = $('catalogSummary');
    const preview = $('catalogPreview');
    if (!code) { summary.textContent = 'Choose a set first.'; return; }
    summary.textContent = `Loading ${code}.json...`;
    preview.textContent = '';
    try {
      const json = await fetchJson(`data/json/${code}.json`);
      const normalized = normalizeSet(json, code);
      const originalCount = normalized.cards.length;
      if (duplicateMode === 'collapse') normalized.cards = collapseDuplicatePrintings(normalized.cards);
      const html = generateCompactSetHtml(normalized, { symbolMode, duplicateMode, originalCount, textSizeMode, fieldMode, navigatorMode });
      const index = {
        setName: normalized.name,
        setCode: normalized.code,
        cardCount: normalized.cards.length,
        originalPrintingCount: originalCount,
        duplicateMode,
        manaSymbolMode: symbolMode,
        textSizeMode,
        fieldMode,
        navigatorMode,
        releaseDate: normalized.releaseDate || '',
        htmlFile: `${normalized.code}.html`,
        profile: 'compact-no-js-v3',
        generatedAt: new Date().toISOString()
      };
      downloadText(`${normalized.code}.html`, html, 'text/html;charset=utf-8');
      await delay(350);
      downloadText(`${normalized.code}.index.json`, JSON.stringify(index, null, 2), 'application/json;charset=utf-8');
      const collapsedText = duplicateMode === 'collapse' ? `Collapsed ${originalCount} printings into ${normalized.cards.length} card entries.` : `Showing all ${originalCount} printings.`;
      summary.textContent = `Built ${normalized.code}.html. ${collapsedText}`;
      preview.textContent = `${normalized.name}\n${normalized.code}\n${collapsedText}\nMana symbols: ${symbolMode}
Text size: ${textSizeMode}
Fields: ${fieldMode}
Navigator: ${navigatorMode}\n\nFirst cards:\n` + normalized.cards.slice(0, 10).map(c => `- ${c.name}${c.alternatePrintings?.length ? ` (${c.alternatePrintings.length + 1} printings)` : ''}`).join('\n');
    } catch (err) {
      console.error(err);
      summary.textContent = `Build failed: ${err.message}`;
    }
  }

  async function fileExists(url) {
    try {
      const res = await fetch(`${url}?cacheBust=${Date.now()}`, { method: 'HEAD', cache: 'no-store' });
      if (res.ok) return true;
      if (res.status === 405) {
        const getRes = await fetch(url, { method: 'GET', cache: 'no-store' });
        return getRes.ok;
      }
      return false;
    } catch { return false; }
  }

  async function fetchJson(url) {
    const res = await fetch(`${url}?cacheBust=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Could not fetch ${url}: ${res.status}`);
    return res.json();
  }

  async function forcedDownload(url, filename) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
  }

  function downloadText(filename, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function normalizeSet(raw, fallbackCode) {
    const data = raw.data || raw;
    const cards = (data.cards || []).map((card, i) => normalizeCard(card, i)).filter(c => c.name);
    cards.sort((a, b) => (a.sortName || a.name).localeCompare(b.sortName || b.name, undefined, { numeric: true }));
    return {
      name: data.name || fallbackCode,
      code: (data.code || fallbackCode).toUpperCase(),
      releaseDate: data.releaseDate || '',
      type: data.type || '',
      cards
    };
  }

  function normalizeCard(card, index) {
    const faceText = Array.isArray(card.faceName) ? card.faceName.join(' / ') : '';
    const names = Array.isArray(card.names) ? card.names.join(' / ') : '';
    const text = card.text || card.oracleText || extractFaceText(card) || '';
    const manaCost = card.manaCost || card.mana_cost || extractFaceManaCost(card) || '';
    const type = card.type || card.typeLine || extractFaceType(card) || '';
    return {
      id: `card-${index + 1}`,
      number: card.number || '',
      name: card.name || faceText || names || '',
      sortName: (card.name || '').replace(/^The\s+/i, ''),
      manaCost,
      manaValue: card.manaValue ?? card.convertedManaCost ?? '',
      type,
      text,
      flavorText: card.flavorText || '',
      power: card.power || '',
      toughness: card.toughness || '',
      loyalty: card.loyalty || '',
      defense: card.defense || '',
      rarity: card.rarity || '',
      artist: card.artist || ''
    };
  }

  function extractFaceText(card) {
    if (!Array.isArray(card.faceData)) return '';
    return card.faceData.map(face => [face.name, face.text].filter(Boolean).join('\n')).filter(Boolean).join('\n---\n');
  }
  function extractFaceManaCost(card) {
    if (!Array.isArray(card.faceData)) return '';
    return card.faceData.map(face => face.manaCost || '').filter(Boolean).join(' // ');
  }
  function extractFaceType(card) {
    if (!Array.isArray(card.faceData)) return '';
    return card.faceData.map(face => face.type || '').filter(Boolean).join(' // ');
  }

  function collapseDuplicatePrintings(cards) {
    const groups = new Map();
    for (const card of cards) {
      const key = gameplayKey(card);
      if (!groups.has(key)) {
        groups.set(key, { ...card, alternatePrintings: [] });
      } else {
        const main = groups.get(key);
        main.alternatePrintings.push({
          number: card.number,
          rarity: card.rarity,
          artist: card.artist,
          flavorText: card.flavorText,
          id: card.id
        });
      }
    }
    const collapsed = Array.from(groups.values());
    collapsed.forEach((card, i) => { card.id = `card-${i + 1}`; });
    return collapsed;
  }

  function gameplayKey(card) {
    return [
      card.name,
      card.manaCost,
      String(card.manaValue ?? ''),
      card.type,
      normalizeRulesText(card.text),
      card.power,
      card.toughness,
      card.loyalty,
      card.defense
    ].map(v => String(v || '').trim().toLowerCase()).join('|');
  }

  function normalizeRulesText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function generateCompactSetHtml(set, options) {
    const title = escapeHtml(set.name);
    const nav = generateNav(set.cards, options);
    const cards = set.cards.map((card, index) => cardSectionHtml(card, options, index)).join('\n');
    const duplicateMeta = options.duplicateMode === 'collapse'
      ? ` &bull; ${set.cards.length} Entries from ${options.originalCount} Printings`
      : ` &bull; ${set.cards.length} Cards`;
    const bodyClass = `size-${options.textSizeMode || 'comfortable'}`;
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;margin:0;background:#f3efe4;color:#191919;line-height:1.5;font-size:17px}body.size-compact{font-size:15px;line-height:1.38}body.size-large{font-size:20px;line-height:1.6}#top{padding:24px 12px;text-align:center;border-bottom:3px solid #111;background:#fff}h1{font-size:36px;margin:0 0 8px;letter-spacing:.2px}body.size-compact h1{font-size:30px}body.size-large h1{font-size:42px}.meta{font-size:.82em;color:#555}.wrap{display:block;max-width:960px;margin:0 auto;padding:14px}.letters{border:1px solid #aaa;background:#fff;padding:10px;margin:0 0 14px;text-align:center}.letters a{display:inline-block;margin:3px 5px;padding:3px 6px;color:#003b73;text-decoration:none;border:1px solid #ddd;border-radius:4px}.nav{border:1px solid #999;background:#fff;padding:14px;margin-bottom:18px}.nav h2{margin:0 0 10px;font-size:1.25em}.letter{font-weight:bold;margin:16px 0 6px;border-bottom:2px solid #ddd;font-size:1.08em}.nav a{display:block;padding:5px 0;color:#003b73;text-decoration:none}.card{border:1px solid #777;background:#fff;margin:0 0 16px;padding:16px;border-radius:4px}.card:nth-child(even){background:#fcfbf7}.card h2{font-size:1.45em;margin:0 0 10px;padding-bottom:5px;border-bottom:1px solid #ddd}.line{margin:7px 0}.label{font-weight:bold;color:#333}.text{white-space:pre-wrap;background:#f8f8f8;border-left:4px solid #ddd;padding:8px}.toplink{display:block;margin-top:12px;font-size:.85em}.pt{font-weight:bold;font-size:1.08em}.small{font-size:.78em;color:#555}.mana{display:inline-block;vertical-align:-3px;width:1.1em;height:1.1em;margin:0 1px}.prints{margin-top:10px;border-top:1px solid #ddd;padding-top:8px}.prints ul{margin:4px 0 0 18px;padding:0}@media print{.nav,.letters,.toplink{display:none}.card{break-inside:avoid}}
</style>
</head>
<body class="${escapeHtml(bodyClass)}">
<header id="top"><h1>${title}</h1><div class="meta">${set.code ? `Set Code: ${escapeHtml(set.code)}` : ''}${set.releaseDate ? ` &bull; Release: ${escapeHtml(set.releaseDate)}` : ''}${duplicateMeta}</div></header>
<div class="wrap">
${generateLetterJumpBar(set.cards, options)}
<nav class="nav"><h2>Card Navigator</h2>${nav}</nav>
<main>
${cards}
</main>
</div>
</body>
</html>`;
  }

  function generateLetterJumpBar(cards, options) {
    if (options.navigatorMode !== 'alphabetical') return '';
    const letters = [];
    for (const card of cards) {
      const letter = navLetter(card.name);
      if (!letters.includes(letter)) letters.push(letter);
    }
    return `<div class="letters"><strong>Jump:</strong> ${letters.map(l => `<a href="#letter-${safeId(l)}">${escapeHtml(l)}</a>`).join(' ')}</div>`;
  }

  function generateNav(cards, options) {
    let current = '';
    return cards.map(card => {
      const letter = navLetter(card.name);
      const heading = options.navigatorMode === 'alphabetical' && letter !== current ? (current = letter, `<div class="letter" id="letter-${safeId(letter)}">${escapeHtml(letter)}</div>`) : '';
      const printCount = card.alternatePrintings?.length ? ` <span class="small">(${card.alternatePrintings.length + 1})</span>` : '';
      return `${heading}<a href="#${card.id}">${escapeHtml(card.name)}${printCount}</a>`;
    }).join('\n');
  }

  function navLetter(name) {
    const first = (name || '#').trim()[0] || '#';
    return /[A-Za-z]/.test(first) ? first.toUpperCase() : '#';
  }

  function safeId(value) {
    return String(value || 'x').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  function cardSectionHtml(card, options, index) {
    const pt = card.power || card.toughness ? `<p class="line pt"><span class="label">Power/Toughness:</span> ${escapeHtml(card.power)}/${escapeHtml(card.toughness)}</p>` : '';
    const loyalty = card.loyalty ? field('Loyalty', card.loyalty, options) : '';
    const defense = card.defense ? field('Defense', card.defense, options) : '';
    const flavor = card.flavorText && options.fieldMode === 'full' ? `<p class="line"><span class="label">Flavor:</span><br><em>${renderManaSymbols(escapeHtml(card.flavorText), options)}</em></p>` : '';
    const alternates = alternatePrintingsHtml(card, options);
    return `<section class="card" id="${card.id}">
<h2>${escapeHtml(card.name)}</h2>
${field('Number', card.number, options)}
${field('Mana Cost', card.manaCost, options)}
${field('Mana Value', String(card.manaValue ?? ''), options)}
${field('Type', card.type, options)}
${card.text ? `<p class="line text"><span class="label">Text:</span><br>${renderManaSymbols(escapeHtml(card.text), options)}</p>` : ''}
${flavor}
${pt}
${loyalty}
${defense}
${field('Rarity', card.rarity, options)}
${field('Artist', card.artist, options)}
${alternates}
<a class="toplink" href="#top">Back to top</a>
</section>`;
  }

  function alternatePrintingsHtml(card, options) {
    if (!card.alternatePrintings?.length) return '';
    if (options.fieldMode !== 'full') return `<div class="prints"><span class="label">Other printings collapsed:</span> ${card.alternatePrintings.length}</div>`;
    const items = card.alternatePrintings.map((p, i) => {
      const bits = [];
      if (p.number) bits.push(`#${escapeHtml(p.number)}`);
      if (p.rarity) bits.push(escapeHtml(p.rarity));
      if (p.artist) bits.push(`Artist: ${escapeHtml(p.artist)}`);
      if (p.flavorText && p.flavorText !== card.flavorText) bits.push(`Different flavor text`);
      return `<li>${bits.join(' &bull; ') || `Alternate printing ${i + 2}`}</li>`;
    }).join('');
    return `<div class="prints"><span class="label">Other printings collapsed:</span><ul>${items}</ul></div>`;
  }

  function field(label, value, options) {
    if (!value) return '';
    const essential = new Set(['Mana Cost', 'Type', 'Loyalty', 'Defense']);
    if (options.fieldMode === 'essential' && !essential.has(label)) return '';
    const rendered = label === 'Mana Cost' ? renderManaSymbols(escapeHtml(value), options) : escapeHtml(value);
    return `<p class="line"><span class="label">${escapeHtml(label)}:</span> ${rendered}</p>`;
  }

  function renderManaSymbols(text, options) {
    if (options.symbolMode !== 'embedded') return text;
    return String(text).replace(/\{([^}]+)\}/g, (match, rawSymbol) => {
      const symbol = rawSymbol.toUpperCase().replace(/∞/g, 'INF');
      const svg = symbolSvg(symbol);
      if (!svg) return match;
      return `<img class="mana" alt="${escapeHtml(match)}" title="${escapeHtml(match)}" src="${svg}">`;
    });
  }

  function symbolSvg(symbol) {
    const labelMap = { TAP: 'T', T: 'T', W: 'W', U: 'U', B: 'B', R: 'R', G: 'G', C: 'C', X: 'X', Y: 'Y', Z: 'Z' };
    const label = labelMap[symbol] || symbol;
    if (!/^[A-Z0-9/+-]+$/.test(label) || label.length > 4) return null;
    const palette = {
      W: ['#f2ead0', '#111'], U: ['#b9d9ef', '#111'], B: ['#222', '#fff'], R: ['#e69a73', '#111'], G: ['#9acb99', '#111'], C: ['#d8d8d8', '#111']
    };
    const first = symbol[0];
    const [fill, color] = palette[first] || ['#ddd', '#111'];
    const safeLabel = escapeHtml(label);
    const fontSize = label.length <= 2 ? 12 : 9;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="8" fill="${fill}" stroke="#333" stroke-width="1"/><text x="9" y="13" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${fontSize}" font-weight="bold" fill="${color}">${safeLabel}</text></svg>`;
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
  }

  function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
})();
