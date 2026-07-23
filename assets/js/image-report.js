function generateImageReport(results) {
  const found = results.filter(r => r.image).length;

  return {
    cardsProcessed: results.length,
    imagesFound: found,
    successRate: `${found}/${results.length}`
  };
}