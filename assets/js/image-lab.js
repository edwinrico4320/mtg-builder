// MTG Builder v8 Image Lab
// Proof-of-concept image pipeline

const ImageLab = {
  settings: {
    width: 300,
    quality: 0.65
  },

  async getScryfallImage(scryfallId) {
    const response = await fetch(
      `https://api.scryfall.com/cards/${scryfallId}`
    );
    const card = await response.json();

    if (card.image_uris) {
      return card.image_uris.normal;
    }

    if (card.card_faces && card.card_faces[0].image_uris) {
      return card.card_faces[0].image_uris.normal;
    }

    return null;
  },

  async processImage(url) {
    const response = await fetch(url);
    const blob = await response.blob();

    return await new Promise(resolve => {
      const img = new Image();

      img.onload = () => {
        const scale = this.settings.width / img.width;
        const canvas = document.createElement("canvas");

        canvas.width = this.settings.width;
        canvas.height = Math.round(img.height * scale);

        canvas.getContext("2d")
          .drawImage(img, 0, 0, canvas.width, canvas.height);

        resolve(canvas.toDataURL(
          "image/jpeg",
          this.settings.quality
        ));
      };

      img.src = URL.createObjectURL(blob);
    });
  }
};