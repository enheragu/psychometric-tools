/**
 * app.js — Main controller. Wires MapView, UI, Regression, and I18n.
 * Exposed as window.App so inline handlers in index.html can call it.
 */
const App = (() => {

  // ── State ─────────────────────────────────────────────────────────
  const _selected = new Set();   // ISO-3 codes currently selected
  let _shell = null;
  let _theme = 'light'; // Updated by onApplyTheme callback

  // ── Initialisation ────────────────────────────────────────────────
  async function init() {
    try {
      await Data.init();
    } catch (error) {
      alert(`Data loading failed: ${error.message}`);
      return;
    }

    // Render checkbox list
    UI.renderCheckboxList(_selected, _toggleCountry);

    // Wire controls
    document.getElementById('btn-parse').addEventListener(  'click',  _onParseInput);
    document.getElementById('btn-select-all').addEventListener('click', _selectAll);
    document.getElementById('btn-clear').addEventListener(  'click',  _clearAll);
    document.getElementById('btn-invert').addEventListener( 'click',  _invertAll);
    document.getElementById('btn-run').addEventListener(    'click',  _runRegression);
    document.getElementById('btn-export').addEventListener( 'click',  _exportCsvReport);
    document.getElementById('btn-export-json').addEventListener('click', _exportJsonReport);
    document.querySelectorAll('.map-color-toggle [data-color-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.colorMode;
        MapView.setColorMode(mode);
        document.querySelectorAll('.map-color-toggle [data-color-mode]').forEach(b => {
          b.classList.toggle('is-active', b === btn);
        });
        const hdiLeg = document.getElementById('map-legend-hdi');
        const incLeg = document.getElementById('map-legend-income');
        if (hdiLeg) hdiLeg.classList.toggle('hidden', mode !== 'hdi');
        if (incLeg) incLeg.classList.toggle('hidden', mode !== 'income');
      });
    });

    // ── Map legend hover → highlight matching countries ────────────
    // Income legend chips: highlight countries of that income group.
    document.querySelectorAll('#map-legend-income .income-legend-chip').forEach(chip => {
      const cls = Array.from(chip.querySelector('.income-swatch')?.classList || [])
        .find(c => c.startsWith('income-swatch--'));
      const group = cls ? cls.replace('income-swatch--', '') : null;
      if (!group) return;
      chip.style.cursor = 'pointer';
      chip.addEventListener('mouseenter', () => {
        MapView.setHighlightFilter(iso3 => {
          const row = Data.COUNTRY_BY_ISO3[iso3];
          return row && row.incomeGroup === group;
        });
      });
      chip.addEventListener('mouseleave', () => MapView.setHighlightFilter(null));
    });

    // HDI gradient legend: highlight countries near the hovered HDI value.
    const hdiGradient = document.querySelector('#map-legend-hdi .legend-gradient');
    if (hdiGradient) {
      hdiGradient.style.cursor = 'pointer';
      hdiGradient.addEventListener('mousemove', e => {
        const rect = hdiGradient.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width; // 0 = low HDI, 1 = high HDI
        const hdiCenter = Math.max(0, Math.min(1, ratio));
        const HDI_RANGE = 0.08; // highlight ±0.08 around cursor
        MapView.setHighlightFilter(iso3 => {
          const row = Data.COUNTRY_BY_ISO3[iso3];
          if (!row || !Number.isFinite(row.hdi)) return false;
          return Math.abs(row.hdi - hdiCenter) <= HDI_RANGE;
        });
      });
      hdiGradient.addEventListener('mouseleave', () => MapView.setHighlightFilter(null));
    }

    document.getElementById('cb-sort').addEventListener('change', () => UI.syncCheckboxes(_selected));
    document.getElementById('cb-search').addEventListener(  'input',  e =>
      UI.filterCheckboxes(e.target.value)
    );

    // Trigger parse when pressing Enter in the textarea
    document.getElementById('country-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _onParseInput(); }
    });

    _shell = window.SharedToolPageShell.initToolPage({
      fallbackLang: 'en',
      i18nApi: I18n,
      relatedWork: {
        toolId: 'C-NRSBTool',
        sourceUrl: '/psychometric-tools/assets/related-work.json',
        publicationsSourceUrl: window.PUBLICATIONS_SOURCE_URL || 'https://enheragu.github.io/publications-data.json',
      },
      onApplyLanguage: (_copy, _lang) => {
        if (typeof I18n.applyToDOM === 'function') I18n.applyToDOM();
        UI.syncCheckboxes(_selected);
        _refreshMapUnavailableText();
        _refreshThemeButton();
        _renderFooterMeta();
        UI.refreshCharts();
      },
      onApplyTheme: (theme) => {
        _theme = theme;
        if (window.SharedUiCore) {
          window.SharedUiCore.applyBodyTheme(theme);
        } else {
          document.body.classList.toggle('dark', theme === 'dark');
        }
        _refreshThemeButton();
        UI.refreshCharts();
      },
    });

    // Wire result tabs (HDI / income groups). Re-render charts on tab show
    // so Chart.js measures the now-visible canvas correctly.
    const resultsTablist = document.getElementById('results-tabs');
    if (resultsTablist && window.SharedTabs?.bind) {
      window.SharedTabs.bind(resultsTablist, {
        manageVisibility: true,
        onSelect: () => UI.refreshCharts(),
      });
    }

    // Init map (async — fetches GeoJSON)
    try {
      await MapView.init('map', _toggleCountry);
    } catch (error) {
      _setMapUnavailable(error);
    }

    let _resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(_resizeTimer);
      _resizeTimer = setTimeout(() => UI.refreshCharts(), 120);
    });

    if (!localStorage.getItem('theme') && window.matchMedia) {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const applySystemTheme = e => {
        if (localStorage.getItem('theme')) return;
        const newTheme = e.matches ? 'dark' : 'light';
        if (newTheme !== _theme) _shell.toggleTheme();
      };
      if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', applySystemTheme);
      } else if (typeof media.addListener === 'function') {
        media.addListener(applySystemTheme);
      }
    }
  }

  // ── Country toggle (shared by map clicks and checkboxes) ──────────
  function _toggleCountry(iso3, selected) {
    if (selected) _selected.add(iso3);
    else          _selected.delete(iso3);

    MapView.setSelected(_selected);
    UI.syncCheckboxes(_selected);
    UI.hideResults();
    UI.setSimStatus('', false);
  }

  // ── Parse CSV input ───────────────────────────────────────────────
  function _onParseInput() {
    const raw = document.getElementById('country-input').value;
    const { resolved, unmatched } = UI.parseInput(raw);

    for (const iso3 of resolved) _selected.add(iso3);

    MapView.setSelected(_selected);
    UI.syncCheckboxes(_selected);
    UI.hideResults();
    UI.setSimStatus('', false);
    UI.showParseErrors(unmatched);

    if (unmatched.length) UI.showModal(unmatched);

    // Clear textarea after parsing
    document.getElementById('country-input').value = '';
  }

  // ── Bulk operations ───────────────────────────────────────────────
  function _selectAll() {
    for (const { iso3 } of Data.COUNTRY_DATA) _selected.add(iso3);
    MapView.setSelected(_selected);
    UI.syncCheckboxes(_selected);
    UI.hideResults();
    UI.setSimStatus('', false);
  }

  function _clearAll() {
    _selected.clear();
    MapView.setSelected(_selected);
    UI.syncCheckboxes(_selected);
    UI.hideResults();
    UI.setSimStatus('', false);
    document.getElementById('parse-errors').classList.add('hidden');
  }

  function _invertAll() {
    for (const { iso3 } of Data.COUNTRY_DATA) {
      if (_selected.has(iso3)) _selected.delete(iso3);
      else                     _selected.add(iso3);
    }
    MapView.setSelected(_selected);
    UI.syncCheckboxes(_selected);
    UI.hideResults();
    UI.setSimStatus('', false);
  }

  function _readIterations() {
    const el = document.getElementById('n-sim-iter');
    const raw = el ? Number(el.value) : Income.DEFAULT_ITERATIONS;
    const iterations = Math.max(500, Math.min(200000, Number.isFinite(raw) ? Math.floor(raw) : Income.DEFAULT_ITERATIONS));
    if (el) el.value = String(iterations);
    return iterations;
  }

  // ── Run analyses (HDI regression + income-group subsampling) ──────
  function _runRegression() {
    if (_selected.size === 0) {
      UI.setSimStatus(I18n.t('run_need_selection'), false, 'error');
      return;
    }

    const iterations = _readIterations();
    UI.setSimStatus(I18n.t('sim_status_running', { iterations }), true);

    // Two RAFs: first commits busy state to DOM, second ensures spinner
    // is painted before the synchronous simulation blocks the main thread.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const t0 = performance.now();
      let result, incomeResult;
      try {
        result = Regression.analyse(_selected);
        incomeResult = Income.analyse(_selected, { iterations });
      } catch (err) {
        console.error('[C-NRSBTool] Run failed:', err);
        UI.setSimStatus(I18n.t('sim_status_error'), false, 'error');
        return;
      }

      if (result.error === 'degenerate') {
        UI.setSimStatus(I18n.t('sim_status_error'), false, 'error');
        alert(I18n.t('stat_n_selected') + ': 0 or all countries selected — cannot fit model.');
        return;
      }

      UI.showResults(result, incomeResult);
      const ms = Math.round(performance.now() - t0);
      const time = ms >= 1000 ? (ms / 1000).toFixed(1) + ' s' : ms + ' ms';
      UI.setSimStatus(I18n.t('sim_status_done', { time }), false, 'ok');
    }));
  }

  function _exportCsvReport() {
    const report = _buildExportReport();
    if (!report) return;

    const { result, incomeResult, rows } = report;
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    // --- File 1: results (model stats + income subsampling) ---
    const resultLines = [];
    const pushResult = values => { resultLines.push(values.map(_csvEscape).join(',')); };

    pushResult(['section', 'metric', 'value']);
    pushResult(['summary', 'selected_countries', _selected.size]);
    pushResult(['summary', 'total_countries', Data.COUNTRY_DATA.length]);
    pushResult(['summary', 'total_countries_with_income_group',
      Data.COUNTRY_DATA.filter(r => r.incomeGroup).length]);
    pushResult(['summary', 'countries_without_data', Data.NO_HDI_DATA.length]);

    if (result.error === 'degenerate') {
      pushResult(['model', 'status', 'degenerate']);
    } else {
      pushResult(['model', 'mean_hdi_selected', result.meanHdiSel.toFixed(6)]);
      pushResult(['model', 'mean_hdi_not_selected', result.meanHdiNsel.toFixed(6)]);
      pushResult(['model', 'beta0', result.beta0.toFixed(6)]);
      pushResult(['model', 'beta1', result.beta1.toFixed(6)]);
      pushResult(['model', 'odds_ratio_exp_beta1', Math.exp(result.beta1).toFixed(6)]);
      pushResult(['model', 'std_error_beta1', result.se.toFixed(6)]);
      pushResult(['model', 'z', result.z.toFixed(6)]);
      pushResult(['model', 'p_value', result.pValue.toFixed(6)]);
      pushResult(['model', 'auc', result.auc.toFixed(6)]);
    }

    if (incomeResult && !incomeResult.error) {
      pushResult(['income_subsampling', 'sample_size', incomeResult.sampleSize]);
      pushResult(['income_subsampling', 'universe_size', incomeResult.universeSize]);
      pushResult(['income_subsampling', 'iterations', incomeResult.iterations]);
      pushResult(['income_subsampling', 'excluded_iso3', incomeResult.excludedIso3.join('|')]);
      for (const g of incomeResult.groups) {
        pushResult(['income_subsampling_' + g.key, 'observed_pct', g.observedPct.toFixed(3)]);
        pushResult(['income_subsampling_' + g.key, 'observed_count', g.observedCount]);
        pushResult(['income_subsampling_' + g.key, 'universe_pct', g.universePct.toFixed(3)]);
        pushResult(['income_subsampling_' + g.key, 'p025', g.p025.toFixed(3)]);
        pushResult(['income_subsampling_' + g.key, 'p50', g.p50.toFixed(3)]);
        pushResult(['income_subsampling_' + g.key, 'p975', g.p975.toFixed(3)]);
        pushResult(['income_subsampling_' + g.key, 'outside_95', g.outsideCi ? '1' : '0']);
      }
    } else if (incomeResult) {
      pushResult(['income_subsampling', 'status', incomeResult.error]);
    }

    // --- File 2: countries ---
    const countryLines = [];
    const pushCountry = values => { countryLines.push(values.map(_csvEscape).join(',')); };

    pushCountry(['country', 'iso3', 'selected', 'hdi', 'hdi_year', 'income_group', 'income_year', 'prob_selected_by_hdi']);

    for (const row of rows) {
      const isSelected = _selected.has(row.iso3);
      const hasHdi = Number.isFinite(row.hdi);
      let predicted = '';
      if (hasHdi && result.error !== 'degenerate') {
        predicted = Regression.sigmoid(result.beta0 + result.beta1 * row.hdi).toFixed(6);
      }
      pushCountry([
        row.country,
        row.iso3,
        isSelected ? '1' : '0',
        hasHdi ? Number(row.hdi).toFixed(3) : '',
        row.hdiYear ?? row.year ?? '',
        row.incomeGroup ?? '',
        row.incomeYear ?? '',
        predicted,
      ]);
    }

    _downloadBlob(resultLines.join('\n') + '\n', 'text/csv;charset=utf-8;',
      `c-nrsbtool-results-${datePart}.csv`);
    _downloadBlob(countryLines.join('\n') + '\n', 'text/csv;charset=utf-8;',
      `c-nrsbtool-countries-${datePart}.csv`);
  }

  function _exportJsonReport() {
    const report = _buildExportReport();
    if (!report) return;

    const payload = {
      exported_at_utc: new Date().toISOString(),
      summary: {
        selected_countries: _selected.size,
        total_countries: Data.COUNTRY_DATA.length,
        total_countries_with_income_group: Data.COUNTRY_DATA.filter(r => r.incomeGroup).length,
        countries_without_data: Data.NO_HDI_DATA.length,
      },
      model: (() => {
        // eslint-disable-next-line no-unused-vars
        const { sigmoidCurve, rocCurve, samples, ...modelStats } = report.result;
        return modelStats;
      })(),
      income_subsampling: report.incomeResult ? (() => {
        const { groups, ...rest } = report.incomeResult;
        return {
          ...rest,
          groups: groups?.map(({ distribution, ...g }) => g),
        };
      })() : null,
      countries: report.rows.map(row => {
        const hasHdi = Number.isFinite(row.hdi);
        const predicted = (hasHdi && report.result.error !== 'degenerate')
          ? Regression.sigmoid(report.result.beta0 + report.result.beta1 * row.hdi)
          : null;
        return {
          country: row.country,
          iso3: row.iso3,
          selected: _selected.has(row.iso3),
          hdi: hasHdi ? row.hdi : null,
          hdi_year: row.hdiYear ?? row.year ?? null,
          income_group: row.incomeGroup ?? null,
          income_group_label: row.incomeGroupLabel ?? null,
          income_year: row.incomeYear ?? null,
          prob_selected_by_hdi: predicted,
          has_hdi_data: hasHdi,
        };
      }),
    };

    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    _downloadBlob(JSON.stringify(payload, null, 2) + '\n', 'application/json;charset=utf-8;',
      `c-nrsbtool-export-${datePart}.json`);
  }

  function _buildExportReport() {
    if (_selected.size === 0) {
      alert(I18n.t('export_need_selection'));
      return null;
    }

    const iterations = _readIterations();
    const result = Regression.analyse(_selected);
    const incomeResult = Income.analyse(_selected, { iterations });
    const seen = new Set();
    const rows = [];
    for (const row of Data.COUNTRY_DATA) {
      if (seen.has(row.iso3)) continue;
      seen.add(row.iso3);
      rows.push(row);
    }
    for (const row of Data.NO_HDI_DATA) {
      if (seen.has(row.iso3)) continue;
      seen.add(row.iso3);
      rows.push(row);
    }
    rows.sort((a, b) => String(a.country).localeCompare(String(b.country)));

    return { result, incomeResult, rows };
  }

  function _downloadBlob(content, mimeType, filename) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function _csvEscape(value) {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function _refreshThemeButton() {
    const button = document.getElementById('btn-theme');
    if (!button) return;
    const nextModeLabel = _theme === 'dark' ? I18n.t('theme_btn_light') : I18n.t('theme_btn_dark');
    button.setAttribute('title', nextModeLabel);
    button.setAttribute('aria-label', nextModeLabel);
    button.setAttribute('aria-pressed', String(_theme === 'dark'));
  }

  function _renderFooterMeta() {
    const meta = Data.getMeta();
    const incomeMeta = Data.getIncomeMeta();
    const generated = meta.generated_at_utc
      ? new Date(meta.generated_at_utc).toLocaleString(I18n.getLang() === 'es' ? 'es-ES' : 'en-GB')
      : I18n.t('footer_unknown');

    const latestYear = meta.latest_year_global ?? I18n.t('footer_unknown');
    const latestIncomeYear = incomeMeta?.latest_year_global ?? I18n.t('footer_unknown');

    const footerData = document.getElementById('footer-data-updated');
    const footerSource = document.getElementById('footer-data-source');
    const footerLatest = document.getElementById('footer-latest-year');
    const footerIdea = document.getElementById('footer-idea-credit');
    const footerApp = document.getElementById('footer-app-updated');

    if (footerData) {
      footerData.textContent = I18n.t('footer_data_updated', { date: generated });
    }
    if (footerLatest) {
      footerLatest.textContent = I18n.t('footer_latest_year', { year: latestYear, incomeYear: latestIncomeYear });
    }
    if (footerSource) {
      const owid = 'https://ourworldindata.org/';
      const hdiUrl = 'https://ourworldindata.org/grapher/human-development-index';
      const incUrl = 'https://ourworldindata.org/grapher/world-bank-income-groups';
      footerSource.innerHTML =
        `${I18n.t('footer_source_prefix')} ` +
        `<a href="${owid}" target="_blank" rel="noopener noreferrer">Our World in Data</a> (` +
        `<a href="${hdiUrl}" target="_blank" rel="noopener noreferrer">HDI</a>, ` +
        `<a href="${incUrl}" target="_blank" rel="noopener noreferrer">World Bank income groups</a>)`;
    }
    if (footerIdea) {
      footerIdea.innerHTML = `${I18n.t('footer_idea_prefix')} <a href="https://fantasmamecanico.wordpress.com/" target="_blank" rel="noopener noreferrer">Alejandro Rujano</a>`;
    }
    if (footerApp) {
      footerApp.innerHTML = `${I18n.t('footer_app_prefix')} <a href="https://enheragu.github.io/" target="_blank" rel="noopener noreferrer">Enrique Heredia-Aguado</a>`;
    }
  }

  function _setMapUnavailable(error) {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;
    mapEl.innerHTML = `<div class="map-unavailable">${I18n.t('map_unavailable')}</div>`;
    console.warn('Map unavailable:', error);
  }

  function _refreshMapUnavailableText() {
    const marker = document.querySelector('#map .map-unavailable');
    if (!marker) return;
    marker.textContent = I18n.t('map_unavailable');
  }

  // ── Boot ──────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);

  return {
    setLang: (lang) => _shell && _shell.setLang(lang),
    toggleLang: () => _shell && _shell.setLang(_shell.getLang() === 'en' ? 'es' : 'en'),
    toggleTheme: () => _shell && _shell.toggleTheme(),
  };
})();
