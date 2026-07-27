(function () {
  function $(id) { return document.getElementById(id); }

  const state = { generatedHtml: "", setCode: "" };

  function registerModule() {
    if (typeof BuilderModules !== "undefined") {
      BuilderModules.register("Image Lab", "8.0.4");
    }
  }

  function syncSetOptions() {
    const source = $("catalogSetSelect");
    const target = $("imageLabSetSelect");
    if (!source || !target) return 0;

    const options = Array.from(source.options || []).filter(opt => opt.value);
    target.innerHTML = '<option value="">Choose a scanned set...</option>';
    options.forEach(opt => {
      const clone = document.createElement("option");
      clone.value = opt.value;
      clone.textContent = opt.textContent;
      target.appendChild(clone);
    });
    return options.length;
  }

  async function scanAndSyncSets() {
    const report = $("image-report");
    const scanBtn = $("scanCatalogSetsBtn");
    if (report) report.innerHTML = "Scanning sets through Catalog Builder...";
    if (scanBtn) scanBtn.click();
    await new Promise(r => setTimeout(r, 1500));
    const count = syncSetOptions();
    if (report) {
      report.innerHTML = count
        ? `Loaded ${count} discovered sets into Image Lab.`
        : "No scanned sets were found yet. Try scanning again from Catalog Builder.";
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

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function renderRulesText(text) {
    const safe = escapeHtml(text || "");
    return safe
      .replace(/\n/g, "<br>")
      .replace(/(\([^)]*\))/g, '<span class="reminder">$1</span>');
  }

  function statBadge(card) {
    if (card.power && card.toughness) return `${escapeHtml(card.power)}/${escapeHtml(card.toughness)}`;
    if (card.loyalty) return `Loyalty ${escapeHtml(card.loyalty)}`;
    if (card.defense) return `Defense ${escapeHtml(card.defense)}`;
    return "";
  }

  function makeNavTitle(card, index) {
    return escapeHtml(card.faceName || card.name || `Card ${index + 1}`);
  }

  function renderTestHtml(setCode, setName, cards, mode) {
    const navItems = cards.map((card, index) =>
      `<a href="#card-${index + 1}">${makeNavTitle(card, index)}</a>`
    ).join("\n");

    const blocks = cards.map((card, index) => {
      const img = card._processedImage
        ? `<div class="image-wrap"><img src="${card._processedImage}" alt="${escapeHtml(card.name)}"></div>`
        : (card._imageUrl && mode === "external"
            ? `<div class="image-wrap"><img src="${card._imageUrl}" alt="${escapeHtml(card.name)}"></div>`
            : "");

      const mana = card.manaCost ? `<div class="mana-cost">${escapeHtml(card.manaCost)}</div>` : "";
      const type = card.type ? `<div class="type-line">${escapeHtml(card.type)}</div>` : "";
      const layout = card.layout ? `<div class="layout-line">Layout: ${escapeHtml(card.layout)}</div>` : "";
      const oracleText = card.text || card.oracleText || "";
      const flavor = card.flavorText ? `<div class="flavor-box"><div class="section-label">Flavor Text</div><div class="flavor-text">${escapeHtml(card.flavorText).replace(/\n/g, "<br>")}</div></div>` : "";
      const badge = statBadge(card);
      const footerParts = [];
      if (card.number) footerParts.push(`#${escapeHtml(card.number)}`);
      if (card.artist) footerParts.push(`Artist: ${escapeHtml(card.artist)}`);
      const footer = footerParts.length ? `<div class="card-footer">${footerParts.join(" · ")}</div>` : "";

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

            ${badge ? `<div class="stats-box"><span class="stats-badge">${badge}</span></div>` : ""}
            ${footer}
          </div>
        </div>

        <div class="back-top"><a href="#top">Back to top</a></div>
      </article>`;
    }).join("\n");

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(setCode)} Image Test</title>
<style>
  body{
    font-family: Arial, sans-serif;
    margin:0;
    background:#f3f0e8;
    color:#202020;
  }
  #top{display:block;}
  .page{max-width:1200px;margin:0 auto;padding:18px;}
  .set-header{text-align:center;background:#ebe2cf;border:1px solid #b9ac8e;padding:18px;margin-bottom:16px;}
  .set-header h1{margin:0 0 6px 0;font-size:30px;}
  .set-sub{font-size:14px;color:#444;}
  .layout{display:flex;gap:18px;align-items:flex-start;}
  .nav{width:240px;background:#f8f5ed;border:1px solid #c6baa0;padding:12px;box-sizing:border-box;}
  .nav h2{margin:0 0 10px 0;font-size:18px;}
  .nav a{display:block;padding:6px 8px;margin:2px 0;text-decoration:none;color:#15314b;border-radius:4px;}
  .nav a:hover,.nav a:focus{background:#e3edf7;}
  .cards{flex:1;min-width:0;}
  .card-entry{background:#fbfaf6;border:1px solid #b8ae96;padding:14px;margin-bottom:16px;}
  .card-header{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;border-bottom:1px solid #ccbfa2;padding-bottom:8px;margin-bottom:10px;}
  .card-header h2{margin:0;font-size:24px;line-height:1.1;}
  .mana-cost{font-weight:bold;white-space:nowrap;font-size:18px;}
  .card-body{display:flex;gap:14px;align-items:flex-start;}
  .image-wrap{width:220px;flex:0 0 220px;background:#ebe8df;border:1px solid #c2b7a1;padding:8px;box-sizing:border-box;}
  .image-wrap img{width:100%;height:auto;display:block;}
  .card-copy{flex:1;min-width:0;}
  .type-line{font-weight:bold;margin:0 0 3px 0;}
  .layout-line{margin:0 0 8px 0;font-size:14px;color:#4c4c4c;}
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
  @media (max-width: 900px){
    .layout{display:block;}
    .nav{width:auto;margin-bottom:16px;}
    .card-body{display:block;}
    .image-wrap{width:100%;max-width:320px;margin-bottom:12px;}
  }
</style>
</head>
<body>
<div id="top"></div>
<div class="page">
  <header class="set-header">
    <h1>${escapeHtml(setName)}</h1>
    <div class="set-sub">Set Code: ${escapeHtml(setCode)} · Generated by MTG Builder v8.0.4 Image Lab</div>
  </header>

  <div class="layout">
    <nav class="nav">
      <h2>Card Navigator</h2>
      ${navItems}
    </nav>

    <main class="cards">
      ${blocks}
    </main>
  </div>
</div>
</body>
</html>`;
  }

  async function runImageTest() {
    const setCode = ($("imageLabSetSelect") || {}).value || "";
    const reportEl = $("image-report");
    const downloadBtn = $("downloadImageTestBtn");
    if (downloadBtn) downloadBtn.disabled = true;

    if (!setCode) {
      if (reportEl) reportEl.innerHTML = "Choose a scanned set first.";
      return;
    }
    if (typeof ImageLab === "undefined") {
      if (reportEl) reportEl.innerHTML = "ImageLab module is not loaded.";
      return;
    }

    const mode = ($("image-mode") || {}).value || "embedded";
    const width = Number((($("image-width") || {}).value) || 300);
    const quality = Number((($("image-quality") || {}).value) || 0.65);
    const testSizeValue = ($("image-test-size") || {}).value || "10";
    ImageLab.settings.width = width;
    ImageLab.settings.quality = quality;

    if (reportEl) reportEl.innerHTML = `Loading ${setCode}.json...`;
    const response = await fetch(`./data/json/${setCode}.json`);
    const json = await response.json();
    const setName = getSetName(json, setCode);
    const cards = extractCards(json);
    const selectedCards = testSizeValue === "all" ? cards : cards.slice(0, Number(testSizeValue));

    let idsFound = 0;
    let imagesFound = 0;
    let totalBytes = 0;

    for (let i = 0; i < selectedCards.length; i++) {
      const card = selectedCards[i];
      if (reportEl) reportEl.innerHTML = `Testing card ${i + 1} of ${selectedCards.length}: ${card.name}`;
      const scryfallId = card && card.identifiers && card.identifiers.scryfallId;
      if (!scryfallId) continue;
      idsFound += 1;
      try {
        const imageUrl = await ImageLab.getScryfallImage(scryfallId);
        if (!imageUrl) continue;
        card._imageUrl = imageUrl;
        imagesFound += 1;
        if (mode === "embedded") {
          const processed = await ImageLab.processImage(imageUrl);
          card._processedImage = processed;
          totalBytes += processed.length;
        } else {
          totalBytes += imageUrl.length;
        }
      } catch (err) {
        console.warn("Image test failed for", card.name, err);
      }
    }

    const html = renderTestHtml(setCode, setName, selectedCards, mode);
    state.generatedHtml = html;
    state.setCode = setCode;
    const htmlBytes = new TextEncoder().encode(html).length;

    const report = {
      setCode: setCode,
      cardsProcessed: selectedCards.length,
      idsFound: idsFound,
      imagesFound: imagesFound,
      mode: mode === "embedded" ? `Embedded (${width}px @ ${Math.round(quality * 100)}%)` : "External URL",
      totalBytes: totalBytes,
      htmlBytes: htmlBytes
    };

    if (reportEl && typeof buildImageReportHtml === "function") {
      reportEl.innerHTML = buildImageReportHtml(report);
    }
    if (downloadBtn) downloadBtn.disabled = false;
  }

  function downloadTestHtml() {
    if (!state.generatedHtml) return;
    const blob = new Blob([state.generatedHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.setCode || "image-test"}-image-test.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function init() {
    registerModule();
    const syncBtn = $("imageLabSyncBtn");
    const scanBtn = $("imageLabScanBtn");
    const runBtn = $("run-image-test");
    const downloadBtn = $("downloadImageTestBtn");

    if (syncBtn) syncBtn.addEventListener("click", function () {
      const count = syncSetOptions();
      const report = $("image-report");
      if (report) report.innerHTML = count ? `Loaded ${count} discovered sets into Image Lab.` : "No sets are currently scanned in Catalog Builder.";
    });
    if (scanBtn) scanBtn.addEventListener("click", scanAndSyncSets);
    if (runBtn) runBtn.addEventListener("click", runImageTest);
    if (downloadBtn) downloadBtn.addEventListener("click", downloadTestHtml);

    setTimeout(syncSetOptions, 1200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
