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
  return `
<strong>Set:</strong> ${report.setCode}<br>
<strong>Cards processed:</strong> ${report.cardsProcessed}<br>
<strong>Scryfall IDs found:</strong> ${report.idsFound}/${report.cardsProcessed}<br>
<strong>Images retrieved:</strong> ${report.imagesFound}/${report.cardsProcessed}<br>
<strong>Mode:</strong> ${report.mode}<br>
<strong>Approx image payload:</strong> ${formatBytes(report.totalBytes)}<br>
<strong>Approx generated HTML:</strong> ${formatBytes(report.htmlBytes)}<br>
<strong>Status:</strong> ${report.imagesFound > 0 ? "SUCCESS" : "No images found"}
`;
}
