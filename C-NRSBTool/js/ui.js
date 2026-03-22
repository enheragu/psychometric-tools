/**
 * ui.js — All DOM interactions:
 *   - Checkbox list (render, filter, toggle)
 *   - CSV text input parsing with fuzzy fallback + error modal
 *   - Results: stats table, scatter+sigmoid chart, ROC chart
 */


const UI = (() => {

  const CHART_COLORS = window.SharedChartLegend.getDataColors();

  const CHART_STROKES = {
    emphasis: 2.4,
    baseline: 1.5,
  };

  // ── Chart instances (kept to allow destroy on re-run) ─────────────
  let _scatterChart = null;
  let _rocChart     = null;
  let _modalChart   = null;
  let _modalKind = null;
  let _toggleHandler = null;
  let _lastResult = null;
  let _modalDefaults = null;
  let _globalHandlersBound = false;
  let _zoomPluginRegistered = false;

  function _ensureZoomPluginRegistered() {
    if (_zoomPluginRegistered) return;
    if (typeof Chart === 'undefined' || typeof Chart.register !== 'function') return;
    const plugin = window.ChartZoom || window.chartjsPluginZoom || window['chartjs-plugin-zoom'];
    if (plugin) {
      Chart.register(plugin);
      _zoomPluginRegistered = true;
    }
  }

  // ── Checkbox list ─────────────────────────────────────────────────

  /** Render the full list of country checkboxes. Called once on init. */
  function renderCheckboxList(selectedSet, onToggle) {
    _toggleHandler = onToggle;
    _bindGlobalHandlers();
    _renderOrderedCheckboxes(selectedSet);
  }

  function _bindGlobalHandlers() {
    if (_globalHandlersBound) return;
    _globalHandlersBound = true;

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeChartModal();
    });
  }

  function _renderOrderedCheckboxes(selectedSet) {
    const container = document.getElementById('checkbox-list');
    container.innerHTML = '';
    const sortMode = document.getElementById('cb-sort')?.value || 'name-asc';

    const selectedRows = [];
    const unselectedRows = [];
    const unavailableRows = [...Data.NO_HDI_DATA];
    for (const row of Data.HDI_DATA) {
      if (selectedSet.has(row.iso3)) selectedRows.push(row);
      else                           unselectedRows.push(row);
    }

    _sortRows(selectedRows, sortMode);
    _sortRows(unselectedRows, sortMode);
    _sortRows(unavailableRows, sortMode);

    const orderedRows = [...selectedRows, ...unselectedRows, ...unavailableRows];

    const lang = I18n.getLang();

    for (let index = 0; index < orderedRows.length; index++) {
      const { iso3, hdi, year, noData } = orderedRows[index];
      const displayCountry = Data.getCountryLabel(iso3, lang);
      const label = document.createElement('label');
      label.className = 'shared-checkbox-item';
      if (noData) label.classList.add('shared-checkbox-item--disabled');
      label.dataset.iso3 = iso3;
      label.dataset.name = Data.normalize(displayCountry);

      const number = document.createElement('span');
      number.className = 'cb-idx';
      number.textContent = String(index);

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.iso3 = iso3;
      cb.checked = !noData && selectedSet.has(iso3);
      cb.disabled = Boolean(noData);
      if (!noData) cb.addEventListener('change', () => _toggleHandler(iso3, cb.checked));

      const span = document.createElement('span');
      span.className = 'cb-name';
      span.textContent = displayCountry;

      const metaWrap = document.createElement('span');
      metaWrap.className = 'cb-meta-wrap';

      if (noData) {
        const noDataSpan = document.createElement('span');
        noDataSpan.className = 'cb-hdi cb-meta-chip cb-meta-chip--warning';
        noDataSpan.textContent = I18n.t('no_hdi_data');
        metaWrap.appendChild(noDataSpan);
      } else {
        const hdiSpan = document.createElement('span');
        hdiSpan.className = 'cb-hdi cb-meta-chip';
        hdiSpan.textContent = `HDI ${hdi.toFixed(3)}`;
        metaWrap.appendChild(hdiSpan);

        if (year) {
          const yearSpan = document.createElement('span');
          yearSpan.className = 'cb-hdi cb-meta-chip cb-meta-chip--subtle';
          yearSpan.textContent = String(year);
          metaWrap.appendChild(yearSpan);
        }
      }

      label.append(number, cb, span, metaWrap);
      container.appendChild(label);

      if (selectedRows.length && unselectedRows.length && iso3 === selectedRows[selectedRows.length - 1].iso3) {
        const divider = document.createElement('div');
        divider.className = 'cb-divider';
        container.appendChild(divider);
      }

      if (selectedRows.length + unselectedRows.length && unavailableRows.length) {
        const lastSelectableIso = orderedRows[selectedRows.length + unselectedRows.length - 1]?.iso3;
        if (iso3 === lastSelectableIso) {
          const divider = document.createElement('div');
          divider.className = 'cb-divider';
          container.appendChild(divider);
        }
      }
    }

    document.getElementById('sel-count').textContent = selectedSet.size;

    const searchInput = document.getElementById('cb-search');
    if (searchInput) filterCheckboxes(searchInput.value);
  }

  function _sortRows(rows, mode) {
    const getYear = row => Number.isFinite(row.year) ? row.year : Number.NEGATIVE_INFINITY;
    const byNameAsc = (a, b) => String(a.country).localeCompare(String(b.country));

    switch (mode) {
      case 'name-desc':
        rows.sort((a, b) => byNameAsc(b, a));
        break;
      case 'hdi-desc':
        rows.sort((a, b) => (b.hdi - a.hdi) || byNameAsc(a, b));
        break;
      case 'hdi-asc':
        rows.sort((a, b) => (a.hdi - b.hdi) || byNameAsc(a, b));
        break;
      case 'year-desc':
        rows.sort((a, b) => (getYear(b) - getYear(a)) || byNameAsc(a, b));
        break;
      case 'year-asc':
        rows.sort((a, b) => (getYear(a) - getYear(b)) || byNameAsc(a, b));
        break;
      case 'name-asc':
      default:
        rows.sort(byNameAsc);
        break;
    }
  }

  /** Sync checkbox states to match selectedSet (no full re-render). */
  function syncCheckboxes(selectedSet) {
    _renderOrderedCheckboxes(selectedSet);
  }

  /** Filter visible checkboxes by text. */
  function filterCheckboxes(query) {
    const needle = Data.normalize(query);
    document.querySelectorAll('#checkbox-list .shared-checkbox-item').forEach(el => {
      el.style.display = (!needle || el.dataset.name.includes(needle)) ? '' : 'none';
    });
    document.querySelectorAll('#checkbox-list .cb-divider').forEach(el => {
      el.style.display = needle ? 'none' : '';
    });
  }

  // ── CSV text input ─────────────────────────────────────────────────

  /**
   * Parse the textarea contents.
   * Splits on comma / semicolon / newline, resolves each token.
   * @param {string} raw
   * @returns {{ resolved: string[], unmatched: string[] }}
   */
  function parseInput(raw) {
    const tokens = raw
      .split(/[,;\n\r]+/)
      .map(s => s.trim())
      .filter(Boolean);

    const resolved  = [];
    const unmatched = [];

    for (const token of tokens) {
      const iso3 = Data.resolve(token);
      if (iso3) {
        if (!resolved.includes(iso3)) resolved.push(iso3);
      } else {
        unmatched.push(token);
      }
    }
    return { resolved, unmatched };
  }

  /** Show inline error box below the textarea. */
  function showParseErrors(unmatched) {
    const box = document.getElementById('parse-errors');
    if (!unmatched.length) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    box.textContent = `⚠ ${unmatched.join(' · ')}`;
  }

  // ── Modal ─────────────────────────────────────────────────────────

  function showModal(unmatched) {
    const list = document.getElementById('modal-list');
    list.innerHTML = '';
    for (const token of unmatched) {
      const li = document.createElement('li');
      const suggestion = Data.suggest(token);
      li.textContent = token + (suggestion ? ` → ${suggestion}?` : '');
      list.appendChild(li);
    }
    document.getElementById('modal-suggestions').textContent = I18n.t('modal_suggestions');
    document.getElementById('modal-overlay').classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
  }

  // ── Results ───────────────────────────────────────────────────────

  function showResults(result) {
    _lastResult = result;
    const section = document.getElementById('results');
    section.classList.remove('hidden');

    _renderStats(result);

    section.scrollIntoView({ behavior: 'smooth', block: 'start' });

    setTimeout(function () {
      _renderScatter(result);
      _renderROC(result);
    }, 0);
  }

  function hideResults() {
    _lastResult = null;
    document.getElementById('results').classList.add('hidden');
  }

  // Stats table
  function _renderStats(r) {
    const fmt2  = n => n.toFixed(3);
    const fmtP  = n => (n < 0.001 ? '< 0.001' : n.toFixed(3));
    const fmtAuc = n => n.toFixed(3);
    const fmtOr = n => (n >= 1000 || n <= 0.001) ? n.toExponential(2) : n.toFixed(3);

    const rows = [
      ['stat_n_selected', r.n1],
      ['stat_n_total',    r.total],
      ['stat_hdi_sel',    fmt2(r.meanHdiSel)],
      ['stat_hdi_nsel',   fmt2(r.meanHdiNsel)],
      ['stat_beta0',      fmt2(r.beta0)],
      ['stat_beta1',      fmt2(r.beta1)],
      ['stat_or',         fmtOr(Math.exp(r.beta1))],
      ['stat_se',         fmt2(r.se)],
      ['stat_z',          fmt2(r.z)],
      ['stat_pval',       fmtP(r.pValue)],
      ['stat_auc',        fmtAuc(r.auc)],
    ];

    const tbody = document.getElementById('stats-body');
    tbody.innerHTML = '';
    for (const [key, val] of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="shared-cell-text">${I18n.t(key)}</td><td class="shared-cell-num">${val}</td>`;
      tbody.appendChild(tr);
    }

    // Significance row
    const sigTr = document.createElement('tr');
    const sigKey  = r.significant ? 'sig_yes' : 'sig_no';
    const sigClass = r.significant ? 'sig' : 'non-sig';
    sigTr.innerHTML = `<td colspan="2" class="shared-cell-text ${sigClass}">${I18n.t(sigKey)}</td>`;
    tbody.appendChild(sigTr);

    // Interpretation
    let interpKey;
    if (!r.significant)      interpKey = 'interp_ns';
    else if (r.beta1 > 0)    interpKey = 'interp_pos';
    else                     interpKey = 'interp_neg';

    document.getElementById('stats-interpretation').textContent = I18n.t(interpKey, {
      b1:  r.beta1.toFixed(3),
      p:   fmtP(r.pValue),
      auc: r.auc.toFixed(3),
    });
  }

  function _chartTheme() {
    return window.SharedChartLegend.getChartTheme();
  }

  function _linearScale(title, min, max) {
    return window.SharedChartLegend.buildLinearScale(title, min, max);
  }

  // Scatter + sigmoid chart
  function _scatterDatasets(r, pointRadius = 3) {
    const selPoints  = r.samples.filter(s => s.label === 1).map(s => ({
      x: s.hdi,
      y: 1,
      country: s.country,
      iso3: s.iso3,
      selected: true,
    }));
    const nselPoints = r.samples.filter(s => s.label === 0).map(s => ({
      x: s.hdi,
      y: 0,
      country: s.country,
      iso3: s.iso3,
      selected: false,
    }));

    return [
      {
        label:           I18n.t('chart_scatter_sel'),
        data:            selPoints,
        backgroundColor: window.SharedChartLegend.withAlpha(CHART_COLORS.blue, 0.72),
        pointRadius,
        pointHoverRadius: Math.max(pointRadius + 1, 5),
        pointHitRadius:   0,
        order:           2,
      },
      {
        label:           I18n.t('chart_scatter_nsel'),
        data:            nselPoints,
        backgroundColor: window.SharedChartLegend.withAlpha(CHART_COLORS.gray, 0.50),
        pointRadius,
        pointHoverRadius: Math.max(pointRadius + 1, 5),
        pointHitRadius:   0,
        order:           3,
      },
      {
        label:       I18n.t('chart_sigmoid'),
        data:        r.sigmoidCurve.map(p => ({ x: p.x, y: p.y })),
        type:        'line',
        borderColor: CHART_COLORS.green,
        borderWidth: CHART_STROKES.emphasis,
        pointRadius: 0,
        pointHoverRadius: 0,
        pointHitRadius: 0,
        fill:        false,
        tension:     0.4,
        order:       1,
        tooltipEnabled: false,
      },
      {
        label:       I18n.t('chart_sigmoid'),
        data:        r.sigmoidCurve.map(p => ({ x: p.x, y: p.y })),
        type:        'scatter',
        showLine:    false,
        backgroundColor: 'transparent',
        pointRadius: 0,
        pointHoverRadius: 0,
        pointHitRadius: 8,
        order:       4,
        hideFromLegend: true,
        tooltipEnabled: true,
      },
    ];
  }

  function _sizeCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.parentNode.clientWidth;
    const h = canvas.parentNode.clientHeight;
    if (w > 0 && h > 0) {
      canvas.width  = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width  = w + 'px';
      canvas.style.height = h + 'px';
    }
  }

  function _renderScatter(r) {
    _ensureZoomPluginRegistered();
    const canvasEl = document.getElementById('regression-chart');
    const expandBtn = document.getElementById('btn-expand-regression');
    if (expandBtn) expandBtn.onclick = () => openChartModal('scatter');
    canvasEl.onclick = e => {
      if (!window.SharedChartInteractions?.isInsideChartArea(e, _scatterChart, canvasEl)) return;
      openChartModal('scatter');
    };
    canvasEl.onmousemove = e => {
      canvasEl.style.cursor = window.SharedChartInteractions?.isInsideChartArea(e, _scatterChart, canvasEl) ? 'zoom-in' : 'default';
    };
    canvasEl.onmouseleave = () => { canvasEl.style.cursor = ''; };
    if (_scatterChart) _scatterChart.destroy();
    _sizeCanvas(canvasEl);
    const ctx = canvasEl.getContext('2d');

    const scatterOpts = window.SharedChartLegend.buildChartOptions({
      theme: _chartTheme(),
      interaction: {
        mode: 'point',
        intersect: true,
        axis: 'xy',
      },
      plugins: {
        legend: window.SharedChartLegend.createLegendOptions({
          position: 'top',
          labels: {
            color: _chartTheme().text,
            filter: (legendItem, data) => !data.datasets[legendItem.datasetIndex]?.hideFromLegend,
          },
        }),
        tooltip: window.SharedChartLegend.createTooltipLabelOptions({
          filter: ctx => ctx.dataset?.tooltipEnabled !== false,
          label: ctx => _formatScatterTooltip(ctx.raw),
        }),
      },
      scales: {
        x: _linearScale(I18n.t('chart_x'), 0, 1.0),
        y: _linearScale(I18n.t('chart_y'), -0.06, 1.06),
      },
    });
    _scatterChart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: _scatterDatasets(r, 4),
      },
      options: scatterOpts,
    });

    const noteEl = document.getElementById('scatter-note');
    if (noteEl) {
      const base = I18n.t('chart_note_scatter');
      const nearLinear = Math.abs(r.beta1) < 2.0;
      noteEl.textContent = nearLinear ? `${base} ${I18n.t('chart_note_near_linear')}` : base;
    }
  }

  // ROC curve chart
  function _rocDatasets(r) {
    return [
      {
        label:       `${I18n.t('roc_curve')} (AUC=${r.auc.toFixed(3)})`,
        data:        r.rocCurve.map(p => ({ x: p.fpr, y: p.tpr, threshold: p.threshold })),
        borderColor: CHART_COLORS.green,
        borderWidth: CHART_STROKES.emphasis,
        pointRadius: 0,
        fill:        false,
        tension:     0,
      },
      {
        label:       I18n.t('roc_random'),
        data:        [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        borderColor: CHART_COLORS.gray,
        borderWidth: CHART_STROKES.baseline,
        borderDash:  [6, 4],
        pointRadius: 0,
        fill:        false,
      },
    ];
  }

  function _renderROC(r) {
    _ensureZoomPluginRegistered();
    const canvasEl = document.getElementById('roc-chart');
    const expandBtn = document.getElementById('btn-expand-roc');
    if (expandBtn) expandBtn.onclick = () => openChartModal('roc');
    canvasEl.onclick = e => {
      if (!window.SharedChartInteractions?.isInsideChartArea(e, _rocChart, canvasEl)) return;
      openChartModal('roc');
    };
    canvasEl.onmousemove = e => {
      canvasEl.style.cursor = window.SharedChartInteractions?.isInsideChartArea(e, _rocChart, canvasEl) ? 'zoom-in' : 'default';
    };
    canvasEl.onmouseleave = () => { canvasEl.style.cursor = ''; };
    if (_rocChart) _rocChart.destroy();
    _sizeCanvas(canvasEl);
    const ctx = canvasEl.getContext('2d');

    const rocOpts = window.SharedChartLegend.buildChartOptions({
      theme: _chartTheme(),
      interaction: {
        mode: 'nearest',
        intersect: false,
        axis: 'xy',
      },
      plugins: {
        legend: window.SharedChartLegend.createLegendOptions({
          position: 'top',
          labels: { color: _chartTheme().text },
        }),
        tooltip: window.SharedChartLegend.createTooltipLabelOptions({
          filter: ctx => ctx.datasetIndex === 0,
          label: ctx => _formatRocTooltip(ctx.raw),
        }),
      },
      scales: {
        x: _linearScale(I18n.t('roc_x'), 0, 1),
        y: _linearScale(I18n.t('roc_y'), 0, 1),
      },
    });
    _rocChart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: _rocDatasets(r),
      },
      options: rocOpts,
    });
  }

  function openChartModal(kind) {
    _ensureZoomPluginRegistered();
    if (!_lastResult) return;

    const overlay = document.getElementById('chart-modal-overlay');
    const titleEl = document.getElementById('chart-modal-title');
    const canvas = document.getElementById('chart-modal-canvas');
    if (!overlay || !titleEl || !canvas) return;

    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    if (_modalChart) {
      _modalChart.destroy();
      _modalChart = null;
    }

    const ctx = canvas.getContext('2d');
    const isScatter = kind === 'scatter';
    _modalKind = kind;
    titleEl.textContent = I18n.t(isScatter ? 'chart_modal_scatter' : 'chart_modal_roc');
    _modalDefaults = isScatter
      ? { xMin: 0, xMax: 1.0, yMin: -0.06, yMax: 1.06 }
      : { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };

    const modalDatasets = isScatter ? _scatterDatasets(_lastResult, 5) : _rocDatasets(_lastResult);
    const modalOpts = window.SharedChartLegend.buildChartOptions({
      theme: _chartTheme(),
      interaction: isScatter
        ? {
            mode: 'point',
            intersect: true,
            axis: 'xy',
          }
        : {
            mode: 'nearest',
            intersect: false,
            axis: 'xy',
          },
      plugins: {
        legend: window.SharedChartLegend.createLegendOptions({
          position: 'top',
          labels: {
            color: _chartTheme().text,
            filter: (legendItem, data) => !data.datasets[legendItem.datasetIndex]?.hideFromLegend,
          },
        }),
        tooltip: window.SharedChartLegend.createTooltipLabelOptions({
          filter: ctx => (isScatter ? (ctx.dataset?.tooltipEnabled !== false) : ctx.datasetIndex === 0),
          label: ctx => (isScatter ? _formatScatterTooltip(ctx.raw) : _formatRocTooltip(ctx.raw)),
        }),
        zoom: {
          zoom: {
            wheel: { enabled: true, speed: 0.08 },
            pinch: { enabled: true },
            drag: { enabled: false },
            mode: 'xy',
          },
          pan: {
            enabled: true,
            mode: 'xy',
          },
        },
      },
      scales: isScatter
        ? {
            x: _linearScale(I18n.t('chart_x'), 0, 1.0),
            y: _linearScale(I18n.t('chart_y'), -0.06, 1.06),
          }
        : {
            x: _linearScale(I18n.t('roc_x'), 0, 1),
            y: _linearScale(I18n.t('roc_y'), 0, 1),
          },
    });
    _modalChart = new Chart(ctx, {
      type: isScatter ? 'scatter' : 'line',
      data: { datasets: modalDatasets },
      options: modalOpts,
    });

    window.SharedChartInteractions?.attach({
      canvas,
      getChart: () => _modalChart,
      defaults: {
        xMin: _modalDefaults?.xMin,
        xMax: _modalDefaults?.xMax,
        yMin: _modalDefaults?.yMin,
        yMax: _modalDefaults?.yMax,
        mode: 'xy',
      },
    });
  }

  function _formatRocTooltip(raw) {
    if (!raw || typeof raw.x !== 'number' || typeof raw.y !== 'number') return '';
    const base = `FPR: ${raw.x.toFixed(3)} · TPR: ${raw.y.toFixed(3)}`;
    if (typeof raw.threshold !== 'number') return base;
    return `${base} · ${I18n.t('roc_threshold')}: ${raw.threshold.toFixed(3)}`;
  }

  function _formatScatterTooltip(raw) {
    if (!raw || typeof raw.x !== 'number' || typeof raw.y !== 'number') return '';
    if (!raw.country) return `${I18n.t('chart_sigmoid')} · HDI: ${raw.x.toFixed(3)} · p: ${raw.y.toFixed(3)}`;
    const status = raw.selected ? I18n.t('chart_scatter_sel') : I18n.t('chart_scatter_nsel');
    return `${raw.country} (${raw.iso3}) — ${status} · HDI: ${raw.x.toFixed(3)} · p: ${raw.y.toFixed(3)}`;
  }

  function closeChartModal() {
    const overlay = document.getElementById('chart-modal-overlay');
    const canvas = document.getElementById('chart-modal-canvas');
    if (overlay) overlay.classList.add('hidden');
    document.body.style.overflow = '';
    if (canvas) {
      window.SharedChartInteractions?.detach?.(canvas);
    }
    if (_modalChart) {
      _modalChart.destroy();
      _modalChart = null;
    }
    _modalDefaults = null;
    _modalKind = null;
  }

  function refreshCharts() {
    if (!_lastResult) return;
    _renderScatter(_lastResult);
    _renderROC(_lastResult);
    if (_modalKind) {
      openChartModal(_modalKind);
    }
  }

  // ── Public API ────────────────────────────────────────────────────
  return {
    renderCheckboxList,
    syncCheckboxes,
    filterCheckboxes,
    parseInput,
    showParseErrors,
    showModal,
    closeModal,
    openChartModal,
    closeChartModal,
    showResults,
    hideResults,
    refreshCharts,
  };
})();
