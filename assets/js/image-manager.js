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
  }
};
