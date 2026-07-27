function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function buildImageReportHtml(report) {
  const warnings = (report.warnings || []).map(w => `<li>${w}</li>`).join('');
  const warningBlock = warnings ? `<div class="image-lab-warning"><strong>Warnings</strong><ul>${warnings}</ul></div>` : '';

  return `
<strong>Set:</strong> ${report.setCode}<br>
<strong>Cards processed:</strong> ${report.cardsProcessed}/${report.cardsRequested}<br>
<strong>Scryfall IDs found:</strong> ${report.idsFound}/${report.cardsProcessed}<br>
<strong>Images retrieved:</strong> ${report.imagesFound}/${report.cardsProcessed}<br>
<strong>Missing / failed images:</strong> ${report.failures}<br>
<strong>Mode:</strong> ${report.mode}<br>
<strong>Approx image payload:</strong> ${formatBytes(report.totalBytes)}<br>
<strong>Approx generated HTML:</strong> ${formatBytes(report.htmlBytes)}<br>
<strong>Compatibility estimate:</strong> ${report.compatibility}<br>
<strong>Status:</strong> ${report.status}
${warningBlock}`;
}
