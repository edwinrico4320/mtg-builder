(function () {
  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const state = {
    running: false,
    cancelRequested: false
  };

  function registerModule() {
    if (typeof BuilderModules !== 'undefined') {
      BuilderModules.register('Catalog Image Profile', '8.1.0');
    }
  }

  function extractCards(json) {
    if (json && json.data && Array.isArray(json.data.cards)) return json.data.cards;
    if (json && Array.isArray(json.cards)) return json.cards;
    return [];
  }

  function getSetName(json, fallbackCode) {
    if (json && json.data && json.data.name) return json.data.name;
    if (json && json.meta && json.meta.name) return json.meta.name;
    if (json && json.name) return json.name;
    return fallbackCode;
  }

  function sortCards(cards, navMode) {
    const out = cards.slice();
    if (navMode === 'alpha') {
      out.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')) || String(a.number || '').localeCompare(String(b.number || '')));
    }
    return out;
  }

  function collapseDuplicates(cards) {
    const map = new Map();
    for (const card of cards) {
      const key = [card.name, card.manaCost, card.type, card.text || card.oracleText, card.power, card.toughness, card.loyalty, card.defense, card.layout].join('|');
      if (!map.has(key)) {
        map.set(key, Object.assign({_altPrintings: 0}, card));
      } else {
        const existing = map.get(key);
        existing._altPrintings += 1;
      }
    }
    return Array.from(map.values());
  }

  function renderRulesText(text) {
    const safe = escapeHtml(text || '');
    return safe.replace(/\n/g, '<br>').replace(/(\([^)]*\))/g, '<span class="reminder">$1</span>');
  }

  function statBadge(card) {
    if (card.power && card.toughness) return `${escapeHtml(card.power)}/${escapeHtml(card.toughness)}`;
    if (card.loyalty) return `Loyalty ${escapeHtml(card.loyalty)}`;
    if (card.defense) return `Defense ${escapeHtml(card.defense)}`;
    return '';
  }

  function textScale(size) {
    if (size === 'compact') return {body: '14px', h1: '28px', h2: '22px'};
    if (size === 'large') return {body: '18px', h1: '34px', h2: '28px'};
    return {body: '16px', h1: '30px', h2: '24px'};
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let idx = 0;
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx += 1;
    }
    return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
  }

  function compatibility(htmlBytes, mode) {
    if (mode === 'none') return 'Restricted-viewer friendly';
    const mb = htmlBytes / (1024 * 1024);
    if (mb <= 5) return 'Likely restricted-viewer friendly';
    if (mb <= 10) return 'Probably okay, test on device';
    if (mb <= 25) return 'Caution: may be slow on restricted viewers';
    return 'High risk for restricted viewers';
  }

  function buildWarnings(report) {
    const warnings = [];
    if (report.failures > 0) warnings.push(`${report.failures} card(s) were missing a Scryfall image or ID.`);
    if (report.htmlBytes > 10 * 1024 * 1024) warnings.push('Generated HTML exceeds 10 MB. Test on the restricted viewer.');
    if (report.htmlBytes > 25 * 1024 * 1024) warnings.push('Generated HTML exceeds 25 MB and may be too heavy for some restricted viewers.');
    return warnings;
  }

  function renderCardProfileHtml(setCode, setName, cards, options) {
    const scale = textScale(options.textSize);
    const navItems = cards.map((card, index) => `<a href="#card-${index + 1}">${escapeHtml(card.name || `Card ${index + 1}`)}</a>`).join('\n');

    const blocks = cards.map((card, index) => {
      const img = options.imageMode === 'none' ? '' : (
        card._processedImage
          ? `<div class="image-wrap"><img src="${card._processedImage}" alt="${escapeHtml(card.name)}"></div>`
          : '<div class="missing-image">No image available</div>'
      );
      const mana = card.manaCost ? `<div class="mana-cost">${escapeHtml(card.manaCost)}</div>` : '';
      const type = card.type ? `<div class="type-line">${escapeHtml(card.type)}</div>` : '';
      const layout = (options.fieldMode === 'full' && card.layout) ? `<div class="layout-line">Layout: ${escapeHtml(card.layout)}</div>` : '';
      const oracleText = card.text || card.oracleText || '';
      const flavor = (options.fieldMode === 'full' && card.flavorText) ? `<div class="flavor-box"><div class="section-label">Flavor Text</div><div class="flavor-text">${escapeHtml(card.flavorText).replace(/\n/g, '<br>')}</div></div>` : '';
      const badge = statBadge(card);
      const footerParts = [];
      if (card.number) footerParts.push(`#${escapeHtml(card.number)}`);
      if (card.artist && options.fieldMode === 'full') footerParts.push(`Artist: ${escapeHtml(card.artist)}`);
      if (card._altPrintings) footerParts.push(`${card._altPrintings} alternate printing(s)`);
      const footer = footerParts.length ? `<div class="card-footer">${footerParts.join(' · ')}</div>` : '';

      return `<article id="card-${index + 1}" class="card-entry">
        <div class="card-header">
          <h2>${escapeHtml(card.name)}</h2>
          ${mana}
        </div>
        <div class="card-body">
          ${img}
          <div class="card-copy">
            ${type}
            ${layout}
            <div class="rules-box">
              <div class="section-label">Oracle Text</div>
              <div class="oracle-text">${renderRulesText(oracleText) || '<span class="muted">No rules text</span>'}</div>
            </div>
            ${flavor}
            ${badge ? `<div class="stats-box"><span class="stats-badge">${badge}</span></div>` : ''}
            ${footer}
          </div>
        </div>
        <div class="back-top"><a href="#top">Back to top</a></div>
      </article>`;
    }).join('\n');

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(setCode)} Catalog</title>
<style>
  body{font-family:Arial,sans-serif;font-size:${scale.body};margin:0;background:#f3f0e8;color:#202020;}
  #top{display:block;}
  .page{max-width:1200px;margin:0 auto;padding:18px;}
  .set-header{text-align:center;background:#ebe2cf;border:1px solid #b9ac8e;padding:18px;margin-bottom:16px;}
  .set-header h1{margin:0 0 6px 0;font-size:${scale.h1};}
  .set-sub{font-size:14px;color:#444;}
  .layout{display:block;}
  .nav{width:auto;background:#f8f5ed;border:1px solid #c6baa0;padding:12px;box-sizing:border-box;margin-bottom:16px;position:static;max-height:38vh;overflow-y:auto;}
  .nav h2{margin:0 0 10px 0;font-size:18px;}
  .nav a{display:inline-block;vertical-align:top;width:calc(50% - 10px);padding:6px 8px;margin:2px 4px 2px 0;text-decoration:none;color:#15314b;border-radius:4px;box-sizing:border-box;}
  .nav a:hover,.nav a:focus{background:#e3edf7;}
  .cards{min-width:0;}
  .card-entry{background:#fbfaf6;border:1px solid #b8ae96;padding:14px;margin-bottom:16px;}
  .card-header{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;border-bottom:1px solid #ccbfa2;padding-bottom:8px;margin-bottom:10px;}
  .card-header h2{margin:0;font-size:${scale.h2};line-height:1.1;}
  .mana-cost{font-weight:bold;white-space:nowrap;font-size:18px;}
  .card-body{display:block;}
  .image-wrap,.missing-image{width:100%;max-width:320px;margin:0 auto 12px;background:#ebe8df;border:1px solid #c2b7a1;padding:8px;box-sizing:border-box;text-align:center;}
  .image-wrap img{width:100%;height:auto;display:block;}
  .missing-image{padding:24px 8px;color:#666;background:#f1eee7;}
  .type-line{font-weight:bold;margin:0 0 3px 0;}
  .layout-line{margin:0 0 8px 0;font-size:0.9em;color:#4c4c4c;}
  .rules-box{background:#efe6d4;border:1px solid #cbb999;padding:10px;margin-top:4px;}
  .flavor-box{background:#f5efe6;border:1px solid #d0c3b1;padding:10px;margin-top:8px;}
  .section-label{font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;color:#55452e;}
  .oracle-text,.flavor-text{line-height:1.35;}
  .flavor-text{font-style:italic;}
  .reminder{font-style:italic;color:#666;font-size:0.94em;}
  .stats-box{margin-top:8px;background:#dde4ea;border:1px solid #b2bcc8;padding:8px;}
  .stats-badge{display:inline-block;font-weight:bold;font-size:18px;padding:4px 10px;border:1px solid #7c8da0;background:#f7fbff;}
  .card-footer{margin-top:8px;font-size:12px;color:#555;}
  .back-top{margin-top:8px;font-size:13px;}
  .back-top a{color:#15314b;text-decoration:none;}
  .muted{color:#777;}
  @media (min-width: 901px) and (orientation: landscape) {
    .layout{display:flex;gap:18px;align-items:flex-start;}
    .nav{width:240px;flex:0 0 240px;position:sticky;top:12px;max-height:calc(100vh - 24px);margin-bottom:0;}
    .nav a{display:block;width:auto;margin:2px 0;}
    .cards{flex:1;min-width:0;}
    .card-body{display:flex;gap:14px;align-items:flex-start;}
    .image-wrap,.missing-image{width:220px;max-width:none;flex:0 0 220px;margin:0;}
  }
  @media (max-width: 480px) {
    .nav a{display:block;width:100%;margin-right:0;}
    .page{padding:10px;}
    .card-entry{padding:10px;}
  }
</style>
</head>
<body>
<div id="top"></div>
<div class="page">
  <header class="set-header">
    <h1>${escapeHtml(setName)}</h1>
    <div class="set-sub">Set Code: ${escapeHtml(setCode)} · Generated by MTG Builder v8.1 · ${escapeHtml(options.profileLabel)}</div>
  </header>
  <div class="layout">
    <nav class="nav">
      <h2>Card Navigator</h2>
      ${navItems}
    </nav>
    <main class="cards">${blocks}</main>
  </div>
</div>
</body>
</html>`;
  }

  async function buildSelectedSet(ev) {
    const profile = ($('outputProfileSelect') || {}).value || 'compact-text';
    if (profile === 'compact-text') {
      return; // allow existing builder logic to run
    }

    ev.preventDefault();
    ev.stopImmediatePropagation();
    if (state.running) return;

    const summary = $('catalogSummary');
    const cancelBtn = $('cancelCatalogBuildBtn');
    const setCode = ($('catalogSetSelect') || {}).value || '';
    if (!setCode) {
      if (summary) summary.innerHTML = 'Choose a scanned set first.';
      return;
    }
    if (profile === 'card-embedded-images' && typeof ImageLab === 'undefined') {
      if (summary) summary.innerHTML = 'ImageLab module is not loaded.';
      return;
    }

    state.running = true;
    state.cancelRequested = false;
    if (cancelBtn) cancelBtn.disabled = false;

    try {
      const textSize = (($('textSizeSelect') || {}).value) || 'comfortable';
      const fieldMode = (($('fieldModeSelect') || {}).value) || 'essential';
      const navMode = (($('navModeSelect') || {}).value) || 'alpha';
      const duplicateMode = (($('duplicateModeSelect') || {}).value) || 'collapse';
      const imageWidth = Number((($('catalogImageWidthSelect') || {}).value) || 300);
      const imageQuality = Number((($('catalogImageQualitySelect') || {}).value) || 0.65);
      const imageMode = profile === 'card-no-images' ? 'none' : 'embedded';
      ImageLab.settings.width = imageWidth;
      ImageLab.settings.quality = imageQuality;

      if (summary) summary.innerHTML = `Loading ${setCode}.json...`;
      const response = await fetch(`./data/json/${setCode}.json`);
      const json = await response.json();
      const setName = getSetName(json, setCode);
      let cards = extractCards(json);
      cards = sortCards(cards, navMode);
      if (duplicateMode === 'collapse') cards = collapseDuplicates(cards);

      let idsFound = 0;
      let imagesFound = 0;
      let failures = 0;
      let totalBytes = 0;
      const processedCards = [];

      for (let i = 0; i < cards.length; i++) {
        if (state.cancelRequested) break;
        const card = Object.assign({}, cards[i]);
        if (summary) summary.innerHTML = `Building ${setCode}: ${i + 1} of ${cards.length} · ${escapeHtml(card.name || 'Unknown card')}`;
        if (imageMode === 'embedded') {
          const scryfallId = card && card.identifiers && card.identifiers.scryfallId;
          if (scryfallId) idsFound += 1;
          if (scryfallId) {
            try {
              const imageUrl = await ImageLab.getScryfallImage(scryfallId);
              if (imageUrl) {
                const processed = await ImageLab.processImage(imageUrl);
                card._processedImage = processed;
                imagesFound += 1;
                totalBytes += processed.length;
              } else {
                failures += 1;
              }
            } catch (err) {
              failures += 1;
              console.warn('Embedded image failed for', card.name, err);
            }
          } else {
            failures += 1;
          }
        }
        processedCards.push(card);
        if ((i + 1) % 5 === 0) await sleep(0);
      }

      const profileLabel = profile === 'card-no-images' ? 'Card Profile — No Images' : `Card Profile — Embedded Images (${imageWidth}px @ ${Math.round(imageQuality * 100)}%)`;
      const html = renderCardProfileHtml(setCode, setName, processedCards, {
        textSize,
        fieldMode,
        imageMode,
        profileLabel
      });
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${setCode}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      const htmlBytes = new TextEncoder().encode(html).length;
      const report = {
        cardsProcessed: processedCards.length,
        idsFound,
        imagesFound,
        failures,
        htmlBytes,
        compatibility: compatibility(htmlBytes, imageMode)
      };
      const warnings = buildWarnings(report);
      if (summary) {
        summary.innerHTML = `<strong>Built:</strong> ${setCode}.html<br>` +
          `<strong>Cards processed:</strong> ${processedCards.length}<br>` +
          `${imageMode === 'embedded' ? `<strong>Images embedded:</strong> ${imagesFound}/${processedCards.length}<br>` : ''}` +
          `<strong>Approx HTML size:</strong> ${formatBytes(htmlBytes)}<br>` +
          `<strong>Compatibility estimate:</strong> ${report.compatibility}` +
          `${warnings.length ? `<div class="image-lab-warning"><strong>Warnings</strong><ul>${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul></div>` : ''}`;
      }
    } catch (err) {
      console.error(err);
      if ($('catalogSummary')) $('catalogSummary').innerHTML = `Image-profile build failed: ${escapeHtml(err && err.message ? err.message : String(err))}`;
    } finally {
      state.running = false;
      if (cancelBtn) cancelBtn.disabled = true;
    }
  }

  function cancelBuild() {
    state.cancelRequested = true;
    const summary = $('catalogSummary');
    if (summary) summary.innerHTML = 'Cancellation requested... finishing current card.';
  }

  function updateProfileUi() {
    const profile = ($('outputProfileSelect') || {}).value || 'compact-text';
    const width = $('catalogImageWidthSelect');
    const quality = $('catalogImageQualitySelect');
    const widthLabel = width && width.closest('label');
    const qualityLabel = quality && quality.closest('label');
    const visible = profile === 'card-embedded-images';
    if (widthLabel) widthLabel.style.display = visible ? '' : 'none';
    if (qualityLabel) qualityLabel.style.display = visible ? '' : 'none';
  }

  function init() {
    registerModule();
    const profile = $('outputProfileSelect');
    const buildBtn = $('buildCatalogBtn');
    const cancelBtn = $('cancelCatalogBuildBtn');
    if (profile) profile.addEventListener('change', updateProfileUi);
    updateProfileUi();
    if (buildBtn) buildBtn.addEventListener('click', buildSelectedSet, true);
    if (cancelBtn) cancelBtn.addEventListener('click', cancelBuild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
