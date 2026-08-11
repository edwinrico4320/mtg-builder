/*
 * MTG Builder v8.7.1.6 — Micro Catalog Preview & Native Art Crops
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

  function art(card, mode, artMap, profile) {
    if (mode === 'none') return '';
    const label = mode === 'full' ? 'Full card' : 'Cropped art';
    const zoom = 1 + (Number(profile && profile.microArtZoom || 0) / 100) * 1.2;
    const posX = Number(profile && profile.microArtPositionX == null ? 50 : (profile && profile.microArtPositionX));
    const posY = Number(profile && profile.microArtPositionY == null ? 50 : (profile && profile.microArtPositionY));
    const image = artMap && artMap[card.identifiers && card.identifiers.scryfallId];
    if (image) {
      return `<div class="mc-art mc-art-real mc-art-${esc(mode)}${profile && profile.microArtBoxMode === 'custom' ? ' mc-art-custom' : ''}" aria-label="${esc(label)}"><img src="${image}" alt="" style="--mc-art-zoom:${zoom};--mc-art-x:${posX}%;--mc-art-y:${posY}%"></div>`;
    }
    // Preview fixtures still receive a neutral placeholder when no real card
    // has been loaded. Production builds never use these fixture backgrounds.
    return `<div class="mc-art mc-art-${esc(card.art || 'default')} mc-art-${esc(mode)}${profile && profile.microArtBoxMode === 'custom' ? ' mc-art-custom' : ''}" aria-label="${esc(label)} preview"><span>${esc(label)}</span></div>`;
  }

  function oracleText(card, mode) {
    if (mode === 'hide') return '';
    let text = card.oracle;
    if (mode === 'compact' && text.length > 92) text = text.slice(0,89).trimEnd() + '…';
    return `<div class="mc-oracle">${esc(text)}</div>`;
  }

  // Build one compact card cell from the active profile. Keeping this function
  // small makes later print-density changes easier to reason about.
  // Preview renderer mirrors the production print-card structure: artwork is
  // horizontal across the top, followed by the compact text block. The previous
  // preview used a vertical art strip, which made the preview look like a
  // different product even though the profile settings were identical.
  // Render one micro card from the active profile. Each field has an explicit
  // switch so the preview can be used as a design tool rather than a fixed mockup.
  // Keep this function structurally parallel with CatalogProfileCore's printable
  // renderer: both consume the same profile fields and the same normalized card data.
  function renderCard(card, profile, index, artMap, setCode) {
    const density = profile.microDensity || 'reference';
    const oracleMode = profile.microOracleMode || 'compact';
    const artMode = profile.microArtMode || 'crop';
    const imagePosition = profile.microImagePosition || 'left';
    const imageWidth = Math.max(10, Math.min(45, Number(profile.microImageWidth == null ? 24 : profile.microImageWidth)));
    const artBoxMode = profile.microArtBoxMode === 'custom' ? 'custom' : 'flow';
    const artBoxWidth = Math.max(10, Math.min(80, Number(profile.microArtBoxWidth == null ? imageWidth : profile.microArtBoxWidth)));
    const artBoxHeight = Math.max(10, Math.min(100, Number(profile.microArtBoxHeight == null ? 100 : profile.microArtBoxHeight)));
    const artBoxX = Math.max(0, Math.min(90, Number(profile.microArtBoxX == null ? 0 : profile.microArtBoxX)));
    const artBoxY = Math.max(0, Math.min(90, Number(profile.microArtBoxY == null ? 0 : profile.microArtBoxY)));
    const cardPadding = Math.max(0, Math.min(4, Number(profile.microCardPadding == null ? 2 : profile.microCardPadding)));
    const flowGap = Math.max(0, Math.min(6, Number(profile.microFlowGap == null ? 3 : profile.microFlowGap)));
    const microFontSize = Math.max(4.5, Math.min(8, Number(profile.microFontSize == null ? 6.2 : profile.microFontSize)));
    const microLineHeight = Math.max(.9, Math.min(1.3, Number(profile.microLineHeight == null ? 1.08 : profile.microLineHeight)));
    const oracleMaxChars = Math.max(40, Math.min(220, Number(profile.microOracleMaxChars == null ? 92 : profile.microOracleMaxChars)));
    const showName = profile.microShowName !== false;
    const showMana = profile.microShowMana !== false;
    const showType = profile.microShowType !== false;
    const showFlavor = profile.microFlavor === true && density !== 'collector';
    const showArtist = profile.microShowArtist === true;
    const showStats = profile.microShowStats !== false && !!card.stats;
    const showRarity = profile.microShowRarity !== false && !!card.rarity;
    const showCollector = profile.microShowCollector !== false && !!card.number;
    const showSetCode = profile.microShowSetCode !== false && !!setCode;
    const priceMode = profile.microPriceMode || 'lowest';
    const rawOracle = card.oracle || '';
    let oracle = rawOracle;
    if (oracleMode === 'hide') oracle = '';
    else if (oracleMode === 'compact' && oracle.length > oracleMaxChars) {
      const cut = Math.max(1, oracleMaxChars - 1);
      oracle = oracle.slice(0, cut).trimEnd() + '…';
    }
    const imageBlock = art(card, artMode, artMap, profile);
    const metaBits = [];
    if (showRarity) metaBits.push(esc(card.rarity));
    if (showCollector) metaBits.push(`#${esc(card.number)}`);
    if (showSetCode) metaBits.push(esc(setCode));
    if (showArtist && card.artist) metaBits.push(esc(card.artist));
    const header = `<header class="mc-header">${showName ? `<strong>${esc(card.name)}</strong>` : '<span></span>'}${showMana ? `<span class="mc-mana">${mana(card.mana)}</span>` : ''}</header>`;
    const body = `${showType ? `<div class="mc-type">${esc(card.type)}</div>` : ''}${oracle ? `<div class="mc-oracle">${esc(oracle)}</div>` : ''}${showFlavor ? `<div class="mc-flavor">${esc(card.flavor)}</div>` : ''}`;
    const meta = `<footer class="mc-meta"><span>${metaBits.join(' · ')}</span><strong>${showStats ? esc(card.stats) : ''}</strong></footer>`;
    return `<article class="micro-card mc-density-${esc(density)} mc-image-${esc(imagePosition)}${artBoxMode === 'custom' ? ' mc-art-custom' : ''}" data-index="${index}" style="--mc-image-width:${imageWidth}%;--mc-art-box-width:${artBoxWidth}%;--mc-art-box-height:${artBoxHeight}%;--mc-art-box-x:${artBoxX}%;--mc-art-box-y:${artBoxY}%;--mc-card-padding:${cardPadding}px;--mc-flow-gap:${flowGap}px;--mc-font-size:${microFontSize}pt;--mc-line-height:${microLineHeight}">${imageBlock}<div class="mc-copy">${header}${body}${meta}<div class="mc-price-row">${price(card, priceMode)}</div></div></article>`;
  }

  function render(profile, cardsInput, artMap) {
    const p = profile || {};
    const count = Number(p.printCardsPerSide || 30);
    const cols = count === 30 ? 5 : 4;
    const rows = count === 20 ? 5 : 6;
    const sourceCards = Array.isArray(cardsInput) && cardsInput.length ? cardsInput : SAMPLE_CARDS;
    const cards = Array.from({length:count},(_,i)=>sourceCards[i % sourceCards.length]);
    const setCode = p.microPreviewSetCode || 'SMP';
    return `<div class="micro-preview-shell"><section class="micro-sheet micro-paper-${esc(p.printPaper || 'letter')}"><header class="micro-sheet-header"><strong>Sample Set — Micro Catalog</strong><span>${count} cards / side · ${cols} × ${rows} · ${esc(p.microDensity || 'reference')}</span></header><div class="micro-grid" style="--mc-cols:${cols};--mc-rows:${rows}">${cards.map((c,i)=>renderCard(c,p,i,artMap,setCode)).join('')}</div></section></div>`;
  }

  function css(profile) {
    const p = profile || {};
    const font = Number(p.printFontSize || 6.2);
    const border = p.printCutGuides === false ? '#ddd' : '#555';
    const artHeight = p.microArtMode === 'none' ? '0' : (p.microDensity === 'collector' ? '.46in' : '.62in');
    // The sheet is always the fixed 30-card canvas. Individual cards can change
    // their internal field mix without changing the 5 x 6 page geometry.
    return `.micro-preview-shell{padding:12px;background:#555;min-height:100%;font-family:Arial,sans-serif}.micro-sheet{background:#fff;color:#111;width:100%;aspect-ratio:11/8.5;padding:1.2%;box-shadow:0 2px 12px rgba(0,0,0,.45);display:flex;flex-direction:column;overflow:hidden}.micro-sheet-header{height:4%;display:flex;align-items:center;justify-content:space-between;font-size:${Math.max(5.5,font)}px;padding:0 2px}.micro-grid{height:96%;display:grid;grid-template-columns:repeat(var(--mc-cols),minmax(0,1fr));grid-template-rows:repeat(var(--mc-rows),minmax(0,1fr));gap:1px}.micro-card{min-width:0;min-height:0;overflow:hidden;border:.55pt solid ${border};padding:var(--mc-card-padding,2px);display:flex;flex-direction:row;font-size:var(--mc-font-size,${font}px);line-height:var(--mc-line-height,1.08);background:#fff;position:relative}.mc-art{overflow:hidden;background:#eee;flex:0 0 var(--mc-image-width,24%);width:var(--mc-image-width,24%);height:auto;min-height:0;margin:0 var(--mc-flow-gap,3px) 0 0;border-right:.35pt solid #999;border-bottom:0}.mc-image-right{flex-direction:row-reverse}.mc-image-right .mc-art{margin:0 0 0 3px;border-right:0;border-left:.35pt solid #999}.mc-image-top{display:flex;flex-direction:column}.mc-image-top .mc-art{width:100%;height:${artHeight};flex:0 0 ${artHeight};margin:0 0 2px 0;border-right:0;border-bottom:.35pt solid #999}.mc-image-top .mc-copy{min-height:0}.mc-art-real img{width:100%;height:100%;display:block;object-fit:cover;object-position:var(--mc-art-x,50%) var(--mc-art-y,50%);transform:scale(var(--mc-art-zoom,1));transform-origin:center}.mc-art span{font-size:${Math.max(3.8,font-1.5)}px;font-weight:700;padding:1px;text-align:center}.mc-art-crop{background:linear-gradient(135deg,#4b7c9e 0 25%,#a96d35 25% 48%,#315d38 48% 72%,#5c3e71 72%)}.mc-art-full{background:linear-gradient(145deg,#193b59,#b47d45 45%,#263f2a)}.mc-art-custom{display:block!important}.mc-art-custom .mc-art-custom,.mc-art-custom .mc-art{position:absolute!important;left:var(--mc-art-box-x,0%);top:var(--mc-art-box-y,0%);width:var(--mc-art-box-width,24%)!important;height:var(--mc-art-box-height,100%)!important;margin:0!important;z-index:3;border:0!important}.mc-art-custom .mc-copy{width:100%;height:100%;padding:var(--mc-card-padding,2px);position:relative;z-index:1}.mc-art-custom .mc-art-real img{width:100%;height:100%;object-fit:cover}.mc-art-custom .mc-art span{position:absolute;inset:0;display:grid;place-items:center}.mc-art-custom .mc-art{pointer-events:none}.mc-copy{min-width:0;min-height:0;display:flex;flex-direction:column;flex:1 1 auto}.mc-header{display:flex;justify-content:space-between;align-items:flex-start;gap:2px;border-bottom:.35pt solid #888;padding-bottom:1px;margin-bottom:1px;flex:0 0 auto;font-size:${Math.max(4.5,font)}px;line-height:1.02}.mc-header strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mc-mana{white-space:nowrap;display:inline-flex;align-items:center}.mc-mana img,.mc-mana .mana-symbol{width:${Math.max(5,font-1)}px;height:${Math.max(5,font-1)}px}.mc-type{font-size:${Math.max(3.8,font-1.2)}px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:1px}.mc-oracle{font-size:${Math.max(3.8,font-1.1)}px;display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden;line-height:1.03;flex:1 1 auto}.mc-density-reference .mc-oracle{-webkit-line-clamp:2}.mc-density-rules .mc-oracle{-webkit-line-clamp:5}.mc-density-collector .mc-oracle{display:none}.mc-flavor{font-size:${Math.max(3.5,font-1.5)}px;font-style:italic;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;max-height:2.15em}.mc-meta{display:flex;justify-content:space-between;gap:2px;align-items:flex-end;border-top:.35pt solid #999;margin-top:1px;padding-top:1px;font-size:${Math.max(3.6,font-1.6)}px;line-height:1;flex:0 0 auto;white-space:nowrap}.mc-meta span{overflow:hidden;text-overflow:ellipsis}.mc-price-row{font-size:${Math.max(3.6,font-1.6)}px;text-align:right;line-height:1;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mc-price{font-weight:700}@media(max-width:900px){.micro-sheet{aspect-ratio:auto;min-height:700px}.micro-grid{min-height:650px}}`;
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

  window.MicroCatalogPreview = {version:'8.7.1.4',render,css,hydrate};
})();
