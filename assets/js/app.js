import { recommendedSets } from "./recommended-sets.js";

const mount = document.querySelector("#pluginMount");
const status = document.querySelector("#appStatus");
const navButtons = [...document.querySelectorAll(".nav")];

const MTGJSON_BASE = "https://mtgjson.com/api/v5/";

const state = {
  installedSets: [],
  missingSets: [],
  recommendedSets,
  lastCheck: null
};

function setStatus(text) {
  status.textContent = text;
}

function mtgjsonUrl(code) {
  return `${MTGJSON_BASE}${code}.json`;
}

function localJsonPath(code) {
  return `data/json/${code}.json`;
}

function downloadUrl(code) {
  return mtgjsonUrl(code);
}

function objectUrlFromText(text, mimeType = "application/json") {
  const blob = new Blob([text], { type: mimeType });
  return URL.createObjectURL(blob);
}

function log(message) {
  const box = document.querySelector("#log");
  if (!box) return;
  const time = new Date().toLocaleTimeString();
  box.textContent += `\n[${time}] ${message}`;
  box.scrollTop = box.scrollHeight;
}

async function fileExists(path) {
  try {
    const response = await fetch(`${path}?v=${Date.now()}`, {
      method: "HEAD",
      cache: "no-store"
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function checkInstalledSets() {
  setStatus("Checking sets...");
  const installed = [];
  const missing = [];

  for (const code of state.recommendedSets) {
    const exists = await fileExists(localJsonPath(code));
    if (exists) installed.push(code);
    else missing.push(code);
    const count = installed.length + missing.length;
    const progress = document.querySelector("#checkProgress");
    if (progress) progress.textContent = `${count} / ${state.recommendedSets.length}`;
  }

  state.installedSets = installed;
  state.missingSets = missing;
  state.lastCheck = new Date();
  setStatus("Set Downloader");
  renderSets();
}

function copyText(text, successMessage) {
  navigator.clipboard.writeText(text)
    .then(() => log(successMessage))
    .catch(() => log("Clipboard copy failed. Select the text manually and copy it."));
}


let downloadQueueTimer = null;
let stopRequested = false;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function triggerDownloadFromBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
}

function triggerDirectFallback(url, filename) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.target = "_blank";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function downloadSetJson(code, { fallbackToDirect = true } = {}) {
  const url = downloadUrl(code);
  const filename = `${code}.json`;

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const text = await response.text();

    try {
      JSON.parse(text);
    } catch {
      throw new Error("Downloaded response was not valid JSON");
    }

    const blob = new Blob([text], { type: "application/json" });
    triggerDownloadFromBlob(blob, filename);
    return { ok: true, method: "blob" };
  } catch (error) {
    if (fallbackToDirect) {
      log(`Fetch download failed for ${filename}: ${error.message}. Opening fallback link instead.`);
      triggerDirectFallback(url, filename);
      return { ok: false, method: "fallback", error };
    }
    return { ok: false, method: "fetch", error };
  }
}

function getMissingOrAllCodes() {
  return state.lastCheck ? state.missingSets : state.recommendedSets;
}

async function multiDownloadMissing() {
  const codes = getMissingOrAllCodes();
  const delayInput = document.querySelector("#downloadDelay");
  const delay = Math.max(500, Number(delayInput?.value || 1500));
  const progress = document.querySelector("#multiProgress");

  if (!codes.length) {
    log("No missing sets to download.");
    return;
  }

  stopRequested = false;
  document.querySelector("#startMultiDownload").disabled = true;
  document.querySelector("#stopMultiDownload").disabled = false;
  log(`Starting multi-download for ${codes.length} set file(s).`);
  log("Your browser may ask whether to allow multiple downloads from this site. Choose Allow if prompted.");

  for (let i = 0; i < codes.length; i++) {
    if (stopRequested) {
      log("Multi-download stopped by user.");
      break;
    }

    const code = codes[i];
    if (progress) progress.textContent = `${i + 1} / ${codes.length} — ${code}.json`;
    log(`Fetching ${code}.json and forcing browser download...`);
    const result = await downloadSetJson(code);
    if (result.ok) {
      log(`Queued ${code}.json as a real file download.`);
    } else if (result.method === "fallback") {
      log(`${code}.json used fallback direct link. If it opens in a tab, right-click the page and choose Save As.`);
    }
    await sleep(delay);
  }

  document.querySelector("#startMultiDownload").disabled = false;
  document.querySelector("#stopMultiDownload").disabled = true;
  if (progress && !stopRequested) progress.textContent = `Done — ${codes.length} file(s) queued`;
  if (!stopRequested) log("Multi-download queue finished. Upload the downloaded JSON files into data/json/ in GitHub.");
}

function stopMultiDownload() {
  stopRequested = true;
}

function renderSetRows() {
  const installed = new Set(state.installedSets);
  return state.recommendedSets.map(code => {
    const hasFile = installed.has(code);
    const label = hasFile ? "Installed" : "Missing";
    const className = hasFile ? "ok" : "warn";
    return `
      <tr>
        <td><strong>${code}</strong></td>
        <td><span class="pill ${className}">${label}</span></td>
        <td><code>${localJsonPath(code)}</code></td>
        <td>
          <button class="linkButton" data-download-set="${code}">Force Download</button>
          <a href="${downloadUrl(code)}" target="_blank" rel="noopener">Open source</a>
        </td>
      </tr>
    `;
  }).join("");
}

function renderSets() {
  const missingUrls = (state.missingSets.length ? state.missingSets : state.recommendedSets)
    .map(code => downloadUrl(code))
    .join("\n");

  const installedCount = state.installedSets.length;
  const missingCount = state.lastCheck ? state.missingSets.length : "?";

  mount.innerHTML = `
    <div class="card">
      <h2>Set Downloader v3</h2>
      <p>This plugin checks your GitHub Pages project for files in <code>data/json/</code>, then fetches missing MTGJSON files and forces real <code>.json</code> browser downloads.</p>
      <div class="actions">
        <button class="primary" id="checkSets">Check Installed Sets</button>
        <button class="secondary" id="startMultiDownload">Download Missing Sets</button>
        <button class="secondary" id="stopMultiDownload" disabled>Stop Download Queue</button>
        <button class="secondary" id="copyMissing">Copy Missing URLs</button>
        <button class="secondary" id="copyCodes">Copy Missing Set Codes</button>
      </div>
      <div class="downloadControls">
        <label for="downloadDelay">Delay between downloads</label>
        <input id="downloadDelay" type="number" min="500" step="250" value="1500" />
        <span class="muted">milliseconds</span>
      </div>
      <p class="muted">Check progress: <span id="checkProgress">${state.lastCheck ? state.recommendedSets.length + " / " + state.recommendedSets.length : "Not checked yet"}</span></p>
      <p class="muted">Multi-download progress: <span id="multiProgress">Not started</span></p>
    </div>

    <div class="grid">
      <div class="stat"><strong>${state.recommendedSets.length}</strong><span>Recommended sets</span></div>
      <div class="stat"><strong>${installedCount}</strong><span>Installed in data/json</span></div>
      <div class="stat"><strong>${missingCount}</strong><span>Missing files</span></div>
    </div>

    <div class="card">
      <h3>Missing download URLs</h3>
      <p class="muted">Download these files, then upload the resulting <code>.json</code> files into your repo at <code>data/json/</code>. If forced download fails, the app falls back to direct source links.</p>
      <textarea id="missingUrls" rows="10" readonly>${missingUrls}</textarea>
    </div>

    <div class="card">
      <h3>Recommended Set Status</h3>
      <div class="tableWrap">
        <table>
          <thead>
            <tr><th>Set</th><th>Status</th><th>Expected repo path</th><th>Source</th></tr>
          </thead>
          <tbody>${renderSetRows()}</tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h3>Activity Log</h3>
      <div class="log" id="log">Ready.</div>
    </div>
  `;

  document.querySelector("#checkSets").addEventListener("click", checkInstalledSets);
  document.querySelector("#startMultiDownload").addEventListener("click", multiDownloadMissing);
  document.querySelector("#stopMultiDownload").addEventListener("click", stopMultiDownload);
  document.querySelector("#copyMissing").addEventListener("click", () => {
    copyText(document.querySelector("#missingUrls").value, "Copied missing download URLs.");
  });
  document.querySelector("#copyCodes").addEventListener("click", () => {
    const codes = (state.missingSets.length ? state.missingSets : state.recommendedSets).join("\n");
    copyText(codes, "Copied missing set codes.");
  });

  document.querySelectorAll("[data-download-set]").forEach(button => {
    button.addEventListener("click", async () => {
      const code = button.dataset.downloadSet;
      button.disabled = true;
      button.textContent = "Downloading...";
      const result = await downloadSetJson(code);
      button.disabled = false;
      button.textContent = "Force Download";
      if (result.ok) log(`Queued ${code}.json as a real file download.`);
    });
  });
}

const plugins = {
  dashboard() {
    mount.innerHTML = `
      <div class="card">
        <h2>Dashboard</h2>
        <p>This is the plugin-based MTG Builder running from GitHub Pages.</p>
        <div class="grid">
          <div class="stat"><strong>${state.recommendedSets.length}</strong><span>Recommended sets</span></div>
          <div class="stat"><strong>${state.installedSets.length}</strong><span>Installed sets tracked</span></div>
          <div class="stat"><strong>0</strong><span>Catalogs built</span></div>
        </div>
      </div>
      <div class="card">
        <h3>Current milestone</h3>
        <p>Use <strong>Set Downloader</strong> to check <code>data/json/</code>, download missing MTGJSON files, and upload them into the repository.</p>
      </div>
    `;
  },

  sets() {
    renderSets();
  },

  catalog() {
    mount.innerHTML = `
      <div class="card">
        <h2>Catalog Builder</h2>
        <p>Coming next: load set JSON files from <code>data/json/</code>, dedupe cards, and export a lightweight offline catalog.</p>
      </div>
    `;
  },

  settings() {
    mount.innerHTML = `
      <div class="card">
        <h2>Settings</h2>
        <label>MTGJSON API base URL</label>
        <input value="${MTGJSON_BASE}" readonly />
        <p class="muted">Repo JSON folder: <code>data/json/</code></p>
      </div>
    `;
  }
};

function loadPlugin(name) {
  navButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.plugin === name));
  setStatus(`${name[0].toUpperCase()}${name.slice(1)} Plugin`);
  plugins[name]();
}

navButtons.forEach(btn => btn.addEventListener("click", () => loadPlugin(btn.dataset.plugin)));
loadPlugin("dashboard");
