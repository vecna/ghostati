(function () {
  'use strict';

  var controls = Array.from(document.querySelectorAll('[data-project-filter]'));
  var rows = Array.from(document.querySelectorAll('[data-project-category]'));
  var count = document.getElementById('projects-visible-count');
  var empty = document.getElementById('projects-empty');

  if (!controls.length || !rows.length) return;

  function applyFilter(category) {
    var visible = 0;
    rows.forEach(function (row) {
      var show = category === 'all' || row.dataset.projectCategory === category;
      row.hidden = !show;
      if (show) visible += 1;
    });
    controls.forEach(function (button) {
      var active = button.dataset.projectFilter === category;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    if (count) count.textContent = String(visible);
    if (empty) empty.hidden = visible !== 0;
  }

  controls.forEach(function (button) {
    button.addEventListener('click', function () {
      applyFilter(button.dataset.projectFilter);
    });
  });
})();
