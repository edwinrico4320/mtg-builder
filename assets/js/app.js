import { recommendedSets } from "./recommended-sets.js";

const mount = document.querySelector("#pluginMount");
const status = document.querySelector("#appStatus");
const navButtons = [...document.querySelectorAll(".nav")];

const state = {
  installedSets: [],
  recommendedSets
};

const plugins = {
  dashboard() {
    mount.innerHTML = `
      <div class="card">
        <h2>Dashboard</h2>
        <p>This is the plugin-based MTG Builder shell running from GitHub Pages.</p>
        <div class="grid">
          <div class="stat"><strong>${state.recommendedSets.length}</strong><span>Recommended sets</span></div>
          <div class="stat"><strong>${state.installedSets.length}</strong><span>Installed sets tracked</span></div>
          <div class="stat"><strong>0</strong><span>Catalogs built</span></div>
        </div>
      </div>
      <div class="card">
        <h3>Next milestone</h3>
        <p>Add GitHub storage so the builder can read/write files in this repository.</p>
      </div>
    `;
  },

  sets() {
    mount.innerHTML = `
      <div class="card">
        <h2>Set Downloader</h2>
        <p>This plugin will download MTGJSON set files. For now, it generates direct download links.</p>
        <button class="primary" id="makeLinks">Generate MTGJSON Links</button>
      </div>
      <div class="card">
        <h3>Recommended set list</h3>
        <textarea id="setOutput" rows="14" readonly>${state.recommendedSets.join("\n")}</textarea>
      </div>
      <div class="card">
        <h3>Activity Log</h3>
        <div class="log" id="log">Ready.</div>
      </div>
    `;

    document.querySelector("#makeLinks").addEventListener("click", () => {
      const urls = state.recommendedSets.map(code => `https://mtgjson.com/api/v5/${code}.json`);
      document.querySelector("#setOutput").value = urls.join("\n");
      document.querySelector("#log").textContent = `Generated ${urls.length} MTGJSON download URLs.`;
    });
  },

  catalog() {
    mount.innerHTML = `
      <div class="card">
        <h2>Catalog Builder</h2>
        <p>Coming next: load set JSON files, dedupe cards, and export a lightweight offline catalog.</p>
      </div>
    `;
  },

  settings() {
    mount.innerHTML = `
      <div class="card">
        <h2>Settings</h2>
        <label>MTGJSON API base URL</label>
        <input value="https://mtgjson.com/api/v5/" />
      </div>
    `;
  }
};

function loadPlugin(name) {
  navButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.plugin === name));
  status.textContent = `${name[0].toUpperCase()}${name.slice(1)} Plugin`;
  plugins[name]();
}

navButtons.forEach(btn => btn.addEventListener("click", () => loadPlugin(btn.dataset.plugin)));
loadPlugin("dashboard");
