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

    // Init map (async — fetches GeoJSON)
    try {
      await MapView.init('map', _toggleCountry);
    } catch (error) {
      _setMapUnavailable(error);
    }

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
  }

  // ── Parse CSV input ───────────────────────────────────────────────
  function _onParseInput() {
    const raw = document.getElementById('country-input').value;
    const { resolved, unmatched } = UI.parseInput(raw);

    for (const iso3 of resolved) _selected.add(iso3);

    MapView.setSelected(_selected);
    UI.syncCheckboxes(_selected);
    UI.hideResults();
    UI.showParseErrors(unmatched);

    if (unmatched.length) UI.showModal(unmatched);

    // Clear textarea after parsing
    document.getElementById('country-input').value = '';
  }

  // ── Bulk operations ───────────────────────────────────────────────
  function _selectAll() {
    for (const { iso3 } of Data.HDI_DATA) _selected.add(iso3);
    MapView.setSelected(_selected);
    UI.syncCheckboxes(_selected);
    UI.hideResults();
  }

  function _clearAll() {
    _selected.clear();
    MapView.setSelected(_selected);
    UI.syncCheckboxes(_selected);
    UI.hideResults();
    document.getElementById('parse-errors').classList.add('hidden');
  }

  function _invertAll() {
    for (const { iso3 } of Data.HDI_DATA) {
      if (_selected.has(iso3)) _selected.delete(iso3);
      else                     _selected.add(iso3);
    }
    MapView.setSelected(_selected);
    UI.syncCheckboxes(_selected);
    UI.hideResults();
  }

  // ── Regression ────────────────────────────────────────────────────
  function _runRegression() {
    if (_selected.size === 0) return;

    const result = Regression.analyse(_selected);

    if (result.error === 'degenerate') {
      alert(I18n.t('stat_n_selected') + ': 0 or all countries selected — cannot fit model.');
      return;
    }

    UI.showResults(result);
  }

  function _exportCsvReport() {
    const report = _buildExportReport();
    if (!report) return;

    const { result, rows } = report;
    const lines = [];
    const pushCsvRow = values => {
      lines.push(values.map(_csvEscape).join(','));
    };

    pushCsvRow(['section', 'metric', 'value']);
    pushCsvRow(['summary', 'selected_countries', _selected.size]);
    pushCsvRow(['summary', 'total_countries_with_hdi', Data.HDI_DATA.length]);
    pushCsvRow(['summary', 'countries_without_hdi', Data.NO_HDI_DATA.length]);

    if (result.error === 'degenerate') {
      pushCsvRow(['model', 'status', 'degenerate']);
    } else {
      pushCsvRow(['model', 'mean_hdi_selected', result.meanHdiSel.toFixed(6)]);
      pushCsvRow(['model', 'mean_hdi_not_selected', result.meanHdiNsel.toFixed(6)]);
      pushCsvRow(['model', 'beta0', result.beta0.toFixed(6)]);
      pushCsvRow(['model', 'beta1', result.beta1.toFixed(6)]);
      pushCsvRow(['model', 'odds_ratio_exp_beta1', Math.exp(result.beta1).toFixed(6)]);
      pushCsvRow(['model', 'std_error_beta1', result.se.toFixed(6)]);
      pushCsvRow(['model', 'z', result.z.toFixed(6)]);
      pushCsvRow(['model', 'p_value', result.pValue.toFixed(6)]);
      pushCsvRow(['model', 'auc', result.auc.toFixed(6)]);
    }

    lines.push('');
    pushCsvRow(['country', 'iso3', 'selected', 'hdi', 'year', 'predicted_probability', 'has_hdi_data']);

    for (const row of rows) {
      const isSelected = _selected.has(row.iso3);
      const hasHdi = Number.isFinite(row.hdi);
      let predicted = '';
      if (hasHdi && result.error !== 'degenerate') {
        predicted = Regression.sigmoid(result.beta0 + result.beta1 * row.hdi).toFixed(6);
      }

      pushCsvRow([
        row.country,
        row.iso3,
        isSelected ? '1' : '0',
        hasHdi ? Number(row.hdi).toFixed(3) : '',
        row.year ?? '',
        predicted,
        hasHdi ? '1' : '0',
      ]);
    }

    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8;' });
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `c-nrsbtool-export-${datePart}.csv`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function _exportJsonReport() {
    const report = _buildExportReport();
    if (!report) return;

    const payload = {
      exported_at_utc: new Date().toISOString(),
      summary: {
        selected_countries: _selected.size,
        total_countries_with_hdi: Data.HDI_DATA.length,
        countries_without_hdi: Data.NO_HDI_DATA.length,
      },
      model: report.result,
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
          year: row.year ?? null,
          predicted_probability: predicted,
          has_hdi_data: hasHdi,
        };
      }),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2) + '\n'], {
      type: 'application/json;charset=utf-8;',
    });
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `c-nrsbtool-export-${datePart}.json`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function _buildExportReport() {
    if (_selected.size === 0) {
      alert(I18n.t('export_need_selection'));
      return null;
    }

    const result = Regression.analyse(_selected);
    const rows = [...Data.HDI_DATA, ...Data.NO_HDI_DATA]
      .slice()
      .sort((a, b) => String(a.country).localeCompare(String(b.country)));

    return { result, rows };
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
    const generated = meta.generated_at_utc
      ? new Date(meta.generated_at_utc).toLocaleString(I18n.getLang() === 'es' ? 'es-ES' : 'en-GB')
      : I18n.t('footer_unknown');

    const latestYear = meta.latest_year_global ?? I18n.t('footer_unknown');

    const footerData = document.getElementById('footer-data-updated');
    const footerSource = document.getElementById('footer-data-source');
    const footerLatest = document.getElementById('footer-latest-year');
    const footerIdea = document.getElementById('footer-idea-credit');
    const footerApp = document.getElementById('footer-app-updated');

    if (footerData) {
      footerData.textContent = I18n.t('footer_data_updated', { date: generated });
    }
    if (footerLatest) {
      footerLatest.textContent = I18n.t('footer_latest_year', { year: latestYear });
    }
    if (footerSource) {
      footerSource.innerHTML = `${I18n.t('footer_source_prefix')} <a href="${meta.source}" target="_blank" rel="noopener noreferrer">Our World in Data</a>`;
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
