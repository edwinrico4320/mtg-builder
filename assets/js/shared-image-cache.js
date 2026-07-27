(function () {
  function $(id) { return document.getElementById(id); }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;');
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

  function bytesToBlob(bytes, name) {
    const lower = String(name || '').toLowerCase();
    let type = 'application/octet-stream';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) type = 'image/jpeg';
    else if (lower.endsWith('.png')) type = 'image/png';
    else if (lower.endsWith('.webp')) type = 'image/webp';
    else if (lower.endsWith('.json')) type = 'application/json';
    return new Blob([bytes], { type });
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let idx = 0;
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx += 1;
    }
    return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
  }

  class SimpleZipReader {
    constructor(arrayBuffer) {
      this.buffer = arrayBuffer;
      this.view = new DataView(arrayBuffer);
      this.entries = null;
    }

    _findEndOfCentralDirectory() {
      const minOffset = Math.max(0, this.buffer.byteLength - 0xFFFF - 22);
      for (let i = this.buffer.byteLength - 22; i >= minOffset; i--) {
        if (this.view.getUint32(i, true) === 0x06054b50) return i;
      }
      throw new Error('ZIP end-of-central-directory record not found');
    }

    _readEntries() {
      if (this.entries) return this.entries;
      const eocd = this._findEndOfCentralDirectory();
      const totalEntries = this.view.getUint16(eocd + 10, true);
      const centralDirOffset = this.view.getUint32(eocd + 16, true);
      let offset = centralDirOffset;
      const entries = {};

      for (let i = 0; i < totalEntries; i++) {
        if (this.view.getUint32(offset, true) !== 0x02014b50) throw new Error('Invalid central directory record');
        const compression = this.view.getUint16(offset + 10, true);
        const compressedSize = this.view.getUint32(offset + 20, true);
        const uncompressedSize = this.view.getUint32(offset + 24, true);
        const fileNameLength = this.view.getUint16(offset + 28, true);
        const extraLength = this.view.getUint16(offset + 30, true);
        const commentLength = this.view.getUint16(offset + 32, true);
        const localHeaderOffset = this.view.getUint32(offset + 42, true);
        const fileNameBytes = new Uint8Array(this.buffer, offset + 46, fileNameLength);
        const fileName = new TextDecoder().decode(fileNameBytes);

        entries[fileName] = {
          fileName,
          compression,
          compressedSize,
          uncompressedSize,
          localHeaderOffset
        };

        offset += 46 + fileNameLength + extraLength + commentLength;
      }

      this.entries = entries;
      return entries;
    }

    listEntries() {
      return Object.keys(this._readEntries());
    }

    async getEntryBytes(name) {
      const entries = this._readEntries();
      const entry = entries[name];
      if (!entry) return null;
      const offset = entry.localHeaderOffset;
      if (this.view.getUint32(offset, true) !== 0x04034b50) throw new Error('Invalid local ZIP header');
      const fileNameLength = this.view.getUint16(offset + 26, true);
      const extraLength = this.view.getUint16(offset + 28, true);
      const dataOffset = offset + 30 + fileNameLength + extraLength;
      const raw = new Uint8Array(this.buffer.slice(dataOffset, dataOffset + entry.compressedSize));

      if (entry.compression === 0) {
        return raw;
      }
      if (entry.compression === 8 && typeof DecompressionStream !== 'undefined') {
        const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        const response = new Response(stream);
        return new Uint8Array(await response.arrayBuffer());
      }
      throw new Error(`Unsupported ZIP compression method: ${entry.compression}`);
    }

    async getEntryDataUrl(name) {
      const bytes = await this.getEntryBytes(name);
      if (!bytes) return null;
      const blob = bytesToBlob(bytes, name);
      return blobToDataUrl(blob);
    }
  }

  const SharedImageCache = {
    dbName: 'mtg-builder-image-cache',
    storeName: 'images',
    dbPromise: null,
    remoteManifest: null,
    pendingUpdates: new Map(),
    packReaders: new Map(),
    stats: {
      localHits: 0,
      githubLooseHits: 0,
      githubPackHits: 0,
      processedFresh: 0
    },
    config: {
      maxPackBytes: 20 * 1024 * 1024
    },

    registerModule() {
      if (typeof BuilderModules !== 'undefined') BuilderModules.register('Packed Shared Image Cache', '8.3.1');
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
        const response = await fetch(`${cfg.basePath}/manifest.json`, { cache: 'no-store' });
        if (!response.ok) throw new Error('manifest not found');
        this.remoteManifest = await response.json();
      } catch (err) {
        this.remoteManifest = { version: '8.3.1', generatedAt: null, profiles: {} };
      }
      return this.remoteManifest;
    },

    async fetchGithubImage(path) {
      const cfg = this.getConfig();
      const response = await fetch(`${cfg.basePath}/${path}`, { cache: 'no-store' });
      if (!response.ok) return null;
      const blob = await response.blob();
      if (!(blob.type || '').startsWith('image/')) return null;
      return blobToDataUrl(blob);
    },

    async getPackReader(packPath) {
      const cfg = this.getConfig();
      if (this.packReaders.has(packPath)) return this.packReaders.get(packPath);
      const response = await fetch(`${cfg.basePath}/${packPath}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Pack not found: ${packPath}`);
      const buffer = await response.arrayBuffer();
      const reader = new SimpleZipReader(buffer);
      this.packReaders.set(packPath, reader);
      return reader;
    },

    async resolveRemoteReference(folder, scryfallId) {
      const manifest = await this.loadRemoteManifest();
      const profile = manifest && manifest.profiles ? manifest.profiles[folder] : null;
      if (!profile || !profile.files) return null;
      return profile.files[scryfallId] || null;
    },

    async fetchFromPackedCache(reference) {
      const parts = String(reference).split('#');
      if (parts.length !== 2) return null;
      const packPath = parts[0];
      const entryName = parts[1];
      const reader = await this.getPackReader(packPath);
      return reader.getEntryDataUrl(entryName);
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
            return { dataUrl: local, source: 'local' };
          }
        } catch (err) {
          console.warn('Local cache read failed', err);
        }
      }

      if (cfg.useGithub) {
        try {
          const folder = this.folder(width, quality);
          const reference = await this.resolveRemoteReference(folder, scryfallId);
          if (reference) {
            let githubData = null;
            if (String(reference).includes('.zip#')) {
              githubData = await this.fetchFromPackedCache(reference);
              if (githubData) this.stats.githubPackHits += 1;
            } else {
              githubData = await this.fetchGithubImage(reference);
              if (githubData) this.stats.githubLooseHits += 1;
            }
            if (githubData) {
              if (cfg.useLocal) {
                try { await this.putLocal(key, githubData); } catch (err) {}
              }
              this.refreshStatusSoon();
              return { dataUrl: githubData, source: 'github' };
            }
          }
        } catch (err) {
          console.warn('GitHub cache fetch failed', err);
        }
      }

      if (typeof ImageLab === 'undefined') return { dataUrl: null, source: 'missing' };
      const imageUrl = await ImageLab.getScryfallImage(scryfallId);
      if (!imageUrl) return { dataUrl: null, source: 'missing' };
      const processed = await ImageLab.processImage(imageUrl);
      if (cfg.useLocal) {
        try { await this.putLocal(key, processed); } catch (err) {}
      }
      this.pendingUpdates.set(key, {
        key,
        scryfallId,
        width,
        quality,
        folder: this.folder(width, quality),
        fileName: `${scryfallId}.jpg`,
        dataUrl: processed,
        byteLength: dataUrlToBytes(processed).length,
        updatedAt: new Date().toISOString()
      });
      this.stats.processedFresh += 1;
      this.refreshStatusSoon();
      return { dataUrl: processed, source: 'scryfall' };
    },

    buildPackPlan() {
      const groups = new Map();
      for (const entry of this.pendingUpdates.values()) {
        if (!groups.has(entry.folder)) groups.set(entry.folder, []);
        groups.get(entry.folder).push(entry);
      }
      const plan = [];
      const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
      for (const [folder, entries] of groups.entries()) {
        let bucket = [];
        let bucketBytes = 0;
        let packIndex = 1;
        for (const entry of entries) {
          const estimated = entry.byteLength + 200;
          if (bucket.length && bucketBytes + estimated > this.config.maxPackBytes) {
            plan.push({ folder, packName: `packs/${folder}-pack-${timestamp}-${String(packIndex).padStart(3, '0')}.zip`, entries: bucket });
            packIndex += 1;
            bucket = [];
            bucketBytes = 0;
          }
          bucket.push(entry);
          bucketBytes += estimated;
        }
        if (bucket.length) {
          plan.push({ folder, packName: `packs/${folder}-pack-${timestamp}-${String(packIndex).padStart(3, '0')}.zip`, entries: bucket });
        }
      }
      return plan;
    },

    async buildMergedManifest(plan) {
      const manifest = JSON.parse(JSON.stringify(await this.loadRemoteManifest() || { version: '8.3.1', profiles: {} }));
      if (!manifest.profiles) manifest.profiles = {};
      manifest.version = '8.3.1';
      manifest.generatedAt = new Date().toISOString();
      for (const pack of plan) {
        if (!manifest.profiles[pack.folder]) manifest.profiles[pack.folder] = { files: {} };
        for (const entry of pack.entries) {
          manifest.profiles[pack.folder].files[entry.scryfallId] = `${pack.packName}#${entry.fileName}`;
        }
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

      const plan = this.buildPackPlan();
      const manifest = await this.buildMergedManifest(plan);
      const outerFiles = [];
      for (const pack of plan) {
        const innerFiles = pack.entries.map(entry => ({ name: entry.fileName, content: dataUrlToBytes(entry.dataUrl) }));
        const innerZipBlob = SimpleZip.create(innerFiles);
        const innerBytes = new Uint8Array(await innerZipBlob.arrayBuffer());
        outerFiles.push({ name: `data/image-cache/${pack.packName}`, content: innerBytes });
      }
      outerFiles.push({ name: 'data/image-cache/manifest.json', content: JSON.stringify(manifest, null, 2) });
      outerFiles.push({ name: 'README-upload.txt', content: [
        'Packed Image Cache Update',
        '',
        'Upload the contents of the data/ folder in this ZIP to your GitHub repository root.',
        'This update contains packed cache ZIP files plus an updated data/image-cache/manifest.json.',
        '',
        'Recommended upload target:',
        'data/image-cache/'
      ].join('\n') });

      const zip = SimpleZip.create(outerFiles);
      const a = document.createElement('a');
      const url = URL.createObjectURL(zip);
      a.href = url;
      a.download = 'image-cache-packed-update.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      if (status) {
        const totalImages = plan.reduce((sum, pack) => sum + pack.entries.length, 0);
        status.innerHTML = `<strong>Packed cache update ready.</strong><br>` +
          `<strong>New images:</strong> ${totalImages}<br>` +
          `<strong>Pack files:</strong> ${plan.length}<br>` +
          `<strong>Upload target:</strong> <code>data/image-cache</code><br>` +
          `<strong>Download:</strong> <code>image-cache-packed-update.zip</code>`;
      }
    },

    async refreshStatus() {
      const status = $('imageCacheStatus');
      if (!status) return;
      let localCount = 0;
      try { localCount = await this.countLocal(); } catch (err) {}
      const cfg = this.getConfig();
      const packPlan = this.buildPackPlan();
      const pendingImages = Array.from(this.pendingUpdates.values()).length;
      const pendingPackBytes = packPlan.reduce((sum, pack) => sum + pack.entries.reduce((acc, e) => acc + e.byteLength, 0), 0);
      status.innerHTML = `<strong>GitHub cache path:</strong> <code>${escapeHtml(cfg.basePath)}</code><br>` +
        `<strong>Local cached images:</strong> ${localCount}<br>` +
        `<strong>Pending upload images:</strong> ${pendingImages}<br>` +
        `<strong>Estimated packed ZIP files:</strong> ${packPlan.length}<br>` +
        `<strong>Pending packed image payload:</strong> ${formatBytes(pendingPackBytes)}<br>` +
        `<strong>Cache hits:</strong> local ${this.stats.localHits} · GitHub loose ${this.stats.githubLooseHits} · GitHub packed ${this.stats.githubPackHits}<br>` +
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

  // fix accidental Python-style syntax introduced in buildPackPlan check helper path
  SharedImageCache.buildPackPlan = function () {
    const groups = new Map();
    for (const entry of this.pendingUpdates.values()) {
      if (!groups.has(entry.folder)) groups.set(entry.folder, []);
      groups.get(entry.folder).push(entry);
    }
    const plan = [];
    const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    for (const [folder, entries] of groups.entries()) {
      let bucket = [];
      let bucketBytes = 0;
      let packIndex = 1;
      for (const entry of entries) {
        const estimated = entry.byteLength + 200;
        if (bucket.length && bucketBytes + estimated > this.config.maxPackBytes) {
          plan.push({ folder, packName: `packs/${folder}-pack-${timestamp}-${String(packIndex).padStart(3, '0')}.zip`, entries: bucket });
          packIndex += 1;
          bucket = [];
          bucketBytes = 0;
        }
        bucket.push(entry);
        bucketBytes += estimated;
      }
      if (bucket.length) {
        plan.push({ folder, packName: `packs/${folder}-pack-${timestamp}-${String(packIndex).padStart(3, '0')}.zip`, entries: bucket });
      }
    }
    return plan;
  };

  window.SharedImageCache = SharedImageCache;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SharedImageCache.init());
  } else {
    SharedImageCache.init();
  }
})();
