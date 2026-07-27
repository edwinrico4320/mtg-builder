(function () {
  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const state = {
    running: false,
    cancelCurrentSet: false,
    cancelEntireBatch: false
  };

  function registerModule() {
    if (typeof BuilderModules !== 'undefined') {
      BuilderModules.register('Changed/New Image Profile', '8.2.1');
    }
  }

  function setStatus(html) {
    const output = $('batchBuildStatus') || $('catalogSummary');
    if (output) output.innerHTML = html;
  }

  function setCancelButtons(running) {
    const current = $('cancelCurrentBatchSetBtn');
    const entire = $('cancelEntireBatchBtn');
    if (current) current.disabled = !running;
    if (entire) entire.disabled = !running;
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
    const output = cards.slice();
    if (navMode === 'alpha') {
      output.sort((a, b) => {
        const byName = String(a.name || '').localeCompare(String(b.name || ''));
        return byName || String(a.number || '').localeCompare(String(b.number || ''));
      });
    }
    return output;
  }

  function collapseDuplicates(cards) {
    const entries = new Map();
    for (const card of cards) {
      const key = [
        card.name,
        card.manaCost,
        card.type,
        card.text || card.oracleText,
        card.power,
        card.toughness,
        card.loyalty,
        card.defense,
        card.layout
      ].join('|');

      if (!entries.has(key)) {
        entries.set(key, Object.assign({ _altPrintings: 0 }, card));
      } else {
        entries.get(key)._altPrintings += 1;
      }
    }
    return Array.from(entries.values());
  }

  function renderRulesText(value) {
    return escapeHtml(value || '')
      .replace(/\n/g, '<br>')
      .replace(/(\([^)]*\))/g, '<span class="reminder">$1</span>');
  }

  function statBadge(card) {
    if (card.power && card.toughness) return `${escapeHtml(card.power)}/${escapeHtml(card.toughness)}`;
    if (card.loyalty) return `Loyalty ${escapeHtml(card.loyalty)}`;
    if (card.defense) return `Defense ${escapeHtml(card.defense)}`;
    return '';
  }

  function textScale(size) {
    if (size === 'compact') return { body: '14px', h1: '28px', h2: '22px' };
    if (size === 'large') return { body: '18px', h1: '34px', h2: '28px' };
    return { body: '16px', h1: '30px', h2: '24px' };
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
  }

  function compatibility(htmlBytes, imageMode) {
    if (imageMode === 'none') return 'Restricted-viewer friendly';
    const megabytes = htmlBytes / (1024 * 1024);
    if (megabytes <= 5) return 'Likely restricted-viewer friendly';
    if (megabytes <= 10) return 'Probably okay, test on device';
    if (megabytes <= 25) return 'Caution: may be slow on restricted viewers';
    return 'High risk for restricted viewers';
  }

  function fnv1a(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (`0000000${(hash >>> 0).toString(16)}`).slice(-8);
  }

  function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }

  function profileSettings(profile) {
    return {
      profile,
      textSize: (($('textSizeSelect') || {}).value) || 'comfortable',
      fieldMode: (($('fieldModeSelect') || {}).value) || 'essential',
      navMode: (($('navModeSelect') || {}).value) || 'alpha',
      symbolMode: (($('symbolModeSelect') || {}).value) || 'embedded',
      duplicateMode: (($('duplicateModeSelect') || {}).value) || 'collapse',
      imageWidth: Number((($('catalogImageWidthSelect') || {}).value) || 300),
      imageQuality: Number((($('catalogImageQualitySelect') || {}).value) || 0.65)
    };
  }

  function discoverSetCodes() {
    const found = new Set();

    document.querySelectorAll('#batchSetList input[type="checkbox"]').forEach(box => {
      const code = box.value || box.dataset.code || box.dataset.setCode || box.getAttribute('data-code') || box.getAttribute('data-set-code');
      if (code) found.add(String(code));
    });

    const select = $('catalogSetSelect');
    if (select) {
      Array.from(select.options || []).forEach(option => {
        if (option.value) found.add(String(option.value));
      });
    }

    return Array.from(found);
  }

  async function fetchManifest() {
    const candidates = [
      './data/output/build-manifest.json',
      'data/output/build-manifest.json',
      './build-manifest.json'
    ];

    for (const path of candidates) {
      try {
        const response = await fetch(path, { cache: 'no-store' });
        if (!response.ok) continue;
        const manifest = await response.json();
        if (manifest && typeof manifest === 'object') {
          return { manifest, sourcePath: path };
        }
      } catch (error) {
        console.warn('Manifest candidate unavailable:', path, error);
      }
    }

    return { manifest: {}, sourcePath: '' };
  }

  function downloadText(filename, text, mimeType) {
    const blob = new Blob([text], { type: mimeType || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function renderCardProfileHtml(setCode, setName, cards, options) {
    const scale = textScale(options.textSize);
    const navItems = cards.map((card, index) =>
      `<a href="#card-${index + 1}">${escapeHtml(card.name || `Card ${index + 1}`)}</a>`
    ).join('\n');

    const blocks = cards.map((card, index) => {
      const image = options.imageMode === 'none'
        ? ''
        : card._processedImage
          ? `<div class="image-wrap"><img src="${card._processedImage}" alt="${escapeHtml(card.name)}"></div>`
          : '<div class="missing-image">No image available</div>';

      const mana = card.manaCost ? `<div class="mana-cost">${escapeHtml(card.manaCost)}</div>` : '';
      const type = card.type ? `<div class="type-line">${escapeHtml(card.type)}</div>` : '';
      const layout = options.fieldMode === 'full' && card.layout
        ? `<div class="layout-line">Layout: ${escapeHtml(card.layout)}</div>`
        : '';
      const oracleText = card.text || card.oracleText || '';
      const flavor = options.fieldMode === 'full' && card.flavorText
        ? `<div class="flavor-box"><div class="section-label">Flavor Text</div><div class="flavor-text">${escapeHtml(card.flavorText).replace(/\n/g, '<br>')}</div></div>`
        : '';
      const badge = statBadge(card);
      const footerParts = [];
      if (card.number) footerParts.push(`#${escapeHtml(card.number)}`);
      if (card.artist && options.fieldMode === 'full') footerParts.push(`Artist: ${escapeHtml(card.artist)}`);
      if (card._altPrintings) footerParts.push(`${card._altPrintings} alternate printing(s)`);
      const footer = footerParts.length ? `<div class="card-footer">${footerParts.join(' · ')}</div>` : '';

      return `<article id="card-${index + 1}" class="card-entry">
        <div class="card-header"><h2>${escapeHtml(card.name)}</h2>${mana}</div>
        <div class="card-body">
          ${image}
          <div class="card-copy">
            ${type}${layout}
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
  #top{display:block}.page{max-width:1200px;margin:0 auto;padding:18px}
  .set-header{text-align:center;background:#ebe2cf;border:1px solid #b9ac8e;padding:18px;margin-bottom:16px}
  .set-header h1{margin:0 0 6px;font-size:${scale.h1}}.set-sub{font-size:14px;color:#444}
  .layout{display:block}.nav{width:auto;background:#f8f5ed;border:1px solid #c6baa0;padding:12px;box-sizing:border-box;margin-bottom:16px;position:static;max-height:38vh;overflow-y:auto}
  .nav h2{margin:0 0 10px;font-size:18px}.nav a{display:inline-block;vertical-align:top;width:calc(50% - 10px);padding:6px 8px;margin:2px 4px 2px 0;text-decoration:none;color:#15314b;border-radius:4px;box-sizing:border-box}
  .nav a:hover,.nav a:focus{background:#e3edf7}.cards{min-width:0}
  .card-entry{background:#fbfaf6;border:1px solid #b8ae96;padding:14px;margin-bottom:16px}
  .card-header{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;border-bottom:1px solid #ccbfa2;padding-bottom:8px;margin-bottom:10px}
  .card-header h2{margin:0;font-size:${scale.h2};line-height:1.1}.mana-cost{font-weight:bold;white-space:nowrap;font-size:18px}.card-body{display:block}
  .image-wrap,.missing-image{width:100%;max-width:320px;margin:0 auto 12px;background:#ebe8df;border:1px solid #c2b7a1;padding:8px;box-sizing:border-box;text-align:center}
  .image-wrap img{width:100%;height:auto;display:block}.missing-image{padding:24px 8px;color:#666;background:#f1eee7}
  .type-line{font-weight:bold;margin:0 0 3px}.layout-line{margin:0 0 8px;font-size:.9em;color:#4c4c4c}
  .rules-box{background:#efe6d4;border:1px solid #cbb999;padding:10px;margin-top:4px}.flavor-box{background:#f5efe6;border:1px solid #d0c3b1;padding:10px;margin-top:8px}
  .section-label{font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;color:#55452e}.oracle-text,.flavor-text{line-height:1.35}.flavor-text{font-style:italic}
  .reminder{font-style:italic;color:#666;font-size:.94em}.stats-box{margin-top:8px;background:#dde4ea;border:1px solid #b2bcc8;padding:8px}.stats-badge{display:inline-block;font-weight:bold;font-size:18px;padding:4px 10px;border:1px solid #7c8da0;background:#f7fbff}
  .card-footer{margin-top:8px;font-size:12px;color:#555}.back-top{margin-top:8px;font-size:13px}.back-top a{color:#15314b;text-decoration:none}.muted{color:#777}
  @media (min-width:901px) and (orientation:landscape){.layout{display:flex;gap:18px;align-items:flex-start}.nav{width:240px;flex:0 0 240px;position:sticky;top:12px;max-height:calc(100vh - 24px);margin-bottom:0}.nav a{display:block;width:auto;margin:2px 0}.cards{flex:1;min-width:0}.card-body{display:flex;gap:14px;align-items:flex-start}.image-wrap,.missing-image{width:220px;max-width:none;flex:0 0 220px;margin:0}}
  @media (max-width:480px){.nav a{display:block;width:100%;margin-right:0}.page{padding:10px}.card-entry{padding:10px}}
</style>
</head>
<body>
<div id="top"></div><div class="page">
<header class="set-header"><h1>${escapeHtml(setName)}</h1><div class="set-sub">Set Code: ${escapeHtml(setCode)} · Generated by MTG Builder v8.2.1 · ${escapeHtml(options.profileLabel)}</div></header>
<div class="layout"><nav class="nav"><h2>Card Navigator</h2>${navItems}</nav><main class="cards">${blocks}</main></div>
</div></body></html>`;
  }

  async function scanChangedSets(setCodes, imageProfiles, settings) {
    const changed = [];
    const unchanged = [];
    const scanFailures = [];

    for (let index = 0; index < setCodes.length; index += 1) {
      if (state.cancelEntireBatch) break;
      const setCode = setCodes[index];
      setStatus(`<strong>Scanning ${index + 1} of ${setCodes.length}</strong>: ${escapeHtml(setCode)}...`);

      try {
        const response = await fetch(`./data/json/${setCode}.json`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const sourceText = await response.text();
        const sourceHash = fnv1a(sourceText);
        const profileFingerprint = fnv1a(stableStringify({ sourceHash, settings }));
        const prior = imageProfiles[setCode];

        if (prior && prior.sourceHash === sourceHash && prior.profileFingerprint === profileFingerprint) {
          unchanged.push({ setCode, sourceHash, profileFingerprint });
        } else {
          changed.push({ setCode, sourceHash, profileFingerprint });
        }
      } catch (error) {
        scanFailures.push({ setCode, error: error && error.message ? error.message : String(error) });
      }

      if ((index + 1) % 5 === 0) await sleep(0);
    }

    return { changed, unchanged, scanFailures };
  }

  async function buildChangedOrNew(event) {
    const profile = (($('outputProfileSelect') || {}).value) || 'compact-text';
    if (profile === 'compact-text') return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (state.running) return;

    const setCodes = discoverSetCodes();
    if (!setCodes.length) {
      setStatus('<p class="hint">No discovered sets found. Scan available sets first.</p>');
      return;
    }

    if (profile === 'card-embedded-images' && typeof ImageLab === 'undefined') {
      setStatus('<p class="hint">ImageLab module is not loaded.</p>');
      return;
    }

    state.running = true;
    state.cancelCurrentSet = false;
    state.cancelEntireBatch = false;
    setCancelButtons(true);

    const settings = profileSettings(profile);
    const imageMode = profile === 'card-no-images' ? 'none' : 'embedded';
    if (typeof ImageLab !== 'undefined') {
      ImageLab.settings.width = settings.imageWidth;
      ImageLab.settings.quality = settings.imageQuality;
    }

    let manifestInfo;
    let manifest;
    let imageProfiles;
    let scanResult;

    let setsCompleted = 0;
    let setsFailed = 0;
    let cardsProcessed = 0;
    let imagesEmbedded = 0;
    let missingImages = 0;
    const perSet = [];

    try {
      setStatus('Loading build manifest...');
      manifestInfo = await fetchManifest();
      manifest = manifestInfo.manifest || {};
      imageProfiles = manifest.imageProfiles && typeof manifest.imageProfiles === 'object'
        ? manifest.imageProfiles
        : {};
      manifest.imageProfiles = imageProfiles;

      scanResult = await scanChangedSets(setCodes, imageProfiles, settings);
      if (state.cancelEntireBatch) return;

      if (!scanResult.changed.length) {
        setStatus(`<strong>No changed/new image-profile sets found.</strong><br>` +
          `<strong>Sets scanned:</strong> ${setCodes.length}<br>` +
          `<strong>Unchanged sets skipped:</strong> ${scanResult.unchanged.length}<br>` +
          `<strong>Scan failures:</strong> ${scanResult.scanFailures.length}`);
        return;
      }

      for (let setIndex = 0; setIndex < scanResult.changed.length; setIndex += 1) {
        if (state.cancelEntireBatch) break;
        state.cancelCurrentSet = false;

        const target = scanResult.changed[setIndex];
        const setCode = target.setCode;
        let processedCards = [];
        let imagesFound = 0;
        let failures = 0;

        try {
          setStatus(`<strong>Changed/new set ${setIndex + 1} of ${scanResult.changed.length}</strong>: Loading ${escapeHtml(setCode)}...`);
          const response = await fetch(`./data/json/${setCode}.json`, { cache: 'no-store' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const json = await response.json();
          const setName = getSetName(json, setCode);
          let cards = sortCards(extractCards(json), settings.navMode);
          if (settings.duplicateMode === 'collapse') cards = collapseDuplicates(cards);

          for (let cardIndex = 0; cardIndex < cards.length; cardIndex += 1) {
            if (state.cancelEntireBatch || state.cancelCurrentSet) break;
            const card = Object.assign({}, cards[cardIndex]);
            setStatus(`<strong>Changed/new set ${setIndex + 1} of ${scanResult.changed.length}</strong>: ${escapeHtml(setCode)} · Card ${cardIndex + 1} of ${cards.length} · ${escapeHtml(card.name || 'Unknown card')}`);

            if (imageMode === 'embedded') {
              const scryfallId = card && card.identifiers && card.identifiers.scryfallId;
              if (scryfallId) {
                try {
                  const imageUrl = await ImageLab.getScryfallImage(scryfallId);
                  if (imageUrl) {
                    card._processedImage = await ImageLab.processImage(imageUrl);
                    imagesFound += 1;
                  } else {
                    failures += 1;
                  }
                } catch (error) {
                  failures += 1;
                  console.warn('Changed/new image failed for', card.name, error);
                }
              } else {
                failures += 1;
              }
            }

            processedCards.push(card);
            if ((cardIndex + 1) % 5 === 0) await sleep(0);
          }

          if (state.cancelEntireBatch || state.cancelCurrentSet) {
            perSet.push(`${setCode}: cancelled before output`);
            continue;
          }

          const profileLabel = profile === 'card-no-images'
            ? 'Card Profile — No Images'
            : `Card Profile — Embedded Images (${settings.imageWidth}px @ ${Math.round(settings.imageQuality * 100)}%)`;

          const html = renderCardProfileHtml(setCode, setName, processedCards, {
            textSize: settings.textSize,
            fieldMode: settings.fieldMode,
            imageMode,
            profileLabel
          });
          const htmlBytes = new TextEncoder().encode(html).length;
          downloadText(`${setCode}.html`, html, 'text/html;charset=utf-8');

          imageProfiles[setCode] = {
            setCode,
            outputFile: `${setCode}.html`,
            sourceHash: target.sourceHash,
            profileFingerprint: target.profileFingerprint,
            settings,
            cardCount: processedCards.length,
            imageCount: imagesFound,
            missingImageCount: failures,
            htmlBytes,
            builtAt: new Date().toISOString(),
            builderVersion: '8.2.1'
          };

          setsCompleted += 1;
          cardsProcessed += processedCards.length;
          imagesEmbedded += imagesFound;
          missingImages += failures;
          perSet.push(`${setCode}: ${processedCards.length} cards · ${imageMode === 'embedded' ? `${imagesFound} images · ` : ''}${formatBytes(htmlBytes)} · ${compatibility(htmlBytes, imageMode)}`);

          setStatus(`<strong>Completed changed/new set ${setIndex + 1} of ${scanResult.changed.length}</strong>: ${escapeHtml(setCode)}<br>` +
            `<strong>Cards processed:</strong> ${processedCards.length}<br>` +
            `${imageMode === 'embedded' ? `<strong>Images embedded:</strong> ${imagesFound}/${processedCards.length}<br>` : ''}` +
            `<strong>Approx HTML size:</strong> ${formatBytes(htmlBytes)}<br>` +
            `<strong>Compatibility:</strong> ${compatibility(htmlBytes, imageMode)}`);
          await sleep(700);
        } catch (error) {
          setsFailed += 1;
          perSet.push(`${setCode}: failed (${error && error.message ? error.message : String(error)})`);
          setStatus(`<strong>${escapeHtml(setCode)} failed.</strong> Continuing to the next changed/new set...`);
          await sleep(700);
        }
      }

      manifest.imageProfiles = imageProfiles;
      manifest.imageProfileManifestVersion = 1;
      manifest.imageProfileBuilderVersion = '8.2.1';
      manifest.imageProfileGeneratedAt = new Date().toISOString();
      downloadText('build-manifest.json', JSON.stringify(manifest, null, 2), 'application/json;charset=utf-8');

      const status = state.cancelEntireBatch ? 'cancelled' : 'complete';
      setStatus(`<strong>Changed/New image-profile build ${status}</strong><br>` +
        `<strong>Sets scanned:</strong> ${setCodes.length}<br>` +
        `<strong>Changed/new sets:</strong> ${scanResult.changed.length}<br>` +
        `<strong>Sets rebuilt:</strong> ${setsCompleted}<br>` +
        `<strong>Unchanged sets skipped:</strong> ${scanResult.unchanged.length}<br>` +
        `<strong>Sets failed:</strong> ${setsFailed + scanResult.scanFailures.length}<br>` +
        `<strong>Cards processed:</strong> ${cardsProcessed}<br>` +
        `${imageMode === 'embedded' ? `<strong>Images embedded:</strong> ${imagesEmbedded}<br><strong>Missing images:</strong> ${missingImages}<br>` : ''}` +
        `<strong>Manifest:</strong> build-manifest.json downloaded<br>` +
        `<div class="image-lab-warning"><strong>Per-set summary</strong><ul>${perSet.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>`);
    } catch (error) {
      console.error(error);
      setStatus(`<strong>Changed/New build failed:</strong> ${escapeHtml(error && error.message ? error.message : String(error))}`);
    } finally {
      state.running = false;
      state.cancelCurrentSet = false;
      state.cancelEntireBatch = false;
      setCancelButtons(false);
    }
  }

  function cancelCurrentSet() {
    if (!state.running) return;
    state.cancelCurrentSet = true;
    setStatus('<strong>Cancellation requested:</strong> current changed/new set will stop after the current card.');
  }

  function cancelEntireBatch() {
    if (!state.running) return;
    state.cancelEntireBatch = true;
    state.cancelCurrentSet = true;
    setStatus('<strong>Cancellation requested:</strong> changed/new batch will stop after the current card.');
  }

  function init() {
    registerModule();
    const buildButton = $('buildChangedCatalogsBtn');
    const cancelCurrent = $('cancelCurrentBatchSetBtn');
    const cancelEntire = $('cancelEntireBatchBtn');

    if (buildButton) buildButton.addEventListener('click', buildChangedOrNew, true);
    if (cancelCurrent) cancelCurrent.addEventListener('click', cancelCurrentSet);
    if (cancelEntire) cancelEntire.addEventListener('click', cancelEntireBatch);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
