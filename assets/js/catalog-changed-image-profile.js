  import { CatalogProfileCore } from './catalog-profile-core.js';
  import { BatchImageProfileRunner } from './catalog-batch-image-profile.js';
  import { SharedImageCache } from './shared-image-cache.js';
  
  function $(id) { return document.getElementById(id); }
  async function buildChanged(ev) {
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
      const detected = await CatalogProfileCore.detectChangedSetCodes(allCodes, options, html => { if (status) status.innerHTML = html; });
      if (status) status.innerHTML = `<strong>Sets scanned:</strong> ${allCodes.length}<br><strong>Changed/new sets:</strong> ${detected.changed.length}<br><strong>Unchanged sets skipped:</strong> ${detected.skipped.length}`;
      if (!detected.changed.length) return;
      await BatchImageProfileRunner.runBatch(detected.changed, options, detected.manifest, detected.preloaded);
    } finally {
      BatchImageProfileRunner.state.running = false; BatchImageProfileRunner.state.cancelCurrent = false; BatchImageProfileRunner.state.cancelBatch = false;
      if (currentBtn) currentBtn.disabled = true; if (batchBtn) batchBtn.disabled = true; if (window.SharedImageCache) SharedImageCache.refreshStatusSoon();
    }
  }
  function init(){ const btn=$('buildChangedCatalogsBtn'); if(btn) btn.addEventListener('click', buildChanged, true); if(typeof BuilderModules!=='undefined') BuilderModules.register('Changed/New Image Profile','8.7.1'); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();

