(function () {
  function getIssueUrl(title) {
    var base = 'https://github.com/enheragu/psychometric-tools/issues/new?template=tool_bug_report.yml';
    if (!title) return base;
    return base + '&title=' + encodeURIComponent('[' + title + '] ');
  }

  function applyReportProblemLink() {
    var reportLink = document.getElementById('footer-report-problem');
    if (!reportLink) return;
    var toolTitle = reportLink.getAttribute('data-tool-title');
    reportLink.setAttribute('href', getIssueUrl(toolTitle));
  }

  function applyRelatedWorkVariant() {
    var relatedRoot = document.getElementById('related-work-root');
    if (!relatedRoot) return;

    relatedRoot.classList.add('related-work-root');
    var contextual = relatedRoot.getAttribute('data-related-contextual') === 'true';
    relatedRoot.classList.toggle('related-work-root-contextual', contextual);
  }

  function init() {
    applyReportProblemLink();
    applyRelatedWorkVariant();
  }

  window.StatToolsPageUtils = {
    init: init,
    applyReportProblemLink: applyReportProblemLink,
    applyRelatedWorkVariant: applyRelatedWorkVariant,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
