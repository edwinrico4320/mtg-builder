(function () {
  function $(id) { return document.getElementById(id); }
  async function buildAll(ev) {
    const options = CatalogProfileCore.gatherOptions();
    if (options.profile === 'compact-text') return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    if (!window.BatchImageProfileRunner || BatchImageProfileRunner.state.running) return;
    const allCodes = CatalogProfileCore.getAllSetCodes();
    const status = $('batchBuildStatus');
    if (!allCodes.length) { if (status) status.innerHTML = '<p class="hint">No discovered sets available.</p>'; return; }
    BatchImageProfileRunner.state.running = true; BatchImageProfileRunner.state.cancelCurrent = false; BatchImageProfileRunner.state.cancelBatch = false;
    const currentBtn = $('cancelCurrentBatchSetBtn'); const batchBtn = $('cancelEntireBatchBtn');
    if (currentBtn) currentBtn.disabled = false; if (batchBtn) batchBtn.disabled = false;
    try {
      const manifest = await CatalogProfileCore.loadManifest();
      await BatchImageProfileRunner.runBatch(allCodes, options, manifest, null);
    } finally {
      BatchImageProfileRunner.state.running = false; BatchImageProfileRunner.state.cancelCurrent = false; BatchImageProfileRunner.state.cancelBatch = false;
      if (currentBtn) currentBtn.disabled = true; if (batchBtn) batchBtn.disabled = true; if (window.SharedImageCache) SharedImageCache.refreshStatusSoon();
    }
  }
  function init(){ const btn=$('buildAllCatalogsBtn'); if(btn) btn.addEventListener('click', buildAll, true); if(typeof BuilderModules!=='undefined') BuilderModules.register('All-Sets Image Profile','8.6.0'); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
