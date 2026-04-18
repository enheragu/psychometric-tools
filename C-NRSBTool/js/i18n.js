/**
 * i18n.js — Bilingual (EN / ES) translation system.
 * Usage: I18n.t('key')  |  I18n.setLang('es')
 */
const I18n = (() => {
  // ── Translations ─────────────────────────────────────────────────
  const TRANSLATIONS = {
    en: {
      page_title:          'C-NRSBTool — Country Sample Selection Bias Analysis (HDI & World Bank income groups)',
      meta_description:    'Analyze whether a country sample is biased by Human Development Index (HDI) and by World Bank income group, with logistic regression, ROC curve, random subsampling reference distributions and interactive country selection.',
      site_title:          'C-NRSBTool',
      site_subtitle:       'Check whether country inclusion is systematically linked to HDI or to World Bank income group, with interpretable diagnostics and transparent reporting.',
      intro_title:         'Why this tool matters',
      intro_text_html:     'Cross-national datasets often look complete enough to analyze, but <strong>missing countries are rarely random</strong>. This tool helps you test whether country inclusion is systematically associated with the <strong>Human Development Index (HDI)</strong> — via logistic regression and ROC — and whether the share of <strong>World Bank income groups</strong> in your sample deviates from what random sampling would produce, by comparing it against a reference distribution built from random subsamples of N countries (drawn without replacement from the world). In short: it supports a more honest discussion of representativeness before drawing substantive conclusions.',
      intro_text:          'Cross-national datasets often look complete enough to analyze, but missing countries are rarely random. This tool helps you test whether country inclusion is systematically associated with the Human Development Index (HDI) — via logistic regression and ROC — and whether the share of World Bank income groups in your sample deviates from what random sampling would produce, by comparing it against a reference distribution built from random subsamples of N countries (drawn without replacement from the world). In short: it supports a more honest discussion of representativeness before drawing substantive conclusions.',
      theme_btn_dark:      'Dark',
      theme_btn_light:     'Light',
      map_title:           'World Map',
      map_hint:            'Click countries to select / deselect',
      map_unavailable:     'Map unavailable right now. You can still select countries from the list or text input.',
      legend_low:          'Low HDI',
      legend_high:         'High HDI',
      legend_selected:     '■ Selected',
      input_title:         'Enter countries in your sample:',
      input_hint:          'Comma-separated names, ISO-2 or ISO-3 codes; or Spanish/English name.',
      input_placeholder:   'Spain, Germany, USA, BRA, …',
      btn_parse:           'Add',
      btn_select_all:      'Select all',
      btn_clear:           'Clear all',
      btn_invert:          'Invert',
      btn_export:          'Export CSV',
      btn_export_json:     'Export JSON',
      sort_label:          'Sort',
      sort_name_asc:       'A–Z',
      sort_name_desc:      'Z–A',
      sort_hdi_desc:       'HDI ↓',
      sort_hdi_asc:        'HDI ↑',
      sort_year_desc:      'Year ↓',
      sort_year_asc:       'Year ↑',
      search_placeholder:  'Filter…',
      countries_selected:  ' countries selected',
      btn_run:             'Run analysis',
      chip_legend_title:   'Income chips',
      results_title:       'Results',
      stats_title:         'Model Statistics',
      th_stat:             'Statistic',
      th_value:            'Value',
      chart_title:         'HDI vs Selection Probability',
      chart_note_scatter:  'Points are binary outcomes (0/1); the green line is the fitted logistic probability.',
      chart_note_near_linear:'With a small HDI coefficient, the fitted sigmoid can appear almost linear in this range.',
      roc_title:           'ROC Curve',
      btn_expand_chart:    'Expand',
      chart_modal_scatter: 'HDI vs Selection Probability',
      chart_modal_roc:     'ROC Curve',
      chart_modal_help:    'Inside the chart: wheel/pinch = zoom, drag = pan, double click = reset, Esc = close.',
      chart_modal_help_violin: 'Hover the violins or table rows to highlight a group; click a legend item to toggle a layer; Esc to close.',
      stat_n_selected:     'Countries selected (n₁)',
      stat_n_total:        'Total countries (N)',
      stat_hdi_sel:        'Mean HDI — selected',
      stat_hdi_nsel:       'Mean HDI — not selected',
      stat_beta0:          'Intercept (β₀)',
      stat_beta1:          'HDI coefficient (β₁)',
      stat_or:             'Odds ratio (exp(β₁))',
      stat_se:             'Std. error β₁',
      stat_z:              'Z statistic',
      stat_pval:           'p-value',
      stat_auc:            'AUC-ROC',
      sig_yes:             '✔ Significant (p < 0.05)',
      sig_no:              '✘ Not significant (p ≥ 0.05)',
      interp_pos:          'Countries with higher HDI are significantly more likely to appear in your list (β₁ = {b1}, p = {p}). AUC = {auc}.',
      interp_neg:          'Countries with lower HDI are significantly more likely to appear in your list (β₁ = {b1}, p = {p}). AUC = {auc}.',
      interp_ns:           'No statistically significant relationship found between HDI and your list (β₁ = {b1}, p = {p}). AUC = {auc}.',
      modal_title:         'Unrecognised countries',
      modal_intro:         'The following entries could not be matched:',
      modal_suggestions:   'Tip: use ISO-3 codes (e.g. ESP, GBR, DEU) for exact matching.',
      modal_close:         'Close',
      tooltip_hdi:         'HDI: {hdi}',
      tooltip_year:        'Year: {year}',
      no_hdi_data:         'No HDI data',
      results_tab_hdi:     'HDI bias',
      results_tab_income:  'Income groups',
      income_stats_title:  'Income group representation',
      income_chart_title:  'Random subsampling distribution vs observed share',
      income_chart_y:      'Share of countries (%)',
      income_chart_ci:     'Central 95%',
      income_chart_violin: 'Reference distribution',
      income_chart_observed: 'Observed in input sample',
      map_color_hdi:       'HDI',
      map_color_income:    'Income',
      income_chart_note:   'Violins: reference distribution from random subsampling — what the share of each income group would look like if your N countries were drawn at random (without replacement) from the world. Dots: the share actually observed in input sample. Shaded band marks the central 95%.',
      income_summary_line: '{iterations} random subsamples of {n} countries (without replacement) drawn from a universe of {universe} countries with World Bank income classification.',
      income_th_group:     'Income group',
      income_th_observed:  'Observed',
      income_th_ci:        'Central 95%',
      income_outside_ci_title: 'Observed share falls outside the central 95% of the reference distribution',
      income_interp_balanced: 'No income group is over- or under-represented at the 95% level: each observed share lies within the central 95% of the random-subsampling reference distribution.',
      income_interp_over:  '{group} is over-represented in your sample ({obs}% vs expected 95% range {lo}–{hi}%).',
      income_interp_under: '{group} is under-represented in your sample ({obs}% vs expected 95% range {lo}–{hi}%).',
      income_excluded_note: 'Excluded from this analysis ({count}): {names} — no World Bank income-group classification available.',
      income_error_no_sample: 'None of the selected countries has a World Bank income-group classification.',
      income_error_no_universe: 'No countries with income-group data are available.',
      income_error_sample_too_big: 'Sample size exceeds the income-group universe — cannot draw without replacement.',
      income_group_low:           'Low income',
      income_group_lower_middle:  'Lower-middle income',
      income_group_upper_middle:  'Upper-middle income',
      income_group_high:          'High income',
      income_abbr_low:            'LI',
      income_abbr_lower_middle:   'LMI',
      income_abbr_upper_middle:   'UMI',
      income_abbr_high:           'HI',
      sim_iter_label:      'Simulation iterations',
      run_need_selection:  'Select at least one country to run the analysis.',
      sim_status_idle:     '',
      sim_status_running:  'Running simulation ({iterations} iterations)…',
      sim_status_done:     'Done in {time}.',
      sim_status_error:    'Could not run the analysis.',
      chart_modal_income:  'Income group representation',
      footer_unknown:      'Unknown',
      footer_data_updated: 'Country data last updated: {date}',
      footer_latest_year:  'Latest HDI year: {year}; latest income-group year: {incomeYear}',
      footer_source_prefix:'Source:',
      footer_app_prefix:   'Author:',
      footer_idea_prefix:  'Idea by:',
      footer_report_problem:'Report problem',
      chart_scatter_sel:   'Selected',
      chart_scatter_nsel:  'Not selected',
      chart_sigmoid:       'Sigmoid fit',
      chart_x:             'Human Development Index',
      chart_y:             'P(selected)',
      roc_curve:           'ROC curve',
      roc_random:          'Random classifier',
      roc_threshold:       'Threshold',
      roc_x:               'False Positive Rate',
      roc_y:               'True Positive Rate',
      export_need_selection:'Select at least one country before exporting.',
    },

    es: {
      page_title:          'C-NRSBTool — Análisis del sesgo de selección muestral por IDH y grupos de renta del Banco Mundial',
      meta_description:    'Analiza si una muestra de países está sesgada por el Índice de Desarrollo Humano (IDH) o por el grupo de renta del Banco Mundial, con regresión logística, curva ROC, distribución de referencia por remuestreo aleatorio y selección interactiva.',
      site_title:          'C-NRSBTool',
      site_subtitle:       'Comprueba si la inclusión de países está sistemáticamente ligada al IDH o al grupo de renta del Banco Mundial, con métricas claras y reportable.',
      intro_title:         '¿Qué te aporta esta herramienta?',
      intro_text_html:     'En estudios transnacionales, una base de datos puede parecer suficiente y aun así estar sesgada: <strong>los países que faltan rara vez faltan al azar</strong>. Esta herramienta te permite comprobar si la inclusión de países se relaciona con el <strong>Índice de Desarrollo Humano (IDH)</strong> mediante regresión logística y ROC, y si la proporción de <strong>grupos de renta del Banco Mundial</strong> en tu muestra se desvía de lo que produciría un muestreo aleatorio, comparándola con una distribución de referencia construida mediante remuestreo aleatorio de N países (sin reemplazo) del conjunto mundial. En pocas palabras: te ayuda a discutir la representatividad de forma más honesta antes de sacar conclusiones de fondo.',
      intro_text:          'En estudios transnacionales, una base de datos puede parecer suficiente y aun así estar sesgada: los países que faltan rara vez faltan al azar. Esta herramienta te permite comprobar si la inclusión de países se relaciona con el Índice de Desarrollo Humano (IDH) mediante regresión logística y ROC, y si la proporción de grupos de renta del Banco Mundial en tu muestra se desvía de lo que produciría un muestreo aleatorio, comparándola con una distribución de referencia construida mediante remuestreo aleatorio de N países (sin reemplazo) del conjunto mundial. En pocas palabras: te ayuda a discutir la representatividad de forma más honesta antes de sacar conclusiones de fondo.',
      theme_btn_dark:      'Oscuro',
      theme_btn_light:     'Claro',
      map_title:           'Mapa Mundial',
      map_hint:            'Haz clic en los países para seleccionar / deseleccionar',
      map_unavailable:     'El mapa no está disponible ahora mismo. Puedes seguir seleccionando países desde la lista o el input de texto.',
      legend_low:          'IDH bajo',
      legend_high:         'IDH alto',
      legend_selected:     '■ Seleccionado',
      input_title:         'Introduce países de tu muestra:',
      input_hint:          'Nombres separados por comas, códigos ISO-2 o ISO-3; o nombres en español/inglés.',
      input_placeholder:   'España, Alemania, EE.UU., BRA, …',
      btn_parse:           'Añadir',
      btn_select_all:      'Seleccionar todo',
      btn_clear:           'Borrar todo',
      btn_invert:          'Invertir',
      btn_export:          'Exportar CSV',
      btn_export_json:     'Exportar JSON',
      sort_label:          'Orden',
      sort_name_asc:       'A–Z',
      sort_name_desc:      'Z–A',
      sort_hdi_desc:       'IDH ↓',
      sort_hdi_asc:        'IDH ↑',
      sort_year_desc:      'Año ↓',
      sort_year_asc:       'Año ↑',
      search_placeholder:  'Filtrar…',
      countries_selected:  ' países seleccionados',
      btn_run:             'Ejecutar análisis',
      chip_legend_title:   'Chips de renta',
      results_title:       'Resultados',
      stats_title:         'Estadísticas del Modelo',
      th_stat:             'Estadístico',
      th_value:            'Valor',
      chart_title:         'IDH vs Probabilidad de Selección',
      chart_note_scatter:  'Los puntos son resultados binarios (0/1); la línea verde es la probabilidad logística ajustada.',
      chart_note_near_linear:'Con un coeficiente de IDH pequeño, la sigmoide ajustada puede verse casi lineal en este rango.',
      roc_title:           'Curva ROC',
      btn_expand_chart:    'Ampliar',
      chart_modal_scatter: 'IDH vs Probabilidad de Selección',
      chart_modal_roc:     'Curva ROC',
      chart_modal_help:    'Dentro del gráfico: rueda/pellizco = zoom, arrastrar = mover, doble clic = reset, Esc = cerrar.',
      chart_modal_help_violin: 'Pasa el ratón sobre los violines o las filas de la tabla para resaltar un grupo; clic en la leyenda para alternar una capa; Esc para cerrar.',
      stat_n_selected:     'Países seleccionados (n₁)',
      stat_n_total:        'Total de países (N)',
      stat_hdi_sel:        'IDH medio — seleccionados',
      stat_hdi_nsel:       'IDH medio — no seleccionados',
      stat_beta0:          'Intercepto (β₀)',
      stat_beta1:          'Coeficiente IDH (β₁)',
      stat_or:             'Odds ratio (exp(β₁))',
      stat_se:             'Error estándar β₁',
      stat_z:              'Estadístico Z',
      stat_pval:           'Valor p',
      stat_auc:            'AUC-ROC',
      sig_yes:             '✔ Significativo (p < 0,05)',
      sig_no:              '✘ No significativo (p ≥ 0,05)',
      interp_pos:          'Los países con mayor IDH tienen significativamente más probabilidades de aparecer en tu lista (β₁ = {b1}, p = {p}). AUC = {auc}.',
      interp_neg:          'Los países con menor IDH tienen significativamente más probabilidades de aparecer en tu lista (β₁ = {b1}, p = {p}). AUC = {auc}.',
      interp_ns:           'No se encontró relación estadísticamente significativa entre el IDH y tu lista (β₁ = {b1}, p = {p}). AUC = {auc}.',
      modal_title:         'Países no reconocidos',
      modal_intro:         'Las siguientes entradas no pudieron identificarse:',
      modal_suggestions:   'Consejo: usa códigos ISO-3 (p. ej. ESP, GBR, DEU) para una coincidencia exacta.',
      modal_close:         'Cerrar',
      tooltip_hdi:         'IDH: {hdi}',
      tooltip_year:        'Año: {year}',
      no_hdi_data:         'Sin datos de IDH',
      results_tab_hdi:     'Sesgo IDH',
      results_tab_income:  'Grupos de renta',
      income_stats_title:  'Representación por grupo de renta',
      income_chart_title:  'Distribución por remuestreo aleatorio vs proporción observada',
      income_chart_y:      'Proporción de países (%)',
      income_chart_ci:     '95% central',
      income_chart_violin: 'Distribución de referencia',
      income_chart_observed: 'Observado en la muestra introducida',
      map_color_hdi:       'IDH',
      map_color_income:    'Renta',
      income_chart_note:   'Violines: distribución de referencia por remuestreo aleatorio — cómo se vería la proporción de cada grupo de renta si tus N países se extrajeran al azar (sin reemplazo) del mundo. Puntos: la proporción observada en la muestra introducida. La banda sombreada marca el 95% central.',
      income_summary_line: '{iterations} submuestreos aleatorios de {n} países (sin reemplazo) extraídos de un universo de {universe} países con clasificación de renta del Banco Mundial.',
      income_th_group:     'Grupo de renta',
      income_th_observed:  'Observado',
      income_th_ci:        '95% central',
      income_outside_ci_title: 'La proporción observada cae fuera del 95% central de la distribución de referencia',
      income_interp_balanced: 'Ningún grupo de renta está sobre- o infra-representado al 95%: cada proporción observada cae dentro del 95% central de la distribución de referencia por remuestreo aleatorio.',
      income_interp_over:  '{group} está sobre-representado en tu muestra ({obs}% vs rango 95% esperado {lo}–{hi}%).',
      income_interp_under: '{group} está infra-representado en tu muestra ({obs}% vs rango 95% esperado {lo}–{hi}%).',
      income_excluded_note: 'Excluidos de este análisis ({count}): {names} — sin clasificación de renta del Banco Mundial.',
      income_error_no_sample: 'Ninguno de los países seleccionados tiene clasificación de renta del Banco Mundial.',
      income_error_no_universe: 'No hay países con datos de grupo de renta disponibles.',
      income_error_sample_too_big: 'El tamaño de muestra supera al universo de grupos de renta — no se puede muestrear sin reemplazo.',
      income_group_low:           'Renta baja',
      income_group_lower_middle:  'Renta media-baja',
      income_group_upper_middle:  'Renta media-alta',
      income_group_high:          'Renta alta',
      income_abbr_low:            'RB',
      income_abbr_lower_middle:   'RMB',
      income_abbr_upper_middle:   'RMA',
      income_abbr_high:           'RA',
      sim_iter_label:      'Iteraciones de simulación',
      run_need_selection:  'Selecciona al menos un país para ejecutar el análisis.',
      sim_status_idle:     '',
      sim_status_running:  'Ejecutando simulación ({iterations} iteraciones)…',
      sim_status_done:     'Listo en {time}.',
      sim_status_error:    'No se pudo ejecutar el análisis.',
      chart_modal_income:  'Representación por grupo de renta',
      footer_unknown:      'Desconocido',
      footer_data_updated: 'Datos de países actualizados por última vez: {date}',
      footer_latest_year:  'Último año de IDH: {year}; último año de grupos de renta: {incomeYear}',
      footer_source_prefix:'Fuente:',
      footer_app_prefix:   'Autor:',
      footer_idea_prefix:  'Idea de:',
      footer_report_problem:'Reportar problema',
      chart_scatter_sel:   'Seleccionados',
      chart_scatter_nsel:  'No seleccionados',
      chart_sigmoid:       'Ajuste sigmoide',
      chart_x:             'Índice de Desarrollo Humano',
      chart_y:             'P(seleccionado)',
      roc_curve:           'Curva ROC',
      roc_random:          'Clasificador aleatorio',
      roc_threshold:       'Umbral',
      roc_x:               'Tasa de Falsos Positivos',
      roc_y:               'Tasa de Verdaderos Positivos',
      export_need_selection:'Selecciona al menos un país antes de exportar.',
    },
  };

  // ── State ─────────────────────────────────────────────────────────
  const initialLang = window.SharedUiCore
    ? window.SharedUiCore.readLangFromUrl(document.documentElement.lang === 'es' ? 'es' : 'en')
    : (document.documentElement.lang === 'es' ? 'es' : 'en');

  let _fallbackLang = initialLang;

  const _i18n = window.SharedI18nCore
    ? window.SharedI18nCore.createI18n(TRANSLATIONS, { initialLang, fallbackLang: 'en' })
    : {
        getLang: () => _fallbackLang,
        setLang: lang => {
          if (lang === 'en' || lang === 'es') _fallbackLang = lang;
          return _fallbackLang;
        },
        t: (key, vars = {}, lang) => {
          const locale = (lang === 'es' || lang === 'en') ? lang : _fallbackLang;
          let str = (TRANSLATIONS[locale] ?? TRANSLATIONS.en)[key] ?? key;
          for (const [k, v] of Object.entries(vars)) {
            str = str.replaceAll(`{${k}}`, v);
          }
          return str;
        },
      };

  // ── Public API ────────────────────────────────────────────────────
  function setLang(lang) {
    _i18n.setLang(lang);
    _applyToDOM();
  }

  function t(key, vars = {}) {
    return _i18n.t(key, vars, _i18n.getLang());
  }

  function getLang() { return _i18n.getLang(); }

  // Apply translations to every [data-i18n] element in the DOM
  function _applyToDOM() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      el.innerHTML = t(el.dataset.i18nHtml);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    const lang = getLang();
    document.title = t('page_title');
    document.documentElement.lang = lang;
    const metaDescription = document.getElementById('meta-description');
    if (metaDescription) metaDescription.setAttribute('content', t('meta_description'));
    const ogTitle = document.getElementById('meta-og-title');
    if (ogTitle) ogTitle.setAttribute('content', t('page_title'));
    const ogDescription = document.getElementById('meta-og-description');
    if (ogDescription) ogDescription.setAttribute('content', t('meta_description'));
    const ogLocale = document.getElementById('meta-og-locale');
    if (ogLocale) ogLocale.setAttribute('content', lang === 'es' ? 'es_ES' : 'en_GB');
    const ogUrl = document.getElementById('meta-og-url');
    if (ogUrl) {
      const langQuery = lang === 'es' ? '?lang=es' : '?lang=en';
      ogUrl.setAttribute('content', `https://enheragu.github.io/psychometric-tools/C-NRSBTool/${langQuery}`);
    }
    const twitterTitle = document.getElementById('meta-twitter-title');
    if (twitterTitle) twitterTitle.setAttribute('content', t('page_title'));
    const twitterDescription = document.getElementById('meta-twitter-description');
    if (twitterDescription) twitterDescription.setAttribute('content', t('meta_description'));
    // Language button states
    if (window.SharedUiCore?.setLangSwitcherState) {
      window.SharedUiCore.setLangSwitcherState(lang, '#lang-switcher');
    } else {
      document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.id === `btn-${lang}`);
      });
      const switcher = document.querySelector('.lang-switcher');
      if (switcher) {
        switcher.classList.toggle('lang-es', lang === 'es');
      }
    }
  }

  return { setLang, t, getLang, applyToDOM: _applyToDOM };
})();
