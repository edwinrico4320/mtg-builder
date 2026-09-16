// MTG Builder v8 Image Manager Foundation

const ImageManager = {
  mode: "none",

  setMode(mode) {
    this.mode = mode;
  },

  async fetchImage(url) {
    const response = await fetch(url);
    return await response.blob();
  },

  async resizeImage(blob, width = 300, quality = 0.7) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = width / img.width;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = URL.createObjectURL(blob);
    });
  },

  async getScryfallImage(scryfallId) {
    const response = await fetch(`https://api.scryfall.com/cards/${encodeURIComponent(scryfallId)}`, {
      cache: 'no-store',
      headers: {'Accept': 'application/json'}
    });
    if (!response.ok) throw new Error(`Scryfall card lookup failed (${response.status}).`);
    const card = await response.json();
    const urls = [];
    if (card && card.image_uris && card.image_uris.normal) {
      urls.push(card.image_uris.normal);
    } else if (Array.isArray(card && card.card_faces)) {
      card.card_faces.forEach(face => {
        if (face && face.image_uris && face.image_uris.normal) urls.push(face.image_uris.normal);
      });
    }
    return urls;
  },

  async processImage(urls, width = 300, quality = 0.65) {
    if (!Array.isArray(urls)) urls = [urls];
    const processed = [];
    for (const url of urls) {
      try {
        const blob = await this.fetchImage(url);
        const dataUrl = await this.resizeImage(blob, width, quality);
        processed.push(dataUrl);
      } catch (err) {
        console.warn('Failed to process image', url, err);
      }
    }
    return processed;
  }
};

window.ImageManager = ImageManager;
export { ImageManager };
