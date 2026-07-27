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

  async function sha256(text) {
    const data = new TextEncoder().encode(String(text || ''));
    if (window.crypto && window.crypto.subtle) {
      const hash = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    let hash = 2166136261;
    for (let i = 0; i < data.length; i++) {
      hash ^= data[i];
      hash = Math.imul(hash, 16777619);
    }
    return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
  }

  const CatalogProfileCore = {
    manifestPath: './data/output/build-manifest.json',

    registerModule() {
      if (typeof BuilderModules !== 'undefined') BuilderModules.register('Catalog Profile Core', '8.3.0');
    },

    extractCards(json) {
      if (json && json.data && Array.isArray(json.data.cards)) return json.data.cards;
      if (json && Array.isArray(json.cards)) return json.cards;
      return [];
    },

    getSetName(json, fallbackCode) {
      if (json && json.data && json.data.name) return json.data.name;
      if (json && json.meta && json.meta.name) return json.meta.name;
      if (json && json.name) return json.name;
      return fallbackCode;
    },

    sortCards(cards, navMode) {
      const out = cards.slice();
      if (navMode === 'alpha') {
        out.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')) || String(a.number || '').localeCompare(String(b.number || '')));
      }
      return out;
    },

    collapseDuplicates(cards) {
      const map = new Map();
      for (const card of cards) {
        const key = [card.name, card.manaCost, card.type, card.text || card.oracleText, card.power, card.toughness, card.loyalty, card.defense, card.layout].join('|');
        if (!map.has(key)) map.set(key, Object.assign({_altPrintings: 0}, card));
        else map.get(key)._altPrintings += 1;
      }
      return Array.from(map.values());
    },

    textScale(size) {
      if (size === 'compact') return {body: '14px', h1: '28px', h2: '22px'};
      if (size === 'large') return {body: '18px', h1: '34px', h2: '28px'};
      return {body: '16px', h1: '30px', h2: '24px'};
    },

    renderRulesText(text) {
      const safe = escapeHtml(text || '');
      return safe.replace(/\n/g, '<br>').replace(/(\([^)]*\))/g, '<span class="reminder">$1</span>');
    },

    statBadge(card) {
      if (card.power && card.toughness) return `${escapeHtml(card.power)}/${escapeHtml(card.toughness)}`;
      if (card.loyalty) return `Loyalty ${escapeHtml(card.loyalty)}`;
      if (card.defense) return `Defense ${escapeHtml(card.defense)}`;
      return '';
    },

    formatBytes(bytes) {
      if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB'];
      let value = bytes;
      let idx = 0;
      while (value >= 1024 && idx < units.length - 1) {
        value /= 1024; idx += 1;
      }
      return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
    },

    compatibility(htmlBytes, imageMode) {
      if (imageMode === 'none') return 'Restricted-viewer friendly';
      const mb = htmlBytes / (1024 * 1024);
      if (mb <= 5) return 'Likely restricted-viewer friendly';
      if (mb <= 10) return 'Probably okay, test on device';
      if (mb <= 25) return 'Caution: may be slow on restricted viewers';
      return 'High risk for restricted viewers';
    },

    warnings(report) {
      const list = [];
      if (report.failures > 0) list.push(`${report.failures} card(s) were missing a Scryfall image or ID.`);
      if (report.htmlBytes > 10 * 1024 * 1024) list.push('Generated HTML exceeds 10 MB. Test on the restricted viewer.');
      if (report.htmlBytes > 25 * 1024 * 1024) list.push('Generated HTML exceeds 25 MB and may be too heavy for some restricted viewers.');
      return list;
    },

    gatherOptions() {
      const profile = (($('outputProfileSelect') || {}).value) || 'compact-text';
      const imageMode = profile === 'card-no-images' ? 'none' : 'embedded';
      const imageWidth = Number((($('catalogImageWidthSelect') || {}).value) || 300);
      const imageQuality = Number((($('catalogImageQualitySelect') || {}).value) || 0.65);
      return {
        profile,
        imageMode,
        imageWidth,
        imageQuality,
        textSize: (($('textSizeSelect') || {}).value) || 'comfortable',
        fieldMode: (($('fieldModeSelect') || {}).value) || 'essential',
        navMode: (($('navModeSelect') || {}).value) || 'alpha',
        duplicateMode: (($('duplicateModeSelect') || {}).value) || 'collapse',
        profileLabel: profile === 'card-no-images'
          ? 'Card Profile — No Images'
          : (profile === 'card-embedded-images' ? `Card Profile — Embedded Images (${imageWidth}px @ ${Math.round(imageQuality * 100)}%)` : 'Compact Text Only')
      };
    },

    async profileFingerprint(options) {
      const payload = JSON.stringify({
        profile: options.profile,
        imageMode: options.imageMode,
        imageWidth: options.imageWidth,
        imageQuality: options.imageQuality,
        textSize: options.textSize,
        fieldMode: options.fieldMode,
        navMode: options.navMode,
        duplicateMode: options.duplicateMode
      });
      return sha256(payload);
    },

    async fetchSetSource(setCode) {
      const response = await fetch(`./data/json/${setCode}.json`, {cache: 'no-store'});
      if (!response.ok) throw new Error(`Could not load ${setCode}.json`);
      const text = await response.text();
      const json = JSON.parse(text);
      const sourceHash = await sha256(text);
      return {text, json, sourceHash};
    },

    renderCardProfileHtml(setCode, setName, cards, options) {
      const scale = this.textScale(options.textSize);
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
        const badge = this.statBadge(card);
        const footerParts = [];
        if (card.number) footerParts.push(`#${escapeHtml(card.number)}`);
        if (card.artist && options.fieldMode === 'full') footerParts.push(`Artist: ${escapeHtml(card.artist)}`);
        if (card._altPrintings) footerParts.push(`${card._altPrintings} alternate printing(s)`);
        const footer = footerParts.length ? `<div class="card-footer">${footerParts.join(' · ')}</div>` : '';
        return `<article id="card-${index + 1}" class="card-entry">
          <div class="card-header"><h2>${escapeHtml(card.name)}</h2>${mana}</div>
          <div class="card-body">${img}<div class="card-copy">${type}${layout}<div class="rules-box"><div class="section-label">Oracle Text</div><div class="oracle-text">${this.renderRulesText(oracleText) || '<span class="muted">No rules text</span>'}</div></div>${flavor}${badge ? `<div class="stats-box"><span class="stats-badge">${badge}</span></div>` : ''}${footer}</div></div>
          <div class="back-top"><a href="#top">Back to top</a></div>
        </article>`;
      }).join('\n');

      return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(setCode)} Catalog</title>
<style>
body{font-family:Arial,sans-serif;font-size:${scale.body};margin:0;background:#f3f0e8;color:#202020;}#top{display:block;}.page{max-width:1200px;margin:0 auto;padding:18px;}.set-header{text-align:center;background:#ebe2cf;border:1px solid #b9ac8e;padding:18px;margin-bottom:16px;}.set-header h1{margin:0 0 6px 0;font-size:${scale.h1};}.set-sub{font-size:14px;color:#444;}.layout{display:block;}.nav{width:auto;background:#f8f5ed;border:1px solid #c6baa0;padding:12px;box-sizing:border-box;margin-bottom:16px;position:static;max-height:38vh;overflow-y:auto;}.nav h2{margin:0 0 10px 0;font-size:18px;}.nav a{display:inline-block;vertical-align:top;width:calc(50% - 10px);padding:6px 8px;margin:2px 4px 2px 0;text-decoration:none;color:#15314b;border-radius:4px;box-sizing:border-box;}.nav a:hover,.nav a:focus{background:#e3edf7;}.cards{min-width:0;}.card-entry{background:#fbfaf6;border:1px solid #b8ae96;padding:14px;margin-bottom:16px;}.card-header{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;border-bottom:1px solid #ccbfa2;padding-bottom:8px;margin-bottom:10px;}.card-header h2{margin:0;font-size:${scale.h2};line-height:1.1;}.mana-cost{font-weight:bold;white-space:nowrap;font-size:18px;}.card-body{display:block;}.image-wrap,.missing-image{width:100%;max-width:320px;margin:0 auto 12px;background:#ebe8df;border:1px solid #c2b7a1;padding:8px;box-sizing:border-box;text-align:center;}.image-wrap img{width:100%;height:auto;display:block;}.missing-image{padding:24px 8px;color:#666;background:#f1eee7;}.type-line{font-weight:bold;margin:0 0 3px 0;}.layout-line{margin:0 0 8px 0;font-size:0.9em;color:#4c4c4c;}.rules-box{background:#efe6d4;border:1px solid #cbb999;padding:10px;margin-top:4px;}.flavor-box{background:#f5efe6;border:1px solid #d0c3b1;padding:10px;margin-top:8px;}.section-label{font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;color:#55452e;}.oracle-text,.flavor-text{line-height:1.35;}.flavor-text{font-style:italic;}.reminder{font-style:italic;color:#666;font-size:0.94em;}.stats-box{margin-top:8px;background:#dde4ea;border:1px solid #b2bcc8;padding:8px;}.stats-badge{display:inline-block;font-weight:bold;font-size:18px;padding:4px 10px;border:1px solid #7c8da0;background:#f7fbff;}.card-footer{margin-top:8px;font-size:12px;color:#555;}.back-top{margin-top:8px;font-size:13px;}.back-top a{color:#15314b;text-decoration:none;}.muted{color:#777;}@media (min-width: 901px) and (orientation: landscape){.layout{display:flex;gap:18px;align-items:flex-start;}.nav{width:240px;flex:0 0 240px;position:sticky;top:12px;max-height:calc(100vh - 24px);margin-bottom:0;}.nav a{display:block;width:auto;margin:2px 0;}.cards{flex:1;min-width:0;}.card-body{display:flex;gap:14px;align-items:flex-start;}.image-wrap,.missing-image{width:220px;max-width:none;flex:0 0 220px;margin:0;}}@media (max-width: 480px){.nav a{display:block;width:100%;margin-right:0;}.page{padding:10px;}.card-entry{padding:10px;}}</style>
</head><body><div id="top"></div><div class="page"><header class="set-header"><h1>${escapeHtml(setName)}</h1><div class="set-sub">Set Code: ${escapeHtml(setCode)} · Generated by MTG Builder v8.3 · ${escapeHtml(options.profileLabel)}</div></header><div class="layout"><nav class="nav"><h2>Card Navigator</h2>${navItems}</nav><main class="cards">${blocks}</main></div></div></body></html>`;
    },

    async buildSetFromSource(setCode, source, options, controller, progress) {
      const json = source.json;
      const setName = this.getSetName(json, setCode);
      let cards = this.extractCards(json);
      cards = this.sortCards(cards, options.navMode);
      if (options.duplicateMode === 'collapse') cards = this.collapseDuplicates(cards);
      const processedCards = [];
      let idsFound = 0, imagesFound = 0, failures = 0;
      for (let i = 0; i < cards.length; i++) {
        if (controller && (controller.cancelBatch || controller.cancelCurrent)) break;
        const card = Object.assign({}, cards[i]);
        if (progress) progress({phase:'card', current:i+1, total:cards.length, cardName: card.name || 'Unknown card'});
        if (options.imageMode === 'embedded') {
          const scryfallId = card && card.identifiers && card.identifiers.scryfallId;
          if (scryfallId) idsFound += 1;
          if (scryfallId) {
            try {
              const resolved = await SharedImageCache.resolveProcessedImage(scryfallId, options.imageWidth, options.imageQuality);
              if (resolved && resolved.dataUrl) {
                card._processedImage = resolved.dataUrl;
                imagesFound += 1;
              } else failures += 1;
            } catch (err) {
              failures += 1;
              console.warn('Image resolution failed for', card.name, err);
            }
          } else failures += 1;
        }
        processedCards.push(card);
        if ((i + 1) % 5 === 0) await sleep(0);
      }
      const html = this.renderCardProfileHtml(setCode, setName, processedCards, options);
      const htmlBytes = new TextEncoder().encode(html).length;
      return {setCode, setName, html, htmlBytes, cardsProcessed: processedCards.length, idsFound, imagesFound, failures, sourceHash: source.sourceHash};
    },

    downloadTextFile(name, text) {
      const blob = new Blob([text], {type:'text/plain;charset=utf-8'});
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    },

    downloadHtml(name, html) {
      const blob = new Blob([html], {type:'text/html;charset=utf-8'});
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    },

    async loadManifest() {
      try {
        const response = await fetch(this.manifestPath, {cache:'no-store'});
        if (!response.ok) throw new Error('manifest missing');
        const manifest = await response.json();
        if (!manifest.imageProfiles) manifest.imageProfiles = {};
        return manifest;
      } catch (err) {
        return {builderVersion:'8.3.0', imageProfiles:{}};
      }
    },

    async saveManifestDownload(manifest) {
      manifest.builderVersion = '8.3.0';
      this.downloadTextFile('build-manifest.json', JSON.stringify(manifest, null, 2));
    },

    async updateManifestRecord(manifest, buildResult, options) {
      if (!manifest.imageProfiles) manifest.imageProfiles = {};
      manifest.imageProfiles[buildResult.setCode] = {
        sourceHash: buildResult.sourceHash,
        profileFingerprint: await this.profileFingerprint(options),
        settings: {
          profile: options.profile,
          imageMode: options.imageMode,
          imageWidth: options.imageWidth,
          imageQuality: options.imageQuality,
          textSize: options.textSize,
          fieldMode: options.fieldMode,
          navMode: options.navMode,
          duplicateMode: options.duplicateMode
        },
        outputFile: `${buildResult.setCode}.html`,
        updatedAt: new Date().toISOString()
      };
    },

    async detectChangedSetCodes(allCodes, options, setStatus) {
      const manifest = await this.loadManifest();
      const changed = [];
      const skipped = [];
      const preloaded = {};
      const fingerprint = await this.profileFingerprint(options);
      for (let i = 0; i < allCodes.length; i++) {
        const setCode = allCodes[i];
        if (setStatus) setStatus(`<strong>Scanning ${i + 1} of ${allCodes.length}</strong>: ${escapeHtml(setCode)}`);
        const source = await this.fetchSetSource(setCode);
        const rec = manifest.imageProfiles && manifest.imageProfiles[setCode];
        if (!rec || rec.sourceHash !== source.sourceHash || rec.profileFingerprint !== fingerprint) {
          changed.push(setCode);
          preloaded[setCode] = source;
        } else {
          skipped.push(setCode);
        }
        await sleep(0);
      }
      return {manifest, changed, skipped, preloaded};
    },

    getCheckedSetCodes() {
      return Array.from(document.querySelectorAll('#batchSetList input[type="checkbox"]:checked')).map(box => box.value || box.dataset.code || box.dataset.setCode || '').filter(Boolean);
    },

    getAllSetCodes() {
      return Array.from(document.querySelectorAll('#batchSetList input[type="checkbox"]')).map(box => box.value || box.dataset.code || box.dataset.setCode || '').filter(Boolean);
    }
  };

  window.CatalogProfileCore = CatalogProfileCore;
  CatalogProfileCore.registerModule();
})();
