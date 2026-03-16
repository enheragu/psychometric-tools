(function () {
  if (window.StatToolsLandingI18n) return;

  var translations = {
    en: {
      pageTitle: 'Stat Tools — Research tools landing',
      siteTitle: 'Stat Tools',
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
          desc: 'Check whether your country sample is systematically biased by development level (HDI), with logistic regression, ROC analysis, and interactive selection.'
        },
        dif: {
          title: 'DIF-AccumulationTool',
          desc: 'Explore how small item-level DIF effects can accumulate into meaningful group differences in total test scores.'
        },
        mlVariance: {
          title: 'ML variance analysis',
          desc: 'Open the machine-learning variance analysis category and access tools focused on variance diagnostics and model comparison.'
        }
      }
    },
    es: {
      pageTitle: 'Stat Tools — Portal de herramientas de investigación',
      siteTitle: 'Stat Tools',
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
          desc: 'Comprueba si tu muestra de países está sesgada de forma sistemática por nivel de desarrollo (IDH), con regresión logística, análisis ROC y selección interactiva.'
        },
        dif: {
          title: 'DIF-AccumulationTool',
          desc: 'Explora cómo pequeños efectos DIF por ítem pueden acumularse y acabar generando diferencias relevantes de puntuación total entre grupos.'
        },
        mlVariance: {
          title: 'Análisis de varianza en ML',
          desc: 'Abre la categoría de análisis de varianza en machine learning y accede a herramientas centradas en diagnóstico de varianza y comparación de modelos.'
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
