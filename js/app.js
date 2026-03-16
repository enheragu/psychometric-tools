(function () {
  var state = {
    lang: 'en',
    theme: window.SharedUiCore ? window.SharedUiCore.getPreferredTheme() : (localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))
  };

  var tools = [
    {
      key: 'cNRSB',
      section: 'psychometric-tools',
      href: '/stat-tools/psychometric-tools/C-NRSBTool/',
      imageDark: '/stat-tools/psychometric-tools/C-NRSBTool/assets/og-image.svg',
      imageLight: '/stat-tools/psychometric-tools/C-NRSBTool/assets/og-image-light.svg'
    },
    {
      key: 'dif',
      section: 'psychometric-tools',
      href: '/stat-tools/psychometric-tools/DIF-AccumulationTool/',
      imageDark: '/stat-tools/psychometric-tools/DIF-AccumulationTool/assets/og-image.svg',
      imageLight: '/stat-tools/psychometric-tools/DIF-AccumulationTool/assets/og-image-light.svg'
    },
    {
      key: 'mlVariance',
      section: 'ml-variance-analysis',
      href: '/stat-tools/ml-variance-analysis/',
      imageDark: '/stat-tools/assets/og-image.svg',
      imageLight: '/stat-tools/assets/og-image.svg'
    }
  ];

  function readLangFromUrl() {
    if (window.SharedUiCore) return window.SharedUiCore.readLangFromUrl('en');
    var params = new URLSearchParams(window.location.search || '');
    var lang = (params.get('lang') || '').toLowerCase();
    return (lang === 'es' || lang === 'en') ? lang : 'en';
  }

  function applyTheme() {
    var langCopy = window.StatToolsLandingI18n ? window.StatToolsLandingI18n.getCopy(state.lang) : null;
    if (window.SharedUiCore) {
      window.SharedUiCore.applyBodyTheme(state.theme);
    } else {
      document.body.classList.toggle('dark', state.theme === 'dark');
    }
    var button = document.getElementById('btn-theme');
    if (!button) return;
    button.setAttribute('aria-pressed', String(state.theme === 'dark'));
    var toggleThemeLabel = langCopy ? langCopy.toggleTheme : 'Toggle theme';
    button.setAttribute('title', toggleThemeLabel);
    button.setAttribute('aria-label', toggleThemeLabel);
    renderCards();
  }

  function toggleTheme() {
    state.theme = window.SharedUiCore ? window.SharedUiCore.toggleThemeValue(state.theme) : (state.theme === 'dark' ? 'light' : 'dark');
    localStorage.setItem('theme', state.theme);
    var button = document.getElementById('btn-theme');
    if (window.SharedUiCore && button) window.SharedUiCore.animateThemeButton(button, 280);
    applyTheme();
  }

  function withLang(href) {
    var separator = href.indexOf('?') >= 0 ? '&' : '?';
    return href + separator + 'lang=' + encodeURIComponent(state.lang);
  }

  function renderCardsInGrid(gridId, toolList) {
    var grid = document.getElementById(gridId);
    if (!grid) return;

    var cards = toolList.map(function (tool) {
      var i18nCopy = window.StatToolsLandingI18n ? window.StatToolsLandingI18n.getCopy(state.lang) : null;
      var content = i18nCopy ? i18nCopy.cards[tool.key] : { title: tool.key, desc: '' };
      var coverImage = state.theme === 'dark' ? tool.imageDark : (tool.imageLight || tool.imageDark);
      return [
        '<a class="tool-card" href="' + withLang(tool.href) + '">',
        '<img class="tool-cover" src="' + coverImage + '" alt="' + content.title + ' preview" onerror="this.onerror=null;this.src=\'/stat-tools/assets/og-image.svg\';">',
        '<div class="tool-content">',
        '<h3 class="tool-title">' + content.title + '</h3>',
        '<p class="tool-desc">' + content.desc + '</p>',
        '</div>',
        '</a>'
      ].join('');
    }).join('');

    grid.innerHTML = cards;
  }

  function renderCards() {
    renderCardsInGrid('tools-grid', tools.filter(function (tool) { return tool.section === 'psychometric-tools'; }));
    renderCardsInGrid('ml-tools-grid', tools.filter(function (tool) { return tool.section === 'ml-variance-analysis'; }));
  }

  function readSectionFromUrl() {
    var url = new URL(window.location.href);
    var section = (url.searchParams.get('section') || '').trim();
    if (section) return section;
    var hash = (window.location.hash || '').replace(/^#/, '').trim();
    return hash || '';
  }

  function focusSectionFromUrl() {
    var sectionId = readSectionFromUrl();
    if (!sectionId) return;
    var target = document.getElementById(sectionId);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(function () {
      window.scrollBy({ top: -18, left: 0, behavior: 'auto' });
    }, 260);
    target.classList.add('section-focused');
    window.setTimeout(function () {
      target.classList.remove('section-focused');
    }, 1600);
  }

  function renderRelatedWork() {
    var root = document.getElementById('related-work-root');
    if (!root) return;
    if (!window.SharedRelatedWork?.init) {
      root.classList.add('hidden');
      return;
    }
    window.SharedRelatedWork.init({
      container: root,
      toolId: 'Landing',
      lang: state.lang,
      sourceUrl: '/stat-tools/assets/related-work.json',
      publicationsSourceUrl: '/enheragu_github_web_cv/_data/publications.yml',
    });
    var hasContent = root.children.length > 0 || root.textContent.trim().length > 0;
    root.classList.toggle('hidden', !hasContent);
  }

  function applyLanguage() {
    var langCopy = window.StatToolsLandingI18n ? window.StatToolsLandingI18n.getCopy(state.lang) : null;
    if (!langCopy) return;
    document.documentElement.lang = state.lang;
    document.title = langCopy.pageTitle;
    document.getElementById('site-title').textContent = langCopy.siteTitle;
    document.getElementById('site-subtitle').textContent = langCopy.subtitle;
    document.getElementById('intro-title').textContent = langCopy.introTitle;
    document.getElementById('intro-text').textContent = langCopy.introText;
    document.getElementById('tools-title').textContent = langCopy.toolsTitle;
    document.getElementById('ml-tools-title').textContent = langCopy.mlToolsTitle;
    const footerReportProblem = document.getElementById('footer-report-problem');
    if (footerReportProblem) footerReportProblem.textContent = langCopy.reportProblem;
    if (window.SharedFooter?.setLang) window.SharedFooter.setLang(state.lang);

    document.getElementById('btn-en').classList.toggle('active', state.lang === 'en');
    document.getElementById('btn-es').classList.toggle('active', state.lang === 'es');
    document.getElementById('lang-switcher').classList.toggle('lang-es', state.lang === 'es');

    if (window.SharedUiCore) {
      window.SharedUiCore.syncLangInUrl(state.lang);
    } else {
      var url = new URL(window.location.href);
      url.searchParams.set('lang', state.lang);
      window.history.replaceState({}, '', url.toString());
    }

    renderCards();
    applyTheme();
    renderRelatedWork();
  }

  function setLang(lang) {
    state.lang = lang;
    if (window.StatToolsLandingI18n?.setLang) window.StatToolsLandingI18n.setLang(lang);
    applyLanguage();
  }

  function init() {
    state.lang = readLangFromUrl();

    if (window.SharedUiCore?.bindHeaderControls) {
      window.SharedUiCore.bindHeaderControls({
        themeButtonId: 'btn-theme',
        langSwitcherSelector: '#lang-switcher',
        onToggleTheme: toggleTheme,
        onToggleLang: function () {
          setLang(state.lang === 'en' ? 'es' : 'en');
        }
      });
    } else {
      document.getElementById('btn-theme').addEventListener('click', toggleTheme);
      document.getElementById('lang-switcher').addEventListener('click', function () {
        setLang(state.lang === 'en' ? 'es' : 'en');
      });
    }

    applyLanguage();
    focusSectionFromUrl();
  }

  document.addEventListener('DOMContentLoaded', init);
})();