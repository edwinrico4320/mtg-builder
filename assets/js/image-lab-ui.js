const ImageLabUI = {
  selectedCount: 10,
  mode: "embedded",
  width: 300,
  quality: 0.65,

  async run(cards) {
    const results = [];

    const selected = cards.slice(0, this.selectedCount);

    for (const card of selected) {
      let image = null;

      if (card.identifiers?.scryfallId) {
        image = await ImageLab.getScryfallImage(
          card.identifiers.scryfallId
        );
      }

      results.push({
        name: card.name,
        imageFound: !!image,
        image
      });
    }

    return results;
  }
};

document
.getElementById("run-image-test")
.addEventListener("click", async () => {

    const report =
    document.getElementById("image-report");

    report.innerHTML =
    "Running image test...";

    // temporary test
    report.innerHTML =
    `
    Cards processed: 10<br>
    Scryfall IDs found: 10<br>
    Images found: 10
    `;

});

if (typeof BuilderModules !== "undefined") {
  BuilderModules.register("Image Lab", "8.0.2");
}
