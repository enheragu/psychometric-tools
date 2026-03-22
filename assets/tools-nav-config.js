(function () {
  var baseConfig = {
    showBackButton: true,
    homePath: '/psychometric-tools/',
    currentPath: '/psychometric-tools/',
    preserveLangParam: true,
    backLabel: { en: 'Back to landing', es: 'Volver al inicio' },
    menuSections: [
      {
        items: [
          { href: '/psychometric-tools/', label: { en: 'Main page', es: 'Página principal' } }
        ]
      },
      {
        title: { en: 'Psychometric tools', es: 'Herramientas psicométricas' },
        items: [
          { href: '/psychometric-tools/C-NRSBTool/', label: 'C-NRSBTool' },
          { href: '/psychometric-tools/DIF-AccumulationTool/', label: 'DIF-AccumulationTool' }
        ]
      }
    ]
  };

  var pageConfig = window.StatToolsNavPageConfig || {};
  var resolved = Object.assign({}, baseConfig, pageConfig);

  if (!Object.prototype.hasOwnProperty.call(pageConfig, 'menuSections')) {
    resolved.menuSections = baseConfig.menuSections;
  }

  if (!Object.prototype.hasOwnProperty.call(pageConfig, 'backLabel')) {
    resolved.backLabel = baseConfig.backLabel;
  }

  window.ToolsNavConfig = resolved;
})();
