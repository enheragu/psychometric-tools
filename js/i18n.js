(function () {
  if (window.StatToolsLandingI18n) return;

  var translations = {
    en: {
      pageTitle: 'Psychometric Tools — Research tools landing',
      siteTitle: 'Psychometric Tools',
      subtitle: 'A practical hub for statistical tools used in applied research',
      introTitle: 'Just pick one of your liking and get started',
      introText: 'Each tool here targets a concrete methodological question. The goal is simple: make solid statistical reasoning easier to apply, explain, and share. Hope you enjoy! :)',
      toolsTitle: 'Psychometric tools',
      mlToolsTitle: 'ML variance analysis',
      reportProblem: 'Report problem',
      toggleTheme: 'Toggle theme',
      cards: {
        cNRSB: {
          title: 'C-NRSBTool',
          desc: 'Check whether your country sample is systematically biased by development level (HDI) or by World Bank income group, with logistic regression, ROC analysis, a random-subsampling reference distribution, and interactive selection.'
        },
        dif: {
          title: 'DIF-AccumulationTool',
          desc: 'Explore how small item-level DIF effects can accumulate into meaningful group differences in total test scores.'
        },
        replicationComparison: {
          title: 'Replication and Comparison',
          desc: 'Compare repeated-run metric distributions, inspect fitted normals, and estimate rank inversion probabilities under single-run sampling.'
        },
        ablationTests: {
          title: 'Ablation Tests',
          desc: 'Evaluate which model components really matter under repeated runs, controlling for variance and ranking instability.'
        },
        standardizingComparisons: {
          title: 'Standardizing Comparisons',
          desc: 'Define consistent comparison protocols so model rankings are fair, reproducible, and less sensitive to variance artifacts.'
        }
      }
    },
    es: {
      pageTitle: 'Psychometric Tools — Portal de herramientas de investigación',
      siteTitle: 'Psychometric Tools',
      subtitle: 'Un hub práctico de herramientas estadísticas para investigación aplicada',
      introTitle: 'Elige la que más te encaje y juega con ella',
      introText: 'Cada herramienta responde a una pregunta metodológica concreta. La idea es simple: hacer que el razonamiento estadístico sólido sea más fácil de aplicar, explicar y compartir. ¡Espero que te guste! :)',
      toolsTitle: 'Herramientas psicométricas',
      mlToolsTitle: 'Análisis de varianza en ML',
      reportProblem: 'Reportar problema',
      toggleTheme: 'Cambiar tema',
      cards: {
        cNRSB: {
          title: 'C-NRSBTool',
          desc: 'Comprueba si tu muestra de países está sesgada de forma sistemática por nivel de desarrollo (IDH) o por grupo de renta del Banco Mundial, con regresión logística, análisis ROC, distribución de referencia por remuestreo aleatorio y selección interactiva.'
        },
        dif: {
          title: 'DIF-AccumulationTool',
          desc: 'Explora cómo pequeños efectos DIF por ítem pueden acumularse y acabar generando diferencias relevantes de puntuación total entre grupos.'
        },
        replicationComparison: {
          title: 'Replication and Comparison',
          desc: 'Compara distribuciones de métricas en repeticiones, inspecciona normales ajustadas y estima probabilidades de inversión de ranking en una sola corrida.'
        },
        ablationTests: {
          title: 'Ablation Tests',
          desc: 'Evalúa qué componentes del modelo aportan realmente bajo ejecuciones repetidas, controlando varianza e inestabilidad de ranking.'
        },
        standardizingComparisons: {
          title: 'Standardizing Comparisons',
          desc: 'Define protocolos de comparación consistentes para que los rankings sean más justos, reproducibles y menos sensibles a artefactos de varianza.'
        }
      }
    }
  };

  var initialLang = window.SharedUiCore ? window.SharedUiCore.readLangFromUrl('en') : 'en';
  var api = window.SharedI18nCore
    ? window.SharedI18nCore.createI18n(translations, { initialLang: initialLang, fallbackLang: 'en' })
    : {
        getCopy: function (lang) { return translations[lang === 'es' ? 'es' : 'en']; },
        getLang: function () { return initialLang; },
        setLang: function (lang) { initialLang = lang === 'es' ? 'es' : 'en'; return initialLang; },
        t: function (key, vars, lang) {
          var locale = lang === 'es' ? 'es' : 'en';
          var text = (translations[locale] && translations[locale][key]) || key;
          var values = vars || {};
          Object.keys(values).forEach(function (token) {
            text = text.replaceAll('{' + token + '}', values[token]);
          });
          return text;
        },
        translations: translations,
      };

  window.StatToolsLandingI18n = {
    getCopy: api.getCopy,
    getLang: api.getLang,
    setLang: api.setLang,
    t: api.t,
    translations: api.translations,
  };
})();
