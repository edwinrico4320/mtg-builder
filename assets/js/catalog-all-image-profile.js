(function () {
  function $(id) { return document.getElementById(id); }

  function registerModule() {
    if (typeof BuilderModules !== 'undefined') {
      BuilderModules.register('All Discovered Image Profile', '8.2.2');
    }
  }

  function buildAllWithSelectedProfile(event) {
    const profile = (($('outputProfileSelect') || {}).value) || 'compact-text';
    if (profile === 'compact-text') return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const checkboxes = Array.from(document.querySelectorAll('#batchSetList input[type="checkbox"]'));
    const status = $('batchBuildStatus');
    if (!checkboxes.length) {
      if (status) status.innerHTML = '<p class="hint">Scan available sets first.</p>';
      return;
    }

    checkboxes.forEach(box => { box.checked = true; });
    if (status) {
      status.innerHTML = `<strong>All discovered sets selected:</strong> ${checkboxes.length}<br>Starting the checked-set batch engine...`;
    }

    const checkedButton = $('buildCheckedCatalogsBtn');
    if (checkedButton) checkedButton.click();
  }

  function init() {
    registerModule();
    const button = $('buildAllCatalogsBtn');
    if (button) button.addEventListener('click', buildAllWithSelectedProfile, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
