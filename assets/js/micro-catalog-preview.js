/*
 * MTG Builder v8.7.1.2 — Micro Catalog Preview & Native Art Crops
 *
 * Purpose: render a dense, print-oriented sheet preview without creating a
 * second card-data pipeline. The preview consumes the active Output Designer
 * profile and representative normalized card fields.
 *
 * This module deliberately does NOT fetch set JSON, download images, or write
 * price data. Production catalog generation remains responsible for those jobs.
 */
(function () {
  'use strict';

  // Representative cards make the preview useful before a real set build.
  // They are presentation fixtures, not a second source of card data.
  const SAMPLE_CARDS = [
    {name:'Aether Channeler',mana:'{2}{U}',type:'Creature — Human Wizard',oracle:'When this enters, choose one — draw a card; create a 1/1 token; or return another nonland permanent with mana value 2 or less.',flavor:'Every current has a story.',rarity:'U',number:'123',stats:'2/1',artist:'M. Example',art:'water'},
    {name:'Sample Dragon',mana:'{4}{R}{R}',type:'Creature — Dragon',oracle:'Flying. Whenever this attacks, it deals 2 damage to any target.',flavor:'The horizon remembers its wings.',rarity:'M',number:'124',stats:'5/5',artist:'J. Example',art:'fire'},
    {name:'Forest Guardian',mana:'{2}{G}',type:'Creature — Beast',oracle:'Trample. When this enters, you may search your library for a basic land card, reveal it, then shuffle.',flavor:'The roots know every path.',rarity:'R',number:'125',stats:'3/3',artist:'A. Example',art:'forest'},
    {name:'Arcane Lesson',mana:'{1}{U}',type:'Sorcery',oracle:'Draw two cards, then discard a card.',flavor:'Knowledge is a current, not a destination.',rarity:'C',number:'126',stats:'',artist:'K. Example',art:'arcane'},
    {name:'Sunlit Healer',mana:'{1}{W}',type:'Creature — Cleric',oracle:'When this enters, you gain 3 life.',flavor:'Dawn arrives for everyone.',rarity:'C',number:'127',stats:'2/2',artist:'R. Example',art:'light'},
    {name:'Night Market',mana:'{B}',type:'Land',oracle:'{T}: Add {B}.',flavor:'Some bargains are made after dark.',rarity:'U',number:'128',stats:'',artist:'S. Example',art:'night'},
    {name:'Copper Automaton',mana:'{3}',type:'Artifact Creature — Construct',oracle:'Vigilance. This gets +1/+1 as long as you control another artifact.',flavor:'Precision without a heartbeat.',rarity:'U',number:'129',stats:'3/3',artist:'P. Example',art:'metal'},
    {name:'Rising Current',mana:'{2}{U}',type:'Instant',oracle:'Return target creature to its owner’s hand. Draw a card.',flavor:'The tide does not negotiate.',rarity:'C',number:'130',stats:'',artist:'T. Example',art:'water'},
    {name:'Desert Wayfinder',mana:'{2}{W}',type:'Creature — Scout',oracle:'Whenever this attacks, you may tap target creature.',flavor:'Every dune leaves a map.',rarity:'C',number:'131',stats:'2/3',artist:'D. Example',art:'desert'},
    {name:'Grave Whisper',mana:'{2}{B}',type:'Creature — Spirit',oracle:'When this dies, return another target creature card from your graveyard to your hand.',flavor:'The quietest voices travel farthest.',rarity:'R',number:'132',stats:'2/2',artist:'N. Example',art:'spirit'}
  ];

  function esc(value) {
    return String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function mana(text) {
    // Reuse the project's existing mana renderer so the preview stays visually
    // consistent with normal catalogs.
    const renderer = window.MTGSymbolRenderer;
    return renderer ? renderer.manaToHtml(text || '', true) : esc(text || '');
  }

  function price(card, mode) {
    if (mode === 'hide') return '';
    // Preview-only placeholder. Real builds continue using PriceSnapshotManager.
    const value = (0.18 + (Number(card.number) % 17) * 0.07).toFixed(2);
    return mode === 'compact' ? `<span class="mc-price">TCG $${value}</span>` : `<span class="mc-price">$${value}</span>`;
  }

  function art(card, mode, artMap) {
    if (mode === 'none') return '';
    const label = mode === 'full' ? 'Full card' : 'Cropped art';
    const image = artMap && artMap[card.identifiers && card.identifiers.scryfallId];
    if (image) {
      return `<div class="mc-art mc-art-real mc-art-${esc(mode)}" aria-label="${esc(label)}"><img src="${image}" alt=""></div>`;
    }
    // Preview fixtures still receive a neutral placeholder when no real card
    // has been loaded. Production builds never use these fixture backgrounds.
    return `<div class="mc-art mc-art-${esc(card.art || 'default')} mc-art-${esc(mode)}" aria-label="${esc(label)} preview"><span>${esc(label)}</span></div>`;
  }

  function oracleText(card, mode) {
    if (mode === 'hide') return '';
    let text = card.oracle;
    if (mode === 'compact' && text.length > 92) text = text.slice(0,89).trimEnd() + '…';
    return `<div class="mc-oracle">${esc(text)}</div>`;
  }

  // Build one compact card cell from the active profile. Keeping this function
  // small makes later print-density changes easier to reason about.
  function renderCard(card, profile, index, artMap) {
    const density = profile.microDensity || 'reference';
    const oracleMode = profile.microOracleMode || (density === 'rules' ? 'full' : density === 'collector' ? 'hide' : 'compact');
    const artMode = profile.microArtMode || 'crop';
    const showFlavor = profile.microFlavor === true && density !== 'collector';
    const showArtist = profile.microShowArtist === true && density === 'rules';
    const showStats = profile.microShowStats !== false && !!card.stats;
    const priceMode = profile.microPriceMode || 'lowest';
    return `<article class="micro-card mc-density-${density}" data-index="${index}"><div class="mc-top">${art(card, artMode, artMap)}<div class="mc-main"><div class="mc-name-row"><strong>${esc(card.name)}</strong><span class="mc-mana">${mana(card.mana)}</span></div><div class="mc-type">${esc(card.type)}</div>${oracleText(card, oracleMode)}${showFlavor ? `<div class="mc-flavor">${esc(card.flavor)}</div>` : ''}<div class="mc-meta"><span>${esc(card.rarity)} · #${esc(card.number)}</span>${showStats ? `<strong>${esc(card.stats)}</strong>` : ''}</div>${showArtist ? `<div class="mc-artist">${esc(card.artist)}</div>` : ''}<div class="mc-price-row">${price(card, priceMode)}</div></div></div></article>`;
  }

  function render(profile, cardsInput, artMap) {
    const p = profile || {};
    const count = Number(p.printCardsPerSide || 30);
    const cols = count === 30 ? 5 : 4;
    const rows = count === 20 ? 5 : 6;
    const sourceCards = Array.isArray(cardsInput) && cardsInput.length ? cardsInput : SAMPLE_CARDS;
    const cards = Array.from({length:count},(_,i)=>sourceCards[i % sourceCards.length]);
    return `<div class="micro-preview-shell"><section class="micro-sheet micro-paper-${esc(p.printPaper || 'letter')}"><header class="micro-sheet-header"><strong>Sample Set — Micro Catalog</strong><span>${count} cards / side · ${cols} × ${rows} · ${esc(p.microDensity || 'reference')}</span></header><div class="micro-grid" style="--mc-cols:${cols};--mc-rows:${rows}">${cards.map((c,i)=>renderCard(c,p,i,artMap)).join('')}</div></section></div>`;
  }

  function css(profile) {
    const p = profile || {};
    const font = Number(p.printFontSize || 6.2);
    return `.micro-preview-shell{padding:12px;background:#555;min-height:100%;font-family:Arial,sans-serif}.micro-sheet{background:#fff;color:#111;width:100%;aspect-ratio:11/8.5;padding:1.2%;box-shadow:0 2px 12px rgba(0,0,0,.45);display:flex;flex-direction:column;overflow:hidden}.micro-sheet-header{height:4%;display:flex;align-items:center;justify-content:space-between;font-size:${Math.max(5.5,font)}px;padding:0 2px}.micro-grid{height:96%;display:grid;grid-template-columns:repeat(var(--mc-cols),minmax(0,1fr));grid-template-rows:repeat(var(--mc-rows),minmax(0,1fr));gap:1px}.micro-card{border:${p.printCutGuides === false ? '1px solid #ddd' : '1px solid #555'};overflow:hidden;padding:2px;min-width:0;line-height:1.05;background:#fff}.mc-top{display:flex;gap:2px;height:100%;min-width:0}.mc-art{flex:0 0 16%;height:100%;min-width:0;background:#8795a3;display:flex;align-items:flex-end;justify-content:center;overflow:hidden}.mc-art-real img{width:100%;height:100%;display:block;object-fit:cover}.mc-art span{font-size:${Math.max(3.8,font-1.5)}px;font-weight:700;background:rgba(255,255,255,.78);padding:1px;text-align:center;width:100%}.mc-art-crop{background:linear-gradient(135deg,#4b7c9e 0 25%,#a96d35 25% 48%,#315d38 48% 72%,#5c3e71 72%)}.mc-art-full{flex-basis:20%;background:linear-gradient(145deg,#193b59,#b47d45 45%,#263f2a)}.mc-name-row{display:flex;justify-content:space-between;align-items:center;gap:2px;font-size:${Math.max(4.5,font)}px;white-space:nowrap}.mc-name-row strong{overflow:hidden;text-overflow:ellipsis}.mc-mana{white-space:nowrap;display:inline-flex;align-items:center}.mc-mana img,.mc-mana .mana-symbol{width:${Math.max(5,font-1)}px;height:${Math.max(5,font-1)}px}.mc-type{font-size:${Math.max(3.8,font-1.2)}px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}.mc-oracle{font-size:${Math.max(3.8,font-1.1)}px;margin-top:1px;display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden}.mc-density-collector .mc-oracle{display:none}.mc-density-reference .mc-oracle{-webkit-line-clamp:2}.mc-density-rules .mc-oracle{-webkit-line-clamp:5}.mc-flavor{font-size:${Math.max(3.5,font-1.5)}px;font-style:italic;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}.mc-meta{display:flex;justify-content:space-between;gap:2px;font-size:${Math.max(3.6,font-1.6)}px;margin-top:1px}.mc-artist{font-size:${Math.max(3.4,font-1.7)}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mc-price-row{font-size:${Math.max(3.6,font-1.6)}px;text-align:right}.mc-price{font-weight:700}@media(max-width:900px){.micro-sheet{aspect-ratio:auto;min-height:700px}.micro-grid{min-height:650px}}`;
  }

  const artCache = new Map();

  /**
   * Resolve real Scryfall art crops for the first page of the preview.
   * Results live in memory for the current builder session; the shared image
   * cache handles persistent browser/GitHub storage.
   */
  async function hydrate(cards) {
    const out = {};
    if (!window.SharedImageCache || !Array.isArray(cards)) return out;
    const limited = cards.slice(0, 30);
    for (const card of limited) {
      const id = card && card.identifiers && card.identifiers.scryfallId;
      if (!id) continue;
      if (artCache.has(id)) {
        out[id] = artCache.get(id);
        continue;
      }
      try {
        const resolved = await SharedImageCache.resolveArtCrop(id);
        if (resolved && resolved.dataUrl) {
          artCache.set(id, resolved.dataUrl);
          out[id] = resolved.dataUrl;
        }
      } catch (error) {
        console.warn('Micro preview art crop failed for', card.name, error);
      }
    }
    return out;
  }

  window.MicroCatalogPreview = {version:'8.7.1.2',render,css,hydrate};
})();
