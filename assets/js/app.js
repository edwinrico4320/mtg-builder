(() => {
  const $ = (id) => document.getElementById(id);
  const sets = window.RECOMMENDED_SETS || [];
  const state = { installed: new Map(), discovered: [] };

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
        open(`https://mtgjson.com/api/v5/${code}.json`, '_blank');
        await delay(1200);
      }
    }
    summary.textContent = 'Download queue finished. Upload downloaded JSON files to data/json in GitHub.';
  }

  async function scanCatalogSets() {
    const summary = $('catalogSummary');
    const select = $('catalogSetSelect');
    summary.textContent = 'Scanning recommended set files in data/json...';
    select.innerHTML = '<option value="">Scanning...</option>';
    const found = [];
    for (const code of sets) {
      if (await fileExists(`data/json/${code}.json`)) found.push(code);
    }
    state.discovered = found;
    select.innerHTML = found.length
      ? '<option value="">Choose a set...</option>' + found.map(code => `<option value="${code}">${code}</option>`).join('')
      : '<option value="">No set JSON files found</option>';
    summary.textContent = `Found ${found.length} available set files.`;
    $('jsonCount').textContent = `${found.length} / ${sets.length}`;
  }

  async function buildSelectedCatalog() {
    const code = $('catalogSetSelect').value;
    const summary = $('catalogSummary');
    const preview = $('catalogPreview');
    if (!code) { summary.textContent = 'Choose a set first.'; return; }
    summary.textContent = `Loading ${code}.json...`;
    preview.textContent = '';
    try {
      const json = await fetchJson(`data/json/${code}.json`);
      const normalized = normalizeSet(json, code);
      const html = generateCompactSetHtml(normalized);
      const index = {
        setName: normalized.name,
        setCode: normalized.code,
        cardCount: normalized.cards.length,
        releaseDate: normalized.releaseDate || '',
        htmlFile: `${normalized.code}.html`,
        profile: 'compact-no-js',
        generatedAt: new Date().toISOString()
      };
      downloadText(`${normalized.code}.html`, html, 'text/html;charset=utf-8');
      await delay(350);
      downloadText(`${normalized.code}.index.json`, JSON.stringify(index, null, 2), 'application/json;charset=utf-8');
      summary.textContent = `Built ${normalized.code}.html with ${normalized.cards.length} cards.`;
      preview.textContent = `${normalized.name}\n${normalized.code}\n${normalized.cards.length} cards\n\nFirst cards:\n` + normalized.cards.slice(0, 10).map(c => `- ${c.name}`).join('\n');
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
    return {
      id: `card-${index + 1}`,
      number: card.number || '',
      name: card.name || faceText || names || '',
      sortName: (card.name || '').replace(/^The\s+/i, ''),
      manaCost: card.manaCost || card.mana_cost || '',
      manaValue: card.manaValue ?? card.convertedManaCost ?? '',
      type: card.type || card.typeLine || '',
      text: card.text || card.oracleText || '',
      flavorText: card.flavorText || '',
      power: card.power || '',
      toughness: card.toughness || '',
      loyalty: card.loyalty || '',
      defense: card.defense || '',
      rarity: card.rarity || '',
      artist: card.artist || ''
    };
  }

  function generateCompactSetHtml(set) {
    const title = escapeHtml(set.name);
    const nav = generateNav(set.cards);
    const cards = set.cards.map(cardSectionHtml).join('\n');
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;margin:0;background:#f6f3ea;color:#191919;line-height:1.35}#top{padding:18px 12px;text-align:center;border-bottom:2px solid #111;background:#fff}h1{font-size:30px;margin:0 0 6px}.meta{font-size:13px;color:#555}.wrap{display:block;max-width:920px;margin:0 auto;padding:12px}.nav{border:1px solid #999;background:#fff;padding:10px;margin-bottom:14px}.nav h2{margin:0 0 8px;font-size:20px}.letter{font-weight:bold;margin:12px 0 5px;border-bottom:1px solid #ddd}.nav a{display:block;padding:3px 0;color:#003b73;text-decoration:none}.card{border:1px solid #777;background:#fff;margin:0 0 12px;padding:12px}.card h2{font-size:22px;margin:0 0 8px}.line{margin:5px 0}.label{font-weight:bold}.text{white-space:pre-wrap}.toplink{display:block;margin-top:10px;font-size:13px}.pt{font-weight:bold}.small{font-size:12px;color:#555}@media print{.nav,.toplink{display:none}.card{break-inside:avoid}}
</style>
</head>
<body>
<header id="top"><h1>${title}</h1><div class="meta">Set Code: ${escapeHtml(set.code)}${set.releaseDate ? ` &bull; Release: ${escapeHtml(set.releaseDate)}` : ''} &bull; ${set.cards.length} Cards</div></header>
<div class="wrap">
<nav class="nav"><h2>Card Navigator</h2>${nav}</nav>
<main>
${cards}
</main>
</div>
</body>
</html>`;
  }

  function generateNav(cards) {
    let current = '';
    return cards.map(card => {
      const letter = (card.name[0] || '#').toUpperCase();
      const heading = letter !== current ? (current = letter, `<div class="letter">${escapeHtml(letter)}</div>`) : '';
      return `${heading}<a href="#${card.id}">${escapeHtml(card.name)}</a>`;
    }).join('\n');
  }

  function cardSectionHtml(card) {
    const pt = card.power || card.toughness ? `<p class="line pt">${escapeHtml(card.power)}/${escapeHtml(card.toughness)}</p>` : '';
    const loyalty = card.loyalty ? field('Loyalty', card.loyalty) : '';
    const defense = card.defense ? field('Defense', card.defense) : '';
    const flavor = card.flavorText ? `<p class="line"><span class="label">Flavor:</span><br><em>${escapeHtml(card.flavorText)}</em></p>` : '';
    return `<section class="card" id="${card.id}">
<h2>${escapeHtml(card.name)}</h2>
${field('Number', card.number)}
${field('Mana Cost', card.manaCost)}
${field('Mana Value', String(card.manaValue ?? ''))}
${field('Type', card.type)}
${card.text ? `<p class="line text"><span class="label">Text:</span><br>${escapeHtml(card.text)}</p>` : ''}
${flavor}
${pt}
${loyalty}
${defense}
${field('Rarity', card.rarity)}
${field('Artist', card.artist)}
<a class="toplink" href="#top">Back to top</a>
</section>`;
  }

  function field(label, value) {
    if (!value) return '';
    return `<p class="line"><span class="label">${escapeHtml(label)}:</span> ${escapeHtml(value)}</p>`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
  }

  function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
})();
