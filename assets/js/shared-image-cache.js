(function () {
  function $(id) { return document.getElementById(id); }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function dataUrlToBytes(dataUrl) {
    const comma = dataUrl.indexOf(',');
    const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  const SharedImageCache = {
    dbName: 'mtg-builder-image-cache',
    storeName: 'images',
    dbPromise: null,
    remoteManifest: null,
    pendingUpdates: new Map(),
    stats: {
      localHits: 0,
      githubHits: 0,
      processedFresh: 0
    },

    registerModule() {
      if (typeof BuilderModules !== 'undefined') BuilderModules.register('Shared Image Cache', '8.3.0');
    },

    getConfig() {
      return {
        useGithub: !$("enableGithubImageCache") || $("enableGithubImageCache").checked,
        useLocal: !$("enableLocalImageCache") || $("enableLocalImageCache").checked,
        basePath: (($("githubImageCacheBase") || {}).value || './data/image-cache').replace(/\/$/, '')
      };
    },

    folder(width, quality) {
      return `${width}-${Math.round(Number(quality) * 100)}`;
    },

    key(scryfallId, width, quality) {
      return `${this.folder(width, quality)}/${scryfallId}.jpg`;
    },

    async openDb() {
      if (this.dbPromise) return this.dbPromise;
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(this.storeName)) db.createObjectStore(this.storeName);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return this.dbPromise;
    },

    async getLocal(key) {
      const db = await this.openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    },

    async putLocal(key, value) {
      const db = await this.openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        const req = store.put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },

    async countLocal() {
      const db = await this.openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        const req = store.count();
        req.onsuccess = () => resolve(req.result || 0);
        req.onerror = () => reject(req.error);
      });
    },

    async clearLocal() {
      const db = await this.openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },

    async loadRemoteManifest() {
      if (this.remoteManifest) return this.remoteManifest;
      const cfg = this.getConfig();
      try {
        const response = await fetch(`${cfg.basePath}/manifest.json`, {cache: 'no-store'});
        if (!response.ok) throw new Error('manifest not found');
        this.remoteManifest = await response.json();
      } catch (err) {
        this.remoteManifest = {version: '8.3.0', generatedAt: null, profiles: {}};
      }
      return this.remoteManifest;
    },

    async fetchGithubImage(key) {
      const cfg = this.getConfig();
      const response = await fetch(`${cfg.basePath}/${key}`, {cache: 'no-store'});
      if (!response.ok) return null;
      const blob = await response.blob();
      if (!(blob.type || '').startsWith('image/')) return null;
      return blobToDataUrl(blob);
    },

    async resolveProcessedImage(scryfallId, width, quality) {
      const key = this.key(scryfallId, width, quality);
      const cfg = this.getConfig();

      if (cfg.useLocal) {
        try {
          const local = await this.getLocal(key);
          if (local) {
            this.stats.localHits += 1;
            this.refreshStatusSoon();
            return {dataUrl: local, source: 'local'};
          }
        } catch (err) {
          console.warn('Local cache read failed', err);
        }
      }

      if (cfg.useGithub) {
        try {
          const githubData = await this.fetchGithubImage(key);
          if (githubData) {
            if (cfg.useLocal) {
              try { await this.putLocal(key, githubData); } catch (err) {}
            }
            this.stats.githubHits += 1;
            this.refreshStatusSoon();
            return {dataUrl: githubData, source: 'github'};
          }
        } catch (err) {
          console.warn('GitHub cache fetch failed', err);
        }
      }

      if (typeof ImageLab === 'undefined') {
        return {dataUrl: null, source: 'missing'};
      }
      const imageUrl = await ImageLab.getScryfallImage(scryfallId);
      if (!imageUrl) return {dataUrl: null, source: 'missing'};
      const processed = await ImageLab.processImage(imageUrl);
      if (cfg.useLocal) {
        try { await this.putLocal(key, processed); } catch (err) {}
      }
      this.pendingUpdates.set(key, {
        key,
        scryfallId,
        width,
        quality,
        dataUrl: processed,
        updatedAt: new Date().toISOString()
      });
      this.stats.processedFresh += 1;
      this.refreshStatusSoon();
      return {dataUrl: processed, source: 'scryfall'};
    },

    async buildMergedManifest() {
      const manifest = JSON.parse(JSON.stringify(await this.loadRemoteManifest() || {version: '8.3.0', profiles: {}}));
      if (!manifest.profiles) manifest.profiles = {};
      manifest.version = '8.3.0';
      manifest.generatedAt = new Date().toISOString();
      for (const [key, entry] of this.pendingUpdates.entries()) {
        const folder = this.folder(entry.width, entry.quality);
        if (!manifest.profiles[folder]) manifest.profiles[folder] = {files: {}};
        manifest.profiles[folder].files[entry.scryfallId] = `${folder}/${entry.scryfallId}.jpg`;
      }
      return manifest;
    },

    async downloadUpdateZip() {
      const status = $('imageCacheStatus');
      if (!this.pendingUpdates.size) {
        if (status) status.innerHTML = 'No new processed images are waiting to be uploaded.';
        return;
      }
      if (typeof SimpleZip === 'undefined') {
        if (status) status.innerHTML = 'ZIP module is not loaded.';
        return;
      }
      const manifest = await this.buildMergedManifest();
      const files = [];
      for (const [key, entry] of this.pendingUpdates.entries()) {
        files.push({name: `data/image-cache/${key}`, content: dataUrlToBytes(entry.dataUrl)});
      }
      files.push({name: 'data/image-cache/manifest.json', content: JSON.stringify(manifest, null, 2)});
      const zip = SimpleZip.create(files);
      const a = document.createElement('a');
      const url = URL.createObjectURL(zip);
      a.href = url;
      a.download = 'image-cache-update.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if (status) status.innerHTML = `<strong>Cache update ready.</strong><br><strong>New files:</strong> ${this.pendingUpdates.size}<br><strong>Upload target:</strong> <code>data/image-cache</code>`;
    },

    async refreshStatus() {
      const status = $('imageCacheStatus');
      if (!status) return;
      let localCount = 0;
      try { localCount = await this.countLocal(); } catch (err) {}
      const cfg = this.getConfig();
      status.innerHTML = `<strong>GitHub cache path:</strong> <code>${escapeHtml(cfg.basePath)}</code><br>` +
        `<strong>Local cached images:</strong> ${localCount}<br>` +
        `<strong>Pending upload images:</strong> ${this.pendingUpdates.size}<br>` +
        `<strong>Cache hits:</strong> local ${this.stats.localHits} · GitHub ${this.stats.githubHits}<br>` +
        `<strong>Freshly processed:</strong> ${this.stats.processedFresh}`;
    },

    refreshStatusSoon() {
      clearTimeout(this._statusTimer);
      this._statusTimer = setTimeout(() => this.refreshStatus(), 100);
    },

    async init() {
      this.registerModule();
      const refreshBtn = $('refreshImageCacheStatusBtn');
      const downloadBtn = $('downloadImageCacheUpdateBtn');
      const clearBtn = $('clearLocalImageCacheBtn');
      if (refreshBtn) refreshBtn.addEventListener('click', () => this.refreshStatus());
      if (downloadBtn) downloadBtn.addEventListener('click', () => this.downloadUpdateZip());
      if (clearBtn) clearBtn.addEventListener('click', async () => {
        await this.clearLocal();
        this.stats.localHits = 0;
        this.refreshStatus();
      });
      this.refreshStatus();
    }
  };

  window.SharedImageCache = SharedImageCache;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SharedImageCache.init());
  } else {
    SharedImageCache.init();
  }
})();
