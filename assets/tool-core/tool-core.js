(function () {
  if (window.StatToolCore) return;

  function parseInlineYamlArrayMap(raw) {
    var map = {};
    var order = [];
    var lines = String(raw || '').split(/\r?\n/);

    for (var i = 0; i < lines.length; i += 1) {
      var line = lines[i].trim();
      if (!line || line.charAt(0) === '#') continue;

      var match = line.match(/^([^:#][^:]*)\s*:\s*\[(.*)\]\s*$/);
      if (!match) continue;

      var key = match[1].trim();
      var content = match[2].trim();
      if (!content) {
        map[key] = [];
        order.push(key);
        continue;
      }

      var nums = content
        .split(',')
        .map(function (item) { return Number(item.trim()); })
        .filter(function (n) { return Number.isFinite(n); });

      map[key] = nums;
      order.push(key);
    }

    return { map: map, order: order };
  }

  function applyOrderPolicy(options) {
    var availableModels = Array.isArray(options && options.availableModels)
      ? options.availableModels.slice()
      : [];
    var policy = options ? options.policy : null;
    var yamlOrder = Array.isArray(options && options.yamlOrder) ? options.yamlOrder : [];
    var ranker = options && typeof options.ranker === 'function' ? options.ranker : null;

    if (policy === 'yaml') {
      var filteredYaml = yamlOrder.filter(function (m) {
        return availableModels.indexOf(m) !== -1;
      });

      var remaining = availableModels.filter(function (m) {
        return filteredYaml.indexOf(m) === -1;
      });

      return filteredYaml.concat(remaining);
    }

    if (Array.isArray(policy) && policy.length) {
      var seen = new Set();
      var configured = [];

      policy.forEach(function (m) {
        if (availableModels.indexOf(m) !== -1 && !seen.has(m)) {
          configured.push(m);
          seen.add(m);
        }
      });

      var remainder = availableModels.filter(function (m) {
        return !seen.has(m);
      });

      return configured.concat(remainder);
    }

    if (ranker) return ranker(availableModels);
    return availableModels;
  }

  function resolveAutoselection(options) {
    var orderedModels = Array.isArray(options && options.orderedModels)
      ? options.orderedModels
      : [];
    var policy = options ? options.policy : null;
    var fallbackCount = Number.isFinite(Number(options && options.fallbackCount))
      ? Number(options.fallbackCount)
      : 4;

    if (Array.isArray(policy) && policy.length) {
      var selected = [];
      policy.forEach(function (m) {
        if (orderedModels.indexOf(m) !== -1 && selected.indexOf(m) === -1) {
          selected.push(m);
        }
      });
      return selected;
    }

    var count = Number(policy);
    if (!Number.isFinite(count)) count = fallbackCount;
    count = Math.max(0, Math.floor(count));
    return orderedModels.slice(0, Math.min(count, orderedModels.length));
  }

  window.StatToolCore = {
    parseInlineYamlArrayMap: parseInlineYamlArrayMap,
    applyOrderPolicy: applyOrderPolicy,
    resolveAutoselection: resolveAutoselection,
  };
})();
