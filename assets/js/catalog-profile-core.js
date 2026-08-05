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
      if (typeof BuilderModules !== 'undefined') BuilderModules.register('Catalog Profile Core', '8.7.0');
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

    renderRulesText(text, symbolMode) {
      const embedded = symbolMode !== 'text';
      const renderer = window.MTGSymbolRenderer;
      const symbols = [];

      // Protect mana tokens before applying any text-oriented formatting. This
      // prevents reminder-text parsing from touching parentheses inside an
      // embedded SVG data URI such as url(#g) or rgba(...).
      const protectedText = String(text || '').replace(/\{([^}\r\n]+)\}/g, match => {
        const marker = `\uE000MTGSYM${symbols.length}\uE001`;
        symbols.push(match);
        return marker;
      });

      let safe = escapeHtml(protectedText)
        .replace(/(\([^()\n]*\))/g, '<span class="reminder">$1</span>')
        .replace(/\n/g, '<br>');

      symbols.forEach((token, index) => {
        const marker = `\uE000MTGSYM${index}\uE001`;
        const symbolHtml = renderer
          ? renderer.manaToHtml(token, embedded)
          : escapeHtml(token);
        safe = safe.split(marker).join(symbolHtml);
      });

      return safe;
    },

    renderManaCost(text, symbolMode) {
      const embedded = symbolMode !== 'text';
      const renderer = window.MTGSymbolRenderer;
      return renderer ? renderer.manaToHtml(text || '', embedded) : escapeHtml(text || '');
    },

    renderRarity(rarity) {
      const renderer = window.MTGSymbolRenderer;
      return renderer ? renderer.renderRarityIcon(rarity) : '';
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
      if (report.priceMissing > 0 && report.priceMatches === 0) list.push('Price display is enabled, but no cards matched the loaded price snapshot.');
      else if (report.priceMissing > 0) list.push(`${report.priceMissing} card(s) had no selected price data.`);
      if (report.htmlBytes > 10 * 1024 * 1024) list.push('Generated HTML exceeds 10 MB. Test on the restricted viewer.');
      if (report.htmlBytes > 25 * 1024 * 1024) list.push('Generated HTML exceeds 25 MB and may be too heavy for some restricted viewers.');
      return list;
    },

    gatherOptions() {
      const profile = (($('outputProfileSelect') || {}).value) || 'compact-text';
      const imageMode = (profile === 'card-no-images' || profile === 'print-dense') ? 'none' : 'embedded';
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
        symbolMode: (($('symbolModeSelect') || {}).value) || 'embedded',
        priceSettings: window.PriceSnapshotManager ? PriceSnapshotManager.getBuildSettings() : {enabled:false},
        printSettings: window.OutputDesigner ? (()=>{const p=OutputDesigner.getProfile();return {paper:p.printPaper,cardsPerSide:p.printCardsPerSide,fontSize:p.printFontSize,flavorMode:p.printFlavorMode,priceMode:p.printPriceMode,showArtist:p.printShowArtist,cutGuides:p.printCutGuides};})() : {paper:'letter',cardsPerSide:30,fontSize:6.2,flavorMode:'auto',priceMode:'lowest',showArtist:false,cutGuides:true},
        profileLabel: profile === 'card-no-images'
          ? 'Card Profile — No Images'
          : (profile === 'card-embedded-images' ? `Card Profile — Embedded Images (${imageWidth}px @ ${Math.round(imageQuality * 100)}%)` : (profile === 'print-dense' ? 'Printable Micro Catalog' : 'Compact Text Only'))
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
        duplicateMode: options.duplicateMode,
        symbolMode: options.symbolMode,
        design: (window.OutputDesigner ? OutputDesigner.getFingerprintData() : null),
        price: (window.PriceSnapshotManager ? PriceSnapshotManager.getFingerprintData() : null),
        print: options.printSettings || null
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

    profileRecordKey(setCode, profile) {
      return `${String(setCode || '').toUpperCase()}::${profile || 'card-no-images'}`;
    },

    outputFileName(setCode, profile) {
      return profile === 'print-dense' ? `${setCode}-print.html` : `${setCode}.html`;
    },

    printPaperInfo(paper) {
      if (paper === 'a4') return {pageRule:'A4 landscape', width:11.33, height:7.91, label:'A4 landscape'};
      if (paper === 'legal') return {pageRule:'legal landscape', width:13.64, height:8.14, label:'US Legal landscape'};
      return {pageRule:'letter landscape', width:10.64, height:8.14, label:'US Letter landscape'};
    },

    compactPrintText(text, maxChars) {
      const source = String(text || '').replace(/\s*\n\s*/g, ' • ').replace(/\s+/g, ' ').trim();
      if (!maxChars || source.length <= maxChars) return {text:source, shortened:false};
      const cut = source.slice(0, Math.max(1,maxChars-1));
      const boundary = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '), cut.lastIndexOf(' '));
      return {text:(boundary > maxChars * .72 ? cut.slice(0,boundary) : cut).trim() + '…', shortened:true};
    },

    formatPrintCurrency(value, currency) {
      const n = Number(value);
      if (!Number.isFinite(n)) return '—';
      const code = String(currency || 'USD').toUpperCase();
      const sign = code === 'EUR' ? '€' : code === 'GBP' ? '£' : '$';
      return `${sign}${n.toFixed(2)}`;
    },

    renderPrintPrice(record, mode) {
      if (!record || mode === 'hide') return '';
      const points=[];
      (record.providers||[]).forEach(provider=>(provider.points||[]).forEach(point=>points.push({provider,point})));
      if (!points.length) return '';
      let chosen=[];
      if (mode === 'compact') {
        const seen=new Set();
        for (const item of points) {
          const key=item.provider.id||item.provider.short;
          if (seen.has(key)) continue;
          seen.add(key); chosen.push(item);
          if (chosen.length>=3) break;
        }
      } else {
        const best={};
        points.forEach(item=>{const cur=String(item.point.currency||item.provider.currency||'USD').toUpperCase();if(!best[cur]||Number(item.point.value)<Number(best[cur].point.value))best[cur]=item;});
        chosen=Object.values(best).slice(0,2);
      }
      return chosen.length ? `<div class="print-price">${chosen.map(item=>`${escapeHtml(item.provider.short||item.provider.label||item.provider.id)} ${this.formatPrintCurrency(item.point.value,item.point.currency||item.provider.currency)}`).join(' · ')}</div>` : '';
    },

    renderPrintableProfileHtml(setCode, setName, cards, options) {
      const ps=Object.assign({paper:'letter',cardsPerSide:30,fontSize:6.2,flavorMode:'auto',priceMode:'lowest',showArtist:false,cutGuides:true},options.printSettings||{});
      const count=[20,24,30].includes(Number(ps.cardsPerSide))?Number(ps.cardsPerSide):30;
      const cols=count===30?5:4, rows=count===20?5:6;
      const paper=this.printPaperInfo(ps.paper);
      const totalPages=Math.max(1,Math.ceil(cards.length/count));
      const maxRules=count===30?520:count===24?760:980;
      const flavorRuleLimit=count===30?190:count===24?310:450;
      const flavorMax=count===30?105:count===24?170:240;
      const pages=[];
      for(let pageIndex=0;pageIndex<totalPages;pageIndex++){
        const slice=cards.slice(pageIndex*count,(pageIndex+1)*count);
        const cells=slice.map((card,offset)=>{
          const rawRules=card.text||card.oracleText||'';
          const compact=this.compactPrintText(rawRules,maxRules);
          const mana=card.manaCost?`<span class="print-mana">${this.renderManaCost(card.manaCost,options.symbolMode)}</span>`:'';
          const type=card.type?`<div class="print-type">${escapeHtml(card.type)}</div>`:'';
          const ruleClass=rawRules.length>470?' print-rules-xlong':rawRules.length>300?' print-rules-long':'';
          const rules=compact.text?`<div class="print-rules${ruleClass}">${this.renderRulesText(compact.text,options.symbolMode)}</div>`:'<div class="print-rules print-muted">No rules text</div>';
          let flavor='';
          const allowFlavor=ps.flavorMode==='always'||(ps.flavorMode==='auto'&&rawRules.length<=flavorRuleLimit);
          if(allowFlavor&&card.flavorText){const f=this.compactPrintText(card.flavorText,flavorMax);flavor=`<div class="print-flavor">${escapeHtml(f.text)}</div>`;}
          const stats=this.statBadge(card);
          const rarity=card.rarity?escapeHtml(String(card.rarity).charAt(0).toUpperCase()):'';
          const collector=card.number?`#${escapeHtml(card.number)}`:'';
          const artist=ps.showArtist&&card.artist?`<span class="print-artist">${escapeHtml(card.artist)}</span>`:'';
          const shortened=compact.shortened?'<span class="print-shortened" title="Oracle text shortened for dense print">*</span>':'';
          const price=this.renderPrintPrice(card._priceData,ps.priceMode);
          return `<article class="print-card"><header><h2>${escapeHtml(card.name||`Card ${pageIndex*count+offset+1}`)}${shortened}</h2>${mana}</header>${type}${rules}${flavor}<footer><span>${rarity}${rarity&&collector?' · ':''}${collector}${artist?` · ${artist}`:''}</span><strong>${stats}</strong></footer>${price}</article>`;
        }).join('');
        pages.push(`<section class="print-sheet"><div class="print-caption"><strong>${escapeHtml(setName)} (${escapeHtml(setCode)})</strong><span>Side ${pageIndex+1}/${totalPages} · ${count} cards/side · duplex up to ${count*2}/sheet</span></div><div class="print-grid">${cells}</div></section>`);
      }
      const border=ps.cutGuides?'#555':'#d4d4d4';
      return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(setCode)} Printable Catalog</title><style>
@page{size:${paper.pageRule};margin:.18in}*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;background:#444;color:#000}.screen-note{max-width:${paper.width}in;margin:12px auto;padding:10px 14px;background:#fff8cf;border:1px solid #9c8b42;font-size:13px}.print-sheet{width:${paper.width}in;height:${paper.height}in;margin:14px auto;background:#fff;padding:0;display:flex;flex-direction:column;box-shadow:0 3px 18px rgba(0,0,0,.5);break-after:page;page-break-after:always}.print-sheet:last-child{break-after:auto;page-break-after:auto}.print-caption{height:.21in;display:flex;align-items:center;justify-content:space-between;gap:.1in;padding:0 .035in;font-size:6.5pt;line-height:1;border-bottom:.5pt solid #777}.print-grid{height:calc(100% - .21in);display:grid;grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr);gap:.018in;padding-top:.018in}.print-card{min-width:0;min-height:0;overflow:hidden;border:.55pt solid ${border};padding:.025in .032in;display:flex;flex-direction:column;font-size:${Number(ps.fontSize)||6.2}pt;line-height:1.08;background:#fff}.print-card header{display:flex;justify-content:space-between;align-items:flex-start;gap:.025in;border-bottom:.35pt solid #888;padding-bottom:.012in;margin-bottom:.012in;flex:0 0 auto}.print-card h2{font-size:1.13em;line-height:1.02;margin:0;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.print-mana{display:flex;gap:.01in;white-space:nowrap;flex:0 0 auto}.mana{width:1.05em;height:1.05em;vertical-align:-.15em}.print-type{font-size:.93em;font-weight:700;line-height:1.04;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:.012in}.print-rules{flex:1 1 auto;overflow:hidden}.print-rules-long{font-size:.91em;line-height:1.03}.print-rules-xlong{font-size:.82em;line-height:1.01}.reminder{font-style:italic;color:#444;font-size:.92em}.print-flavor{font-style:italic;color:#444;font-size:.84em;line-height:1.02;border-top:.25pt dotted #aaa;margin-top:.012in;padding-top:.01in;max-height:2.15em;overflow:hidden}.print-card footer{display:flex;justify-content:space-between;gap:.03in;align-items:flex-end;border-top:.35pt solid #999;margin-top:.012in;padding-top:.01in;font-size:.82em;line-height:1;flex:0 0 auto;white-space:nowrap}.print-card footer>span{overflow:hidden;text-overflow:ellipsis}.print-artist{color:#444}.print-price{font-size:.79em;font-weight:700;line-height:1;margin-top:.012in;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.print-shortened{font-size:.7em;vertical-align:top}.print-muted{color:#777;font-style:italic}@media print{body{background:#fff}.screen-note{display:none}.print-sheet{margin:0;box-shadow:none;width:${paper.width}in;height:${paper.height}in}}
</style></head><body><div class="screen-note"><strong>Print setup:</strong> ${paper.label}, actual size/100%, background graphics on. For up to ${count*2} card summaries per physical sheet, use double-sided printing and flip on the long edge. An asterisk after a card name means unusually long Oracle text was shortened for the dense layout.</div>${pages.join('')}</body></html>`;
    },

    renderCardProfileHtml(setCode, setName, cards, options) {
      const scale = this.textScale(options.textSize);
      const designerCss = window.OutputDesigner ? OutputDesigner.getGeneratedCss('catalog') : '';
      const designSummary = window.OutputDesigner ? OutputDesigner.getProfileSummary() : null;
      const priceCss = window.PriceSnapshotManager ? PriceSnapshotManager.getOutputCss() : '';
      const navItems = cards.map((card, index) => `<a href="#card-${index + 1}">${escapeHtml(card.name || `Card ${index + 1}`)}</a>`).join('\n');
      const blocks = cards.map((card, index) => {
        const img = options.imageMode === 'none' ? '' : (
          card._processedImage
            ? `<div class="image-wrap"><img src="${card._processedImage}" alt="${escapeHtml(card.name)}"></div>`
            : '<div class="missing-image">No image available</div>'
        );
        const mana = card.manaCost ? `<div class="mana-cost">${this.renderManaCost(card.manaCost, options.symbolMode)}</div>` : '';
        const rarity = (card.rarity && options.fieldMode === 'full') ? `<div class="rarity-line">${this.renderRarity(card.rarity)}<span class="rarity-label">${escapeHtml(card.rarity)}</span></div>` : '';
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
        const priceBox = window.PriceSnapshotManager ? PriceSnapshotManager.renderCardPriceBox(card._priceData, options.priceSettings) : '';
        return `<article id="card-${index + 1}" class="card-entry">
          <div class="card-header"><h2>${escapeHtml(card.name)}</h2>${mana}</div>
          <div class="card-body">${img}<div class="card-copy">${type}${layout}${rarity}<div class="rules-box"><div class="section-label">Oracle Text</div><div class="oracle-text">${this.renderRulesText(oracleText, options.symbolMode) || '<span class="muted">No rules text</span>'}</div></div>${flavor}${badge ? `<div class="stats-box"><span class="stats-badge">${badge}</span></div>` : ''}${priceBox}${footer}</div></div>
          <div class="back-top"><a href="#top">Back to top</a></div>
        </article>`;
      }).join('\n');

      return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(setCode)} Catalog</title>
<style>
body{font-family:Arial,sans-serif;font-size:${scale.body};margin:0;background:#f3f0e8;color:#202020;}#top{display:block;}.page{max-width:1200px;margin:0 auto;padding:18px;}.set-header{text-align:center;background:#ebe2cf;border:1px solid #b9ac8e;padding:18px;margin-bottom:16px;}.set-header h1{margin:0 0 6px 0;font-size:${scale.h1};}.set-sub{font-size:14px;color:#444;}.layout{display:block;}.nav{width:auto;background:#f8f5ed;border:1px solid #c6baa0;padding:12px;box-sizing:border-box;margin-bottom:16px;position:static;max-height:38vh;overflow-y:auto;}.nav h2{margin:0 0 10px 0;font-size:18px;}.nav a{display:inline-block;vertical-align:top;width:calc(50% - 10px);padding:6px 8px;margin:2px 4px 2px 0;text-decoration:none;color:#15314b;border-radius:4px;box-sizing:border-box;}.nav a:hover,.nav a:focus{background:#e3edf7;}.cards{min-width:0;}.card-entry{background:#fbfaf6;border:1px solid #b8ae96;padding:14px;margin-bottom:16px;}.card-header{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;border-bottom:1px solid #ccbfa2;padding-bottom:8px;margin-bottom:10px;}.card-header h2{margin:0;font-size:${scale.h2};line-height:1.1;}.mana-cost{font-weight:bold;white-space:nowrap;font-size:18px;display:flex;align-items:center;gap:3px;flex-wrap:wrap;justify-content:flex-end;}.mana{width:1.35em;height:1.35em;vertical-align:middle;}.mana-fallback{display:inline-flex;align-items:center;justify-content:center;min-width:1.35em;height:1.35em;border:1px solid #666;border-radius:999px;background:#ece8df;color:#222;font-size:.8em;line-height:1;padding:0 .18em;}.oracle-text .mana{width:1.25em;height:1.25em;}.rarity-line{display:flex;align-items:center;gap:6px;margin:6px 0 4px;}.rarity-icon{width:1.05em;height:1.05em;vertical-align:middle;}.rarity-label{text-transform:capitalize;font-size:.9em;color:#555;}.card-body{display:block;}.image-wrap,.missing-image{width:100%;max-width:320px;margin:0 auto 12px;background:#ebe8df;border:1px solid #c2b7a1;padding:8px;box-sizing:border-box;text-align:center;}.image-wrap img{width:100%;height:auto;display:block;}.missing-image{padding:24px 8px;color:#666;background:#f1eee7;}.type-line{font-weight:bold;margin:0 0 3px 0;}.layout-line{margin:0 0 8px 0;font-size:0.9em;color:#4c4c4c;}.rules-box{background:#efe6d4;border:1px solid #cbb999;padding:10px;margin-top:4px;}.flavor-box{background:#f5efe6;border:1px solid #d0c3b1;padding:10px;margin-top:8px;}.section-label{font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;color:#55452e;}.oracle-text,.flavor-text{line-height:1.35;}.flavor-text{font-style:italic;}.reminder{font-style:italic;color:#666;font-size:0.94em;}.stats-box{margin-top:8px;background:#dde4ea;border:1px solid #b2bcc8;padding:8px;}.stats-badge{display:inline-block;font-weight:bold;font-size:18px;padding:4px 10px;border:1px solid #7c8da0;background:#f7fbff;}.card-footer{margin-top:8px;font-size:12px;color:#555;}.back-top{margin-top:8px;font-size:13px;}.back-top a{color:#15314b;text-decoration:none;}.muted{color:#777;}@media (min-width: 901px) and (orientation: landscape){.layout{display:flex;gap:18px;align-items:flex-start;}.nav{width:240px;flex:0 0 240px;position:sticky;top:12px;max-height:calc(100vh - 24px);margin-bottom:0;}.nav a{display:block;width:auto;margin:2px 0;}.cards{flex:1;min-width:0;}.card-body{display:flex;gap:14px;align-items:flex-start;}.image-wrap,.missing-image{width:220px;max-width:none;flex:0 0 220px;margin:0;}}@media (max-width: 480px){.nav a{display:block;width:100%;margin-right:0;}.page{padding:10px;}.card-entry{padding:10px;}}${designerCss}${priceCss}</style>
</head><body><div id="top"></div><div class="page"><header class="set-header"><h1>${escapeHtml(setName)}</h1><div class="set-sub">Set Code: ${escapeHtml(setCode)} · Generated by MTG Builder v8.7.0 · ${escapeHtml(options.profileLabel)}${designSummary ? ` · Design: ${escapeHtml(designSummary.name)}` : ''}</div></header><div class="layout"><nav class="nav"><h2>Card Navigator</h2>${navItems}</nav><main class="cards">${blocks}</main></div></div></body></html>`;
    },

    async buildSetFromSource(setCode, source, options, controller, progress) {
      const json = source.json;
      const setName = this.getSetName(json, setCode);
      let cards = this.extractCards(json);
      cards = this.sortCards(cards, options.navMode);
      if (options.duplicateMode === 'collapse') cards = this.collapseDuplicates(cards);
      const processedCards = [];
      let idsFound = 0, imagesFound = 0, failures = 0, priceMatches = 0, priceMissing = 0;
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
        if (options.priceSettings && options.priceSettings.enabled && window.PriceSnapshotManager) {
          card._priceData = PriceSnapshotManager.lookupCard(card, options.priceSettings);
          if (card._priceData) priceMatches += 1; else priceMissing += 1;
        }
        processedCards.push(card);
        if ((i + 1) % 5 === 0) await sleep(0);
      }
      const html = options.profile === 'print-dense' ? this.renderPrintableProfileHtml(setCode, setName, processedCards, options) : this.renderCardProfileHtml(setCode, setName, processedCards, options);
      const outputFileName = this.outputFileName(setCode, options.profile);
      const htmlBytes = new TextEncoder().encode(html).length;
      return {setCode, setName, html, htmlBytes, outputFileName, cardsProcessed: processedCards.length, idsFound, imagesFound, failures, priceMatches, priceMissing, priceSummary:(window.PriceSnapshotManager?PriceSnapshotManager.getSummary():null), sourceHash: source.sourceHash};
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
        return {builderVersion:'8.7.0', imageProfiles:{}};
      }
    },

    async saveManifestDownload(manifest) {
      manifest.builderVersion = '8.7.0';
      this.downloadTextFile('build-manifest.json', JSON.stringify(manifest, null, 2));
    },

    async updateManifestRecord(manifest, buildResult, options) {
      if (!manifest.imageProfiles) manifest.imageProfiles = {};
      const recordKey = this.profileRecordKey(buildResult.setCode, options.profile);
      manifest.imageProfiles[recordKey] = {
        setCode: buildResult.setCode,
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
          duplicateMode: options.duplicateMode,
          designProfile: (window.OutputDesigner ? OutputDesigner.getProfileSummary() : null),
          priceProfile: (window.PriceSnapshotManager ? PriceSnapshotManager.getFingerprintData() : null),
          printProfile: options.printSettings || null
        },
        outputFile: buildResult.outputFileName || this.outputFileName(buildResult.setCode, options.profile),
        updatedAt: new Date().toISOString()
      };
    },

    async inspectSetChanges(allCodes, options, setStatus) {
      const manifest = await this.loadManifest();
      const changed = [];
      const skipped = [];
      const preloaded = {};
      const records = [];
      const errors = [];
      const fingerprint = await this.profileFingerprint(options);
      for (let i = 0; i < allCodes.length; i++) {
        const setCode = allCodes[i];
        if (setStatus) setStatus(`<strong>Scanning ${i + 1} of ${allCodes.length}</strong>: ${escapeHtml(setCode)}`);
        try {
          const source = await this.fetchSetSource(setCode);
          const recordKey = this.profileRecordKey(setCode, options.profile);
          const rec = manifest.imageProfiles && (manifest.imageProfiles[recordKey] || (options.profile !== 'print-dense' ? manifest.imageProfiles[setCode] : null));
          let reason = 'Current';
          let state = 'current';
          if (!rec) { reason = 'No prior manifest record'; state = 'new'; }
          else if (rec.sourceHash !== source.sourceHash) { reason = 'Set JSON changed'; state = 'changed'; }
          else if (rec.profileFingerprint !== fingerprint) { reason = 'Output, design, price, or symbol settings changed'; state = 'changed'; }
          if (state === 'current') skipped.push(setCode);
          else { changed.push(setCode); preloaded[setCode] = source; }
          records.push({setCode, state, reason, sourceHash:source.sourceHash, previous:rec || null});
        } catch (error) {
          const reason = error && error.message ? error.message : String(error);
          records.push({setCode, state:'error', reason});
          errors.push({setCode, reason});
        }
        await sleep(0);
      }
      return {manifest, changed, skipped, preloaded, records, errors, fingerprint};
    },

    async detectChangedSetCodes(allCodes, options, setStatus) {
      return this.inspectSetChanges(allCodes, options, setStatus);
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
