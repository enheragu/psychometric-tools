(function () {
  if (window.StatMlvaPageShell) return;

  function buildRelatedWorkConfig(opts) {
    if (!opts || !opts.toolId) return null;
    return {
      toolId: opts.toolId,
      sourceUrl: opts.relatedWorkSourceUrl || '/psychometric-tools/assets/related-work.json',
      publicationsSourceUrl: opts.publicationsSourceUrl || '/psychometric-tools/assets/publications-data.json',
    };
  }

  function defaultApplyTheme(theme, themeButtonId) {
    if (window.SharedUiCore && typeof window.SharedUiCore.setThemeForDocument === 'function') {
      window.SharedUiCore.setThemeForDocument(theme, {
        themeButtonId: themeButtonId || 'btn-theme',
        syncDataTheme: true,
      });
      return;
    }
    document.body.classList.toggle('dark', theme === 'dark');
  }

  function initToolPage(options) {
    var opts = options || {};
    if (!window.SharedToolPageShell || typeof window.SharedToolPageShell.initToolPage !== 'function') {
      return null;
    }

    var themeButtonId = opts.themeButtonId || 'btn-theme';
    var i18nApi = opts.i18nApi && typeof opts.i18nApi === 'object' ? opts.i18nApi : null;

    function getCopy(lang) {
      if (typeof opts.getCopy === 'function') return opts.getCopy(lang);
      if (i18nApi && typeof i18nApi.getCopy === 'function') return i18nApi.getCopy(lang);
      return null;
    }

    function setCopyLang(lang) {
      if (typeof opts.setCopyLang === 'function') {
        opts.setCopyLang(lang);
        return;
      }
      if (i18nApi && typeof i18nApi.setLang === 'function') {
        i18nApi.setLang(lang);
      }
    }

    return window.SharedToolPageShell.initToolPage({
      toolTitle: opts.toolTitle || 'MLVA Tool',
      fallbackLang: opts.fallbackLang || 'en',
      themeButtonId: themeButtonId,
      langSwitcherSelector: opts.langSwitcherSelector || '#lang-switcher',
      getCopy: getCopy,
      setCopyLang: setCopyLang,
      relatedWork: buildRelatedWorkConfig(opts),
      onApplyLanguage: opts.onApplyLanguage,
      onApplyTheme: function (theme) {
        if (typeof opts.onApplyTheme === 'function') {
          opts.onApplyTheme(theme);
          return;
        }
        defaultApplyTheme(theme, themeButtonId);
      },
    });
  }

  window.StatMlvaPageShell = {
    initToolPage: initToolPage,
  };
})();
