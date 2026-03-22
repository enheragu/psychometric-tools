(function () {
  if (window.StatMlvaComparisonI18nCore) return;

  var base = {
    en: {
      pageTitle: 'ML Variance Analysis - Psychometric Tools',
      subtitle: 'Compare models under repeated runs',
      introTitle: 'Variance-aware comparison workspace',
      introText: 'Analyze repeated-run metrics and compare models under uncertainty.',
      caseContextMnist: 'MNIST case uses repeated-run metrics generated externally.',
      caseContextDetection: 'Detection case uses multispectral fusion pipelines from a dedicated utility repository.',
      configTitle: 'Data setup',
      presetLabel: 'Use-case preset',
      metricLabel: 'Metric',
      modelsLabel: 'Models',
      clearAll: 'Clear',
      selectAll: 'Select all',
      chartTitle: 'Histogram + fitted normal',
      expand: 'Expand',
      close: 'Close',
      normalLegendLabel: 'Fitted normal (dotted line)',
      resultsTitle: 'Results',
      prechecksTitle: 'Prechecks',
      officialResultsTitle: 'Results',
      resultsIntro: 'Estimate disorder probability over the selected models, averaging N sampled scores per model.',
      simConfigTitle: 'Simulation setup',
      simConfigText: 'Configure trial counts for Monte Carlo and Bootstrap before running the results.',
      mcTrialsLabel: 'Monte Carlo simulations',
      bsTrialsLabel: 'Bootstrap resamples',
      runSim: 'Compute results',
      thSamples: 'N samples/model',
      thStartCondition: 'Start condition',
      thFixedParam: 'Fixed Param',
      thStartValue: 'Start',
      thPWrongGroup: 'p(!correct order)',
      thPReachBestGroup: 'p(reach global best)',
      thMonteCarlo: 'Monte Carlo',
      thBootstrap: 'Bootstrap',
      thModel: 'Model',
      thMedian: 'Median',
      thMean2: 'Mean',
      thSkewness: 'Skewness',
      thKurtosis: 'Kurtosis (Fisher)',
      thShapiroGroup: 'Shapiro-Wilk',
      thShapiroW: 'W',
      thShapiroP: 'p-value (%)',
      thModelN: 'N',
      modelSummaryTitle: 'Model Summary',
      modelSummarySortHint: 'Click to sort',
      thBestValue: 'Best value',
      thStdDev: 'Std. dev.',
      thNormP90: 'Normal P90',
      resultsMethodNote: 'MC and BS trials are configured above.',
      normalityNote: 'Normality diagnostics justify Monte Carlo representativeness. If diagnostics are weak, Bootstrap is the robust reference.',
      resultsSummary: 'Selected conditions: {count}. Trials: Monte Carlo={mcTrials}, Bootstrap={bsTrials}.',
      simComputing: 'Computing...',
      simApiUnavailable: 'Python API unavailable. Start local API to compute probability tables.',
      simDone: 'Results updated.',
      reportProblem: 'Report problem',
      noData: 'No data available for this selection.',
      notEnoughModels: 'Select at least two models to compute p(!correct order).',
      presetMnist: 'Image Classification - MNIST',
      presetDetection: 'Image Detection - Multispectral Images',
      metricAccuracy: 'Accuracy',
      metricMap50: 'mAP50',
      metricMap5095: 'mAP50-95',
      metricP: 'Precision (P)',
      metricR: 'Recall (R)',
      metricAblationAccuracy: 'Ablation Accuracy',
      metricAblationMap50: 'Ablation mAP50',
      metricAblationMap5095: 'Ablation mAP50-95',
      metricAblationP: 'Ablation Precision (P)',
      metricAblationR: 'Ablation Recall (R)'
    },
    es: {
      pageTitle: 'ML Variance Analysis - Psychometric Tools',
      subtitle: 'Compara modelos bajo ejecuciones repetidas',
      introTitle: 'Espacio de comparacion con varianza',
      introText: 'Analiza metricas repetidas y compara modelos bajo incertidumbre.',
      caseContextMnist: 'El caso MNIST usa metricas de ejecuciones repetidas generadas externamente.',
      caseContextDetection: 'El caso de deteccion usa pipelines de fusion multiespectral desde un repositorio dedicado.',
      configTitle: 'Configuracion',
      presetLabel: 'Preset de caso de uso',
      metricLabel: 'Metrica',
      modelsLabel: 'Modelos',
      clearAll: 'Limpiar',
      selectAll: 'Seleccionar todo',
      chartTitle: 'Histograma + normal ajustada',
      expand: 'Ampliar',
      close: 'Cerrar',
      normalLegendLabel: 'Normal ajustada (linea punteada)',
      resultsTitle: 'Resultados',
      prechecksTitle: 'Prechecks',
      officialResultsTitle: 'Resultados',
      resultsIntro: 'Estima la probabilidad de desorden sobre los modelos seleccionados, promediando N muestras por modelo.',
      simConfigTitle: 'Configuracion de simulacion',
      simConfigText: 'Configura el numero de simulaciones Monte Carlo y remuestreos Bootstrap antes de ejecutar.',
      mcTrialsLabel: 'Simulaciones Monte Carlo',
      bsTrialsLabel: 'Remuestreos Bootstrap',
      runSim: 'Calcular resultados',
      thSamples: 'N muestras/modelo',
      thStartCondition: 'Condicion inicial',
      thFixedParam: 'Parametro fijo',
      thStartValue: 'Inicio',
      thPWrongGroup: 'p(!orden correcto)',
      thPReachBestGroup: 'p(llegar al mejor global)',
      thMonteCarlo: 'Monte Carlo',
      thBootstrap: 'Bootstrap',
      thModel: 'Modelo',
      thMedian: 'Mediana',
      thMean2: 'Media',
      thSkewness: 'Asimetria',
      thKurtosis: 'Curtosis (Fisher)',
      thShapiroGroup: 'Shapiro-Wilk',
      thShapiroW: 'W',
      thShapiroP: 'p-valor (%)',
      thModelN: 'N',
      modelSummaryTitle: 'Resumen de modelos',
      modelSummarySortHint: 'Haz clic para ordenar',
      thBestValue: 'Mejor valor',
      thStdDev: 'Desv. est.',
      thNormP90: 'P90 normal',
      resultsMethodNote: 'Configura arriba las iteraciones MC y BS.',
      normalityNote: 'Los diagnosticos de normalidad justifican la representatividad de Monte Carlo. Si son debiles, Bootstrap es la referencia robusta.',
      resultsSummary: 'Condiciones seleccionadas: {count}. Iteraciones: Monte Carlo={mcTrials}, Bootstrap={bsTrials}.',
      simComputing: 'Calculando...',
      simApiUnavailable: 'API de Python no disponible. Inicia la API local para calcular tablas de probabilidad.',
      simDone: 'Resultados actualizados.',
      reportProblem: 'Reportar problema',
      noData: 'No hay datos disponibles para esta seleccion.',
      notEnoughModels: 'Selecciona al menos dos modelos para calcular p(!orden correcto).',
      presetMnist: 'Clasificacion de imagenes - MNIST',
      presetDetection: 'Deteccion de imagenes - Multiespectral',
      metricAccuracy: 'Accuracy',
      metricMap50: 'mAP50',
      metricMap5095: 'mAP50-95',
      metricP: 'Precision (P)',
      metricR: 'Recall (R)',
      metricAblationAccuracy: 'Ablation Accuracy',
      metricAblationMap50: 'Ablation mAP50',
      metricAblationMap5095: 'Ablation mAP50-95',
      metricAblationP: 'Ablation Precision (P)',
      metricAblationR: 'Ablation Recall (R)'
    }
  };

  function mergeLang(baseLang, overrideLang) {
    var out = {};
    Object.keys(baseLang).forEach(function (k) { out[k] = baseLang[k]; });
    Object.keys(overrideLang || {}).forEach(function (k) { out[k] = overrideLang[k]; });
    return out;
  }

  function create(options) {
    var opts = options || {};
    var overrides = opts.overrides || {};
    var translations = {
      en: mergeLang(base.en, overrides.en || {}),
      es: mergeLang(base.es, overrides.es || {})
    };

    var initialLang = window.SharedUiCore ? window.SharedUiCore.readLangFromUrl('en') : 'en';
    var api = window.SharedI18nCore
      ? window.SharedI18nCore.createI18n(translations, { initialLang: initialLang, fallbackLang: 'en' })
      : {
          getCopy: function (lang) { return translations[lang === 'es' ? 'es' : 'en']; },
          getLang: function () { return initialLang; },
          setLang: function (lang) { initialLang = lang === 'es' ? 'es' : 'en'; return initialLang; },
        };

    return {
      getCopy: api.getCopy,
      getLang: api.getLang,
      setLang: api.setLang,
    };
  }

  window.StatMlvaComparisonI18nCore = {
    create: create,
  };
})();