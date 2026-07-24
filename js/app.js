(function () {
  var tools = [
    {
      key: 'cNRSB',
      section: 'psychometric-tools',
      href: '/psychometric-tools/C-NRSBTool/',
      imageDark: '/psychometric-tools/C-NRSBTool/assets/og-image.svg',
      imageLight: '/psychometric-tools/C-NRSBTool/assets/og-image-light.svg'
    },
    {
      key: 'difAnalysis',
      section: 'psychometric-tools',
      href: '/psychometric-tools/DIF-AnalysisTool/',
      imageDark: '/psychometric-tools/DIF-AnalysisTool/assets/og-image.svg',
      imageLight: '/psychometric-tools/DIF-AnalysisTool/assets/og-image-light.svg'
    },
    {
      key: 'dif',
      section: 'psychometric-tools',
      href: '/psychometric-tools/DIF-AccumulationTool/',
      imageDark: '/psychometric-tools/DIF-AccumulationTool/assets/og-image.svg',
      imageLight: '/psychometric-tools/DIF-AccumulationTool/assets/og-image-light.svg'
    }
  ];

  var landingSections = [
    {
      sectionId: 'psychometric-tools',
      gridId: 'tools-grid',
      catalogUrl: '/psychometric-tools/tools-catalog.json',
    }
  ];

  document.addEventListener('DOMContentLoaded', function () {
    window.SharedToolLandingEngine.create({
      i18nGlobal: 'StatToolsLandingI18n',
      tools: tools,
      landingSections: landingSections,
      fallbackImage: '/psychometric-tools/assets/og-image.png',
      toolsTitleElId: 'tools-title',
      toolsTitleI18nKey: 'toolsTitle',
      relatedWorkSourceUrl: '/psychometric-tools/assets/related-work.json',
    }).init();
  });
})();
