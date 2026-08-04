(function () {
  const VERSION = '8.4.0.3';
  const STORAGE_KEY = 'mtg-builder-output-design-v8_4';
  const OUTPUT_FIELDS = [
    'name','fontFamily','baseFontSize','lineHeight','headingScale','headingWeight',
    'pageBackground','contentBackground','navigationBackground','headerBackground',
    'textColor','secondaryTextColor','headingColor','linkColor','borderColor',
    'rulesBackground','flavorBackground','targetBackground','density','maxPageWidth',
    'navigationMode','imagePosition','imageWidth','cardColumns','borderRadius','borderWidth'
  ];

  const DEFAULT_PROFILE = Object.freeze({
    version: VERSION,
    name: 'Restricted Device — Comfortable',
    fontFamily: 'Verdana, Arial, sans-serif',
    baseFontSize: 16,
    lineHeight: 1.5,
    headingScale: 1.3,
    headingWeight: 700,
    pageBackground: '#f3f0e8',
    contentBackground: '#fffdf8',
    navigationBackground: '#f8f5ed',
    headerBackground: '#ebe2cf',
    textColor: '#202020',
    secondaryTextColor: '#555555',
    headingColor: '#202020',
    linkColor: '#163c65',
    borderColor: '#c6baa0',
    rulesBackground: '#efe6d4',
    flavorBackground: '#f5efe6',
    targetBackground: '#fff2b8',
    density: 'comfortable',
    maxPageWidth: 1200,
    navigationMode: 'responsive',
    imagePosition: 'responsive',
    imageWidth: 300,
    cardColumns: 1,
    borderRadius: 4,
    borderWidth: 1
  });

  const PRESETS = {
    'restricted-comfortable': {},
    'restricted-large': {
      name: 'Restricted Device — Large Text', baseFontSize: 18, lineHeight: 1.65,
      headingScale: 1.3, density: 'spacious', maxPageWidth: 1000,
      navigationMode: 'top', imagePosition: 'top', imageWidth: 320, borderRadius: 2
    },
    'compact-library': {
      name: 'Compact Library', fontFamily: 'Arial, sans-serif', baseFontSize: 14,
      lineHeight: 1.4, headingScale: 1.15, density: 'compact', maxPageWidth: 1000,
      navigationMode: 'responsive', imagePosition: 'responsive', imageWidth: 220,
      borderRadius: 2
    },
    'high-contrast': {
      name: 'High Contrast', fontFamily: 'Verdana, Arial, sans-serif', baseFontSize: 17,
      lineHeight: 1.5, pageBackground: '#000000', contentBackground: '#ffffff',
      navigationBackground: '#ffffff', headerBackground: '#ffffff', textColor: '#000000',
      secondaryTextColor: '#222222', headingColor: '#000000', linkColor: '#003cff',
      borderColor: '#000000', rulesBackground: '#f2f2f2', flavorBackground: '#e8e8e8',
      targetBackground: '#fff000', borderWidth: 2, borderRadius: 0
    },
    'warm-paper': {
      name: 'Warm Paper', fontFamily: 'Georgia, Times New Roman, serif', baseFontSize: 16,
      lineHeight: 1.65, headingScale: 1.3, pageBackground: '#d8c7a7',
      contentBackground: '#fff8e8', navigationBackground: '#f1e3c8',
      headerBackground: '#e7d3ad', textColor: '#2f2518', secondaryTextColor: '#66543d',
      headingColor: '#392813', linkColor: '#704214', borderColor: '#a98b5f',
      rulesBackground: '#f5e6c8', flavorBackground: '#f8edda', targetBackground: '#ffe48a',
      borderRadius: 6
    },
    'dark-desktop': {
      name: 'Dark Desktop', fontFamily: 'Verdana, Arial, sans-serif', baseFontSize: 16,
      lineHeight: 1.5, pageBackground: '#101722', contentBackground: '#1a2432',
      navigationBackground: '#202c3c', headerBackground: '#26364a', textColor: '#edf3fa',
      secondaryTextColor: '#b7c4d4', headingColor: '#ffffff', linkColor: '#8fc7ff',
      borderColor: '#52667f', rulesBackground: '#26374a', flavorBackground: '#2d3540',
      targetBackground: '#61551a', borderRadius: 8
    },
    'print-friendly': {
      name: 'Print Friendly', fontFamily: 'Georgia, Times New Roman, serif', baseFontSize: 15,
      lineHeight: 1.5, pageBackground: '#ffffff', contentBackground: '#ffffff',
      navigationBackground: '#ffffff', headerBackground: '#ffffff', textColor: '#000000',
      secondaryTextColor: '#333333', headingColor: '#000000', linkColor: '#000000',
      borderColor: '#777777', rulesBackground: '#f5f5f5', flavorBackground: '#fafafa',
      targetBackground: '#eeeeee', density: 'comfortable', maxPageWidth: 1000,
      navigationMode: 'top', imagePosition: 'top', borderRadius: 0
    }
  };

  const CONTROL_MAP = {
    name: 'odProfileName', fontFamily: 'odFontFamily', baseFontSize: 'odBaseFontSize',
    lineHeight: 'odLineHeight', headingScale: 'odHeadingScale', headingWeight: 'odHeadingWeight',
    pageBackground: 'odPageBackground', contentBackground: 'odContentBackground',
    navigationBackground: 'odNavigationBackground', headerBackground: 'odHeaderBackground',
    textColor: 'odTextColor', secondaryTextColor: 'odSecondaryTextColor',
    headingColor: 'odHeadingColor', linkColor: 'odLinkColor', borderColor: 'odBorderColor',
    rulesBackground: 'odRulesBackground', flavorBackground: 'odFlavorBackground',
    targetBackground: 'odTargetBackground', density: 'odDensity', maxPageWidth: 'odMaxPageWidth',
    navigationMode: 'odNavigationMode', imagePosition: 'odImagePosition', imageWidth: 'odImageWidth',
    cardColumns: 'odCardColumns', borderRadius: 'odBorderRadius', borderWidth: 'odBorderWidth'
  };

  let state = {
    profile: clone(DEFAULT_PROFILE),
    previewMode: 'catalog',
    viewport: 'desktop',
    renderTimer: null,
    profileLibrary: null,
    selectedLibraryProfileId: null
  };

  function $(id) { return document.getElementById(id); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function clamp(value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  }
  function validHex(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toLowerCase() : fallback;
  }

  function sanitizeProfile(input) {
    const source = Object.assign({}, DEFAULT_PROFILE, input || {});
    const p = clone(DEFAULT_PROFILE);
    p.version = VERSION;
    p.name = String(source.name || DEFAULT_PROFILE.name).slice(0, 80);
    p.fontFamily = String(source.fontFamily || DEFAULT_PROFILE.fontFamily).slice(0, 120);
    p.baseFontSize = clamp(source.baseFontSize, 12, 24, 16);
    p.lineHeight = clamp(source.lineHeight, 1.15, 2, 1.5);
    p.headingScale = clamp(source.headingScale, 1.05, 1.8, 1.3);
    p.headingWeight = clamp(source.headingWeight, 400, 900, 700);
    for (const key of ['pageBackground','contentBackground','navigationBackground','headerBackground','textColor','secondaryTextColor','headingColor','linkColor','borderColor','rulesBackground','flavorBackground','targetBackground']) {
      p[key] = validHex(source[key], DEFAULT_PROFILE[key]);
    }
    p.density = ['compact','comfortable','spacious'].includes(source.density) ? source.density : 'comfortable';
    p.maxPageWidth = clamp(source.maxPageWidth, 0, 2000, 1200);
    p.navigationMode = ['responsive','top','left'].includes(source.navigationMode) ? source.navigationMode : 'responsive';
    p.imagePosition = ['responsive','top','left','right'].includes(source.imagePosition) ? source.imagePosition : 'responsive';
    p.imageWidth = clamp(source.imageWidth, 120, 600, 300);
    p.cardColumns = clamp(source.cardColumns, 1, 2, 1);
    p.borderRadius = clamp(source.borderRadius, 0, 20, 4);
    p.borderWidth = clamp(source.borderWidth, 0, 4, 1);
    return p;
  }

  function densityValues(profile) {
    if (profile.density === 'compact') return {page:10, panel:10, gap:10, nav:8, card:10};
    if (profile.density === 'spacious') return {page:24, panel:22, gap:24, nav:18, card:22};
    return {page:16, panel:16, gap:16, nav:12, card:14};
  }

  function getGeneratedCss(context, profileInput) {
    const p = sanitizeProfile(profileInput || state.profile);
    const d = densityValues(p);
    const maxWidth = p.maxPageWidth === 0 ? 'none' : `${p.maxPageWidth}px`;
    const h1 = Math.round(p.baseFontSize * p.headingScale * 1.45);
    const h2 = Math.round(p.baseFontSize * p.headingScale);
    const h3 = Math.round(p.baseFontSize * Math.max(1.05, p.headingScale - .12));
    const navRules = p.navigationMode === 'top'
      ? `.layout{display:block!important}.nav{width:auto!important;position:static!important;max-height:42vh!important;margin:0 0 var(--od-gap)!important;flex-basis:auto!important}.nav a{display:inline-block!important;width:auto!important;margin:2px!important}`
      : p.navigationMode === 'left'
        ? `@media(min-width:620px){.layout{display:flex!important;gap:var(--od-gap)!important;align-items:flex-start!important}.nav{width:250px!important;flex:0 0 250px!important;position:sticky!important;top:10px!important;margin:0!important}.nav a{display:block!important;width:auto!important;margin:2px 0!important}}`
        : '';
    const imageTop = `.card-body{display:block!important}.image-wrap,.missing-image{width:min(100%,var(--od-image-width))!important;max-width:var(--od-image-width)!important;flex:none!important;margin:0 auto var(--od-gap)!important;order:0!important}`;
    const imageSide = side => `@media(min-width:620px){.card-body{display:flex!important;gap:var(--od-gap)!important;align-items:flex-start!important}.image-wrap,.missing-image{width:var(--od-image-width)!important;max-width:var(--od-image-width)!important;flex:0 0 var(--od-image-width)!important;margin:0!important;order:${side==='right'?2:0}!important}.card-copy{order:1!important;min-width:0!important;flex:1!important}}`;
    const imageRules = p.imagePosition === 'top' ? imageTop : p.imagePosition === 'left' ? imageSide('left') : p.imagePosition === 'right' ? imageSide('right') : '';
    return `
:root{--od-font:${p.fontFamily};--od-base-size:${p.baseFontSize}px;--od-line-height:${p.lineHeight};--od-page-bg:${p.pageBackground};--od-content-bg:${p.contentBackground};--od-nav-bg:${p.navigationBackground};--od-header-bg:${p.headerBackground};--od-text:${p.textColor};--od-secondary:${p.secondaryTextColor};--od-heading:${p.headingColor};--od-link:${p.linkColor};--od-border:${p.borderColor};--od-rules-bg:${p.rulesBackground};--od-flavor-bg:${p.flavorBackground};--od-target-bg:${p.targetBackground};--od-radius:${p.borderRadius}px;--od-border-width:${p.borderWidth}px;--od-gap:${d.gap}px;--od-image-width:${p.imageWidth}px}
html{background:var(--od-page-bg)}body{font-family:var(--od-font)!important;font-size:var(--od-base-size)!important;line-height:var(--od-line-height)!important;background:var(--od-page-bg)!important;color:var(--od-text)!important}.page{max-width:${maxWidth}!important;padding:${d.page}px!important}h1,h2,h3,.card-header h2,.chapter-heading{color:var(--od-heading)!important;font-weight:${p.headingWeight}!important}h1,.set-header h1,.header h1{font-size:${h1}px!important}.card-header h2,.chapter-heading{font-size:${h2}px!important}h3{font-size:${h3}px!important}a,.nav a,.back-top a{color:var(--od-link)!important}.meta,.set-sub,.card-footer,.layout-line,.muted{color:var(--od-secondary)!important}.header,.set-header{background:var(--od-header-bg)!important;border-color:var(--od-border)!important;border-width:var(--od-border-width)!important;border-radius:var(--od-radius)!important;padding:${d.panel}px!important}.nav{background:var(--od-nav-bg)!important;border-color:var(--od-border)!important;border-width:var(--od-border-width)!important;border-radius:var(--od-radius)!important;padding:${d.nav}px!important}.content,.card-entry{background:var(--od-content-bg)!important;border-color:var(--od-border)!important;border-width:var(--od-border-width)!important;border-radius:var(--od-radius)!important}.content{padding:${d.panel}px!important}.card-entry{padding:${d.card}px!important;margin-bottom:var(--od-gap)!important}.rules-box{background:var(--od-rules-bg)!important;border-color:var(--od-border)!important;border-width:var(--od-border-width)!important;border-radius:var(--od-radius)!important}.flavor-box,.example{background:var(--od-flavor-bg)!important;border-color:var(--od-border)!important;border-radius:var(--od-radius)!important}.image-wrap,.missing-image{border-color:var(--od-border)!important;border-width:var(--od-border-width)!important;border-radius:var(--od-radius)!important}.chapter-heading:target,.rule:target,h3:target,.card-entry:target{background:var(--od-target-bg)!important}.cards{grid-template-columns:repeat(${p.cardColumns},minmax(0,1fr));gap:var(--od-gap)}${p.cardColumns > 1 ? '@media(min-width:1050px){.cards{display:grid!important}.card-entry{margin-bottom:0!important}}@media(max-width:1049px){.cards{display:block!important}}' : ''}${navRules}${imageRules}@media(max-width:480px){.page{padding:${Math.min(d.page,10)}px!important}.content,.card-entry{padding:${Math.min(d.panel,11)}px!important}}
`;
  }

  function getFingerprintData() {
    const profile = sanitizeProfile(state.profile);
    const out = {version: VERSION};
    OUTPUT_FIELDS.forEach(key => { out[key] = profile[key]; });
    return out;
  }

  function getProfileSummary() {
    const p = sanitizeProfile(state.profile);
    return {name:p.name, version:VERSION, fontFamily:p.fontFamily, baseFontSize:p.baseFontSize, density:p.density, navigationMode:p.navigationMode, imagePosition:p.imagePosition, imageWidth:p.imageWidth};
  }

  function readControls() {
    const raw = {};
    for (const [key,id] of Object.entries(CONTROL_MAP)) {
      const el = $(id);
      if (el) raw[key] = el.value;
    }
    state.profile = sanitizeProfile(raw);
    return state.profile;
  }

  function writeControls(profileInput) {
    const p = sanitizeProfile(profileInput);
    state.profile = p;
    for (const [key,id] of Object.entries(CONTROL_MAP)) {
      const el = $(id);
      if (el) el.value = p[key];
    }
  }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeProfile(state.profile))); } catch (err) {}
  }

  function loadLocal() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? sanitizeProfile(JSON.parse(saved)) : clone(DEFAULT_PROFILE);
    } catch (err) { return clone(DEFAULT_PROFILE); }
  }

  function previewBaseCss() {
    return `*{box-sizing:border-box}html{scroll-behavior:auto}body{margin:0;background:#f3f0e8;color:#202020}.page{max-width:1200px;margin:auto;padding:16px}.header,.set-header{text-align:center;background:#ebe2cf;border:1px solid #b9ac8e;padding:16px;margin-bottom:14px}.layout{display:block}.nav{background:#f8f5ed;border:1px solid #c6baa0;padding:12px;margin-bottom:14px;max-height:36vh;overflow:auto}.nav-title,.nav h2{display:block;font-size:1.05em;margin:0 0 8px;font-weight:bold}.nav-list{list-style:none;margin:0;padding:0}.nav-list li{border-top:1px solid #ddd}.nav a{display:block;padding:7px;text-decoration:none}.content,.card-entry{background:#fffdf8;border:1px solid #c8bea8;padding:16px}.chapter-section{margin:0 0 2em}.chapter-heading{border-bottom:1px solid #cbb999;padding-bottom:5px}.rule{padding-left:1.2em;text-indent:-1.2em}.example{background:#f4ecdd;border-left:4px solid #b99a68;padding:9px}.cards{min-width:0}.card-entry{margin-bottom:16px}.card-header{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid #ccbfa2;padding-bottom:8px;margin-bottom:10px}.card-header h2{margin:0}.card-body{display:block}.image-wrap{width:100%;max-width:300px;margin:0 auto 12px;border:1px solid #c2b7a1;padding:8px;background:#ebe8df}.image-placeholder{aspect-ratio:5/7;display:grid;place-items:center;background:linear-gradient(145deg,#173d64,#6f92b4);color:white;text-align:center;padding:12px;font-weight:bold}.type-line{font-weight:bold;margin-bottom:5px}.rules-box{background:#efe6d4;border:1px solid #cbb999;padding:10px}.flavor-box{background:#f5efe6;border:1px solid #d0c3b1;padding:10px;margin-top:8px;font-style:italic}.stats-box{margin-top:8px}.stats-badge{display:inline-block;border:1px solid #777;padding:4px 10px;font-weight:bold}.portable-set{margin:0 0 22px}.back-top{font-size:.85em}@media(min-width:901px) and (orientation:landscape){.layout{display:flex;gap:16px;align-items:flex-start}.nav{width:240px;flex:0 0 240px;position:sticky;top:10px;margin:0}.content,.cards{flex:1;min-width:0}.card-body{display:flex;gap:14px}.image-wrap{width:220px;flex:0 0 220px;margin:0}}`;
  }

  function navHtml(items) {
    return `<nav class="nav"><div class="nav-title">Contents</div><ol class="nav-list">${items.map(x=>`<li><a href="#${x.id}">${esc(x.label)}</a></li>`).join('')}</ol></nav>`;
  }

  function previewMana(text) {
    const renderer = window.MTGSymbolRenderer;
    return renderer ? renderer.manaToHtml(text || '', true) : esc(text || '');
  }

  function previewRarity(rarity) {
    const renderer = window.MTGSymbolRenderer;
    return renderer ? renderer.renderRarityIcon(rarity) : '';
  }

  function catalogPreview() {
    const nav = navHtml([{id:'card-1',label:'Aether Channeler'},{id:'card-2',label:'Sample Dragon'},{id:'card-3',label:'Sample Land'}]);
    return `<div id="top"></div><div class="page"><header class="set-header"><h1>Sample Set</h1><div class="set-sub">Set Code: SMP · Live design preview</div></header><div class="layout">${nav}<main class="cards"><article id="card-1" class="card-entry"><div class="card-header"><h2>Aether Channeler</h2><div class="mana-cost">${previewMana('{2}{U}')}</div></div><div class="card-body"><div class="image-wrap"><div class="image-placeholder">Embedded card image preview</div></div><div class="card-copy"><div class="type-line">Creature — Human Wizard</div><div class="rarity-line">${previewRarity('uncommon')}<span class="rarity-label">uncommon</span></div><div class="rules-box"><strong>Oracle Text</strong><p>${previewMana('When this creature enters, choose one — create a 1/1 token; return another nonland permanent with mana value {2} or less; or draw a card.')}</p></div><div class="flavor-box">“Every current has a story.”</div><div class="stats-box"><span class="stats-badge">2/1</span></div><p class="back-top"><a href="#top">Back to top</a></p></div></div></article><article id="card-2" class="card-entry"><div class="card-header"><h2>Sample Dragon</h2><div class="mana-cost">${previewMana('{4}{R}{R}')}</div></div><div class="card-body"><div class="image-wrap"><div class="image-placeholder">Second image</div></div><div class="card-copy"><div class="type-line">Creature — Dragon</div><div class="rarity-line">${previewRarity('mythic')}<span class="rarity-label">mythic</span></div><div class="rules-box">Flying<br>Whenever this attacks, it deals 2 damage to any target. Activate only by paying ${previewMana('{W/U}{2/B}{G/P}{T}')}.</div><div class="stats-box"><span class="stats-badge">5/5</span></div></div></div></article></main></div></div>`;
  }

  function rulesPreview() {
    const nav = navHtml([{id:'chapter-100',label:'1. Game Concepts'},{id:'chapter-200',label:'2. Parts of a Card'},{id:'chapter-300',label:'3. Card Types'}]);
    return `<div id="top"></div><div class="page"><header class="header"><h1>Magic Comprehensive Rules</h1><div class="meta">Live rules-library preview</div></header><div class="layout">${nav}<main class="content"><section class="chapter-section"><h2 id="chapter-100" class="chapter-heading">1. Game Concepts</h2><h3 id="rule-100">100. General</h3><p id="rule-100-1" class="rule"><strong>100.1.</strong> These rules apply to a game with two or more players.</p><div class="example">Example: Internal links can highlight a specific rule or chapter.</div><p class="back-top"><a href="#top">Back to chapter list</a></p></section><section class="chapter-section"><h2 id="chapter-200" class="chapter-heading">2. Parts of a Card</h2><p class="rule"><strong>200.1.</strong> The parts of a card include its name, mana cost, illustration, and text box. Mana symbols such as ${previewMana('{W/U}{2/R}{G/P}')} are rendered in the output.</p></section></main></div></div>`;
  }

  function portablePreview() {
    const nav = navHtml([{id:'library-rules',label:'Rules Reference'},{id:'library-set-one',label:'Sample Set One'},{id:'library-set-two',label:'Sample Set Two'}]);
    return `<div id="top"></div><div class="page"><header class="header"><h1>Portable MTG Library</h1><div class="meta">Single self-contained HTML file · internal links only</div></header><div class="layout">${nav}<main class="content"><section id="library-rules" class="chapter-section"><h2 class="chapter-heading">Rules Reference</h2><p>Selected rules chapters would appear directly inside this file.</p><div class="rules-box"><strong>100.1.</strong> These rules apply to a game with two or more players.</div></section><section id="library-set-one" class="portable-set"><h2 class="chapter-heading">Sample Set One</h2><article class="card-entry"><div class="card-header"><h2>Library Card</h2><strong>{1}{G}</strong></div><div class="card-body"><div class="image-wrap"><div class="image-placeholder">Embedded image</div></div><div class="card-copy"><div class="type-line">Creature — Elf</div><div class="rules-box">When this enters, add one mana of any color.</div><div class="stats-box"><span class="stats-badge">2/2</span></div></div></div></article></section><section id="library-set-two" class="portable-set"><h2 class="chapter-heading">Sample Set Two</h2><p>Additional selected sets would continue below using only internal anchors.</p></section></main></div></div>`;
  }

  function buildPreviewDocument() {
    const body = state.previewMode === 'rules' ? rulesPreview() : state.previewMode === 'portable' ? portablePreview() : catalogPreview();
    const title = state.previewMode === 'rules' ? 'Rules Preview' : state.previewMode === 'portable' ? 'Portable Library Preview' : 'Catalog Preview';
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${previewBaseCss()}${getGeneratedCss(state.previewMode)}</style></head><body>${body}</body></html>`;
  }

  function renderPreview() {
    const frame = $('odPreviewFrame');
    const shell = $('odPreviewFrameShell');
    if (!frame || !shell) return;
    shell.dataset.viewport = state.viewport;
    frame.srcdoc = buildPreviewDocument();
    const status = $('odDesignerStatus');
    if (status) status.innerHTML = `<strong>${esc(state.profile.name)}</strong><br><span class="od-profile-chip">${esc(state.previewMode)}</span> · ${esc(state.viewport)} · ${state.profile.baseFontSize}px ${esc(state.profile.fontFamily.split(',')[0])}`;
  }

  function scheduleUpdate() {
    readControls();
    persist();
    clearTimeout(state.renderTimer);
    state.renderTimer = setTimeout(() => {
      renderPreview();
      document.dispatchEvent(new CustomEvent('output-design-change', {detail:getFingerprintData()}));
    }, 120);
  }

  function applyProfile(profile, message) {
    writeControls(profile);
    persist();
    renderPreview();
    const status = $('odDesignerStatus');
    if (status && message) status.innerHTML = `<strong>${esc(message)}</strong><br>${esc(state.profile.name)}`;
  }

  function applyPreset() {
    const id = (($('odPresetSelect') || {}).value) || 'restricted-comfortable';
    applyProfile(Object.assign({}, DEFAULT_PROFILE, PRESETS[id] || {}), 'Preset applied.');
  }

  function downloadText(name, text, type) {
    const blob = new Blob([text], {type:type || 'text/plain;charset=utf-8'});
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  function exportProfile() {
    const p = sanitizeProfile(state.profile);
    const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'design-profile';
    downloadText(`${slug}.json`, JSON.stringify(p, null, 2), 'application/json;charset=utf-8');
    const status = $('odDesignerStatus');
    if (status) status.innerHTML = `<strong>Design profile exported.</strong><br>Upload the JSON to <code>data/design-profiles</code> to use it on other computers.`;
  }

  async function importFile(file) {
    if (!file) return;
    try {
      const p = sanitizeProfile(JSON.parse(await file.text()));
      applyProfile(p, 'Design profile imported.');
    } catch (err) {
      const status = $('odDesignerStatus');
      if (status) status.innerHTML = `<strong>Import failed:</strong> ${esc(err.message || String(err))}`;
    }
  }

  function profileIdFromName(name, fallback) {
    const slug = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    return slug || fallback || 'profile';
  }

  function normalizeProfileLibrary(payload) {
    const library = {version: VERSION, defaultProfile: null, profiles: {}};
    if (!payload || typeof payload !== 'object') throw new Error('Profile library is not valid JSON.');

    if (payload.profiles && !Array.isArray(payload.profiles) && typeof payload.profiles === 'object') {
      Object.entries(payload.profiles).forEach(([id, value], index) => {
        const raw = value && value.profile ? Object.assign({}, value.profile, {name: value.name || value.profile.name}) : value;
        if (!raw || typeof raw !== 'object') return;
        library.profiles[String(id)] = sanitizeProfile(raw);
      });
      library.defaultProfile = payload.defaultProfile && library.profiles[payload.defaultProfile]
        ? payload.defaultProfile
        : Object.keys(library.profiles)[0] || null;
      return library;
    }

    if (Array.isArray(payload.profiles)) {
      payload.profiles.forEach((value, index) => {
        const raw = value && value.profile ? Object.assign({}, value.profile, {name: value.name || value.profile.name}) : value;
        if (!raw || typeof raw !== 'object') return;
        const id = String(value.id || profileIdFromName(raw.name, `profile-${index + 1}`));
        library.profiles[id] = sanitizeProfile(raw);
      });
      library.defaultProfile = payload.defaultProfile && library.profiles[payload.defaultProfile]
        ? payload.defaultProfile
        : Object.keys(library.profiles)[0] || null;
      return library;
    }

    // Backward compatibility: a single old-style profile JSON is treated as a one-entry library.
    const single = sanitizeProfile(payload);
    const id = profileIdFromName(single.name, 'default');
    library.profiles[id] = single;
    library.defaultProfile = id;
    return library;
  }

  function populateGithubProfileSelect(library) {
    const select = $('odGithubProfileSelect');
    const applyBtn = $('odApplyGithubProfileBtn');
    if (!select) return;
    select.innerHTML = '';
    const entries = Object.entries(library.profiles || {});
    entries.forEach(([id, profile]) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = profile.name || id;
      select.appendChild(option);
    });
    select.disabled = entries.length === 0;
    if (applyBtn) applyBtn.disabled = entries.length === 0;
    if (entries.length) {
      const selected = library.defaultProfile && library.profiles[library.defaultProfile]
        ? library.defaultProfile
        : entries[0][0];
      select.value = selected;
      state.selectedLibraryProfileId = selected;
    }
  }

  function applySelectedLibraryProfile(message) {
    const select = $('odGithubProfileSelect');
    const id = select ? select.value : state.selectedLibraryProfileId;
    if (!state.profileLibrary || !id || !state.profileLibrary.profiles[id]) return;
    state.selectedLibraryProfileId = id;
    applyProfile(state.profileLibrary.profiles[id], message || 'Profile selected from GitHub library.');
  }

  async function loadFromGithub() {
    const path = (($('odGithubPath') || {}).value || '').trim();
    const status = $('odDesignerStatus');
    if (!path) return;
    try {
      if (status) status.innerHTML = `Loading profile library <code>${esc(path)}</code>...`;
      const response = await fetch(path, {cache:'no-store'});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const library = normalizeProfileLibrary(await response.json());
      const count = Object.keys(library.profiles).length;
      if (!count) throw new Error('The profile library contains no usable profiles.');
      state.profileLibrary = library;
      populateGithubProfileSelect(library);
      applySelectedLibraryProfile(`Profile library loaded: ${count} profile${count === 1 ? '' : 's'}.`);
    } catch (err) {
      state.profileLibrary = null;
      const select = $('odGithubProfileSelect');
      const applyBtn = $('odApplyGithubProfileBtn');
      if (select) {
        select.innerHTML = '<option value="">Profile library unavailable</option>';
        select.disabled = true;
      }
      if (applyBtn) applyBtn.disabled = true;
      if (status) status.innerHTML = `<strong>Profile library load failed:</strong> ${esc(err.message || String(err))}`;
    }
  }

  function registerModule() {
    if (typeof BuilderModules !== 'undefined') BuilderModules.register('Output Designer', VERSION);
  }

  function init() {
    registerModule();
    writeControls(loadLocal());
    Object.values(CONTROL_MAP).forEach(id => {
      const el = $(id);
      if (el) {
        el.addEventListener('input', scheduleUpdate);
        el.addEventListener('change', scheduleUpdate);
      }
    });
    const previewMode = $('odPreviewMode');
    if (previewMode) previewMode.addEventListener('change', () => {state.previewMode = previewMode.value; renderPreview();});
    document.querySelectorAll('[data-od-viewport]').forEach(btn => btn.addEventListener('click', () => {
      state.viewport = btn.dataset.odViewport;
      document.querySelectorAll('[data-od-viewport]').forEach(x => x.classList.toggle('active', x === btn));
      renderPreview();
    }));
    const applyBtn = $('odApplyPresetBtn'); if (applyBtn) applyBtn.addEventListener('click', applyPreset);
    const resetBtn = $('odResetBtn'); if (resetBtn) resetBtn.addEventListener('click', () => applyProfile(DEFAULT_PROFILE, 'Designer reset to default.'));
    const exportBtn = $('odExportBtn'); if (exportBtn) exportBtn.addEventListener('click', exportProfile);
    const importBtn = $('odImportBtn'); const importFileInput = $('odImportFile');
    if (importBtn && importFileInput) importBtn.addEventListener('click', () => importFileInput.click());
    if (importFileInput) importFileInput.addEventListener('change', () => {importFile(importFileInput.files && importFileInput.files[0]); importFileInput.value='';});
    const githubBtn = $('odLoadGithubBtn'); if (githubBtn) githubBtn.addEventListener('click', loadFromGithub);
    const githubProfileSelect = $('odGithubProfileSelect');
    if (githubProfileSelect) githubProfileSelect.addEventListener('change', () => applySelectedLibraryProfile('GitHub library profile selected.'));
    const applyGithubProfileBtn = $('odApplyGithubProfileBtn');
    if (applyGithubProfileBtn) applyGithubProfileBtn.addEventListener('click', () => applySelectedLibraryProfile('GitHub library profile applied.'));
    renderPreview();
  }

  window.OutputDesigner = {
    version: VERSION,
    defaults: clone(DEFAULT_PROFILE),
    presets: clone(PRESETS),
    getProfile: () => sanitizeProfile(state.profile),
    getFingerprintData,
    getProfileSummary,
    getGeneratedCss,
    applyProfile: p => applyProfile(p, 'Design profile applied.'),
    buildPreviewDocument,
    sanitizeProfile,
    normalizeProfileLibrary
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
