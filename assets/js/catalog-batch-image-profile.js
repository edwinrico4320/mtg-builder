(function () {
  function $(id) { return document.getElementById(id); }
  const state = {running: false, cancelCurrent: false, cancelBatch: false};

  function setButtons(running) {
    const currentBtn = $('cancelCurrentBatchSetBtn');
    const entireBtn = $('cancelEntireBatchBtn');
    if (currentBtn) currentBtn.disabled = !running;
    if (entireBtn) entireBtn.disabled = !running;
  }

  function setStatus(html) { const el = $('batchBuildStatus'); if (el) el.innerHTML = html; }

  async function runBatch(setCodes, options, manifest, preloaded) {
    let totalSetsCompleted = 0, totalSetsFailed = 0, totalCardsProcessed = 0, totalImagesEmbedded = 0, totalMissingImages = 0, totalPriceMatches = 0, totalPriceMissing = 0;
    const perSetSummaries = [];
    for (let s = 0; s < setCodes.length; s++) {
      const setCode = setCodes[s];
      if (state.cancelBatch) break;
      state.cancelCurrent = false;
      try {
        const source = (preloaded && preloaded[setCode]) ? preloaded[setCode] : await CatalogProfileCore.fetchSetSource(setCode);
        const result = await CatalogProfileCore.buildSetFromSource(setCode, source, options, state, prog => {
          setStatus(`<strong>Set ${s + 1} of ${setCodes.length}</strong>: ${setCode} · Card ${prog.current} of ${prog.total} · ${prog.cardName}`);
        });
        CatalogProfileCore.downloadHtml(`${setCode}.html`, result.html);
        await CatalogProfileCore.updateManifestRecord(manifest, result, options);
        totalSetsCompleted += 1;
        totalCardsProcessed += result.cardsProcessed;
        totalImagesEmbedded += result.imagesFound;
        totalMissingImages += result.failures;
        totalPriceMatches += result.priceMatches || 0;
        totalPriceMissing += result.priceMissing || 0;
        const reportWarnings = CatalogProfileCore.warnings(result);
        perSetSummaries.push(`${setCode}: ${result.cardsProcessed} cards · ${options.imageMode==='embedded' ? `${result.imagesFound} images` : 'no images'}${options.priceSettings&&options.priceSettings.enabled?` · ${result.priceMatches||0} priced`:''} · ${CatalogProfileCore.formatBytes(result.htmlBytes)}${reportWarnings.length ? ' · warning' : ''}${state.cancelCurrent ? ' · cancelled current set' : ''}`);
        setStatus(`<strong>Completed set ${s + 1} of ${setCodes.length}</strong>: ${setCode}<br><strong>Cards processed:</strong> ${result.cardsProcessed}<br>${options.imageMode==='embedded' ? `<strong>Images embedded:</strong> ${result.imagesFound}/${result.cardsProcessed}<br>` : ''}${options.priceSettings&&options.priceSettings.enabled?`<strong>Cards with prices:</strong> ${result.priceMatches||0}/${result.cardsProcessed}<br>`:''}<strong>Approx HTML size:</strong> ${CatalogProfileCore.formatBytes(result.htmlBytes)}<br><strong>Compatibility estimate:</strong> ${CatalogProfileCore.compatibility(result.htmlBytes, options.imageMode)}`);
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        totalSetsFailed += 1;
        perSetSummaries.push(`${setCode}: failed (${err && err.message ? err.message : String(err)})`);
        setStatus(`<strong>Set ${s + 1} of ${setCodes.length}</strong>: ${setCode} failed. Continuing...`);
        await new Promise(r => setTimeout(r, 800));
      }
    }
    await CatalogProfileCore.saveManifestDownload(manifest);
    const finalStatus = state.cancelBatch ? 'Cancelled by user' : 'Complete';
    setStatus(`<strong>Batch build ${finalStatus}</strong><br><strong>Sets requested:</strong> ${setCodes.length}<br><strong>Sets completed:</strong> ${totalSetsCompleted}<br><strong>Sets failed:</strong> ${totalSetsFailed}<br><strong>Cards processed:</strong> ${totalCardsProcessed}<br>${options.imageMode==='embedded' ? `<strong>Images embedded:</strong> ${totalImagesEmbedded}<br><strong>Missing images:</strong> ${totalMissingImages}<br>` : ''}${options.priceSettings&&options.priceSettings.enabled?`<strong>Cards with prices:</strong> ${totalPriceMatches}<br><strong>Cards missing prices:</strong> ${totalPriceMissing}<br>`:''}<div class="image-lab-warning"><strong>Per-set summary</strong><ul>${perSetSummaries.map(x => `<li>${x}</li>`).join('')}</ul></div><p class="hint">Updated <code>build-manifest.json</code> was downloaded. Upload it to <code>data/output</code>.</p>`);
  }

  async function buildChecked(ev) {
    const options = CatalogProfileCore.gatherOptions();
    if (options.profile === 'compact-text') return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    if (state.running) return;
    const setCodes = CatalogProfileCore.getCheckedSetCodes();
    if (!setCodes.length) { setStatus('<p class="hint">No checked sets selected.</p>'); return; }
    state.running = true; state.cancelCurrent = false; state.cancelBatch = false; setButtons(true);
    try {
      const manifest = await CatalogProfileCore.loadManifest();
      await runBatch(setCodes, options, manifest, null);
    } finally {
      state.running = false; state.cancelCurrent = false; state.cancelBatch = false; setButtons(false); if (window.SharedImageCache) SharedImageCache.refreshStatusSoon();
    }
  }

  function cancelCurrent() { state.cancelCurrent = true; setStatus('<strong>Cancellation requested:</strong> current set will stop after the current card.'); }
  function cancelBatch() { state.cancelBatch = true; state.cancelCurrent = true; setStatus('<strong>Cancellation requested:</strong> batch will stop after the current card/set.'); }

  window.BatchImageProfileRunner = {runBatch, state};

  function init() {
    const btn = $('buildCheckedCatalogsBtn');
    const cancelCurrentBtn = $('cancelCurrentBatchSetBtn');
    const cancelBatchBtn = $('cancelEntireBatchBtn');
    if (btn) btn.addEventListener('click', buildChecked, true);
    if (cancelCurrentBtn) cancelCurrentBtn.addEventListener('click', cancelCurrent);
    if (cancelBatchBtn) cancelBatchBtn.addEventListener('click', cancelBatch);
    if (typeof BuilderModules !== 'undefined') BuilderModules.register('Batch Image Profile', '8.5.0');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
