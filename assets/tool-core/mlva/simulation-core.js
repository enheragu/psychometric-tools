(function () {
  if (window.StatMlvaSimulationCore) return;

  function buildApiPayload(options) {
    var selectedModels = Array.isArray(options && options.selectedModels) ? options.selectedModels : [];
    var dataByModel = (options && options.dataByModel) || {};
    var montecarloTrials = Number(options && options.montecarloTrials) || 20000;
    var bootstrapTrials = Number(options && options.bootstrapTrials) || 20000;
    var nSamplesMin = Number(options && options.nSamplesMin) || 1;
    var nSamplesMax = Number(options && options.nSamplesMax) || 5;
    var pairingMode = String((options && options.pairingMode) || 'unpaired');
    var groupingField = String((options && options.groupingField) || '');
    var analysisMode = String((options && options.analysisMode) || 'auto');
    var conditionMeta = options && options.conditionMeta && typeof options.conditionMeta === 'object'
      ? options.conditionMeta
      : null;

    var metricData = {};
    selectedModels.forEach(function (model) {
      var vals = Array.isArray(dataByModel[model]) ? dataByModel[model] : [];
      metricData[model] = vals.slice();
    });

    return {
      metric_data: metricData,
      selected_models: selectedModels.slice(),
      montecarlo_trials: montecarloTrials,
      bootstrap_trials: bootstrapTrials,
      n_samples_min: nSamplesMin,
      n_samples_max: nSamplesMax,
      pairing_mode: pairingMode,
      grouping_field: groupingField,
      analysis_mode: analysisMode,
      condition_meta: conditionMeta,
    };
  }

  async function requestAnalysis(options) {
    var apiBase = String((options && options.apiBaseUrl) || 'http://localhost:8010').replace(/\/$/, '');
    var endpoint = apiBase + '/api/analysis';
    var timeoutMs = Number(options && options.timeoutMs) || 25000;
    var payload = buildApiPayload(options || {});

    var controller = new AbortController();
    var timeoutId = setTimeout(function () {
      controller.abort();
    }, timeoutMs);

    try {
      var res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error('API analysis request failed');
      return await res.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function createJobTracker() {
    var currentId = 0;
    return {
      bump: function () {
        currentId += 1;
        return currentId;
      },
      current: function () {
        return currentId;
      },
      isCurrent: function (id) {
        return id === currentId;
      },
    };
  }

  function waitNextTick() {
    return new Promise(function (resolve) {
      setTimeout(resolve, 0);
    });
  }

  window.StatMlvaSimulationCore = {
    buildApiPayload: buildApiPayload,
    requestAnalysis: requestAnalysis,
    createJobTracker: createJobTracker,
    waitNextTick: waitNextTick,
  };
})();
