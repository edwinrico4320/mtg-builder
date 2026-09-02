import { SimpleZip } from './simple-zip.js';

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

  function bytesToBlob(bytes, name) {
    const lower = String(name || '').toLowerCase();
    let type = 'application/octet-stream';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) type = 'image/jpeg';
    else if (lower.endsWith('.png')) type = 'image/png';
    else if (lower.endsWith('.webp')) type = 'image/webp';
    else if (lower.endsWith('.json')) type = 'application/json';
    return new Blob([bytes], {type});
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], {type: 'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  class SimpleZipReader {
    constructor(arrayBuffer) {
      this.buffer = arrayBuffer;
      this.view = new DataView(arrayBuffer);
      this.entries = null;
    }

    _findEndOfCentralDirectory() {
      const minimum = Math.max(0, this.buffer.byteLength - 0xFFFF - 22);
      for (let offset = this.buffer.byteLength - 22; offset >= minimum; offset--) {
        if (this.view.getUint32(offset, true) === 0x06054b50) return offset;
      }
      throw new Error('ZIP end-of-central-directory record not found');
    }

    _readEntries() {
      if (this.entries) return this.entries;
      const eocd = this._findEndOfCentralDirectory();
      const totalEntries = this.view.getUint16(eocd + 10, true);
      const centralDirectoryOffset = this.view.getUint32(eocd + 16, true);
      let offset = centralDirectoryOffset;
      const entries = {};

      for (let index = 0; index < totalEntries; index++) {
        if (this.view.getUint32(offset, true) !== 0x02014b50) {
          throw new Error('Invalid central directory record');
        }
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
      const entry = this._readEntries()[name];
      if (!entry) return null;
      const offset = entry.localHeaderOffset;
      if (this.view.getUint32(offset, true) !== 0x04034b50) {
        throw new Error('Invalid local ZIP header');
      }
      const fileNameLength = this.view.getUint16(offset + 26, true);
      const extraLength = this.view.getUint16(offset + 28, true);
      const dataOffset = offset + 30 + fileNameLength + extraLength;
      const raw = new Uint8Array(this.buffer.slice(dataOffset, dataOffset + entry.compressedSize));
      if (entry.compression === 0) return raw;
      if (entry.compression === 8 && typeof DecompressionStream !== 'undefined') {
        const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
      }
      throw new Error(`Unsupported ZIP compression method: ${entry.compression}`);
    }

    async getEntryDataUrl(name) {
      const bytes = await this.getEntryBytes(name);
      if (!bytes) return null;
      return blobToDataUrl(bytesToBlob(bytes, name));
    }
  }

  const SharedImageCache = {
    dbName: 'mtg-builder-image-cache',
    storeName: 'images',
    dbPromise: null,
    remoteManifest: null,
    pendingUpdates: new Map(),
    packReaders: new Map(),
    lastVerificationReport: null,
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
      if (typeof BuilderModules !== 'undefined') {
        BuilderModules.register('Packed Shared Image Cache', '8.3.2');
      }
    },

    getConfig() {
      return {
        useGithub: !$('enableGithubImageCache') || $('enableGithubImageCache').checked,
        useLocal: !$('enableLocalImageCache') || $('enableLocalImageCache').checked,
        basePath: (($('githubImageCacheBase') || {}).value || './data/image-cache').replace(/\/$/, '')
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
        const request = db.transaction(this.storeName, 'readonly').objectStore(this.storeName).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    },

    async putLocal(key, value) {
      const db = await this.openDb();
      return new Promise((resolve, reject) => {
        const request = db.transaction(this.storeName, 'readwrite').objectStore(this.storeName).put(value, key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },

    async countLocal() {
      const db = await this.openDb();
      return new Promise((resolve, reject) => {
        const request = db.transaction(this.storeName, 'readonly').objectStore(this.storeName).count();
        request.onsuccess = () => resolve(request.result || 0);
        request.onerror = () => reject(request.error);
      });
    },

    async clearLocal() {
      const db = await this.openDb();
      return new Promise((resolve, reject) => {
        const request = db.transaction(this.storeName, 'readwrite').objectStore(this.storeName).clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },

    async loadRemoteManifest(forceReload) {
      if (forceReload) this.remoteManifest = null;
      if (this.remoteManifest) return this.remoteManifest;
      const config = this.getConfig();
      const response = await fetch(`${config.basePath}/manifest.json`, {cache: 'no-store'});
      if (!response.ok) throw new Error(`Cache manifest could not be loaded (${response.status}).`);
      const manifest = await response.json();
      if (!manifest || typeof manifest !== 'object' || !manifest.profiles) {
        throw new Error('Cache manifest is missing its profiles object.');
      }
      this.remoteManifest = manifest;
      return manifest;
    },

    async loadRemoteManifestOrEmpty() {
      try {
        return await this.loadRemoteManifest(false);
      } catch (error) {
        return {version: '8.3.2', generatedAt: null, profiles: {}};
      }
    },

    async fetchGithubImage(path) {
      const config = this.getConfig();
      const response = await fetch(`${config.basePath}/${path}`, {cache: 'no-store'});
      if (!response.ok) return null;
      const blob = await response.blob();
      if (!(blob.type || '').startsWith('image/')) return null;
      return blobToDataUrl(blob);
    },

    async getPackReader(packPath, forceReload) {
      const config = this.getConfig();
      if (forceReload) this.packReaders.delete(packPath);
      if (this.packReaders.has(packPath)) return this.packReaders.get(packPath);
      const response = await fetch(`${config.basePath}/${packPath}`, {cache: 'no-store'});
      if (!response.ok) throw new Error(`Pack not found (${response.status}): ${packPath}`);
      const buffer = await response.arrayBuffer();
      const reader = new SimpleZipReader(buffer);
      reader.listEntries();
      this.packReaders.set(packPath, reader);
      return reader;
    },

    async resolveRemoteReference(folder, scryfallId) {
      const manifest = await this.loadRemoteManifestOrEmpty();
      const profile = manifest.profiles ? manifest.profiles[folder] : null;
      return profile && profile.files ? profile.files[scryfallId] || null : null;
    },

    async fetchFromPackedCache(reference) {
      const hashIndex = String(reference).indexOf('#');
      if (hashIndex < 1) return null;
      const packPath = String(reference).slice(0, hashIndex);
      const entryName = String(reference).slice(hashIndex + 1);
      const reader = await this.getPackReader(packPath, false);
      return reader.getEntryDataUrl(entryName);
    },

    async resolveProcessedImage(scryfallId, width, quality) {
      const key = this.key(scryfallId, width, quality);
      const config = this.getConfig();

      if (config.useLocal) {
        try {
          const local = await this.getLocal(key);
          if (local) {
            this.stats.localHits += 1;
            this.refreshStatusSoon();
            return {dataUrl: local, source: 'local'};
          }
        } catch (error) {
          console.warn('Local cache read failed', error);
        }
      }

      if (config.useGithub) {
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
              if (config.useLocal) {
                try { await this.putLocal(key, githubData); } catch (error) {}
              }
              this.refreshStatusSoon();
              return {dataUrl: githubData, source: 'github'};
            }
          }
        } catch (error) {
          console.warn('GitHub cache fetch failed', error);
        }
      }

      if (typeof ImageLab === 'undefined') return {dataUrl: null, source: 'missing'};
      const imageUrl = await ImageLab.getScryfallImage(scryfallId);
      if (!imageUrl) return {dataUrl: null, source: 'missing'};
      const processed = await ImageLab.processImage(imageUrl);
      if (config.useLocal) {
        try { await this.putLocal(key, processed); } catch (error) {}
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
      return {dataUrl: processed, source: 'scryfall'};
    },

    /*
     * v8.7.1.2 — Native Scryfall art-crop resolver.
     *
     * Micro catalogs need artwork, not the entire card face. Scryfall exposes
     * an `art_crop` URI in image_uris. For transforming cards the same field
     * lives under card_faces[].image_uris, so we inspect both shapes.
     *
     * Art crops use their own cache profile (`art-crop`) so they never collide
     * with the existing processed full-card image cache.
     */
    artCropKey(scryfallId) {
      return `art-crop/${scryfallId}.jpg`;
    },

    async fetchScryfallArtCrop(scryfallId) {
      const response = await fetch(`https://api.scryfall.com/cards/${encodeURIComponent(scryfallId)}`, {
        cache: 'no-store',
        headers: {'Accept': 'application/json'}
      });
      if (!response.ok) throw new Error(`Scryfall card lookup failed (${response.status}).`);
      const card = await response.json();
      const urls = [];
      if (card && card.image_uris && card.image_uris.art_crop) urls.push(card.image_uris.art_crop);
      if (!urls.length && Array.isArray(card && card.card_faces)) {
        card.card_faces.forEach(face => {
          if (face && face.image_uris && face.image_uris.art_crop) urls.push(face.image_uris.art_crop);
        });
      }
      if (!urls.length) return [];
      return urls;
    },

    async resolveArtCrop(scryfallId) {
      if (!scryfallId) return {dataUrl: null, source: 'missing', faces: []};
      const key = this.artCropKey(scryfallId);
      const config = this.getConfig();

      // Local browser cache is checked first so repeated previews do not hit Scryfall.
      if (config.useLocal) {
        try {
          const local = await this.getLocal(key);
          if (local) {
            this.stats.localHits += 1;
            this.refreshStatusSoon();
            return {dataUrl: local, source: 'local', faces: [local]};
          }
        } catch (error) {
          console.warn('Local art-crop cache read failed', error);
        }
      }

      // Reuse the packed GitHub cache when an art-crop profile has already been uploaded.
      if (config.useGithub) {
        try {
          const reference = await this.resolveRemoteReference('art-crop', scryfallId);
          if (reference) {
            const githubData = String(reference).includes('.zip#')
              ? await this.fetchFromPackedCache(reference)
              : await this.fetchGithubImage(reference);
            if (githubData) {
              this.stats.githubPackHits += String(reference).includes('.zip#') ? 1 : 0;
              if (config.useLocal) {
                try { await this.putLocal(key, githubData); } catch (error) {}
              }
              this.refreshStatusSoon();
              return {dataUrl: githubData, source: 'github', faces: [githubData]};
            }
          }
        } catch (error) {
          console.warn('GitHub art-crop cache fetch failed', error);
        }
      }

      // No cached crop exists. Fetch Scryfall's card JSON once and use its native art_crop URI.
      try {
        const urls = await this.fetchScryfallArtCrop(scryfallId);
        if (!urls.length) return {dataUrl: null, source: 'missing', faces: []};

        // The micro format uses the front/first face by default. The lookup still
        // understands card_faces so double-faced cards do not lose their art source.
        const imageResponse = await fetch(urls[0], {cache: 'no-store'});
        if (!imageResponse.ok) throw new Error(`Scryfall art crop failed (${imageResponse.status}).`);
        const blob = await imageResponse.blob();
        const dataUrl = await blobToDataUrl(blob);
        if (config.useLocal) {
          try { await this.putLocal(key, dataUrl); } catch (error) {}
        }

        this.pendingUpdates.set(key, {
          key,
          scryfallId,
          width: 0,
          quality: 1,
          folder: 'art-crop',
          fileName: `${scryfallId}.jpg`,
          dataUrl,
          byteLength: dataUrlToBytes(dataUrl).length,
          updatedAt: new Date().toISOString()
        });
        this.stats.processedFresh += 1;
        this.refreshStatusSoon();
        return {dataUrl, source: 'scryfall-art-crop', faces: [dataUrl], faceCount: urls.length};
      } catch (error) {
        console.warn('Scryfall art-crop resolution failed for', scryfallId, error);
        return {dataUrl: null, source: 'missing', faces: [], error: error.message || String(error)};
      }
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
            plan.push({folder, packName: `packs/${folder}-pack-${timestamp}-${String(packIndex).padStart(3, '0')}.zip`, entries: bucket});
            packIndex += 1;
            bucket = [];
            bucketBytes = 0;
          }
          bucket.push(entry);
          bucketBytes += estimated;
        }
        if (bucket.length) {
          plan.push({folder, packName: `packs/${folder}-pack-${timestamp}-${String(packIndex).padStart(3, '0')}.zip`, entries: bucket});
        }
      }
      return plan;
    },

    async buildMergedManifest(plan) {
      const manifest = JSON.parse(JSON.stringify(await this.loadRemoteManifestOrEmpty()));
      if (!manifest.profiles) manifest.profiles = {};
      manifest.version = '8.3.2';
      manifest.generatedAt = new Date().toISOString();
      for (const pack of plan) {
        if (!manifest.profiles[pack.folder]) manifest.profiles[pack.folder] = {files: {}};
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
        const innerFiles = pack.entries.map(entry => ({name: entry.fileName, content: dataUrlToBytes(entry.dataUrl)}));
        const innerZip = SimpleZip.create(innerFiles);
        outerFiles.push({name: `data/image-cache/${pack.packName}`, content: new Uint8Array(await innerZip.arrayBuffer())});
      }
      outerFiles.push({name: 'data/image-cache/manifest.json', content: JSON.stringify(manifest, null, 2)});
      outerFiles.push({name: 'README-upload.txt', content: [
        'Packed Image Cache Update',
        '',
        'Upload the data/image-cache folder from this ZIP to your repository root.',
        'The update contains one or more packed cache ZIPs plus a merged manifest.json.'
      ].join('\n')});
      const zip = SimpleZip.create(outerFiles);
      const url = URL.createObjectURL(zip);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'image-cache-packed-update.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      const totalImages = plan.reduce((sum, pack) => sum + pack.entries.length, 0);
      if (status) {
        status.innerHTML = `<strong>Packed cache update ready.</strong><br>` +
          `<strong>New images:</strong> ${totalImages}<br>` +
          `<strong>Pack files:</strong> ${plan.length}<br>` +
          `<strong>Download:</strong> <code>image-cache-packed-update.zip</code>`;
      }
    },

    async verifyPackedCache() {
      const status = $('cacheVerificationStatus');
      const verifyButton = $('verifyPackedCacheBtn');
      const reportButton = $('downloadCacheVerificationReportBtn');
      if (verifyButton) verifyButton.disabled = true;
      if (reportButton) reportButton.disabled = true;
      if (status) status.innerHTML = '<strong>Loading packed-cache manifest...</strong>';

      const report = {
        verifiedAt: new Date().toISOString(),
        manifestVersion: '',
        manifestGeneratedAt: '',
        profiles: 0,
        totalReferences: 0,
        packedReferences: 0,
        looseReferences: 0,
        malformedReferences: 0,
        uniquePacks: 0,
        verifiedPacks: 0,
        failedPacks: [],
        missingEntries: [],
        totalPackBytes: 0,
        notes: ['Loose-file entries are counted but not individually fetched by the packed-cache verifier.', 'Static GitHub Pages cannot list folders, so unreferenced/orphaned pack files cannot be detected automatically.']
      };

      try {
        const manifest = await this.loadRemoteManifest(true);
        report.manifestVersion = manifest.version || 'Not specified';
        report.manifestGeneratedAt = manifest.generatedAt || 'Not specified';
        const profiles = manifest.profiles || {};
        report.profiles = Object.keys(profiles).length;
        const packs = new Map();

        for (const [profileName, profile] of Object.entries(profiles)) {
          const files = profile && profile.files ? profile.files : {};
          for (const [scryfallId, referenceValue] of Object.entries(files)) {
            report.totalReferences += 1;
            const reference = String(referenceValue || '');
            const hashIndex = reference.indexOf('#');
            if (reference.includes('.zip#') && hashIndex > 0 && hashIndex < reference.length - 1) {
              report.packedReferences += 1;
              const packPath = reference.slice(0, hashIndex);
              const entryName = reference.slice(hashIndex + 1);
              if (!packs.has(packPath)) packs.set(packPath, []);
              packs.get(packPath).push({profileName, scryfallId, entryName});
            } else if (/\.(?:jpe?g|png|webp)$/i.test(reference)) {
              report.looseReferences += 1;
            } else {
              report.malformedReferences += 1;
            }
          }
        }

        report.uniquePacks = packs.size;
        let packNumber = 0;
        for (const [packPath, expected] of packs.entries()) {
          packNumber += 1;
          if (status) {
            status.innerHTML = `<strong>Verifying pack ${packNumber} of ${packs.size}</strong><br>` +
              `<code>${escapeHtml(packPath)}</code><br>` +
              `Expected entries: ${expected.length}`;
          }
          try {
            const reader = await this.getPackReader(packPath, true);
            report.totalPackBytes += reader.buffer.byteLength;
            const actualEntries = new Set(reader.listEntries());
            for (const item of expected) {
              if (!actualEntries.has(item.entryName)) {
                report.missingEntries.push({packPath, entryName: item.entryName, scryfallId: item.scryfallId, profile: item.profileName});
              }
            }
            report.verifiedPacks += 1;
          } catch (error) {
            report.failedPacks.push({packPath, error: error && error.message ? error.message : String(error)});
          }
        }

        this.lastVerificationReport = report;
        const success = !report.failedPacks.length && !report.missingEntries.length && !report.malformedReferences;
        if (status) {
          status.innerHTML = `<strong>${success ? 'Packed cache verification passed.' : 'Packed cache verification found problems.'}</strong><br>` +
            `<strong>Profiles:</strong> ${report.profiles}<br>` +
            `<strong>Manifest references:</strong> ${report.totalReferences}<br>` +
            `<strong>Packed references:</strong> ${report.packedReferences}<br>` +
            `<strong>Loose references:</strong> ${report.looseReferences}<br>` +
            `<strong>Packs verified:</strong> ${report.verifiedPacks}/${report.uniquePacks}<br>` +
            `<strong>Total pack data checked:</strong> ${formatBytes(report.totalPackBytes)}<br>` +
            `<strong>Missing pack files:</strong> ${report.failedPacks.length}<br>` +
            `<strong>Missing image entries:</strong> ${report.missingEntries.length}<br>` +
            `<strong>Malformed references:</strong> ${report.malformedReferences}` +
            `${report.failedPacks.length ? `<div class="image-lab-warning"><strong>Pack failures</strong><ul>${report.failedPacks.slice(0, 20).map(item => `<li><code>${escapeHtml(item.packPath)}</code>: ${escapeHtml(item.error)}</li>`).join('')}</ul></div>` : ''}` +
            `${report.missingEntries.length ? `<div class="image-lab-warning"><strong>Missing entries</strong><ul>${report.missingEntries.slice(0, 20).map(item => `<li><code>${escapeHtml(item.packPath)}#${escapeHtml(item.entryName)}</code></li>`).join('')}</ul></div>` : ''}`;
        }
        if (reportButton) reportButton.disabled = false;
      } catch (error) {
        this.lastVerificationReport = null;
        if (status) status.innerHTML = `<strong>Verification failed:</strong> ${escapeHtml(error && error.message ? error.message : String(error))}`;
      } finally {
        if (verifyButton) verifyButton.disabled = false;
      }
    },

    downloadVerificationReport() {
      if (!this.lastVerificationReport) return;
      const report = this.lastVerificationReport;
      const lines = [
        'MTG Builder v8.3.2 Packed Cache Verification',
        `Verified: ${report.verifiedAt}`,
        `Manifest version: ${report.manifestVersion}`,
        `Manifest generated: ${report.manifestGeneratedAt}`,
        '',
        `Profiles: ${report.profiles}`,
        `Total references: ${report.totalReferences}`,
        `Packed references: ${report.packedReferences}`,
        `Loose references: ${report.looseReferences}`,
        `Malformed references: ${report.malformedReferences}`,
        `Unique packs: ${report.uniquePacks}`,
        `Verified packs: ${report.verifiedPacks}`,
        `Total pack bytes: ${report.totalPackBytes}`,
        `Failed packs: ${report.failedPacks.length}`,
        `Missing entries: ${report.missingEntries.length}`,
        '',
        'FAILED PACKS',
        ...report.failedPacks.map(item => `${item.packPath} :: ${item.error}`),
        '',
        'MISSING ENTRIES',
        ...report.missingEntries.map(item => `${item.packPath}#${item.entryName} :: ${item.scryfallId} :: ${item.profile}`),
        '',
        'NOTES',
        ...report.notes
      ];
      downloadText('packed-cache-verification.txt', lines.join('\n'));
    },

    async refreshStatus() {
      const status = $('imageCacheStatus');
      if (!status) return;
      let localCount = 0;
      try { localCount = await this.countLocal(); } catch (error) {}
      const config = this.getConfig();
      const packPlan = this.buildPackPlan();
      const pendingPackBytes = packPlan.reduce((sum, pack) => sum + pack.entries.reduce((subtotal, entry) => subtotal + entry.byteLength, 0), 0);
      let remoteSummary = 'not checked';
      try {
        const manifest = await this.loadRemoteManifest(false);
        const profiles = Object.keys(manifest.profiles || {});
        let references = 0;
        let packed = 0;
        const packs = new Set();
        for (const profile of Object.values(manifest.profiles || {})) {
          for (const reference of Object.values((profile && profile.files) || {})) {
            references += 1;
            const value = String(reference || '');
            if (value.includes('.zip#')) {
              packed += 1;
              packs.add(value.slice(0, value.indexOf('#')));
            }
          }
        }
        remoteSummary = `${profiles.length} profiles · ${references} images · ${packed} packed references · ${packs.size} packs`;
      } catch (error) {
        remoteSummary = `manifest unavailable: ${error && error.message ? error.message : String(error)}`;
      }
      status.innerHTML = `<strong>GitHub cache path:</strong> <code>${escapeHtml(config.basePath)}</code><br>` +
        `<strong>Remote cache:</strong> ${escapeHtml(remoteSummary)}<br>` +
        `<strong>Local cached images:</strong> ${localCount}<br>` +
        `<strong>Pending upload images:</strong> ${this.pendingUpdates.size}<br>` +
        `<strong>Estimated pending packs:</strong> ${packPlan.length}<br>` +
        `<strong>Pending packed payload:</strong> ${formatBytes(pendingPackBytes)}<br>` +
        `<strong>Session cache hits:</strong> local ${this.stats.localHits} · GitHub loose ${this.stats.githubLooseHits} · GitHub packed ${this.stats.githubPackHits}<br>` +
        `<strong>Freshly processed this session:</strong> ${this.stats.processedFresh}`;
    },

    refreshStatusSoon() {
      clearTimeout(this._statusTimer);
      this._statusTimer = setTimeout(() => this.refreshStatus(), 100);
    },

    async init() {
      this.registerModule();
      const refreshButton = $('refreshImageCacheStatusBtn');
      const verifyButton = $('verifyPackedCacheBtn');
      const reportButton = $('downloadCacheVerificationReportBtn');
      const updateButton = $('downloadImageCacheUpdateBtn');
      const clearButton = $('clearLocalImageCacheBtn');
      if (refreshButton) refreshButton.addEventListener('click', () => this.refreshStatus());
      if (verifyButton) verifyButton.addEventListener('click', () => this.verifyPackedCache());
      if (reportButton) reportButton.addEventListener('click', () => this.downloadVerificationReport());
      if (updateButton) updateButton.addEventListener('click', () => this.downloadUpdateZip());
      if (clearButton) clearButton.addEventListener('click', async () => {
        await this.clearLocal();
        this.stats.localHits = 0;
        this.refreshStatus();
      });
      this.refreshStatus();
    }
  };

export { SharedImageCache };
export { SimpleZipReader };

// Auto-initialize when the script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => SharedImageCache.init());
} else {
  SharedImageCache.init();
}
