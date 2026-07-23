function createImageReport(results) {
  return {
    cardsProcessed: results.length,
    imagesFound: results.filter(x => x.image).length,
    estimatedSizeKB: Math.round(
      JSON.stringify(results).length / 1024
    )
  };
}