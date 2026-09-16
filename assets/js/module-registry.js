const BuilderModules = {
  modules: [],

  register(name, version) {
    this.modules.push({name, version});
    this.render();
  },

  render() {
    const box = document.getElementById("module-status");
    if (!box) return;

    box.innerHTML = this.modules.map(m =>
      `✔ ${m.name} ${m.version || ""}`
    ).join("<br>");
  }
};