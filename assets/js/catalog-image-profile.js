(function () {
  function $(id) { return document.getElementById(id); }
  const state = {running: false, cancelCurrent: false, cancelBatch: false};

  async function buildSelectedSet(ev) {
    const options = CatalogProfileCore.gatherOptions();
    if (options.profile === 'compact-text') return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    if (state.running) return;

    const setCode = (($('catalogSetSelect') || {}).value) || '';
    const summary = $('catalogSummary');
    const cancelBtn = $('cancelCatalogBuildBtn');
    if (!setCode) {
      if (summary) summary.innerHTML = 'Choose a scanned set first.';
      return;
    }
    state.running = true; state.cancelCurrent = false; state.cancelBatch = false;
    if (cancelBtn) cancelBtn.disabled = false;

    try {
      if (summary) summary.innerHTML = `Loading ${setCode}.json...`;
      const source = await CatalogProfileCore.fetchSetSource(setCode);
      const result = await CatalogProfileCore.buildSetFromSource(setCode, source, options, state, prog => {
        if (summary) summary.innerHTML = `Building ${setCode}: ${prog.current} of ${prog.total} · ${prog.cardName}`;
      });
      CatalogProfileCore.downloadHtml(result.outputFileName || `${setCode}.html`, result.html);
      const reportWarnings = CatalogProfileCore.warnings(result);
      if (summary) {
        summary.innerHTML = `<strong>Built:</strong> ${result.outputFileName || `${setCode}.html`}<br><strong>Cards processed:</strong> ${result.cardsProcessed}<br>${options.imageMode==='embedded' ? `<strong>Images embedded:</strong> ${result.imagesFound}/${result.cardsProcessed}<br>` : ''}${options.priceSettings&&options.priceSettings.enabled?`<strong>Cards with prices:</strong> ${result.priceMatches}/${result.cardsProcessed}<br>`:''}<strong>Approx HTML size:</strong> ${CatalogProfileCore.formatBytes(result.htmlBytes)}<br><strong>Compatibility estimate:</strong> ${CatalogProfileCore.compatibility(result.htmlBytes, options.imageMode)}${reportWarnings.length ? `<div class="image-lab-warning"><strong>Warnings</strong><ul>${reportWarnings.map(w => `<li>${w}</li>`).join('')}</ul></div>` : ''}`;
      }
    } catch (err) {
      if (summary) summary.innerHTML = `Image-profile build failed: ${err && err.message ? err.message : String(err)}`;
    } finally {
      state.running = false;
      if (cancelBtn) cancelBtn.disabled = true;
      if (window.SharedImageCache) SharedImageCache.refreshStatusSoon();
    }
  }

  function cancelBuild() {
    state.cancelCurrent = true;
    const summary = $('catalogSummary');
    if (summary) summary.innerHTML = 'Cancellation requested... finishing current card.';
  }

  function updateProfileUi() {
    const profile = (($('outputProfileSelect') || {}).value) || 'compact-text';
    const width = $('catalogImageWidthSelect');
    const quality = $('catalogImageQualitySelect');
    const widthLabel = width && width.closest('label');
    const qualityLabel = quality && quality.closest('label');
    const visible = profile === 'card-embedded-images';
    const printHelp = $('printProfileHelp');
    if (printHelp) printHelp.hidden = profile !== 'print-dense';
    if (widthLabel) widthLabel.style.display = visible ? '' : 'none';
    if (qualityLabel) qualityLabel.style.display = visible ? '' : 'none';
  }

  function init() {
    const profile = $('outputProfileSelect');
    const buildBtn = $('buildCatalogBtn');
    const cancelBtn = $('cancelCatalogBuildBtn');
    if (profile) profile.addEventListener('change', updateProfileUi);
    updateProfileUi();
    if (buildBtn) buildBtn.addEventListener('click', buildSelectedSet, true);
    if (cancelBtn) cancelBtn.addEventListener('click', cancelBuild);
    if (typeof BuilderModules !== 'undefined') BuilderModules.register('Catalog Image Profile', '8.7.0');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
