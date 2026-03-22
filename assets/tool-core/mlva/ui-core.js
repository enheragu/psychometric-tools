(function () {
  if (window.StatMlvaUiCore) return;

  function renderTabButtons(options) {
    var root = options && options.root;
    if (!root) return;

    var items = Array.isArray(options.items) ? options.items : [];
    var active = options.active;
    var attrName = options.attrName || 'data-id';
    var className = options.className || 'shared-tab';
    var onSelect = typeof options.onSelect === 'function' ? options.onSelect : function () {};

    root.innerHTML = items.map(function (item) {
      var id = item.id;
      var label = item.label;
      var isActive = id === active;
      return '<button class="' + className + (isActive ? ' active' : '') + '" type="button" role="tab" aria-selected="' + isActive + '" ' + attrName + '="' + id + '">' + label + '</button>';
    }).join('');

    root.querySelectorAll('[' + attrName + ']').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute(attrName);
        onSelect(id);
      });
    });
  }

  function renderModelChecklist(options) {
    var root = options && options.root;
    if (!root) return;

    var ordered = Array.isArray(options.orderedModels) ? options.orderedModels : [];
    var selected = options.selectedSet;
    var statsByModel = options.statsByModel || {};
    var displayNameByModel = options.displayNameByModel || {};
    var formatMetric = typeof options.formatMetric === 'function' ? options.formatMetric : function (v) { return String(v); };
    var noDataText = options.noDataText || 'No data available';
    var onToggle = typeof options.onToggle === 'function' ? options.onToggle : function () {};

    var selectedRows = [];
    var unselectedRows = [];
    for (var i = 0; i < ordered.length; i += 1) {
      var model = ordered[i];
      if (selected && selected.has(model)) selectedRows.push(model);
      else unselectedRows.push(model);
    }
    var finalOrder = selectedRows.concat(unselectedRows);

    var html = finalOrder.map(function (model, index) {
      var st = statsByModel[model] || { mean: NaN, std: NaN, n: 0 };
      var displayName = displayNameByModel[model] || model;
      var checked = selected && selected.has(model) ? ' checked' : '';
      var row = [
        '<label class="shared-checkbox-item">',
        '<span class="cb-idx">' + String(index) + '</span>',
        '<input type="checkbox" data-model="' + model + '"' + checked + '>',
        '<span class="cb-name" title="' + model + '">' + displayName + '</span>',
        '<span class="cb-meta-wrap">',
        '<span class="cb-meta-chip"><span class="cb-stat-symbol">x̄</span> ' + formatMetric(st.mean) + '</span>',
        '<span class="cb-meta-chip">s ' + formatMetric(st.std) + '</span>',
        '<span class="cb-meta-chip cb-meta-chip--subtle">n ' + st.n + '</span>',
        '</span>',
        '</label>'
      ].join('');

      if (selectedRows.length > 0 && unselectedRows.length > 0 && model === selectedRows[selectedRows.length - 1]) {
        row += '<div class="cb-divider"></div>';
      }
      return row;
    }).join('');

    root.innerHTML = html || '<p class="hint">' + noDataText + '</p>';

    root.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
      cb.addEventListener('change', function (ev) {
        var model = ev.target.getAttribute('data-model');
        onToggle(model, !!ev.target.checked);
      });
    });
  }

  window.StatMlvaUiCore = {
    renderTabButtons: renderTabButtons,
    renderModelChecklist: renderModelChecklist,
  };
})();
