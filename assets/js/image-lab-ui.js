// MTG Builder v8.0.1 Image Lab UI

const ImageLabUI = {
  testCount: 10,

  setCount(value) {
    this.testCount = Number(value);
  },

  async runTest(cards) {
    const selected = cards.slice(0, this.testCount);
    const results = [];

    for (const card of selected) {
      if (!card.identifiers || !card.identifiers.scryfallId) {
        results.push({
          name: card.name,
          image: false
        });
        continue;
      }

      try {
        const url = await ImageLab.getScryfallImage(
          card.identifiers.scryfallId
        );

        results.push({
          name: card.name,
          image: !!url,
          url
        });
      } catch {
        results.push({
          name: card.name,
          image: false
        });
      }
    }

    return results;
  }
};