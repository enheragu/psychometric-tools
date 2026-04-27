const App = (() => {
  let chartPluginsRegistered = false;
  let _shell = null;

  const state = {
    lang: 'en',
    theme: 'light',
    items: [],
    categories: 5,
    miniCharts: [],
    modalChart: null,
    modalItemIndex: null,
    modalTapStamp: 0,
    viewMode: 'category',
    modalViewMode: 'category',
    lastScoresA: null,
    lastScoresB: null,
    lastMeansA: null,
    lastMeansB: null,
    lastNSim: 1,
    simHistChart: null,
    modalIsHistogram: false,
    modalDefaults: null,
    lastSimulation: null,
    simFitModel: 'ogive',
    lastNGroupA: null,
    lastNGroupB: null,
  };

  const chartAreaBackgroundPlugin = {
    id: 'chartAreaBackground',
    beforeDraw(chart, _args, options) {
      const { ctx, chartArea } = chart;
      if (!chartArea || !options?.color) return;
      ctx.save();
      ctx.fillStyle = options.color;
      ctx.fillRect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, chartArea.bottom - chartArea.top);
      ctx.restore();
    },
  };

  const PRESETS = {
    nodif: {
      numItems: 8, categories: 5,
      items: [
        { a_a:1.8, b_a:[-1.7,-0.8, 0.15,1.05], hasDIF:false, a_b:1.8, b_b:[-1.7,-0.8, 0.15,1.05] },
        { a_a:1.4, b_a:[-1.05,-0.15, 0.35,1.45], hasDIF:false, a_b:1.4, b_b:[-1.05,-0.15, 0.35,1.45] },
        { a_a:2.0, b_a:[-1.95,-1.05,-0.05,0.95], hasDIF:false, a_b:2.0, b_b:[-1.95,-1.05,-0.05,0.95] },
        { a_a:1.6, b_a:[-0.9,-0.1, 0.9,1.7], hasDIF:false, a_b:1.6, b_b:[-0.9,-0.1, 0.9,1.7] },
        { a_a:1.3, b_a:[-1.55,-0.55, 0.25,1.35], hasDIF:false, a_b:1.3, b_b:[-1.55,-0.55, 0.25,1.35] },
        { a_a:1.9, b_a:[-1.45,-0.95, 0.45,1.05], hasDIF:false, a_b:1.9, b_b:[-1.45,-0.95, 0.45,1.05] },
        { a_a:1.5, b_a:[-1.25,-0.35, 0.65,1.55], hasDIF:false, a_b:1.5, b_b:[-1.25,-0.35, 0.65,1.55] },
        { a_a:1.7, b_a:[-1.0,-0.45, 0.75,1.6], hasDIF:false, a_b:1.7, b_b:[-1.0,-0.45, 0.75,1.6] },
      ],
    },
    // 2PL preset: dichotomous items (2 categories), no DIF.
    nodif2pl: {
      numItems: 10, categories: 2,
      items: [
        { a_a:1.2, b_a:[0.0],   hasDIF:false, a_b:1.2,  b_b:[0.0] },
        { a_a:1.5, b_a:[-0.5],  hasDIF:false, a_b:1.5,  b_b:[-0.5] },
        { a_a:1.8, b_a:[0.3],   hasDIF:false, a_b:1.8,  b_b:[0.3] },
        { a_a:1.0, b_a:[-0.8],  hasDIF:false, a_b:1.0,  b_b:[-0.8] },
        { a_a:1.6, b_a:[0.1],   hasDIF:false, a_b:1.6,  b_b:[0.1] },
        { a_a:1.3, b_a:[-0.3],  hasDIF:false, a_b:1.3,  b_b:[-0.3] },
        { a_a:2.0, b_a:[0.6],   hasDIF:false, a_b:2.0,  b_b:[0.6] },
        { a_a:1.4, b_a:[-0.6],  hasDIF:false, a_b:1.4,  b_b:[-0.6] },
        { a_a:1.7, b_a:[0.2],   hasDIF:false, a_b:1.7,  b_b:[0.2] },
        { a_a:1.1, b_a:[-0.4],  hasDIF:false, a_b:1.1,  b_b:[-0.4] },
      ],
    },
    // 2PL preset: dichotomous items (2 categories), mix of DIF and non-DIF items.
    dif2pl: {
      numItems: 10, categories: 2,
      items: [
        { a_a:1.2, b_a:[0.0],   hasDIF:false, a_b:1.2,  b_b:[0.0] },
        { a_a:1.5, b_a:[-0.5],  hasDIF:true,  a_b:1.5,  b_b:[0.4] },
        { a_a:1.8, b_a:[0.3],   hasDIF:false, a_b:1.8,  b_b:[0.3] },
        { a_a:1.0, b_a:[-0.8],  hasDIF:true,  a_b:1.0,  b_b:[0.2] },
        { a_a:1.6, b_a:[0.1],   hasDIF:false, a_b:1.6,  b_b:[0.1] },
        { a_a:1.3, b_a:[-0.3],  hasDIF:true,  a_b:1.3,  b_b:[0.5] },
        { a_a:2.0, b_a:[0.6],   hasDIF:false, a_b:2.0,  b_b:[0.6] },
        { a_a:1.4, b_a:[-0.6],  hasDIF:true,  a_b:1.4,  b_b:[0.3] },
        { a_a:1.7, b_a:[0.2],   hasDIF:false, a_b:1.7,  b_b:[0.2] },
        { a_a:1.1, b_a:[-0.4],  hasDIF:false, a_b:1.1,  b_b:[-0.4] },
      ],
    },
    dif: {
      numItems: 8, categories: 5,
      items: [
        { a_a:1.8, b_a:[-1.7,-0.8, 0.15,1.05], hasDIF:false, a_b:1.8, b_b:[-1.7,-0.8, 0.15,1.05] },
        { a_a:1.4, b_a:[-1.05,-0.15, 0.35,1.45], hasDIF:true,  a_b:1.15, b_b:[-0.35, 0.55, 1.15,2.15] },
        { a_a:2.0, b_a:[-1.95,-1.05,-0.05,0.95], hasDIF:false, a_b:2.0, b_b:[-1.95,-1.05,-0.05,0.95] },
        { a_a:1.6, b_a:[-0.9,-0.1, 0.9,1.7], hasDIF:true,  a_b:1.35, b_b:[-0.2, 0.65, 1.55,2.45] },
        { a_a:1.3, b_a:[-1.55,-0.55, 0.25,1.35], hasDIF:false, a_b:1.3, b_b:[-1.55,-0.55, 0.25,1.35] },
        { a_a:1.9, b_a:[-1.45,-0.95, 0.45,1.05], hasDIF:true,  a_b:1.65, b_b:[-0.55, 0.05, 1.2,1.95] },
        { a_a:1.5, b_a:[-1.25,-0.35, 0.65,1.55], hasDIF:false, a_b:1.5, b_b:[-1.25,-0.35, 0.65,1.55] },
        { a_a:1.7, b_a:[-1.0,-0.45, 0.75,1.6], hasDIF:true,  a_b:1.25, b_b:[-0.15, 0.55, 1.45,2.25] },
      ],
    },
  };

  function t(key, vars = {}) {
    return window.DIFI18n.t(key, vars, state.lang);
  }

  function init() {
    _shell = window.SharedToolPageShell.initToolPage({
      fallbackLang: 'en',
      i18nApi: window.DIFI18n,
      relatedWork: {
        toolId: 'DIF-AccumulationTool',
        sourceUrl: '/psychometric-tools/assets/related-work.json',
        publicationsSourceUrl: window.PUBLICATIONS_SOURCE_URL || 'https://enheragu.github.io/publications-data.json',
      },
      onApplyLanguage: (_copy, lang) => {
        state.lang = lang;
        applyLang();
        buildItemForms();
        renderItemCharts();
        if (state.lastScoresA) renderSimHistogram(state.lastScoresA, state.lastScoresB);
      },
      onApplyTheme: (theme) => {
        state.theme = theme;
        window.SharedUiCore.applyBodyTheme(theme);
        const button = document.getElementById('btn-theme');
        if (button) button.setAttribute('aria-pressed', String(theme === 'dark'));
        renderItemCharts();
        if (state.modalIsHistogram) {
          const mc = document.getElementById('chart-modal-canvas');
          if (state.modalChart) { state.modalChart.destroy(); state.modalChart = null; }
          state.modalChart = renderSimHistogram(state.lastScoresA, state.lastScoresB, mc);
          attachChartInteractions({ canvas: mc, getChart: () => state.modalChart, defaults: state.modalDefaults });
        } else if (state.modalItemIndex !== null) {
          renderModalChart(state.modalItemIndex);
        }
        if (state.lastScoresA) renderSimHistogram(state.lastScoresA, state.lastScoresB);
      },
    });
    state.lang = _shell.lang;
    state.theme = _shell.theme;
    _shell.applyTheme();
    ensureChartPlugins();
    bindControls();
    buildItemForms();
    renderItemCharts();
  }

  function bindControls() {
    document.querySelectorAll('[data-step-target]').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.stepTarget);
        const step = Number(btn.dataset.step || 0);
        const min = Number(target.min || 0);
        const max = Number(target.max || Number.MAX_SAFE_INTEGER);
        const next = Math.max(min, Math.min(max, Number(target.value || 0) + step));
        target.value = next;
        if (target.id === 'num-items' || target.id === 'num-cats') {
          buildItemForms();
          renderItemCharts();
        }
      });
    });

    ['num-items', 'num-cats'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => {
        buildItemForms();
        renderItemCharts();
      });
    });

    document.getElementById('btn-simulate').addEventListener('click', runSimulation);
    document.getElementById('btn-preset-nodif').addEventListener('click', () => loadPreset('nodif'));
    document.getElementById('btn-preset-dif').addEventListener('click', () => loadPreset('dif'));
    document.getElementById('btn-preset-nodif2pl').addEventListener('click', () => loadPreset('nodif2pl'));
    document.getElementById('btn-preset-2pl').addEventListener('click', () => loadPreset('dif2pl'));
    document.getElementById('btn-apply-bulk').addEventListener('click', applyBulkInput);
    const expandHistBtn = document.getElementById('btn-expand-hist');
    if (expandHistBtn) expandHistBtn.addEventListener('click', openHistModal);
    document.getElementById('btn-export-csv').addEventListener('click', exportSimulationCsv);
    document.getElementById('btn-export-json').addEventListener('click', exportSimulationJson);

    document.getElementById('btn-view-category').addEventListener('click', () => setViewMode('category'));
    document.getElementById('btn-view-cumulative').addEventListener('click', () => setViewMode('cumulative'));

    document.getElementById('btn-modal-view-category').addEventListener('click', () => setModalViewMode('category'));
    document.getElementById('btn-modal-view-cumulative').addEventListener('click', () => setModalViewMode('cumulative'));

    const modalOverlay = document.getElementById('chart-modal-overlay');
    document.getElementById('btn-close-modal').addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', e => {
      if (e.target === modalOverlay) closeModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModal();
    });
  }

  function setViewMode(mode) {
    state.viewMode = mode;
    document.getElementById('btn-view-category').classList.toggle('active', mode === 'category');
    document.getElementById('btn-view-cumulative').classList.toggle('active', mode === 'cumulative');
    renderItemCharts();
  }

  function setModalViewMode(mode) {
    state.modalViewMode = mode;
    document.getElementById('btn-modal-view-category').classList.toggle('active', mode === 'category');
    document.getElementById('btn-modal-view-cumulative').classList.toggle('active', mode === 'cumulative');
    if (!state.modalIsHistogram && state.modalItemIndex !== null) {
      renderModalChart(state.modalItemIndex);
    }
  }

  function applyLang() {
    document.getElementById('intro-title').textContent = t('intro_title');
    document.getElementById('intro-text').innerHTML = t('intro_text');
    document.getElementById('cfg-title').textContent = t('cfg_title');
    const cfgHint = document.getElementById('cfg-hint');
    if (cfgHint) cfgHint.textContent = t('cfg_hint');
    document.getElementById('lbl-items').textContent = t('lbl_items');
    document.getElementById('lbl-cats').textContent = t('lbl_cats');
    document.getElementById('lbl-group-a').textContent = t('lbl_group_a');
    document.getElementById('lbl-group-b').textContent = t('lbl_group_b');
    document.getElementById('lbl-simulations').textContent = t('lbl_simulations');
    document.getElementById('btn-simulate').textContent = t('simulate');
    document.getElementById('method-title').textContent = t('method_title');
    document.getElementById('method-text').innerHTML = t('method_text');
    document.getElementById('sim-output-title').textContent = t('sim_output_title');
    const simOutputHint = document.getElementById('sim-output-hint');
    if (simOutputHint) simOutputHint.textContent = t('sim_output_hint');
    document.getElementById('sim-hist-title').textContent = t('sim_hist_title');
    const expandHistBtn = document.getElementById('btn-expand-hist');
    if (expandHistBtn) expandHistBtn.textContent = t('expand_chart');
    document.getElementById('btn-export-csv').textContent = t('export_csv');
    document.getElementById('btn-export-json').textContent = t('export_json');
    document.getElementById('lbl-bulk').textContent = t('bulk_label');
    document.getElementById('btn-apply-bulk').textContent = t('bulk_apply');
    document.getElementById('lbl-preset').textContent = t('preset_title');
    document.getElementById('btn-preset-nodif').textContent = t('preset_no_dif');
    document.getElementById('btn-preset-dif').textContent = t('preset_dif');
    document.getElementById('btn-preset-nodif2pl').textContent = t('preset_2pl_no_dif');
    document.getElementById('btn-preset-2pl').textContent = t('preset_2pl');
    document.getElementById('items-title').textContent = t('items_title');
    const itemsHint = document.getElementById('items-hint');
    if (itemsHint) itemsHint.textContent = t('items_hint');
    document.getElementById('btn-view-category').textContent = t('view_category');
    document.getElementById('btn-view-cumulative').textContent = t('view_cumulative');
    document.getElementById('btn-modal-view-category').textContent = t('view_category');
    document.getElementById('btn-modal-view-cumulative').textContent = t('view_cumulative');
    document.getElementById('btn-close-modal').textContent = t('close');
    const reportProblemLink = document.getElementById('footer-report-problem');
    if (reportProblemLink) reportProblemLink.textContent = t('report_problem');
    if (state.lastSimulation) renderSimulationSummary(state.lastSimulation);
  }

  function _updateModelIndicator() {
    const el = document.getElementById('model-indicator');
    if (!el) return;
    el.textContent = t(state.categories === 2 ? 'model_indicator_2pl' : 'model_indicator_grm');
  }

  function buildItemForms() {
    const itemCount = clampInt(document.getElementById('num-items').value, 1, 80);
    const categories = clampInt(document.getElementById('num-cats').value, 2, 8);
    state.categories = categories;
    _updateModelIndicator();

    const oldById = new Map(state.items.map(i => [i.id, i]));
    state.items = [];

    const container = document.getElementById('item-forms');
    container.innerHTML = '';

    for (let i = 1; i <= itemCount; i++) {
      const prev = oldById.get(i);
      const item = prev || createDefaultItem(i, categories);
      item.b_a = normalizeThresholds(item.b_a, categories, item.id, 'A');
      item.b_b = normalizeThresholds(item.b_b, categories, item.id, 'B');
      state.items.push(item);

      const card = document.createElement('article');
      card.className = 'item-card';
      card.innerHTML = `
        <h3 class="shared-plot-title">Item ${i}</h3>
        <div class="item-row">
          <div>
            <label>${t('a_a')}</label>
            <input type="number" step="0.01" min="0.2" max="4" data-item="${i}" data-field="a_a" value="${item.a_a}">
          </div>
          <div>
            <label>${t('b_a')}</label>
            <input type="text" data-item="${i}" data-field="b_a" value="${item.b_a.join(', ')}">
          </div>
        </div>
        <label class="shared-checkbox-row">
          <input type="checkbox" data-item="${i}" data-field="hasDIF" ${item.hasDIF ? 'checked' : ''}>
          <span>${t('dif_toggle')}</span>
        </label>
        <div class="item-row ${item.hasDIF ? '' : 'hidden'}" data-item-b="${i}">
          <div>
            <label>${t('a_b')}</label>
            <input type="number" step="0.01" min="0.2" max="4" data-item="${i}" data-field="a_b" value="${item.a_b}">
          </div>
          <div>
            <label>${t('b_b')}</label>
            <input type="text" data-item="${i}" data-field="b_b" value="${item.b_b.join(', ')}">
          </div>
        </div>
        <div class="item-chart-wrap" data-open-item="${i}" role="button" tabindex="0" aria-label="Open item ${i} chart">
          <div class="item-chart-canvas">
            <canvas id="mini-chart-${i}"></canvas>
          </div>
        </div>
      `;
      container.appendChild(card);
    }

    container.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', onItemInputChange);
      input.addEventListener('change', onItemInputChange);
    });

    container.querySelectorAll('[data-open-item]').forEach(el => {
      const itemId = Number(el.dataset.openItem);
      const open = () => openModal(itemId - 1);
      el.addEventListener('click', open);
      el.addEventListener('keydown', evt => {
        if (evt.key === 'Enter' || evt.key === ' ') {
          evt.preventDefault();
          open();
        }
      });
    });
  }

  function createDefaultItem(id, categories) {
    const a_a = Number((0.9 + ((id * 17) % 9) * 0.11).toFixed(2));
    return {
      id,
      a_a,
      b_a: defaultThresholds(categories, id, 'A'),
      hasDIF: false,
      a_b: Number((a_a + 0.08).toFixed(2)),
      b_b: defaultThresholds(categories, id, 'B'),
    };
  }

  function defaultThresholds(categories, itemId = 1, group = 'A') {
    const n = categories - 1;
    const baseStart = -1.25;
    const baseStep = 2.55 / Math.max(1, n - 1);
    const itemShift = Math.sin(itemId * 1.37) * 0.34;
    const spread = 1 + Math.cos(itemId * 0.83) * 0.12;
    const groupShift = group === 'B' ? 0.18 + Math.sin(itemId * 0.61) * 0.05 : 0;
    const values = Array.from({ length: n }, (_, i) => {
      const wiggle = Math.sin((itemId + i + 1) * 1.11) * 0.08 + Math.cos((itemId - i + 2) * 0.73) * 0.05;
      return Number((baseStart + i * baseStep * spread + itemShift + groupShift + wiggle).toFixed(2));
    });
    return sortThresholds(values);
  }

  function normalizeThresholds(values, categories, itemId = 1, group = 'A') {
    const needed = Math.max(1, categories - 1);
    const parsed = Array.isArray(values)
      ? values.map(Number).filter(Number.isFinite)
      : [];

    if (parsed.length === needed) return sortThresholds(parsed);

    if (parsed.length > needed) {
      return sortThresholds(parsed.slice(0, needed));
    }

    const fallback = defaultThresholds(categories, itemId, group);
    if (!parsed.length) return fallback;

    const merged = parsed.slice();
    for (let i = parsed.length; i < needed; i++) {
      merged.push(fallback[i]);
    }
    return sortThresholds(merged);
  }

  function onItemInputChange(e) {
    const input = e.target;
    const itemId = Number(input.dataset.item);
    const field = input.dataset.field;
    if (!itemId || !field) return;

    const item = state.items.find(x => x.id === itemId);
    if (!item) return;

    if (field === 'hasDIF') {
      item.hasDIF = input.checked;
      const row = document.querySelector(`[data-item-b="${itemId}"]`);
      if (row) row.classList.toggle('hidden', !item.hasDIF);
    } else if (field === 'b_a' || field === 'b_b') {
      item[field] = parseThresholdCsv(input.value, state.categories, itemId, field === 'b_a' ? 'A' : 'B', item[field]);
    } else {
      item[field] = Number(input.value);
    }

    renderItemCharts();
  }

  function parseThresholdCsv(raw, categories, itemId, group, fallback) {
    const needed = Math.max(1, categories - 1);
    const parsed = String(raw || '')
      .split(',')
      .map(x => Number(x.trim()))
      .filter(Number.isFinite)
      .slice(0, needed);

    if (parsed.length === needed) return sortThresholds(parsed);
    return normalizeThresholds(parsed.length ? parsed : fallback, categories, itemId, group);
  }

  function renderItemCharts() {
    state.miniCharts.forEach(c => c.destroy());
    state.miniCharts = [];

    state.items.forEach(item => {
      const canvas = document.getElementById(`mini-chart-${item.id}`);
      if (!canvas) return;
      const chart = buildItemChart(canvas, item, state.viewMode, false);
      state.miniCharts.push(chart);
    });

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        state.miniCharts.forEach(function (c) { if (c) c.resize(); });
      });
    });
  }

  function openModal(index) {
    state.modalIsHistogram = false;
    state.modalItemIndex = index;
    const item = state.items[index];
    if (!item) return;

    document.getElementById('chart-modal-title').textContent = `Item ${item.id} curves`;
    document.getElementById('chart-modal-overlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    document.querySelector('.chart-modal-actions .view-toggle').classList.remove('hidden');
    state.modalDefaults = { xMin: -3, xMax: 3, yMin: 0, yMax: 1, mode: 'xy' };

    setModalViewMode(state.viewMode);
  }

  function openHistModal() {
    if (!state.lastScoresA) return;
    state.modalIsHistogram = true;
    state.modalItemIndex = null;
    document.getElementById('chart-modal-title').textContent = t('hist_modal_title');
    document.getElementById('chart-modal-overlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    document.querySelector('.chart-modal-actions .view-toggle').classList.add('hidden');
    const canvas = document.getElementById('chart-modal-canvas');
    if (state.modalChart) { state.modalChart.destroy(); state.modalChart = null; }
    const maxScore = state.items.length * (state.categories - 1);
    state.modalDefaults = state.lastNSim > 1
      ? null
      : { xMin: -0.5, xMax: maxScore + 0.5, yMin: 0, yMax: 1, mode: 'x' };
    state.modalChart = renderSimHistogram(state.lastScoresA, state.lastScoresB, canvas);
    attachChartInteractions({ canvas, getChart: () => state.modalChart, defaults: state.modalDefaults });
  }

  function renderModalChart(index) {
    const item = state.items[index];
    if (!item) return;
    if (state.modalChart) state.modalChart.destroy();
    const canvas = document.getElementById('chart-modal-canvas');
    state.modalChart = buildItemChart(canvas, item, state.modalViewMode, true);
    attachChartInteractions({ canvas, getChart: () => state.modalChart, defaults: state.modalDefaults });
  }

  function closeModal() {
    const overlay = document.getElementById('chart-modal-overlay');
    if (overlay.classList.contains('hidden')) return;
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
    if (state.modalChart) {
      state.modalChart.destroy();
      state.modalChart = null;
    }
    detachChartInteractions(document.getElementById('chart-modal-canvas'));
    state.modalItemIndex = null;
    state.modalTapStamp = 0;
    state.modalDefaults = null;
    if (state.modalIsHistogram) {
      state.modalIsHistogram = false;
      document.querySelector('.chart-modal-actions .view-toggle').classList.remove('hidden');
    }
  }

  function buildItemChart(canvas, item, mode, showLegend) {
    const theta = Array.from({ length: 121 }, (_, i) => -3 + i * 0.05);
    const datasets = [];
    const chartTheme = getChartTheme();
    const b_a = normalizeThresholds(item.b_a, state.categories, item.id, 'A');
    const b_b = normalizeThresholds(item.b_b, state.categories, item.id, 'B');

    const addGroup = (labelPrefix, a, b, dashed = false) => {
      const curves = mode === 'cumulative'
        ? cumulativeProbabilities(theta, a, b)
        : categoryProbabilities(theta, a, b);

      curves.forEach((vals, c) => {
        datasets.push({
          label: `${labelPrefix} · ${mode === 'cumulative' ? `P≥${c + 1}` : `Cat ${c + 1}`}`,
          data: theta.map((x, i) => ({ x, y: vals[i] })),
          borderColor: palette(c),
          borderWidth: 1.9,
          borderDash: dashed ? [6, 4] : undefined,
          pointRadius: 0,
          tension: .24,
        });
      });
    };

    addGroup('A', item.a_a, b_a, false);
    if (item.hasDIF) addGroup('B', item.a_b, b_b, true);

    return new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { datasets },
      options: {
        ...window.SharedChartLegend.buildChartOptions({
          theme: chartTheme,
          parsing: false,
          interaction: { mode: 'nearest', intersect: false },
          scales: {
            x: buildLinearScale('θ', -3, 3, { ticks: { maxTicksLimit: 7, color: chartTheme.text } }),
            y: buildLinearScale(mode === 'cumulative' ? t('y_cumulative') : t('y_category'), 0, 1, { ticks: { maxTicksLimit: 5, color: chartTheme.text } }),
          },
          plugins: {
            chartAreaBackground: { color: chartTheme.area },
            legend: window.SharedChartLegend.createLegendOptions({
              display: showLegend,
              labels: { color: chartTheme.text, font: { size: 11, lineHeight: 1.2 } },
            }),
            tooltip: window.SharedChartLegend.createTooltipOptions({ enabled: showLegend }),
          },
        }),
      },
    });
  }

  function ensureChartPlugins() {
    if (chartPluginsRegistered || typeof Chart === 'undefined') return;
    Chart.register(chartAreaBackgroundPlugin);
    if (window.ChartZoom) {
      Chart.register(window.ChartZoom);
    }
    chartPluginsRegistered = true;
  }

  function getChartTheme() {
    return window.SharedChartLegend.getChartTheme();
  }

  function buildLinearScale(title, min, max, overrides) {
    return window.SharedChartLegend.buildLinearScale(title, min, max, overrides);
  }

  function buildCategoryScale(title, overrides) {
    return window.SharedChartLegend.buildCategoryScale(title, overrides);
  }

  function sortThresholds(values) {
    return values.slice().sort((a, b) => a - b).map(v => Number(v.toFixed(2)));
  }

  function attachChartInteractions({ canvas, getChart, defaults, onActivate, readonly }) {
    if (!window.SharedChartInteractions?.attach) return;
    window.SharedChartInteractions.attach({ canvas, getChart, defaults, onActivate, readonly });
  }

  function detachChartInteractions(canvas) {
    window.SharedChartInteractions?.detach?.(canvas);
  }

  function categoryProbabilities(thetaArray, a, thresholds) {
    const nCats = thresholds.length + 1;
    const probs = Array.from({ length: nCats }, () => []);

    for (const theta of thetaArray) {
      const pStar = [1];
      thresholds.forEach(b => {
        pStar.push(sigmoid(a * (theta - b)));
      });
      pStar.push(0);

      for (let k = 0; k < nCats; k++) {
        probs[k].push(Math.max(0, pStar[k] - pStar[k + 1]));
      }
    }

    return probs;
  }

  function cumulativeProbabilities(thetaArray, a, thresholds) {
    const curves = Array.from({ length: thresholds.length }, () => []);
    for (const theta of thetaArray) {
      for (let k = 0; k < thresholds.length; k++) {
        curves[k].push(sigmoid(a * (theta - thresholds[k])));
      }
    }
    return curves;
  }

  function sigmoid(x) {
    if (x >= 0) {
      const z = Math.exp(-x);
      return 1 / (1 + z);
    }
    const z = Math.exp(x);
    return z / (1 + z);
  }

  function runSimulation() {
    const nA = clampInt(document.getElementById('n-group-a').value, 100, 50000);
    const nB = clampInt(document.getElementById('n-group-b').value, 100, 50000);
    const nSim = clampInt(document.getElementById('n-simulations').value, 1, 1000);

    setSimStatus(t('sim_running', { n: nSim }), true);

    // Two RAFs: first lets the browser commit the busy state to the DOM,
    // second ensures the spinner frame is actually painted before the
    // synchronous simulation loop blocks the main thread.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const t0 = performance.now();
      let lastScoresA, lastScoresB, meanA, meanB, cohenD;
      const meansA = [], meansB = [];

      try {
        let sumMeanA = 0, sumMeanB = 0, sumCohenD = 0;
        for (let s = 0; s < nSim; s++) {
          const scoresA = simulateGroupScores(nA, 'A');
          const scoresB = simulateGroupScores(nB, 'B');
          const mA = mean(scoresA);
          const mB = mean(scoresB);
          meansA.push(mA);
          meansB.push(mB);
          sumMeanA += mA;
          sumMeanB += mB;
          sumCohenD += cohensD(scoresA, scoresB);
          lastScoresA = scoresA;
          lastScoresB = scoresB;
        }
        meanA = sumMeanA / nSim;
        meanB = sumMeanB / nSim;
        cohenD = sumCohenD / nSim;
      } catch (err) {
        console.error('[DIF-AccumulationTool] Simulation failed:', err);
        setSimStatus(t('sim_error'), false, 'error');
        return;
      }

      const ms = Math.round(performance.now() - t0);
      const time = ms >= 1000 ? (ms / 1000).toFixed(1) + ' s' : ms + ' ms';
      const delta = meanB - meanA;

      state.lastSimulation = { meanA, meanB, delta, cohenD };
      state.lastNGroupA = nA;
      state.lastNGroupB = nB;
      state.lastNSim = nSim;
      state.lastMeansA = meansA;
      state.lastMeansB = meansB;
      state.lastScoresA = lastScoresA;
      state.lastScoresB = lastScoresB;
      renderSimulationSummary(state.lastSimulation);
      document.getElementById('sim-results').classList.remove('hidden');
      renderSimHistogram(lastScoresA, lastScoresB);
      setSimStatus(t('sim_done', { time }), false, 'ok');
    }));
  }

  function renderSimulationSummary({ meanA, meanB, delta, cohenD }) {
    document.getElementById('sim-summary').innerHTML = `
      <div class="sim-badge">
        <span class="sim-badge-label">${t('sim_mean_a')}</span>
        <span class="sim-badge-value">${meanA.toFixed(3)}</span>
      </div>
      <div class="sim-badge">
        <span class="sim-badge-label">${t('sim_mean_b')}</span>
        <span class="sim-badge-value">${meanB.toFixed(3)}</span>
      </div>
      <div class="sim-badge delta">
        <span class="sim-badge-label">${t('sim_delta')}</span>
        <span class="sim-badge-value">${cohenD.toFixed(3)}</span>
      </div>`;
  }

  function renderSimHistogram(scoresA, scoresB, targetCanvas) {
    const shared = window.SharedHistogramNormalChart;
    const dataColors = window.SharedChartLegend.getDataColors();
    const useMeans = state.lastNSim > 1;

    let chartData, defaults, histChartOpts;

    if (useMeans) {
      chartData = shared?.buildContinuousDatasets
        ? shared.buildContinuousDatasets({
            series: [
              { label: t('sim_group_a'), values: state.lastMeansA },
              { label: t('sim_group_b'), values: state.lastMeansB },
            ],
          })
        : null;
      defaults = null;
      const theme = getChartTheme();
      histChartOpts = window.SharedChartLegend.buildChartOptions({
        theme,
        plugins: {
          chartAreaBackground: { color: theme.area },
          legend: shared.createLegendOptions({ normalLabel: t('sim_fit_ogive') }),
          tooltip: window.SharedChartLegend.createTooltipLabelOptions({
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y}`,
          }),
        },
        scales: {
          x: buildCategoryScale(t('sim_means_hist_x'), {
            ticks: { color: theme.text, maxTicksLimit: 14 },
          }),
          y: buildLinearScale(t('sim_means_hist_y'), 0, undefined, {
            ticks: { color: theme.text },
          }),
        },
      });
    } else {
      const maxScore = state.items.length * (state.categories - 1);
      chartData = shared?.buildDiscreteHistogramDatasets
        ? shared.buildDiscreteHistogramDatasets({
            maxScore,
            groups: [
              { label: t('sim_group_a'), scores: scoresA, color: dataColors.blue },
              { label: t('sim_group_b'), scores: scoresB, color: dataColors.red },
            ],
            fit: { type: 'normal-binmass', labelPrefix: t('sim_fit_ogive') },
          })
        : null;
      defaults = { xMin: -0.5, xMax: maxScore + 0.5, yMin: 0, yMax: 1, mode: 'x' };
      const theme = getChartTheme();
      histChartOpts = window.SharedChartLegend.buildChartOptions({
        theme,
        plugins: {
          chartAreaBackground: { color: theme.area },
          legend: shared.createLegendOptions({ normalLabel: t('sim_fit_ogive') }),
          tooltip: window.SharedChartLegend.createTooltipLabelOptions({
            label: ctx => `${ctx.dataset.label}: ${(ctx.parsed.y * 100).toFixed(1)} %`,
          }),
        },
        scales: {
          x: buildCategoryScale(t('sim_hist_x'), {
            ticks: { color: theme.text, maxTicksLimit: 14 },
          }),
          y: buildLinearScale(t('sim_hist_y'), undefined, undefined, {
            ticks: { color: theme.text, callback: v => `${(v * 100).toFixed(0)} %` },
          }),
        },
      });
    }

    const labels = chartData?.labels || [];

    if (!targetCanvas) {
      document.getElementById('sim-hist-block').classList.remove('hidden');
      if (state.simHistChart) { state.simHistChart.destroy(); state.simHistChart = null; }
    }

    const canvas = targetCanvas || document.getElementById('sim-hist-canvas');
    const chart = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: { labels, datasets: chartData?.datasets || [] },
      options: histChartOpts,
    });

    if (!targetCanvas) state.simHistChart = chart;
    attachChartInteractions({
      canvas,
      getChart: () => targetCanvas ? state.modalChart : state.simHistChart,
      defaults,
      onActivate: targetCanvas ? null : openHistModal,
      readonly: !targetCanvas,
    });

    if (!targetCanvas) {
      requestAnimationFrame(function () { if (chart) chart.resize(); });
    }

    return chart;
  }

  function clearSimHistogram() {
    if (state.simHistChart) { state.simHistChart.destroy(); state.simHistChart = null; }
    document.getElementById('sim-hist-block')?.classList.add('hidden');
    document.getElementById('sim-results')?.classList.add('hidden');
    document.getElementById('sim-summary').innerHTML = '';
    state.lastScoresA = null;
    state.lastScoresB = null;
    state.lastMeansA = null;
    state.lastMeansB = null;
    state.lastNSim = 1;
    state.lastSimulation = null;
    state.lastNGroupA = null;
    state.lastNGroupB = null;
  }

  function simulateGroupScores(n, group) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const theta = randn();
      let total = 0;
      for (const item of state.items) {
        const useB = group === 'B' && item.hasDIF;
        const a = useB ? item.a_b : item.a_a;
        const b = normalizeThresholds(useB ? item.b_b : item.b_a, state.categories, item.id, useB ? 'B' : 'A');
        const probs = categoryProbabilities([theta], a, b).map(arr => arr[0]);
        total += sampleCategory(probs);
      }
      out.push(total);
    }
    return out;
  }

  function sampleCategory(probabilities) {
    const r = Math.random();
    let acc = 0;
    for (let i = 0; i < probabilities.length; i++) {
      acc += probabilities[i];
      if (r <= acc) return i;
    }
    return probabilities.length - 1;
  }

  function randn() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function stdDev(values, meanValue = mean(values)) {
    if (values.length < 2) return 0;
    const variance = values.reduce((acc, value) => acc + ((value - meanValue) ** 2), 0) / values.length;
    return Math.sqrt(Math.max(variance, 0));
  }

  // Cohen's d: (meanB - meanA) / pooled SD (unbiased, using n-1 denominators).
  function cohensD(scoresA, scoresB) {
    const nA = scoresA.length;
    const nB = scoresB.length;
    if (nA < 2 || nB < 2) return 0;
    const mA = mean(scoresA);
    const mB = mean(scoresB);
    const varA = scoresA.reduce((acc, v) => acc + (v - mA) ** 2, 0) / (nA - 1);
    const varB = scoresB.reduce((acc, v) => acc + (v - mB) ** 2, 0) / (nB - 1);
    const pooledSD = Math.sqrt(((nA - 1) * varA + (nB - 1) * varB) / (nA + nB - 2));
    return pooledSD > 0 ? (mB - mA) / pooledSD : 0;
  }

  function erfApprox(x) {
    const sign = x < 0 ? -1 : 1;
    const ax = Math.abs(x);
    const p = 0.3275911;
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const t = 1 / (1 + p * ax);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
    return sign * y;
  }

  function normalCdf(x, mu, sigma) {
    if (!(sigma > 0)) return x >= mu ? 1 : 0;
    return 0.5 * (1 + erfApprox((x - mu) / (sigma * Math.SQRT2)));
  }

  function normalCdfBinMass(x, mu, sigma) {
    if (!(sigma > 0)) return 0;
    const upper = normalCdf(x + 0.5, mu, sigma);
    const lower = normalCdf(x - 0.5, mu, sigma);
    return Math.max(0, upper - lower);
  }

  function palette(idx) {
    const shared = window.SharedHistogramNormalChart?.getTokenPalette?.();
    const colors = (Array.isArray(shared) && shared.length)
      ? shared
      : window.SharedChartLegend.getDataPalette();
    return colors[idx % colors.length];
  }

  function setSimStatus(text, isBusy, type) {
    if (window.SharedSimStatus) window.SharedSimStatus.set('sim-progress', text, isBusy, type);
  }

  function clampInt(value, min, max) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function loadPreset(presetId) {
    if (!window.confirm(t('preset_confirm'))) return;
    const preset = PRESETS[presetId];
    if (!preset) return;
    document.getElementById('num-items').value = preset.numItems;
    document.getElementById('num-cats').value = preset.categories;
    buildItemForms();
    preset.items.forEach((pi, i) => {
      const item = state.items[i];
      if (!item) return;
      const idx = item.id;
      item.a_a = pi.a_a;  item.b_a = pi.b_a.slice();
      item.hasDIF = pi.hasDIF;
      item.a_b = pi.a_b;  item.b_b = pi.b_b.slice();
      document.querySelector(`input[data-item="${idx}"][data-field="a_a"]`).value = pi.a_a;
      document.querySelector(`input[data-item="${idx}"][data-field="b_a"]`).value = pi.b_a.join(', ');
      const chk = document.querySelector(`input[data-item="${idx}"][data-field="hasDIF"]`);
      chk.checked = pi.hasDIF;
      const bRow = document.querySelector(`[data-item-b="${idx}"]`);
      if (bRow) bRow.classList.toggle('hidden', !pi.hasDIF);
      document.querySelector(`input[data-item="${idx}"][data-field="a_b"]`).value = pi.a_b;
      document.querySelector(`input[data-item="${idx}"][data-field="b_b"]`).value = pi.b_b.join(', ');
    });
    renderItemCharts();
    document.getElementById('sim-summary').innerHTML = '';
    closeModal();
    clearSimHistogram();
  }

  function applyBulkInput() {
    const raw = (document.getElementById('bulk-input').value || '').trim();
    const status = document.getElementById('bulk-status');
    const errorsEl = document.getElementById('bulk-errors');
    if (!raw) {
      status.textContent = t('bulk_error');
      renderBulkErrors([{ line: 0, reason: t('bulk_no_valid_lines') }]);
      return;
    }

    const lines = raw.split(/\r?\n/);
    const parsed = [];
    const errors = [];
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      const result = parseBulkLine(trimmed);
      if (result.skip) {
        return;
      }
      if (result.errorKey) {
        errors.push({ line: idx + 1, reason: t(result.errorKey), raw: trimmed });
        return;
      }
      parsed.push(result.data);
    });

    if (errors.length || !parsed.length) {
      status.textContent = !parsed.length ? t('bulk_no_valid_lines') : t('bulk_error');
      renderBulkErrors(errors.length ? errors : [{ line: 0, reason: t('bulk_no_valid_lines') }]);
      return;
    }

    const maxItem = Math.max(...parsed.map(x => x.itemId));
    const maxCats = Math.max(...parsed.map(x => x.b.length + 1));
    document.getElementById('num-items').value = Math.max(1, Math.min(80, maxItem));
    document.getElementById('num-cats').value = Math.max(2, Math.min(8, maxCats));
    buildItemForms();

    for (const entry of parsed) {
      const item = state.items.find(x => x.id === entry.itemId);
      if (!item) continue;
      if (entry.group === 'B') {
        item.hasDIF = true;
        item.a_b = entry.a;
        item.b_b = normalizeThresholds(entry.b, state.categories, entry.itemId, 'B');
      } else {
        item.a_a = entry.a;
        item.b_a = normalizeThresholds(entry.b, state.categories, entry.itemId, 'A');
      }
    }

    syncItemsToInputs();
    renderItemCharts();
    clearSimHistogram();
    status.textContent = t('bulk_applied', { n: parsed.length, items: maxItem });
    errorsEl.innerHTML = '';
    errorsEl.classList.add('hidden');
  }

  function parseBulkLine(line) {
    if (!line || line.startsWith('#')) return { skip: true };
    const parts = line.split(';').map(x => x.trim()).filter(Boolean);
    if (parts.length < 3) return { errorKey: 'bulk_line_err_format' };

    let itemToken = parts[0];
    let group = 'A';
    let aText;
    let bText;

    if (parts.length >= 4) {
      if (!/^(A|B)$/i.test(parts[1])) return { errorKey: 'bulk_line_err_group' };
      group = parts[1].toUpperCase();
      aText = parts[2];
      bText = parts.slice(3).join(';');
    } else {
      const tokenMatch = itemToken.match(/^(\d+)([abAB])?$/);
      if (!tokenMatch) return { errorKey: 'bulk_line_err_item' };
      itemToken = tokenMatch[1];
      if (tokenMatch[2]) group = tokenMatch[2].toUpperCase();
      aText = parts[1];
      bText = parts.slice(2).join(';');
    }

    const itemId = Number(itemToken);
    const a = Number(aText);
    const b = bText.split(',').map(x => Number(x.trim())).filter(Number.isFinite);
    if (!/^(A|B)$/.test(group)) return { errorKey: 'bulk_line_err_group' };
    if (!Number.isFinite(itemId) || itemId < 1) return { errorKey: 'bulk_line_err_item' };
    if (!Number.isFinite(a)) return { errorKey: 'bulk_line_err_a' };
    if (!b.length) return { errorKey: 'bulk_line_err_b' };
    return { data: { itemId, group, a, b } };
  }

  function renderBulkErrors(errors) {
    const errorsEl = document.getElementById('bulk-errors');
    if (!errors?.length) {
      errorsEl.innerHTML = '';
      errorsEl.classList.add('hidden');
      return;
    }
    errorsEl.innerHTML = errors.map(err => {
      if (!err.line) return `<li>${err.reason}</li>`;
      return `<li>${t('bulk_line_prefix', { line: err.line, reason: err.reason })}</li>`;
    }).join('');
    errorsEl.classList.remove('hidden');
  }

  function syncItemsToInputs() {
    for (const item of state.items) {
      const idx = item.id;
      const inputAA = document.querySelector(`input[data-item="${idx}"][data-field="a_a"]`);
      const inputBA = document.querySelector(`input[data-item="${idx}"][data-field="b_a"]`);
      const chk = document.querySelector(`input[data-item="${idx}"][data-field="hasDIF"]`);
      const inputAB = document.querySelector(`input[data-item="${idx}"][data-field="a_b"]`);
      const inputBB = document.querySelector(`input[data-item="${idx}"][data-field="b_b"]`);
      const bRow = document.querySelector(`[data-item-b="${idx}"]`);
      const wrap = document.querySelector(`[data-open-item="${idx}"] .item-chart-head span:first-child`);

      if (inputAA) inputAA.value = item.a_a;
      if (inputBA) inputBA.value = item.b_a.join(', ');
      if (chk) chk.checked = item.hasDIF;
      if (inputAB) inputAB.value = item.a_b;
      if (inputBB) inputBB.value = item.b_b.join(', ');
      if (bRow) bRow.classList.toggle('hidden', !item.hasDIF);
      if (wrap) wrap.textContent = item.hasDIF ? 'DIF' : 'No DIF';
    }
  }

  function exportSimulationCsv() {
    if (!state.lastScoresA || !state.lastScoresB || !state.lastSimulation) {
      alert(t('export_need_simulation'));
      return;
    }
    const rows = [];
    const push = values => rows.push(values.map(csvEscape).join(','));
    const maxScore = state.items.length * (state.categories - 1);
    const freqA = new Array(maxScore + 1).fill(0);
    const freqB = new Array(maxScore + 1).fill(0);
    state.lastScoresA.forEach(s => { if (s >= 0 && s <= maxScore) freqA[s]++; });
    state.lastScoresB.forEach(s => { if (s >= 0 && s <= maxScore) freqB[s]++; });

    push(['section', 'metric', 'value']);
    push(['summary', 'lang', state.lang]);
    push(['summary', 'n_group_a', state.lastNGroupA]);
    push(['summary', 'n_group_b', state.lastNGroupB]);
    push(['summary', 'items', state.items.length]);
    push(['summary', 'categories', state.categories]);
    push(['summary', 'mean_a', state.lastSimulation.meanA.toFixed(6)]);
    push(['summary', 'mean_b', state.lastSimulation.meanB.toFixed(6)]);
    push(['summary', 'delta_raw', state.lastSimulation.delta.toFixed(6)]);
    push(['summary', 'cohens_d', state.lastSimulation.cohenD.toFixed(6)]);
    push(['summary', 'irt_model', state.categories === 2 ? '2PL' : 'GRM']);

    rows.push('');
    push(['item', 'group', 'a', 'b_thresholds']);
    for (const item of state.items) {
      push([item.id, 'A', item.a_a, item.b_a.join('|')]);
      if (item.hasDIF) push([item.id, 'B', item.a_b, item.b_b.join('|')]);
    }

    rows.push('');
    push(['score', 'freq_a', 'freq_b', 'prop_a', 'prop_b']);
    for (let s = 0; s <= maxScore; s++) {
      push([s, freqA[s], freqB[s], (freqA[s] / state.lastScoresA.length).toFixed(8), (freqB[s] / state.lastScoresB.length).toFixed(8)]);
    }

    const blob = new Blob([rows.join('\n') + '\n'], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `dif-accumulation-export-${dateStamp()}.csv`);
  }

  function exportSimulationJson() {
    if (!state.lastScoresA || !state.lastScoresB || !state.lastSimulation) {
      alert(t('export_need_simulation'));
      return;
    }
    const payload = {
      exported_at_utc: new Date().toISOString(),
      lang: state.lang,
      simulation: {
        n_group_a: state.lastNGroupA,
        n_group_b: state.lastNGroupB,
        items: state.items.length,
        categories: state.categories,
        mean_a: state.lastSimulation.meanA,
        mean_b: state.lastSimulation.meanB,
        delta_raw: state.lastSimulation.delta,
        cohens_d: state.lastSimulation.cohenD,
        irt_model: state.categories === 2 ? '2PL' : 'GRM',
        fit_model: state.simFitModel,
      },
      item_parameters: state.items.map(item => ({
        item: item.id,
        group_a: { a: item.a_a, b: item.b_a.slice() },
        group_b: item.hasDIF ? { a: item.a_b, b: item.b_b.slice() } : null,
      })),
      score_samples: {
        group_a: state.lastScoresA.slice(),
        group_b: state.lastScoresB.slice(),
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2) + '\n'], { type: 'application/json;charset=utf-8;' });
    downloadBlob(blob, `dif-accumulation-export-${dateStamp()}.json`);
  }

  function csvEscape(value) {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  function dateStamp() {
    return new Date().toISOString().slice(0, 10).replace(/-/g, '');
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  document.addEventListener('DOMContentLoaded', init);
  return {
    setLang: (lang) => _shell && _shell.setLang(lang),
    toggleTheme: () => _shell && _shell.toggleTheme(),
  };
})();
