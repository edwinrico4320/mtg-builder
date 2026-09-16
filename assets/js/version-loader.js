
async function loadBuilderInfo() {
  try {
    const response = await fetch("builder-info.json");
    const info = await response.json();

    const versionBox = document.getElementById("version-info");
    if (versionBox) {
      versionBox.innerHTML =
        `${info.name}<br>` +
        `${info.version}<br>` +
        `Branch: ${info.branch}`;
    }

    window.BuilderInfo = info;
  } catch (error) {
    console.warn("Builder info unavailable", error);
  }
}

loadBuilderInfo();
