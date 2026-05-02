(function () {
  if (window.DIFAnalysisApp) return;

  var state = {
    lang: 'en',
    parsed: null,
    groupVar: null,
    nestedVar: null,
    nestedFilter: null,
    groupRef: null,
    groupFoc: null,
    itemType: 'auto',
    method: 'both',
    orThreshold: 1.25,
    pThreshold: 0.05,
    maxIter: 50,
    mhResults: null,
    tswResults: null,
    running: false,
  };

  var t = function (key, vars) {
    return window.DIFAnalysisI18n ? window.DIFAnalysisI18n.t(key, vars) : key;
  };

  // ── DOM refs ─────────────────────────────────────────────────────────────

  function $(id) { return document.getElementById(id); }

  // ── i18n update ──────────────────────────────────────────────────────────

  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      el.innerHTML = t(el.dataset.i18nHtml);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    var methodDesc = $('dif-method-desc');
    if (methodDesc) {
      var checked = document.querySelector('input[name="dif-method"]:checked');
      var method = checked ? checked.value : 'both';
      methodDesc.innerHTML = t('method_desc_' + method);
    }
  }

  // ── Progress bar ──────────────────────────────────────────────────────────

  function setProgress(pct, text) {
    var bar = $('dif-progress-bar');
    var label = $('dif-progress-label');
    var section = $('dif-progress-section');
    if (!bar) return;
    if (section) section.classList.remove('hidden');
    bar.style.width = Math.min(100, Math.max(0, pct)) + '%';
    bar.setAttribute('aria-valuenow', pct);
    if (label) label.textContent = text || '';
  }

  function hideProgress() {
    var section = $('dif-progress-section');
    if (section) section.classList.add('hidden');
  }

  // ── Warnings ─────────────────────────────────────────────────────────────

  function showWarning(id, text) {
    var zone = $('dif-warnings');
    if (!zone) return;
    var existing = document.getElementById('warn-' + id);
    if (existing) { existing.querySelector('.warn-text').textContent = text; return; }
    var div = document.createElement('div');
    div.id = 'warn-' + id;
    div.className = 'dif-warning';
    div.innerHTML = '<span class="warn-icon">⚠</span><span class="warn-text"></span>';
    div.querySelector('.warn-text').textContent = text;
    zone.appendChild(div);
    zone.classList.remove('hidden');
  }

  function clearWarnings() {
    var zone = $('dif-warnings');
    if (zone) { zone.innerHTML = ''; zone.classList.add('hidden'); }
  }

  // ── File upload ───────────────────────────────────────────────────────────

  function handleFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      var delimSel = $('dif-delimiter');
      var delimOverride = delimSel ? delimSel.value : null;
      var parsed = window.DIFData.parse(e.target.result, delimOverride === 'auto' ? null : delimOverride);
      if (parsed.error) {
        setStatus(t('file_error_' + parsed.error) || t('file_error'), 'error');
        return;
      }
      state.parsed = parsed;
      updateAfterParse(file.name);
    };
    reader.readAsText(file);
  }

  function updateAfterParse(fileName) {
    var p = state.parsed;
    var dims = Object.keys(p.dimensions);
    setStatus(t('file_loaded', { name: fileName, rows: p.nRows, items: p.itemNames.length, dims: dims.length }), 'ok');

    // Enable selects now that data is loaded
    ['dif-group-var', 'dif-group-ref', 'dif-group-foc', 'dif-nested-var', 'dif-item-type'].forEach(function (id) {
      var el = $(id); if (el) el.disabled = false;
    });

    // Populate group variable selector
    var groupSel = $('dif-group-var');
    if (groupSel) {
      groupSel.innerHTML = '';
      p.metaColNames.forEach(function (name) {
        var opt = document.createElement('option');
        opt.value = name; opt.textContent = name;
        groupSel.appendChild(opt);
      });
      state.groupVar = p.metaColNames[0] || null;
      updateGroupValues();
    }

    // Populate nested var selector
    var nestedSel = $('dif-nested-var');
    if (nestedSel) {
      nestedSel.innerHTML = '<option value="">—</option>';
      p.metaColNames.forEach(function (name) {
        var opt = document.createElement('option');
        opt.value = name; opt.textContent = name;
        nestedSel.appendChild(opt);
      });
      state.nestedVar = null;
    }

    // Item type auto-detect display
    var typeSel = $('dif-item-type');
    if (typeSel && state.itemType === 'auto') {
      var detected = document.getElementById('dif-type-detected');
      if (detected) detected.textContent = p.detectedType === 'dichot' ? t('item_type_dichot') : t('item_type_polytomus');
    }

    $('dif-run-btn') && ($('dif-run-btn').disabled = false);
    clearWarnings();
    hideResults();
  }

  function updateGroupValues() {
    if (!state.parsed || !state.groupVar) return;
    var vals = window.DIFData.groupValues(state.parsed.metaCols, state.groupVar);
    var col = state.parsed.metaCols[state.groupVar] || [];
    var counts = {};
    col.forEach(function (v) { counts[v] = (counts[v] || 0) + 1; });
    var byCount = vals.slice().sort(function (a, b) { return (counts[b] || 0) - (counts[a] || 0); });
    var defRef = byCount[0] || null;
    var defFoc = byCount[1] || byCount[0] || null;
    var refSel = $('dif-group-ref');
    var focSel = $('dif-group-foc');
    if (!refSel || !focSel) return;
    refSel.innerHTML = ''; focSel.innerHTML = '';
    vals.forEach(function (v) {
      var o1 = document.createElement('option'); o1.value = v; o1.textContent = v;
      var o2 = document.createElement('option'); o2.value = v; o2.textContent = v;
      if (v === defRef) o1.selected = true;
      if (v === defFoc) o2.selected = true;
      refSel.appendChild(o1); focSel.appendChild(o2);
    });
    var allOpt = document.createElement('option');
    allOpt.value = '__all__';
    allOpt.setAttribute('data-i18n', 'group_foc_all');
    allOpt.textContent = t('group_foc_all');
    focSel.appendChild(allOpt);
    state.groupRef = defRef;
    state.groupFoc = defFoc;
    updateNestedFilter();
  }

  function updateNestedFilter() {
    var filterWrap = $('dif-nested-filter-wrap');
    var filterSel = $('dif-nested-filter');
    if (!filterWrap || !filterSel) return;
    if (!state.nestedVar || !state.parsed) {
      filterWrap.classList.add('hidden'); return;
    }
    filterWrap.classList.remove('hidden');
    var vals = window.DIFData.groupValues(state.parsed.metaCols, state.nestedVar);
    filterSel.innerHTML = '<option value="">' + t('nested_filter_all') + '</option>';
    vals.forEach(function (v) {
      var opt = document.createElement('option'); opt.value = v; opt.textContent = v;
      filterSel.appendChild(opt);
    });
  }

  // ── Analysis ──────────────────────────────────────────────────────────────

  function readConfig() {
    state.groupVar = ($('dif-group-var') || {}).value || state.groupVar;
    state.groupRef = ($('dif-group-ref') || {}).value || state.groupRef;
    state.groupFoc = ($('dif-group-foc') || {}).value || state.groupFoc;
    state.nestedVar = ($('dif-nested-var') || {}).value || null;
    state.nestedFilter = ($('dif-nested-filter') || {}).value || null;
    var methodEl = document.querySelector('input[name="dif-method"]:checked');
    state.method = methodEl ? methodEl.value : 'both';
    state.orThreshold = parseFloat(($('dif-or-thr') || {}).value) || 1.25;
    state.pThreshold = parseFloat(($('dif-p-thr') || {}).value) || 0.05;
    state.maxIter = parseInt(($('dif-max-iter') || {}).value, 10) || 50;
    var typeSel = $('dif-item-type');
    state.itemType = typeSel ? typeSel.value : 'auto';
    if (state.itemType === 'auto') state.itemType = (state.parsed && state.parsed.detectedType) || 'polytomus';
  }

  function runAnalysis() {
    if (state.running || !state.parsed) return;
    readConfig();

    if (!state.groupVar || !state.groupRef || !state.groupFoc) {
      setStatus(t('file_error'), 'error'); return;
    }
    if (state.groupRef === state.groupFoc) {
      setStatus(t('file_error'), 'error'); return;
    }

    state.running = true;
    state.mhResults = null;
    state.tswResults = null;
    var btn = $('dif-run-btn');
    if (btn) btn.disabled = true;
    setSimStatus(t('loading_pyodide'), true);
    clearWarnings();
    hideResults();

    var t0 = Date.now();
    setProgress(0, t('loading_pyodide'));

    // Determine iterations: pairwise multi-focal OR nested levels
    var iterations;
    var iterLabel;
    if (state.groupFoc === '__all__') {
      var allFocs = window.DIFData.groupValues(state.parsed.metaCols, state.groupVar)
        .filter(function (v) { return String(v) !== String(state.groupRef); });
      if (allFocs.length === 0) {
        setStatus(t('file_error'), 'error');
        state.running = false;
        if (btn) btn.disabled = false;
        return;
      }
      iterations = allFocs.map(function (foc) { return { level: foc, nestedLevel: null, groupFoc: foc }; });
      iterLabel = t('group_foc_label');
    } else {
      var nestedLevels;
      if (state.nestedVar && !state.nestedFilter) {
        nestedLevels = window.DIFData.groupValues(state.parsed.metaCols, state.nestedVar);
      } else {
        nestedLevels = [state.nestedFilter || null];
      }
      iterations = nestedLevels.map(function (lv) { return { level: lv, nestedLevel: lv, groupFoc: state.groupFoc }; });
      iterLabel = state.nestedVar;
    }
    var totalLevels = iterations.length;
    var allLevelResults = [];

    function runLevel(idx) {
      if (idx >= totalLevels) {
        renderAllResults(allLevelResults, iterLabel);
        showResultsSection();
        var elapsed = ((Date.now() - t0) / 1000).toFixed(1) + 's';
        var doneMsg = t('done', { time: elapsed });
        setProgress(100, doneMsg);
        setSimStatus(doneMsg, false, 'ok');
        setTimeout(hideProgress, 3000);
        state.running = false;
        if (btn) btn.disabled = false;
        return;
      }

      var iter = iterations[idx];
      var level = iter.level;
      var groupFoc = iter.groupFoc;
      var levelPrefix = totalLevels > 1 ? '[' + level + '] ' : '';
      var levelBasePct = Math.round(100 * idx / totalLevels);
      var levelSpan = Math.round(100 / totalLevels);

      var parsedFiltered = iter.nestedLevel !== null
        ? window.DIFData.filterByNested(state.parsed, state.nestedVar, iter.nestedLevel)
        : state.parsed;

      var refCount = (parsedFiltered.metaCols[state.groupVar] || []).filter(function (v) { return String(v) === String(state.groupRef); }).length;
      var focCount = (parsedFiltered.metaCols[state.groupVar] || []).filter(function (v) { return String(v) === String(groupFoc); }).length;

      var doMH = (state.method === 'mh' || state.method === 'both');
      var doTSW = (state.method === 'tsw' || state.method === 'both');
      if (doTSW && (refCount < 800 || focCount < 800)) {
        showWarning('tsw_small_' + idx, t('warn_tsw_small', { pair: state.groupRef + '/' + groupFoc }) + (level ? ' (' + level + ')' : ''));
        doTSW = false;
        if (!doMH) doMH = true;
      }

      var payload = window.DIFData.buildPayload(parsedFiltered, {
        groupVar: state.groupVar,
        groupRef: state.groupRef,
        groupFoc: groupFoc,
        itemType: state.itemType,
        orThreshold: state.orThreshold,
        pThreshold: state.pThreshold,
        maxIter: state.maxIter,
      });

      var dims = parsedFiltered.dimensions;
      var dimKeys = Object.keys(dims);
      var dimTotal = dimKeys.length;
      var dimDone = 0;

      function levelProgress(phasePct, msg) {
        setProgress(levelBasePct + Math.round(levelSpan * phasePct / 100), msg);
        setSimStatus(msg, true);
      }

      var mhPromise = doMH
        ? window.DIFMHRunner.runAll(payload, dims, function (dim) {
            levelProgress(Math.round(50 * dimDone / dimTotal), levelPrefix + t('running_mh', { dim: dim }));
          }).then(function (results) {
            dimDone = dimTotal;
            return results;
          })
        : Promise.resolve(null);

      mhPromise.then(function (mhResults) {
        var anchorsByDim = {};
        dimKeys.forEach(function (dim) {
          var dr = mhResults && mhResults.find(function (r) { return r.dimension === dim; });
          anchorsByDim[dim] = dr ? dr.anchor_items : dims[dim];
        });

        var tswDimDone = 0;
        var tswPromise = doTSW
          ? window.DIFTSWRunner.runAll(payload, dims, anchorsByDim, function (dim, done, total) {
              if (done === total) tswDimDone++;
              var base = doMH ? 50 : 0;
              var span = doMH ? 50 : 100;
              levelProgress(base + Math.round(span * tswDimDone / dimTotal), levelPrefix + t('running_tsw', { dim: dim, i: done, n: total }));
            })
          : Promise.resolve(null);

        tswPromise.then(function (tswResults) {
          if (doMH) state.mhResults = mhResults;
          if (doTSW) state.tswResults = tswResults;
          allLevelResults.push({ level: level, mhResults: mhResults, tswResults: tswResults, dims: dims, doMH: doMH, doTSW: doTSW });
          runLevel(idx + 1);
        }).catch(onError);
      }).catch(onError);
    }

    function onError(err) {
      console.error('[DIFAnalysis]', err);
      setStatus(t('status_error'), 'error');
      setSimStatus(t('status_error'), false, 'error');
      hideProgress();
      state.running = false;
      if (btn) btn.disabled = false;
    }

    runLevel(0);
  }

  // ── Results rendering ─────────────────────────────────────────────────────

  function hideResults() {
    var s = document.getElementById('dif-results-section');
    if (s) s.classList.add('hidden');
    var mh = $('dif-mh-results'); if (mh) mh.innerHTML = '';
    var tsw = $('dif-tsw-results'); if (tsw) tsw.innerHTML = '';
    var multi = $('dif-multilevel-results'); if (multi) multi.remove();
  }

  function showResultsSection() {
    var s = document.getElementById('dif-results-section');
    if (s) s.classList.remove('hidden');
  }

  function fmtNum(v, digits) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    var n = Number(v);
    var d = digits !== undefined ? digits : 3;
    if (n !== 0 && Math.abs(n) < 0.5 * Math.pow(10, -d)) return n.toExponential(2);
    return n.toFixed(d);
  }

  function fmtArr(arr) {
    if (!arr || !arr.length) return '—';
    return arr.map(function (v) { return fmtNum(v, 2); }).join(', ');
  }

  function variantBadge(isVariant) {
    var cls = isVariant ? 'badge-variant' : 'badge-invariant';
    var lbl = isVariant ? t('label_variant') : t('label_invariant');
    return '<span class="dif-badge ' + cls + '">' + lbl + '</span>';
  }

  function renderMHResults(resultsArr, dims, container) {
    if (!container) container = $('dif-mh-results');
    if (!container) return;
    container.innerHTML = '';

    var allItems = [];
    resultsArr.forEach(function (dimResult) {
      (dimResult.results || []).forEach(function (r) { allItems.push({ dim: dimResult.dimension, r: r }); });
    });

    if (allItems.length === 0) { container.textContent = '—'; return; }

    Object.keys(dims).forEach(function (dim) {
      var dimItems = allItems.filter(function (x) { return x.dim === dim; });
      if (!dimItems.length) return;

      var dimResult = resultsArr.find(function (r) { return r.dimension === dim; });
      var iters = dimResult ? dimResult.iterations : 0;
      var conv = dimResult ? dimResult.converged : false;
      var iterNote = conv ? t('converged', { n: iters }) : t('not_converged', { n: iters });

      var section = document.createElement('div');
      section.className = 'dif-dim-section';
      section.innerHTML = '<h4 class="dif-dim-title">Dimension ' + dim + ' <span class="dif-iter-note">' + iterNote + '</span></h4>';

      var tbl = document.createElement('table');
      tbl.className = 'shared-results-table shared-results-table--hover shared-results-table--num';
      tbl.innerHTML = '<thead><tr>' +
        '<th class="shared-cell-text">' + t('col_item') + '</th>' +
        '<th title="' + t('col_or_hint') + '">' + t('col_or') + '</th>' +
        '<th title="' + t('col_p_raw_hint') + '">' + t('col_p_raw') + '</th>' +
        '<th title="' + t('col_p_adj_hint') + '">' + t('col_p_adj') + '</th>' +
        '<th title="' + t('col_variant_hint') + '">' + t('col_variant') + '</th>' +
        '</tr></thead><tbody></tbody>';

      var tbody = tbl.querySelector('tbody');
      dimItems.forEach(function (x) {
        var r = x.r;
        var tr = document.createElement('tr');
        if (r.variant) tr.classList.add('row-variant');
        tr.innerHTML =
          '<td class="cell-item shared-cell-text">' + r.item + '</td>' +
          '<td>' + fmtNum(r.or, 3) + '</td>' +
          '<td>' + fmtNum(r.p_raw, 4) + '</td>' +
          '<td>' + fmtNum(r.p_adj, 4) + '</td>' +
          '<td>' + variantBadge(r.variant) + '</td>';
        tbody.appendChild(tr);
      });

      var tblWrap = document.createElement('div');
      tblWrap.className = 'shared-results-table-wrap';
      tblWrap.appendChild(tbl);
      section.appendChild(tblWrap);
      var exportBtn = document.createElement('button');
      exportBtn.className = 'btn-secondary btn-sm dif-export-btn';
      exportBtn.textContent = t('export_csv');
      exportBtn.addEventListener('click', function () { exportMHCSV(dim, dimItems); });
      section.appendChild(exportBtn);
      container.appendChild(section);
    });
  }

  function renderTSWResults(resultsArr, dims, container) {
    if (!container) container = $('dif-tsw-results');
    if (!container) return;
    container.innerHTML = '';

    if (!resultsArr || !resultsArr.length) return;

    Object.keys(dims).forEach(function (dim) {
      var dimResult = resultsArr.find(function (r) { return r.dimension === dim; });
      if (!dimResult) return;

      var conv = dimResult.converged;
      var iters = dimResult.iterations;
      var iterNote = conv ? t('converged', { n: iters }) : t('not_converged', { n: iters });

      var section = document.createElement('div');
      section.className = 'dif-dim-section';
      section.innerHTML = '<h4 class="dif-dim-title">Dimension ' + dim + ' <span class="dif-iter-note">' + iterNote + '</span></h4>';

      var tbl = document.createElement('table');
      tbl.className = 'shared-results-table shared-results-table--hover shared-results-table--num';
      tbl.innerHTML = '<thead><tr>' +
        '<th class="shared-cell-text">' + t('col_item') + '</th>' +
        '<th title="' + t('col_a_ref_hint') + '">' + t('col_a_ref') + '</th>' +
        '<th title="' + t('col_b_ref_hint') + '">' + t('col_b_ref') + '</th>' +
        '<th title="' + t('col_a_foc_hint') + '">' + t('col_a_foc') + '</th>' +
        '<th title="' + t('col_b_foc_hint') + '">' + t('col_b_foc') + '</th>' +
        '<th title="' + t('col_sids_hint') + '">' + t('col_sids') + '</th>' +
        '<th title="' + t('col_uids_hint') + '">' + t('col_uids') + '</th>' +
        '<th title="' + t('col_dmax_hint') + '">' + t('col_dmax') + '</th>' +
        '<th title="' + t('col_essd_hint') + '">' + t('col_essd') + '</th>' +
        '<th title="' + t('col_tsw_stat_hint') + '">' + t('col_tsw_stat') + '</th>' +
        '<th title="' + t('col_tsw_p_hint') + '">' + t('col_tsw_p') + '</th>' +
        '<th title="' + t('col_variant_hint') + '">' + t('col_variant') + '</th>' +
        '</tr></thead><tbody></tbody>';

      var tbody = tbl.querySelector('tbody');
      (dimResult.results || []).forEach(function (r) {
        if (r.error) {
          var tr = document.createElement('tr');
          tr.innerHTML = '<td class="cell-item shared-cell-text">' + r.item + '</td><td colspan="11" class="cell-error">—</td>';
          tbody.appendChild(tr);
          return;
        }
        var tr = document.createElement('tr');
        if (r.variant) tr.classList.add('row-variant');
        tr.innerHTML =
          '<td class="cell-item shared-cell-text">' + r.item + '</td>' +
          '<td>' + fmtNum(r.a_ref, 2) + '</td>' +
          '<td class="cell-b">' + fmtArr(r.b_ref) + '</td>' +
          '<td>' + fmtNum(r.a_foc, 2) + '</td>' +
          '<td class="cell-b">' + fmtArr(r.b_foc) + '</td>' +
          '<td>' + fmtNum(r.sids, 3) + '</td>' +
          '<td>' + fmtNum(r.uids, 3) + '</td>' +
          '<td>' + fmtNum(r.dmax, 3) + '</td>' +
          '<td>' + fmtNum(r.essd, 3) + '</td>' +
          '<td>' + fmtNum(r.G2, 2) + '</td>' +
          '<td>' + fmtNum(r.p_adj, 4) + '</td>' +
          '<td>' + variantBadge(r.variant) + '</td>';
        tbody.appendChild(tr);
      });

      var tblWrap = document.createElement('div');
      tblWrap.className = 'shared-results-table-wrap';
      tblWrap.appendChild(tbl);
      section.appendChild(tblWrap);

      // Per-dimension test-level summary
      if (dimResult.test_level) {
        var tl = dimResult.test_level;
        var tlDiv = document.createElement('div');
        tlDiv.className = 'dif-testlevel';
        tlDiv.innerHTML =
          '<div class="tl-metric"><span class="tl-label" title="' + t('tsw_stds_hint') + '">STDS</span><span class="tl-val">' + fmtNum(tl.stds, 3) + '</span></div>' +
          '<div class="tl-metric"><span class="tl-label" title="' + t('tsw_utds_hint') + '">UTDS</span><span class="tl-val">' + fmtNum(tl.utds, 3) + '</span></div>' +
          '<div class="tl-metric"><span class="tl-label" title="' + t('tsw_etsd_hint') + '">ETSD</span><span class="tl-val">' + fmtNum(tl.etsd, 3) + '</span></div>' +
          '<div class="tl-metric"><span class="tl-label" title="' + t('tsw_uetsd_hint') + '">UETSD</span><span class="tl-val">' + fmtNum(tl.uetsd, 3) + '</span></div>';
        section.appendChild(tlDiv);
      }

      var exportBtn = document.createElement('button');
      exportBtn.className = 'btn-secondary btn-sm dif-export-btn';
      exportBtn.textContent = t('export_csv');
      exportBtn.addEventListener('click', function () { exportTSWCSV(dim, dimResult.results); });
      section.appendChild(exportBtn);
      container.appendChild(section);
    });

  }

  // ── Multi-level results rendering ─────────────────────────────────────────

  function buildLevelPanel(levelResult) {
    var wrapper = document.createElement('div');
    wrapper.className = 'dif-nested-panel';

    function addMethodPanel(label, results, renderFn) {
      var sec = document.createElement('section');
      sec.className = 'panel widget-box-primary';

      var header = document.createElement('div');
      header.className = 'panel-header';

      var title = document.createElement('h2');
      title.className = 'shared-panel-title';
      title.textContent = label + ' — ' + levelResult.level;

      header.appendChild(title);
      sec.appendChild(header);

      var body = document.createElement('div');
      body.className = 'dif-results-body';

      var inner = document.createElement('div');
      inner.className = 'dif-results-inner';
      renderFn(results, levelResult.dims, inner);
      body.appendChild(inner);
      sec.appendChild(body);

      wrapper.appendChild(sec);
    }

    if (levelResult.doMH && levelResult.mhResults) addMethodPanel(t('mh_results_title'), levelResult.mhResults, renderMHResults);
    if (levelResult.doTSW && levelResult.tswResults) addMethodPanel(t('tsw_results_title'), levelResult.tswResults, renderTSWResults);

    return wrapper;
  }

  function renderAllResults(allLevelResults, iterLabel) {
    var isMulti = allLevelResults.length > 1;
    var mhPanel = $('dif-mh-panel');
    var tswPanel = $('dif-tsw-panel');

    if (!isMulti) {
      var r = allLevelResults[0];
      if (r.mhResults) renderMHResults(r.mhResults, r.dims);
      if (r.tswResults) renderTSWResults(r.tswResults, r.dims);
      if (mhPanel) mhPanel.classList.toggle('hidden', !r.doMH);
      if (tswPanel) tswPanel.classList.toggle('hidden', !r.doTSW);
      return;
    }

    if (mhPanel) mhPanel.classList.add('hidden');
    if (tswPanel) tswPanel.classList.add('hidden');

    var section = document.getElementById('dif-results-section');
    var multiDiv = document.createElement('div');
    multiDiv.id = 'dif-multilevel-results';

    // ── Nav strip ──────────────────────────────────────────────────
    var nav = document.createElement('div');
    nav.className = 'dif-nested-nav';

    var navLabel = document.createElement('label');
    navLabel.className = 'dif-nested-nav-label';
    navLabel.setAttribute('for', 'dif-nested-pick');
    navLabel.textContent = (iterLabel || '') + ':';

    var pick = document.createElement('select');
    pick.id = 'dif-nested-pick';
    pick.className = 'dif-nested-pick';

    var counter = document.createElement('span');
    counter.className = 'dif-nested-counter';
    counter.textContent = '1 / ' + allLevelResults.length;

    allLevelResults.forEach(function (r, i) {
      var opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = r.level;
      pick.appendChild(opt);
    });

    nav.appendChild(navLabel);
    nav.appendChild(pick);
    nav.appendChild(counter);
    multiDiv.appendChild(nav);

    // ── Pre-render all level panels ────────────────────────────────
    var levelPanels = allLevelResults.map(function (r, i) {
      var panel = buildLevelPanel(r);
      if (i !== 0) panel.classList.add('hidden');
      multiDiv.appendChild(panel);
      return panel;
    });

    pick.addEventListener('change', function () {
      var idx = parseInt(pick.value, 10);
      levelPanels.forEach(function (p, i) { p.classList.toggle('hidden', i !== idx); });
      counter.textContent = (idx + 1) + ' / ' + allLevelResults.length;
    });

    section.appendChild(multiDiv);
  }

  // ── CSV export ────────────────────────────────────────────────────────────

  function exportMHCSV(dim, dimItems) {
    var header = ['Item', 'Dimension', 'OR', 'p_raw', 'p_adj', 'Variant'];
    var rows = dimItems.map(function (x) {
      var r = x.r;
      return [r.item, dim, r.or, r.p_raw, r.p_adj, r.variant ? 1 : 0].join(',');
    });
    downloadCSV('MH_' + dim + '.csv', [header.join(',')].concat(rows).join('\n'));
  }

  function exportTSWCSV(dim, results) {
    var header = ['Item', 'Dimension', 'a_ref', 'b_ref', 'a_foc', 'b_foc', 'SIDS', 'UIDS', 'Dmax', 'ESSD', 'G2', 'p_adj', 'Variant'];
    var rows = (results || []).filter(function (r) { return !r.error; }).map(function (r) {
      return [r.item, dim, r.a_ref, (r.b_ref || []).join(';'), r.a_foc, (r.b_foc || []).join(';'), r.sids, r.uids, r.dmax, r.essd, r.G2, r.p_adj, r.variant ? 1 : 0].join(',');
    });
    downloadCSV('TSW_' + dim + '.csv', [header.join(',')].concat(rows).join('\n'));
  }

  function downloadCSV(filename, content) {
    var blob = new Blob([content], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // ── Status line ───────────────────────────────────────────────────────────

  function setStatus(text, kind) {
    var el = $('dif-status');
    if (!el) return;
    el.textContent = text;
    el.className = 'dif-status dif-status--' + (kind || 'idle');
  }

  function setSimStatus(text, isBusy, type) {
    if (window.SharedSimStatus) window.SharedSimStatus.set('sim-progress', text, isBusy, type);
  }

  // ── Event wiring ──────────────────────────────────────────────────────────

  function wireEvents() {
    var dropZone = $('dif-drop-zone');
    var fileInput = $('dif-file-input');
    var browseBtn = $('dif-browse-btn');

    if (dropZone) {
      dropZone.addEventListener('dragover', function (e) { e.preventDefault(); dropZone.classList.add('dragover'); });
      dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('dragover'); });
      dropZone.addEventListener('drop', function (e) {
        e.preventDefault(); dropZone.classList.remove('dragover');
        var file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      });
      dropZone.addEventListener('click', function () { if (fileInput) fileInput.click(); });
    }

    if (browseBtn && fileInput) {
      browseBtn.addEventListener('click', function (e) { e.stopPropagation(); fileInput.click(); });
    }

    var loadExBtn = $('dif-load-example-btn');
    if (loadExBtn) {
      loadExBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        setStatus(t('load_example_loading'), 'idle');
        fetch('/psychometric-tools/DIF-AnalysisTool/sample_data/riasec.csv')
          .then(function (r) { return r.text(); })
          .then(function (text) {
            var parsed = window.DIFData.parse(text);
            if (parsed.error) { setStatus(t('file_error_' + parsed.error) || t('file_error'), 'error'); return; }
            state.parsed = parsed;
            updateAfterParse('riasec.csv');
          })
          .catch(function () { setStatus(t('file_error'), 'error'); });
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', function () {
        if (fileInput.files[0]) handleFile(fileInput.files[0]);
      });
    }

    var groupSel = $('dif-group-var');
    if (groupSel) {
      groupSel.addEventListener('change', function () {
        state.groupVar = groupSel.value;
        updateGroupValues();
      });
    }

    var refSel = $('dif-group-ref');
    var focSel = $('dif-group-foc');
    if (refSel) refSel.addEventListener('change', function () { state.groupRef = refSel.value; });
    if (focSel) focSel.addEventListener('change', function () { state.groupFoc = focSel.value; });

    var nestedSel = $('dif-nested-var');
    if (nestedSel) {
      nestedSel.addEventListener('change', function () {
        state.nestedVar = nestedSel.value || null;
        updateNestedFilter();
      });
    }

    function updateMethodDesc() {
      var el = $('dif-method-desc');
      if (!el) return;
      var checked = document.querySelector('input[name="dif-method"]:checked');
      var method = checked ? checked.value : 'both';
      el.innerHTML = t('method_desc_' + method);
    }
    document.querySelectorAll('input[name="dif-method"]').forEach(function (r) {
      r.addEventListener('change', updateMethodDesc);
    });
    updateMethodDesc();

    var runBtn = $('dif-run-btn');
    if (runBtn) runBtn.addEventListener('click', runAnalysis);

    var dlExampleBtn = $('dif-dl-example-btn');
    if (dlExampleBtn) {
      dlExampleBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        window.open('/psychometric-tools/DIF-AnalysisTool/sample_data/riasec.csv');
      });
    }

    var dlMhBtn = $('dif-dl-mh-btn');
    if (dlMhBtn) {
      dlMhBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        window.open('/psychometric-tools/DIF-AnalysisTool/sample_data/MH_cult_stats_BB25.csv');
      });
    }

    var dlIrtBtn = $('dif-dl-irt-btn');
    if (dlIrtBtn) {
      dlIrtBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        window.open('/psychometric-tools/DIF-AnalysisTool/sample_data/variant_parameters_gen.csv');
      });
    }
  }

  // ── Boot ──────────────────────────────────────────────────────────────────

  function init() {
    var shell = null;
    if (window.SharedToolPageShell) {
      shell = window.SharedToolPageShell.initToolPage({
        fallbackLang: 'en',
        i18nApi: window.DIFAnalysisI18n,
        relatedWork: {
          toolId: 'DIF-AnalysisTool',
          sourceUrl: '/psychometric-tools/assets/related-work.json',
          publicationsSourceUrl: (window.PUBLICATIONS_SOURCE_URL) || 'https://enheragu.github.io/publications-data.json',
        },
        onApplyLanguage: function (_copy, lang) {
          state.lang = lang;
          applyI18n();
        },
        onApplyTheme: function (theme) {
          state.theme = theme;
          if (window.SharedUiCore && window.SharedUiCore.applyBodyTheme) {
            window.SharedUiCore.applyBodyTheme(theme);
          }
        },
      });
      if (shell) {
        state.lang = shell.lang;
        state.theme = shell.theme;
        shell.applyTheme();
      }
    }

    applyI18n();
    wireEvents();
    hideProgress();
    hideResults();
    setStatus(t('status_ready'), 'idle');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.DIFAnalysisApp = { state: state };
})();
