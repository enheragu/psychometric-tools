/**
 * ui.js — All DOM interactions:
 *   - Checkbox list (render, filter, toggle)
 *   - CSV text input parsing with fuzzy fallback + error modal
 *   - Results: stats table, scatter+sigmoid chart, ROC chart
 */


const UI = (() => {

  const CHART_COLORS = window.SharedChartLegend.getDataColors();

  const CHART_STROKES = {
    emphasis: 2.4,
    baseline: 1.5,
  };

  // ── Chart instances (kept to allow destroy on re-run) ─────────────
  let _scatterChart = null;
  let _rocChart     = null;
  let _incomeChart  = null;
  let _modalChart   = null;
  let _modalKind = null;
  let _toggleHandler = null;
  let _lastResult = null;
  let _lastIncome = null;
  let _modalDefaults = null;
  let _globalHandlersBound = false;
  let _zoomPluginRegistered = false;

  // HDI gradient (matches map STOPS) — must be declared before INCOME_GROUP_COLORS.
  const _HDI_STOPS = [
    [0.00, [215,  25,  28]],
    [0.20, [253, 174,  97]],
    [0.40, [255, 255, 191]],
    [0.60, [217, 239, 139]],
    [0.80, [145, 207,  96]],
    [1.00, [ 26, 152,  80]],
  ];
  function _hdiRampColor(hdi) {
    if (!Number.isFinite(hdi)) return '#9ca3af';
    for (let i = 0; i < _HDI_STOPS.length - 1; i++) {
      const [lo, cLo] = _HDI_STOPS[i];
      const [hi, cHi] = _HDI_STOPS[i + 1];
      if (hdi <= hi) {
        const t = (hdi - lo) / (hi - lo);
        const r = Math.round(cLo[0] + t * (cHi[0] - cLo[0]));
        const g = Math.round(cLo[1] + t * (cHi[1] - cLo[1]));
        const b = Math.round(cLo[2] + t * (cHi[2] - cLo[2]));
        return `rgb(${r},${g},${b})`;
      }
    }
    return '#9ca3af';
  }

  // Income-group colors: 4 discrete stops from the HDI ramp (low → high).
  const INCOME_GROUP_COLORS = {
    low:          _hdiRampColor(0.10),
    lower_middle: _hdiRampColor(0.35),
    upper_middle: _hdiRampColor(0.65),
    high:         _hdiRampColor(0.90),
  };
  function _incomeColor(group) {
    return INCOME_GROUP_COLORS[group] || '#9ca3af';
  }
  function _incomeLabelKey(group) {
    return `income_group_${group}`;
  }

  function _ensureZoomPluginRegistered() {
    if (_zoomPluginRegistered) return;
    if (typeof Chart === 'undefined' || typeof Chart.register !== 'function') return;
    const plugin = window.ChartZoom || window.chartjsPluginZoom || window['chartjs-plugin-zoom'];
    if (plugin) {
      Chart.register(plugin);
      _zoomPluginRegistered = true;
    }
  }

  // ── Checkbox list ─────────────────────────────────────────────────

  /** Render the full list of country checkboxes. Called once on init. */
  function renderCheckboxList(selectedSet, onToggle) {
    _toggleHandler = onToggle;
    _bindGlobalHandlers();
    _renderOrderedCheckboxes(selectedSet);
  }

  function _bindGlobalHandlers() {
    if (_globalHandlersBound) return;
    _globalHandlersBound = true;

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeChartModal();
    });
  }

  function _renderOrderedCheckboxes(selectedSet) {
    const container = document.getElementById('checkbox-list');
    container.innerHTML = '';
    const sortMode = document.getElementById('cb-sort')?.value || 'name-asc';

    const selectedRows = [];
    const unselectedRows = [];
    const unavailableRows = [];
    for (const row of Data.COUNTRY_DATA) {
      if (selectedSet.has(row.iso3)) selectedRows.push(row);
      else                           unselectedRows.push(row);
    }

    _sortRows(selectedRows, sortMode);
    _sortRows(unselectedRows, sortMode);
    _sortRows(unavailableRows, sortMode);

    const orderedRows = [...selectedRows, ...unselectedRows, ...unavailableRows];

    const lang = I18n.getLang();

    for (let index = 0; index < orderedRows.length; index++) {
      const row = orderedRows[index];
      const { iso3, noData } = row;
      const hdi = row.hdi;
      const displayCountry = Data.getCountryLabel(iso3, lang);
      const label = document.createElement('label');
      label.className = 'shared-checkbox-item';
      if (noData) label.classList.add('shared-checkbox-item--disabled');
      if (row.incomeGroup) label.classList.add(`shared-checkbox-item--income-${row.incomeGroup}`);
      label.dataset.iso3 = iso3;
      label.dataset.name = Data.normalize(displayCountry);

      const number = document.createElement('span');
      number.className = 'cb-idx';
      number.textContent = String(index);

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.iso3 = iso3;
      cb.checked = !noData && selectedSet.has(iso3);
      cb.disabled = Boolean(noData);
      if (!noData) cb.addEventListener('change', () => _toggleHandler(iso3, cb.checked));

      const span = document.createElement('span');
      span.className = 'cb-name';
      span.textContent = displayCountry;

      const metaWrap = document.createElement('span');
      metaWrap.className = 'cb-meta-wrap';

      if (noData) {
        const noDataSpan = document.createElement('span');
        noDataSpan.className = 'cb-hdi cb-meta-chip cb-meta-chip--warning';
        noDataSpan.textContent = I18n.t('no_hdi_data');
        metaWrap.appendChild(noDataSpan);
      } else {
        if (Number.isFinite(hdi)) {
          const hdiSpan = document.createElement('span');
          hdiSpan.className = 'cb-hdi cb-meta-chip cb-meta-chip--by-hdi';
          hdiSpan.style.setProperty('--hdi-color', _hdiRampColor(hdi));
          hdiSpan.textContent = `HDI ${hdi.toFixed(3)}`;
          if (row.hdiYear) hdiSpan.title = String(row.hdiYear);
          metaWrap.appendChild(hdiSpan);
        }

        if (row.incomeGroup) {
          const incomeSpan = document.createElement('span');
          incomeSpan.className = `cb-meta-chip cb-meta-chip--inc-abbr cb-meta-chip--income-${row.incomeGroup}`;
          incomeSpan.style.setProperty('--income-color', _incomeColor(row.incomeGroup));
          incomeSpan.textContent = I18n.t(`income_abbr_${row.incomeGroup}`);
          const fullLabel = I18n.t(_incomeLabelKey(row.incomeGroup));
          incomeSpan.title = row.incomeYear ? `${fullLabel} (${row.incomeYear})` : fullLabel;
          metaWrap.appendChild(incomeSpan);
        }
      }

      label.append(number, cb, span, metaWrap);
      container.appendChild(label);

      if (selectedRows.length && unselectedRows.length && iso3 === selectedRows[selectedRows.length - 1].iso3) {
        const divider = document.createElement('div');
        divider.className = 'cb-divider';
        container.appendChild(divider);
      }

      if (selectedRows.length + unselectedRows.length && unavailableRows.length) {
        const lastSelectableIso = orderedRows[selectedRows.length + unselectedRows.length - 1]?.iso3;
        if (iso3 === lastSelectableIso) {
          const divider = document.createElement('div');
          divider.className = 'cb-divider';
          container.appendChild(divider);
        }
      }
    }

    document.getElementById('sel-count').textContent = selectedSet.size;

    const searchInput = document.getElementById('cb-search');
    if (searchInput) filterCheckboxes(searchInput.value);
  }

  function _sortRows(rows, mode) {
    const getHdi = row => Number.isFinite(row.hdi) ? row.hdi : Number.NEGATIVE_INFINITY;
    const getYear = row => {
      const y = row.hdiYear ?? row.year;
      return Number.isFinite(y) ? y : Number.NEGATIVE_INFINITY;
    };
    const byNameAsc = (a, b) => String(a.country).localeCompare(String(b.country));

    switch (mode) {
      case 'name-desc':
        rows.sort((a, b) => byNameAsc(b, a));
        break;
      case 'hdi-desc':
        rows.sort((a, b) => (getHdi(b) - getHdi(a)) || byNameAsc(a, b));
        break;
      case 'hdi-asc':
        rows.sort((a, b) => (getHdi(a) - getHdi(b)) || byNameAsc(a, b));
        break;
      case 'year-desc':
        rows.sort((a, b) => (getYear(b) - getYear(a)) || byNameAsc(a, b));
        break;
      case 'year-asc':
        rows.sort((a, b) => (getYear(a) - getYear(b)) || byNameAsc(a, b));
        break;
      case 'name-asc':
      default:
        rows.sort(byNameAsc);
        break;
    }
  }

  /** Sync checkbox states to match selectedSet (no full re-render). */
  function syncCheckboxes(selectedSet) {
    _renderOrderedCheckboxes(selectedSet);
  }

  /** Filter visible checkboxes by text. */
  function filterCheckboxes(query) {
    const needle = Data.normalize(query);
    document.querySelectorAll('#checkbox-list .shared-checkbox-item').forEach(el => {
      el.style.display = (!needle || el.dataset.name.includes(needle)) ? '' : 'none';
    });
    document.querySelectorAll('#checkbox-list .cb-divider').forEach(el => {
      el.style.display = needle ? 'none' : '';
    });
  }

  // ── CSV text input ─────────────────────────────────────────────────

  /**
   * Parse the textarea contents.
   * Splits on comma / semicolon / newline, resolves each token.
   * @param {string} raw
   * @returns {{ resolved: string[], unmatched: string[] }}
   */
  function parseInput(raw) {
    const tokens = raw
      .split(/[,;\n\r]+/)
      .map(s => s.trim())
      .filter(Boolean);

    const resolved  = [];
    const unmatched = [];

    for (const token of tokens) {
      const iso3 = Data.resolve(token);
      if (iso3) {
        if (!resolved.includes(iso3)) resolved.push(iso3);
      } else {
        unmatched.push(token);
      }
    }
    return { resolved, unmatched };
  }

  /** Show inline error box below the textarea. */
  function showParseErrors(unmatched) {
    const box = document.getElementById('parse-errors');
    if (!unmatched.length) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    box.textContent = `⚠ ${unmatched.join(' · ')}`;
  }

  // ── Modal ─────────────────────────────────────────────────────────

  function showModal(unmatched) {
    const list = document.getElementById('modal-list');
    list.innerHTML = '';
    for (const token of unmatched) {
      const li = document.createElement('li');
      const suggestion = Data.suggest(token);
      li.textContent = token + (suggestion ? ` → ${suggestion}?` : '');
      list.appendChild(li);
    }
    document.getElementById('modal-suggestions').textContent = I18n.t('modal_suggestions');
    document.getElementById('modal-overlay').classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
  }

  // ── Results ───────────────────────────────────────────────────────

  function showResults(result, incomeResult) {
    _lastResult = result;
    _lastIncome = incomeResult || null;
    const section = document.getElementById('results');
    section.classList.remove('hidden');

    _renderStats(result);
    if (_lastIncome) _renderIncome(_lastIncome);

    section.scrollIntoView({ behavior: 'smooth', block: 'start' });

    setTimeout(function () {
      _renderScatter(result);
      _renderROC(result);
      if (_lastIncome) _renderIncomeChart(_lastIncome);
    }, 0);
  }

  function hideResults() {
    _lastResult = null;
    _lastIncome = null;
    document.getElementById('results').classList.add('hidden');
  }

  // Stats table
  function _renderStats(r) {
    const fmt2  = n => n.toFixed(3);
    const fmtP  = n => (n < 0.001 ? '< 0.001' : n.toFixed(3));
    const fmtAuc = n => n.toFixed(3);
    const fmtOr = n => (n >= 1000 || n <= 0.001) ? n.toExponential(2) : n.toFixed(3);

    const rows = [
      ['stat_n_selected', r.n1],
      ['stat_n_total',    r.total],
      ['stat_hdi_sel',    fmt2(r.meanHdiSel)],
      ['stat_hdi_nsel',   fmt2(r.meanHdiNsel)],
      ['stat_beta0',      fmt2(r.beta0)],
      ['stat_beta1',      fmt2(r.beta1)],
      ['stat_or',         fmtOr(Math.exp(r.beta1))],
      ['stat_se',         fmt2(r.se)],
      ['stat_z',          fmt2(r.z)],
      ['stat_pval',       fmtP(r.pValue)],
      ['stat_auc',        fmtAuc(r.auc)],
    ];

    const tbody = document.getElementById('stats-body');
    tbody.innerHTML = '';
    for (const [key, val] of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="shared-cell-text">${I18n.t(key)}</td><td class="shared-cell-num">${val}</td>`;
      tbody.appendChild(tr);
    }

    // Significance row
    const sigTr = document.createElement('tr');
    const sigKey  = r.significant ? 'sig_yes' : 'sig_no';
    const sigClass = r.significant ? 'sig' : 'non-sig';
    sigTr.innerHTML = `<td colspan="2" class="shared-cell-text ${sigClass}">${I18n.t(sigKey)}</td>`;
    tbody.appendChild(sigTr);

    // Interpretation
    let interpKey;
    if (!r.significant)      interpKey = 'interp_ns';
    else if (r.beta1 > 0)    interpKey = 'interp_pos';
    else                     interpKey = 'interp_neg';

    document.getElementById('stats-interpretation').textContent = I18n.t(interpKey, {
      b1:  r.beta1.toFixed(3),
      p:   fmtP(r.pValue),
      auc: r.auc.toFixed(3),
    });
  }

  // ── Income groups (table + summary text) ─────────────────────────
  function _renderIncome(r) {
    const fmtPct = n => `${n.toFixed(1)}%`;
    const tbody = document.getElementById('income-body');
    tbody.innerHTML = '';

    const summaryEl = document.getElementById('income-summary-line');
    if (summaryEl) {
      summaryEl.textContent = I18n.t('income_summary_line', {
        n: r.sampleSize,
        universe: r.universeSize,
        iterations: r.iterations,
      });
    }

    if (r.error) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="3" class="shared-cell-text non-sig">${I18n.t('income_error_' + r.error)}</td>`;
      tbody.appendChild(tr);
    } else {
      r.groups.forEach((g, i) => {
        const tr = document.createElement('tr');
        tr.className = 'income-row';
        const swatch = `<span class="income-swatch" style="background:${_incomeColor(g.key)}"></span>`;
        const flag = g.outsideCi ? ` <span class="income-flag" title="${I18n.t('income_outside_ci_title')}">●</span>` : '';
        tr.innerHTML = `
          <td class="shared-cell-text">${swatch}${I18n.t(_incomeLabelKey(g.key))}${flag}</td>
          <td class="shared-cell-num">${fmtPct(g.observedPct)} <span class="income-count">(${g.observedCount})</span></td>
          <td class="shared-cell-num">${fmtPct(g.p025)} – ${fmtPct(g.p975)}</td>
        `;
        tr.addEventListener('mouseenter', () => {
          _highlightIncomeGroup(i);
          tbody.querySelectorAll('.income-row').forEach((row, j) => {
            row.classList.toggle('is-dimmed', j !== i);
          });
        });
        tr.addEventListener('mouseleave', () => {
          _highlightIncomeGroup(null);
          tbody.querySelectorAll('.income-row').forEach(row => row.classList.remove('is-dimmed'));
        });
        tbody.appendChild(tr);
      });
    }

    const interpEl = document.getElementById('income-interpretation');
    if (interpEl) {
      if (r.error) {
        interpEl.textContent = '';
      } else {
        const flagged = r.groups.filter(g => g.outsideCi);
        if (flagged.length === 0) {
          interpEl.textContent = I18n.t('income_interp_balanced');
        } else {
          const parts = flagged.map(g => {
            const direction = g.observedPct > g.p975 ? 'over' : 'under';
            return I18n.t(`income_interp_${direction}`, {
              group: I18n.t(_incomeLabelKey(g.key)),
              obs: g.observedPct.toFixed(1),
              lo: g.p025.toFixed(1),
              hi: g.p975.toFixed(1),
            });
          });
          interpEl.textContent = parts.join(' ');
        }
      }
    }

    const excludedEl = document.getElementById('income-excluded');
    if (excludedEl) {
      if (r.excludedIso3 && r.excludedIso3.length) {
        excludedEl.classList.remove('hidden');
        const lang = I18n.getLang();
        const names = r.excludedIso3.map(iso => Data.getCountryLabel(iso, lang)).join(', ');
        excludedEl.textContent = I18n.t('income_excluded_note', {
          count: r.excludedIso3.length,
          names,
        });
      } else {
        excludedEl.classList.add('hidden');
        excludedEl.textContent = '';
      }
    }
  }

  // Build a KDE-smoothed violin for one group's distribution.
  // Returns { yValues, density } arrays (density already normalized 0..1).
  function _kdeViolin(sortedDistribution, bins = 48) {
    const n = sortedDistribution.length;
    if (!n) return { yValues: [], density: [] };
    const lo = sortedDistribution[0];
    const hi = sortedDistribution[n - 1];
    if (hi <= lo) {
      // Degenerate distribution (all same value) — single spike.
      return { yValues: [lo], density: [1] };
    }
    // Silverman's rule of thumb bandwidth (rough estimate).
    let mean = 0;
    for (let i = 0; i < n; i++) mean += sortedDistribution[i];
    mean /= n;
    let variance = 0;
    for (let i = 0; i < n; i++) {
      const d = sortedDistribution[i] - mean;
      variance += d * d;
    }
    const std = Math.sqrt(variance / n) || (hi - lo) / 6;
    const bw = Math.max(1.06 * std * Math.pow(n, -1 / 5), (hi - lo) / 60);
    const pad = bw * 2;
    const yLo = Math.max(0, lo - pad);
    const yHi = Math.min(100, hi + pad);
    const step = (yHi - yLo) / (bins - 1);
    const yValues = new Array(bins);
    const density = new Array(bins);
    const inv2bw2 = 1 / (2 * bw * bw);
    const norm = 1 / (n * bw * Math.sqrt(2 * Math.PI));
    let peak = 0;
    for (let b = 0; b < bins; b++) {
      const y = yLo + b * step;
      yValues[b] = y;
      let s = 0;
      for (let i = 0; i < n; i++) {
        const d = sortedDistribution[i] - y;
        s += Math.exp(-d * d * inv2bw2);
      }
      density[b] = s * norm;
      if (density[b] > peak) peak = density[b];
    }
    if (peak > 0) for (let b = 0; b < bins; b++) density[b] /= peak;

    // Gaussian post-smoothing to remove residual jaggedness from
    // discrete/clustered income data where Silverman bandwidth is narrow.
    // Gaussian post-smoothing (2 passes) to remove residual jaggedness from
    // discrete/clustered income data where Silverman bandwidth is narrow.
    const kernel = [0.0625, 0.25, 0.375, 0.25, 0.0625]; // σ≈1 bin
    const half = Math.floor(kernel.length / 2);
    function gaussPass(src) {
      const out = new Array(bins);
      for (let b = 0; b < bins; b++) {
        let s = 0;
        for (let k = 0; k < kernel.length; k++) {
          const idx = Math.min(Math.max(b + k - half, 0), bins - 1);
          s += kernel[k] * src[idx];
        }
        out[b] = s;
      }
      return out;
    }
    return { yValues, density: gaussPass(gaussPass(density)) };
  }

  function _incomeChartDatasets(r) {
    const labels = r.groupOrder.map(g => I18n.t(_incomeLabelKey(g)));
    const colors = r.groupOrder.map(g => _incomeColor(g));

    if (r.error || !r.groups) {
      return { labels, colors, violins: [], observed: [] };
    }

    // Half-width of each violin on the category axis (in category units).
    const HALF = 0.40;

    // Build a closed polygon for one violin between two y bounds.
    // density/yValues come from KDE; we keep only samples within [yLo, yHi]
    // and clamp the boundary samples by linear interpolation so the central
    // 95% slice connects smoothly with the tails.
    function buildPolygon(centerIndex, yValues, density, yLo, yHi) {
      if (!yValues.length) return [];
      const interp = (yA, dA, yB, dB, yT) => {
        if (yA === yB) return dA;
        const t = (yT - yA) / (yB - yA);
        return dA + t * (dB - dA);
      };
      const samples = [];
      for (let i = 0; i < yValues.length; i++) {
        const y = yValues[i];
        if (y < yLo || y > yHi) continue;
        if (samples.length === 0 && i > 0 && yValues[i - 1] < yLo) {
          samples.push({ y: yLo, d: interp(yValues[i - 1], density[i - 1], y, density[i], yLo) });
        }
        samples.push({ y, d: density[i] });
        if (i < yValues.length - 1 && yValues[i + 1] > yHi) {
          samples.push({ y: yHi, d: interp(y, density[i], yValues[i + 1], density[i + 1], yHi) });
        }
      }
      if (samples.length < 2) return [];
      const right = samples.map(s => ({ x: centerIndex + s.d * HALF, y: s.y }));
      const left = samples.slice().reverse().map(s => ({ x: centerIndex - s.d * HALF, y: s.y }));
      const poly = right.concat(left);
      poly.push({ x: poly[0].x, y: poly[0].y });
      return poly;
    }

    const violins = r.groups.map((g, i) => {
      const { yValues, density } = _kdeViolin(g.distribution || new Float64Array());
      const yLo = yValues.length ? yValues[0] : 0;
      const yHi = yValues.length ? yValues[yValues.length - 1] : 0;
      return {
        index: i,
        full:    buildPolygon(i, yValues, density, yLo, yHi),
        central: buildPolygon(i, yValues, density, g.p025, g.p975),
        p025: g.p025,
        p975: g.p975,
        p50: g.p50,
      };
    });

    const observed = r.groups.map((g, i) => ({ x: i, y: g.observedPct, groupIndex: i }));
    return { labels, colors, violins, observed, half: HALF };
  }

  // Track dataset roles in the chart for hover-from-table interactions.
  let _incomeDatasetRoles = [];
  function _incomeRoleVisible(role, chart) {
    if (!chart) return true;
    let any = false;
    chart.data.datasets.forEach((ds, idx) => {
      if (ds._role === role && chart.isDatasetVisible(idx)) any = true;
    });
    return any;
  }
  function _highlightIncomeGroup(groupIndex) {
    if (!_incomeChart) return;
    const withAlpha = window.SharedChartLegend.withAlpha;
    _incomeChart.data.datasets.forEach((ds) => {
      if (ds._role !== 'violin-tail' && ds._role !== 'violin-central') return;
      const dim = (groupIndex != null && ds._groupIndex !== groupIndex);
      const color = ds._origColor;
      const baseAlpha = ds._fillAlpha ?? 0.3;
      const fillAlpha = dim ? baseAlpha * 0.12 : baseAlpha;
      const borderAlpha = dim ? 0.15 : (ds._role === 'violin-central' ? 1 : 0.85);
      ds.backgroundColor = withAlpha(color, fillAlpha);
      ds.borderColor = withAlpha(color, borderAlpha);
    });
    _incomeChart.update('none');
  }

  // Custom plugin: paints the violin polygons (closed, smooth, filled)
  // before the default line dataset draw. Each violin dataset opts in by
  // setting `_role: 'violin'` and providing `_polygon` (array of {x,y} in
  // data space) plus `_fillStyleFn(ctx)` returning a color/gradient.
  const _violinPlugin = {
    id: 'cnrsbViolin',
    beforeDatasetDraw(chart, args) {
      const ds = chart.data.datasets[args.index];
      if (!ds || !ds._polygon || ds._polygon.length < 3) return;
      if (ds._role !== 'violin-tail' && ds._role !== 'violin-central') return;
      const xScale = chart.scales.x;
      const yScale = chart.scales.y;
      if (!xScale || !yScale) return;
      const ctx = chart.ctx;
      const meta = chart.getDatasetMeta(args.index);
      if (meta?.hidden) return;
      const pts = ds._polygon.map(p => ({
        x: xScale.getPixelForValue(p.x),
        y: yScale.getPixelForValue(p.y),
      }));
      ctx.save();
      // Smooth closed cardinal-ish path via quadratic midpoints.
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        const p0 = pts[i - 1];
        const p1 = pts[i];
        const mx = (p0.x + p1.x) / 2;
        const my = (p0.y + p1.y) / 2;
        ctx.quadraticCurveTo(p0.x, p0.y, mx, my);
      }
      ctx.closePath();
      ctx.fillStyle = ds.backgroundColor || 'rgba(0,0,0,0.1)';
      ctx.globalAlpha = 1;
      ctx.fill();
      ctx.lineWidth = ds.borderWidth || 1.2;
      ctx.strokeStyle = ds.borderColor || '#000';
      ctx.stroke();
      ctx.restore();
      // Skip the default line drawing (we already rendered the polygon).
      return false;
    },
  };

  function _buildIncomeChartData(r) {
    const { labels, colors, violins, observed } = _incomeChartDatasets(r);
    const datasets = [];
    _incomeDatasetRoles = [];

    const withAlpha = window.SharedChartLegend.withAlpha;
    const ALPHA_TAIL = 0.22;
    const ALPHA_CENTRAL = 0.65;

    // Two closed-polygon datasets per violin: full (tail) + central 95%.
    // The custom `_violinPlugin` renders each as a smoothed filled polygon.
    violins.forEach((v, i) => {
      const color = colors[i];
      datasets.push({
        label: `${labels[i]} — ${I18n.t('income_chart_violin')}`,
        type: 'line',
        data: v.full,
        parsing: false,
        borderColor: withAlpha(color, 0.85),
        backgroundColor: withAlpha(color, ALPHA_TAIL),
        borderWidth: 1.1,
        pointRadius: 0,
        pointHitRadius: 0,
        fill: false,
        showLine: false,
        order: 5,
        _role: 'violin-tail',
        _groupIndex: i,
        _origColor: color,
        _polygon: v.full,
        _fillAlpha: ALPHA_TAIL,
      });
      _incomeDatasetRoles.push({ role: 'violin-tail', groupIndex: i });

      datasets.push({
        label: `${labels[i]} — ${I18n.t('income_chart_ci')}`,
        type: 'line',
        data: v.central,
        parsing: false,
        borderColor: color,
        backgroundColor: withAlpha(color, ALPHA_CENTRAL),
        borderWidth: 1.3,
        pointRadius: 0,
        pointHitRadius: 0,
        fill: false,
        showLine: false,
        order: 4,
        _role: 'violin-central',
        _groupIndex: i,
        _origColor: color,
        _polygon: v.central,
        _fillAlpha: ALPHA_CENTRAL,
      });
      _incomeDatasetRoles.push({ role: 'violin-central', groupIndex: i });
    });

    // Observed value as a diamond marker.
    datasets.push({
      label: I18n.t('income_chart_observed'),
      type: 'scatter',
      data: observed,
      parsing: false,
      backgroundColor: '#111827',
      borderColor: '#ffffff',
      borderWidth: 1.5,
      pointRadius: 6,
      pointHoverRadius: 8,
      pointStyle: 'rectRot',
      order: 1,
      _role: 'observed',
    });
    _incomeDatasetRoles.push({ role: 'observed' });

    return { labels, datasets };
  }

  function _buildIncomeChartOptions(r, modal) {
    const { labels, violins } = _incomeChartDatasets(r);

    const legendOpts = window.SharedChartLegend.createLegendOptions({
      position: 'top',
      labels: {
        color: _chartTheme().text,
        usePointStyle: true,
      },
    });

    return window.SharedChartLegend.buildChartOptions({
      theme: _chartTheme(),
      interaction: { mode: 'nearest', intersect: true, axis: 'xy' },
      plugins: {
        legend: legendOpts,
        zoom: modal ? {
          zoom: {
            wheel: { enabled: true, speed: 0.08 },
            pinch: { enabled: true },
            drag: { enabled: false },
            mode: 'xy',
          },
          pan: { enabled: true, mode: 'xy' },
        } : undefined,
        tooltip: window.SharedChartLegend.createTooltipLabelOptions({
          label: ctx => {
            const ds = ctx.dataset;
            if (ds?.type === 'scatter') {
              const raw = ctx.raw;
              const i = raw?.groupIndex ?? 0;
              return `${labels[i]} · ${I18n.t('income_chart_observed')}: ${raw.y.toFixed(1)}%`;
            }
            const i = ds?._groupIndex ?? Math.round(ctx.parsed?.x ?? 0);
            const v = violins[i];
            if (!v) return '';
            return `${labels[i]} · 95%: ${v.p025.toFixed(1)}% – ${v.p975.toFixed(1)}%`;
          },
        }),
      },
      scales: {
        x: {
          type: 'linear',
          min: -0.6,
          max: (violins.length || 1) - 0.4,
          ticks: {
            color: _chartTheme().text,
            stepSize: 1,
            callback: v => {
              const i = Math.round(v);
              return (Number.isInteger(v) || Math.abs(v - i) < 1e-6) ? (labels[i] ?? '') : '';
            },
          },
          grid: { color: _chartTheme().grid, display: false },
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: I18n.t('income_chart_y'), color: _chartTheme().text },
          ticks: { color: _chartTheme().text, callback: v => `${v}%` },
          grid: { color: _chartTheme().grid },
        },
      },
    });
  }

  function _renderIncomeChart(r) {
    _ensureZoomPluginRegistered();
    const canvasEl = document.getElementById('income-chart');
    if (!canvasEl) return;
    const expandBtn = document.getElementById('btn-expand-income');
    if (expandBtn) expandBtn.onclick = () => openChartModal('income');
    canvasEl.onclick = e => {
      if (!window.SharedChartInteractions?.isInsideChartArea(e, _incomeChart, canvasEl)) return;
      openChartModal('income');
    };
    canvasEl.onmousemove = e => {
      canvasEl.style.cursor = window.SharedChartInteractions?.isInsideChartArea(e, _incomeChart, canvasEl) ? 'zoom-in' : 'default';
    };
    canvasEl.onmouseleave = () => { canvasEl.style.cursor = ''; };
    if (_incomeChart) _incomeChart.destroy();
    _sizeCanvas(canvasEl);
    const ctx = canvasEl.getContext('2d');

    _incomeChart = new Chart(ctx, {
      type: 'bar',
      data: _buildIncomeChartData(r),
      options: _buildIncomeChartOptions(r),
      plugins: [_violinPlugin],
    });
  }

  function _chartTheme() {
    return window.SharedChartLegend.getChartTheme();
  }

  function _linearScale(title, min, max) {
    return window.SharedChartLegend.buildLinearScale(title, min, max);
  }

  // Scatter + sigmoid chart
  function _scatterDatasets(r, pointRadius = 3) {
    const selPoints  = r.samples.filter(s => s.label === 1).map(s => ({
      x: s.hdi,
      y: 1,
      country: s.country,
      iso3: s.iso3,
      selected: true,
    }));
    const nselPoints = r.samples.filter(s => s.label === 0).map(s => ({
      x: s.hdi,
      y: 0,
      country: s.country,
      iso3: s.iso3,
      selected: false,
    }));

    return [
      {
        label:           I18n.t('chart_scatter_sel'),
        data:            selPoints,
        backgroundColor: window.SharedChartLegend.withAlpha(CHART_COLORS.blue, 0.72),
        pointRadius,
        pointHoverRadius: Math.max(pointRadius + 1, 5),
        pointHitRadius:   0,
        order:           2,
      },
      {
        label:           I18n.t('chart_scatter_nsel'),
        data:            nselPoints,
        backgroundColor: window.SharedChartLegend.withAlpha(CHART_COLORS.gray, 0.50),
        pointRadius,
        pointHoverRadius: Math.max(pointRadius + 1, 5),
        pointHitRadius:   0,
        order:           3,
      },
      {
        label:       I18n.t('chart_sigmoid'),
        data:        r.sigmoidCurve.map(p => ({ x: p.x, y: p.y })),
        type:        'line',
        borderColor: CHART_COLORS.green,
        borderWidth: CHART_STROKES.emphasis,
        pointRadius: 0,
        pointHoverRadius: 0,
        pointHitRadius: 0,
        fill:        false,
        tension:     0.4,
        order:       1,
        tooltipEnabled: false,
      },
      {
        label:       I18n.t('chart_sigmoid'),
        data:        r.sigmoidCurve.map(p => ({ x: p.x, y: p.y })),
        type:        'scatter',
        showLine:    false,
        backgroundColor: 'transparent',
        pointRadius: 0,
        pointHoverRadius: 0,
        pointHitRadius: 8,
        order:       4,
        hideFromLegend: true,
        tooltipEnabled: true,
      },
    ];
  }

  function _sizeCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.parentNode.clientWidth;
    const h = canvas.parentNode.clientHeight;
    if (w > 0 && h > 0) {
      canvas.width  = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width  = w + 'px';
      canvas.style.height = h + 'px';
    }
  }

  function _renderScatter(r) {
    _ensureZoomPluginRegistered();
    const canvasEl = document.getElementById('regression-chart');
    const expandBtn = document.getElementById('btn-expand-regression');
    if (expandBtn) expandBtn.onclick = () => openChartModal('scatter');
    canvasEl.onclick = e => {
      if (!window.SharedChartInteractions?.isInsideChartArea(e, _scatterChart, canvasEl)) return;
      openChartModal('scatter');
    };
    canvasEl.onmousemove = e => {
      canvasEl.style.cursor = window.SharedChartInteractions?.isInsideChartArea(e, _scatterChart, canvasEl) ? 'zoom-in' : 'default';
    };
    canvasEl.onmouseleave = () => { canvasEl.style.cursor = ''; };
    if (_scatterChart) _scatterChart.destroy();
    _sizeCanvas(canvasEl);
    const ctx = canvasEl.getContext('2d');

    const scatterOpts = window.SharedChartLegend.buildChartOptions({
      theme: _chartTheme(),
      interaction: {
        mode: 'point',
        intersect: true,
        axis: 'xy',
      },
      plugins: {
        legend: window.SharedChartLegend.createLegendOptions({
          position: 'top',
          labels: {
            color: _chartTheme().text,
            filter: (legendItem, data) => !data.datasets[legendItem.datasetIndex]?.hideFromLegend,
          },
        }),
        tooltip: window.SharedChartLegend.createTooltipLabelOptions({
          filter: ctx => ctx.dataset?.tooltipEnabled !== false,
          label: ctx => _formatScatterTooltip(ctx.raw),
        }),
      },
      scales: {
        x: _linearScale(I18n.t('chart_x'), Math.max(0, r.hdiMin - 0.03), Math.min(1, r.hdiMax + 0.03)),
        y: _linearScale(I18n.t('chart_y'), -0.06, 1.06),
      },
    });
    _scatterChart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: _scatterDatasets(r, 4),
      },
      options: scatterOpts,
    });

    const noteEl = document.getElementById('scatter-note');
    if (noteEl) {
      const base = I18n.t('chart_note_scatter');
      const nearLinear = Math.abs(r.beta1) < 2.0;
      noteEl.textContent = nearLinear ? `${base} ${I18n.t('chart_note_near_linear')}` : base;
    }
  }

  // ROC curve chart
  function _rocDatasets(r) {
    return [
      {
        label:       `${I18n.t('roc_curve')} (AUC=${r.auc.toFixed(3)})`,
        data:        r.rocCurve.map(p => ({ x: p.fpr, y: p.tpr, threshold: p.threshold })),
        borderColor: CHART_COLORS.green,
        borderWidth: CHART_STROKES.emphasis,
        pointRadius: 0,
        fill:        false,
        tension:     0,
      },
      {
        label:       I18n.t('roc_random'),
        data:        [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        borderColor: CHART_COLORS.gray,
        borderWidth: CHART_STROKES.baseline,
        borderDash:  [6, 4],
        pointRadius: 0,
        fill:        false,
      },
    ];
  }

  function _renderROC(r) {
    _ensureZoomPluginRegistered();
    const canvasEl = document.getElementById('roc-chart');
    const expandBtn = document.getElementById('btn-expand-roc');
    if (expandBtn) expandBtn.onclick = () => openChartModal('roc');
    canvasEl.onclick = e => {
      if (!window.SharedChartInteractions?.isInsideChartArea(e, _rocChart, canvasEl)) return;
      openChartModal('roc');
    };
    canvasEl.onmousemove = e => {
      canvasEl.style.cursor = window.SharedChartInteractions?.isInsideChartArea(e, _rocChart, canvasEl) ? 'zoom-in' : 'default';
    };
    canvasEl.onmouseleave = () => { canvasEl.style.cursor = ''; };
    if (_rocChart) _rocChart.destroy();
    _sizeCanvas(canvasEl);
    const ctx = canvasEl.getContext('2d');

    const rocOpts = window.SharedChartLegend.buildChartOptions({
      theme: _chartTheme(),
      interaction: {
        mode: 'nearest',
        intersect: false,
        axis: 'xy',
      },
      plugins: {
        legend: window.SharedChartLegend.createLegendOptions({
          position: 'top',
          labels: { color: _chartTheme().text },
        }),
        tooltip: window.SharedChartLegend.createTooltipLabelOptions({
          filter: ctx => ctx.datasetIndex === 0,
          label: ctx => _formatRocTooltip(ctx.raw),
        }),
      },
      scales: {
        x: _linearScale(I18n.t('roc_x'), 0, 1),
        y: _linearScale(I18n.t('roc_y'), 0, 1),
      },
    });
    _rocChart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: _rocDatasets(r),
      },
      options: rocOpts,
    });
  }

  function openChartModal(kind) {
    _ensureZoomPluginRegistered();
    if (!_lastResult) return;

    const overlay = document.getElementById('chart-modal-overlay');
    const titleEl = document.getElementById('chart-modal-title');
    const canvas = document.getElementById('chart-modal-canvas');
    if (!overlay || !titleEl || !canvas) return;

    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    const helpEl = document.getElementById('chart-modal-help');
    if (helpEl) helpEl.textContent = I18n.t('chart_modal_help');

    if (_modalChart) {
      _modalChart.destroy();
      _modalChart = null;
    }

    const ctx = canvas.getContext('2d');
    const isScatter = kind === 'scatter';
    const isIncome = kind === 'income';
    _modalKind = kind;
    titleEl.textContent = I18n.t(
      isScatter ? 'chart_modal_scatter' : (isIncome ? 'chart_modal_income' : 'chart_modal_roc')
    );
    const incomeViolinCount = (isIncome && _lastIncome?.groups) ? _lastIncome.groups.length : 0;
    const scatterXMin = isScatter ? Math.max(0, _lastResult.hdiMin - 0.03) : 0;
    const scatterXMax = isScatter ? Math.min(1, _lastResult.hdiMax + 0.03) : 1.0;
    _modalDefaults = isScatter
      ? { xMin: scatterXMin, xMax: scatterXMax, yMin: -0.06, yMax: 1.06 }
      : (isIncome
          ? { xMin: -0.6, xMax: (incomeViolinCount || 1) - 0.4, yMin: 0, yMax: 100 }
          : { xMin: 0, xMax: 1, yMin: 0, yMax: 1 });

    if (isIncome) {
      if (!_lastIncome) return;
      _modalChart = new Chart(ctx, {
        type: 'bar',
        data: _buildIncomeChartData(_lastIncome),
        options: _buildIncomeChartOptions(_lastIncome, true),
        plugins: [_violinPlugin],
      });
      window.SharedChartInteractions?.attach({
        canvas,
        getChart: () => _modalChart,
        defaults: { ..._modalDefaults, mode: 'xy' },
      });
      return;
    }

    const modalDatasets = isScatter ? _scatterDatasets(_lastResult, 5) : _rocDatasets(_lastResult);
    const modalOpts = window.SharedChartLegend.buildChartOptions({
      theme: _chartTheme(),
      interaction: isScatter
        ? {
            mode: 'point',
            intersect: true,
            axis: 'xy',
          }
        : {
            mode: 'nearest',
            intersect: false,
            axis: 'xy',
          },
      plugins: {
        legend: window.SharedChartLegend.createLegendOptions({
          position: 'top',
          labels: {
            color: _chartTheme().text,
            filter: (legendItem, data) => !data.datasets[legendItem.datasetIndex]?.hideFromLegend,
          },
        }),
        tooltip: window.SharedChartLegend.createTooltipLabelOptions({
          filter: ctx => (isScatter ? (ctx.dataset?.tooltipEnabled !== false) : ctx.datasetIndex === 0),
          label: ctx => (isScatter ? _formatScatterTooltip(ctx.raw) : _formatRocTooltip(ctx.raw)),
        }),
        zoom: {
          zoom: {
            wheel: { enabled: true, speed: 0.08 },
            pinch: { enabled: true },
            drag: { enabled: false },
            mode: 'xy',
          },
          pan: {
            enabled: true,
            mode: 'xy',
          },
        },
      },
      scales: isScatter
        ? {
            x: _linearScale(I18n.t('chart_x'), scatterXMin, scatterXMax),
            y: _linearScale(I18n.t('chart_y'), -0.06, 1.06),
          }
        : {
            x: _linearScale(I18n.t('roc_x'), 0, 1),
            y: _linearScale(I18n.t('roc_y'), 0, 1),
          },
    });
    _modalChart = new Chart(ctx, {
      type: isScatter ? 'scatter' : 'line',
      data: { datasets: modalDatasets },
      options: modalOpts,
    });

    window.SharedChartInteractions?.attach({
      canvas,
      getChart: () => _modalChart,
      defaults: {
        xMin: _modalDefaults?.xMin,
        xMax: _modalDefaults?.xMax,
        yMin: _modalDefaults?.yMin,
        yMax: _modalDefaults?.yMax,
        mode: 'xy',
      },
    });
  }

  function _formatRocTooltip(raw) {
    if (!raw || typeof raw.x !== 'number' || typeof raw.y !== 'number') return '';
    const base = `FPR: ${raw.x.toFixed(3)} · TPR: ${raw.y.toFixed(3)}`;
    if (typeof raw.threshold !== 'number') return base;
    return `${base} · ${I18n.t('roc_threshold')}: ${raw.threshold.toFixed(3)}`;
  }

  function _formatScatterTooltip(raw) {
    if (!raw || typeof raw.x !== 'number' || typeof raw.y !== 'number') return '';
    if (!raw.country) return `${I18n.t('chart_sigmoid')} · HDI: ${raw.x.toFixed(3)} · p: ${raw.y.toFixed(3)}`;
    const status = raw.selected ? I18n.t('chart_scatter_sel') : I18n.t('chart_scatter_nsel');
    return `${raw.country} (${raw.iso3}) — ${status} · HDI: ${raw.x.toFixed(3)} · p: ${raw.y.toFixed(3)}`;
  }

  function closeChartModal() {
    const overlay = document.getElementById('chart-modal-overlay');
    const canvas = document.getElementById('chart-modal-canvas');
    if (overlay) overlay.classList.add('hidden');
    document.body.style.overflow = '';
    if (canvas) {
      window.SharedChartInteractions?.detach?.(canvas);
    }
    if (_modalChart) {
      _modalChart.destroy();
      _modalChart = null;
    }
    _modalDefaults = null;
    _modalKind = null;
  }

  function setSimStatus(text, isBusy, type) {
    if (window.SharedSimStatus) {
      window.SharedSimStatus.set('sim-progress', text, isBusy, type);
    }
  }

  function refreshCharts() {
    if (!_lastResult) return;
    _renderScatter(_lastResult);
    _renderROC(_lastResult);
    if (_lastIncome) _renderIncomeChart(_lastIncome);
    if (_modalKind) {
      openChartModal(_modalKind);
    }
  }

  // ── Public API ────────────────────────────────────────────────────
  return {
    renderCheckboxList,
    syncCheckboxes,
    filterCheckboxes,
    parseInput,
    showParseErrors,
    showModal,
    closeModal,
    openChartModal,
    closeChartModal,
    showResults,
    hideResults,
    refreshCharts,
    setSimStatus,
  };
})();
