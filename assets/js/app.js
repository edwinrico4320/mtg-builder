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
        <td><a href="${downloadUrl(code)}" target="_blank" rel="noopener">Download JSON</a></td>
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
      <h2>Set Downloader v1</h2>
      <p>This plugin checks your GitHub Pages project for files in <code>data/json/</code> and gives you direct MTGJSON download links for anything missing.</p>
      <div class="actions">
        <button class="primary" id="checkSets">Check Installed Sets</button>
        <button class="secondary" id="copyMissing">Copy Missing URLs</button>
        <button class="secondary" id="copyCodes">Copy Missing Set Codes</button>
      </div>
      <p class="muted">Check progress: <span id="checkProgress">${state.lastCheck ? state.recommendedSets.length + " / " + state.recommendedSets.length : "Not checked yet"}</span></p>
    </div>

    <div class="grid">
      <div class="stat"><strong>${state.recommendedSets.length}</strong><span>Recommended sets</span></div>
      <div class="stat"><strong>${installedCount}</strong><span>Installed in data/json</span></div>
      <div class="stat"><strong>${missingCount}</strong><span>Missing files</span></div>
    </div>

    <div class="card">
      <h3>Missing download URLs</h3>
      <p class="muted">Download these files, then upload the resulting <code>.json</code> files into your repo at <code>data/json/</code>.</p>
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
  document.querySelector("#copyMissing").addEventListener("click", () => {
    copyText(document.querySelector("#missingUrls").value, "Copied missing download URLs.");
  });
  document.querySelector("#copyCodes").addEventListener("click", () => {
    const codes = (state.missingSets.length ? state.missingSets : state.recommendedSets).join("\n");
    copyText(codes, "Copied missing set codes.");
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
