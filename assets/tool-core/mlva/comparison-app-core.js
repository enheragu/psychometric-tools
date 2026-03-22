(function () {
  if (window.StatMlvaComparisonCore) return;

  function init(options) {
    var toolConfig = options.toolConfig || {};
    var i18nApi = options.i18nApi || null;
    var chartMode = options.chartMode || 'histogram';
    var resultsMode = options.resultsMode || 'auto';
    var appNamespace = options.appNamespace || 'StatMlvaComparisonApp';
    var toolTitle = options.toolTitle || 'Comparison';
    var toolId = options.toolId || 'Comparison';
    var fallbackLang = options.fallbackLang || 'en';

    var PRESETS = toolConfig.presets || {};
    var MODEL_ORDER_POLICY = toolConfig.modelOrderPolicy || {};
    var MODEL_AUTOSELECT_POLICY = toolConfig.modelAutoselectPolicy || {};
    var DEFAULT_AUTOSELECT_COUNT = Number.isFinite(Number(toolConfig.defaultAutoselectCount))
      ? Number(toolConfig.defaultAutoselectCount)
      : 4;
    var SELECT_ALL_BY_DEFAULT = toolConfig.selectAllByDefault === true;

    var state = {
      lang: fallbackLang,
      preset: Object.keys(PRESETS)[0] || 'mnist',
      metric: null,
      dataByModel: {},
      dataModelOrder: [],
      statsByModel: {},
      selected: new Set(),
      hasInitialSelection: false,
      chart: null,
      modalChart: null,
      modalKeydownBound: false,
      modalResizeBound: false,
      simJobId: 0,
      lastNormalityRows: null,
      dataProfile: null,
      conditionMeta: null,
      simResultsCache: {},
      decisionUiByFactor: {},
      lastDecisionRows: null,
      lastDecisionExpectedOrder: null,
      modelDisplayByKey: {},
      modelColorByKey: {},
      summaryPercentile: 90,
      modelSummarySort: {
        key: '',
        dir: '',
      },
      decisionTreeRenderPending: false,
      decisionTreeRenderQueue: [],
    };

    var NORMAL_Z_P90 = 1.2815515655446004;

    function drawDecisionLinksIn(rootElement) {
      if (!rootElement) return;
      var flows = Array.prototype.slice.call(rootElement.querySelectorAll('.decision-flow'));
      flows.forEach(function (flow) {
        var svg = flow.querySelector('.decision-links');
        if (!svg) return;

        var fRect = flow.getBoundingClientRect();
        var width = Math.max(1, Math.round(fRect.width));
        var height = Math.max(1, Math.round(fRect.height));
        svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
        svg.setAttribute('width', String(width));
        svg.setAttribute('height', String(height));

        function anchorRight(el) {
          var r = el.getBoundingClientRect();
          return { x: r.right - fRect.left, y: r.top - fRect.top + r.height / 2 };
        }
        function anchorLeft(el) {
          var r = el.getBoundingClientRect();
          return { x: r.left - fRect.left, y: r.top - fRect.top + r.height / 2 };
        }
        function addPath(x1, y1, x2, y2, cls) {
          var dx = Math.max(14, Math.abs(x2 - x1) * 0.3);
          return '<path class="' + cls + '" d="M ' + x1.toFixed(2) + ' ' + y1.toFixed(2) + ' C ' + (x1 + dx).toFixed(2) + ' ' + y1.toFixed(2) + ', ' + (x2 - dx).toFixed(2) + ' ' + y2.toFixed(2) + ', ' + x2.toFixed(2) + ' ' + y2.toFixed(2) + '" />';
        }

        var paths = [];
        var activeStart = flow.querySelector('.decision-start-choice.is-active');
        var levelButtons = Array.prototype.slice.call(flow.querySelectorAll('.decision-level-choice'));
        var byLevel = {};
        levelButtons.forEach(function (btn) {
          var level = Number(btn.getAttribute('data-level'));
          if (!Number.isFinite(level)) return;
          if (!byLevel[level]) byLevel[level] = [];
          byLevel[level].push(btn);
        });

        var levels = Object.keys(byLevel)
          .map(function (k) { return Number(k); })
          .filter(function (n) { return Number.isFinite(n); })
          .sort(function (a, b) { return a - b; });

        if (activeStart && byLevel[0] && byLevel[0].length) {
          var s0 = anchorRight(activeStart);
          byLevel[0].forEach(function (btn) {
            var t0 = anchorLeft(btn);
            var isActive0 = btn.classList.contains('is-active');
            var isBest0 = btn.classList.contains('decision-choice--best');
            paths.push(addPath(s0.x, s0.y, t0.x, t0.y, 'decision-link decision-link--l1' + (isActive0 ? ' is-active' : '') + (isBest0 ? ' decision-link--best' : '')));
          });
        }

        levels.forEach(function (level) {
          var current = byLevel[level] || [];
          var next = byLevel[level + 1] || [];
          if (!current.length || !next.length) return;
          var byId = {};
          current.forEach(function (btn) {
            var id = String(btn.getAttribute('data-node-id') || '');
            if (id) byId[id] = btn;
          });
          next.forEach(function (child) {
            var parentId = String(child.getAttribute('data-parent-node-id') || '');
            var parent = byId[parentId];
            if (!parent) return;
            var s = anchorRight(parent);
            var t = anchorLeft(child);
            var isActive = child.classList.contains('is-active');
            var isBest = child.classList.contains('decision-choice--best');
            paths.push(addPath(s.x, s.y, t.x, t.y, 'decision-link decision-link--l2' + (isActive ? ' is-active' : '') + (isBest ? ' decision-link--best' : '')));
          });
        });

        svg.innerHTML = paths.join('');
      });
    }

    function normalizeDecisionChoiceSizes(rootElement) {
      if (!rootElement) return;
      var flows = Array.prototype.slice.call(rootElement.querySelectorAll('.decision-flow'));
      flows.forEach(function (flow) {
        var choices = Array.prototype.slice.call(flow.querySelectorAll('.decision-choice'));
        if (!choices.length) return;

        choices.forEach(function (el) {
          el.style.width = '';
          el.style.minHeight = '';
        });

        var maxW = 0;
        var maxH = 0;
        choices.forEach(function (el) {
          var rect = el.getBoundingClientRect();
          maxW = Math.max(maxW, rect.width);
          maxH = Math.max(maxH, rect.height);
        });

        var minColW = Infinity;
        Array.prototype.slice.call(flow.querySelectorAll('.decision-column')).forEach(function (col) {
          var rect = col.getBoundingClientRect();
          if (rect.width > 0) minColW = Math.min(minColW, rect.width);
        });
        if (!Number.isFinite(minColW)) minColW = maxW;

        var targetW = Math.max(92, Math.min(Math.ceil(maxW), Math.floor(minColW) - 2));
        var targetH = Math.max(30, Math.ceil(maxH));

        choices.forEach(function (el) {
          el.style.width = String(targetW) + 'px';
          el.style.minHeight = String(targetH) + 'px';
        });
      });
    }

    function distributeStep1ByLeaves(rootElement) {
      if (!rootElement) return;
      var flows = Array.prototype.slice.call(rootElement.querySelectorAll('.decision-flow'));
      flows.forEach(function (flow) {
        var levelButtons = Array.prototype.slice.call(flow.querySelectorAll('.decision-level-choice'));
        if (!levelButtons.length) return;

        levelButtons.forEach(function (btn) {
          btn.style.marginTop = '';
          btn.style.transform = '';
        });

        var flowRect = flow.getBoundingClientRect();
        var byLevel = {};
        levelButtons.forEach(function (btn) {
          var level = Number(btn.getAttribute('data-level'));
          if (!Number.isFinite(level)) return;
          if (!byLevel[level]) byLevel[level] = [];
          byLevel[level].push(btn);
        });
        var levels = Object.keys(byLevel)
          .map(function (k) { return Number(k); })
          .filter(function (n) { return Number.isFinite(n); })
          .sort(function (a, b) { return a - b; });

        var minGap = 8;
        var paddingTopBottom = 2;

        function solveLevel(level) {
          var current = byLevel[level] || [];
          var next = byLevel[level + 1] || [];
          if (!current.length || !next.length) return;

          var childrenByParent = {};
          next.forEach(function (child) {
            var parentId = String(child.getAttribute('data-parent-node-id') || '');
            if (!parentId) return;
            if (!childrenByParent[parentId]) childrenByParent[parentId] = [];
            childrenByParent[parentId].push(child);
          });

          var boxes = current.map(function (btn) {
            var rect = btn.getBoundingClientRect();
            var h = rect.height;
            var center = rect.top - flowRect.top + h / 2;
            var id = String(btn.getAttribute('data-node-id') || '');
            var children = childrenByParent[id] || [];
            var targetCenter = center;
            if (children.length) {
              var acc = 0;
              children.forEach(function (child) {
                var r = child.getBoundingClientRect();
                acc += (r.top - flowRect.top + r.height / 2);
              });
              targetCenter = acc / children.length;
            }
            return { btn: btn, h: h, baseCenter: center, targetCenter: targetCenter, solvedCenter: center };
          });

          boxes.forEach(function (item, index) {
            var minCenter = item.h / 2 + paddingTopBottom;
            if (index > 0) {
              var prev = boxes[index - 1];
              minCenter = Math.max(minCenter, prev.solvedCenter + (prev.h / 2) + (item.h / 2) + minGap);
            }
            item.solvedCenter = Math.max(item.targetCenter, minCenter);
          });

          for (var i = boxes.length - 1; i >= 0; i -= 1) {
            var item = boxes[i];
            var maxCenter = flowRect.height - (item.h / 2) - paddingTopBottom;
            if (i < boxes.length - 1) {
              var nx = boxes[i + 1];
              maxCenter = Math.min(maxCenter, nx.solvedCenter - (nx.h / 2) - (item.h / 2) - minGap);
            }
            item.solvedCenter = Math.min(item.solvedCenter, maxCenter);
          }

          boxes.forEach(function (item) {
            var delta = item.solvedCenter - item.baseCenter;
            if (Math.abs(delta) > 0.5) {
              item.btn.style.transform = 'translateY(' + Math.round(delta) + 'px)';
            }
          });
        }

        for (var l = levels.length - 2; l >= 0; l -= 1) {
          solveLevel(levels[l]);
        }
      });
    }

    function getCopy() {
      return i18nApi && typeof i18nApi.getCopy === 'function' ? i18nApi.getCopy(state.lang) : null;
    }

    function getApiBaseUrl() {
      var params = new URLSearchParams(window.location.search || '');
      var fromQuery = (params.get('apiBase') || '').trim();
      if (fromQuery) return fromQuery.replace(/\/$/, '');
      return 'http://localhost:8010';
    }

    function getPresetMetrics() {
      var preset = PRESETS[state.preset] || { metrics: {} };
      return preset.metrics || {};
    }

    function setText(id, value) {
      var el = document.getElementById(id);
      if (el && value != null) el.textContent = value;
    }

    function setHtml(id, value) {
      var el = document.getElementById(id);
      if (el && value != null) el.innerHTML = value;
    }

    function parseYamlArrayMap(raw) {
      if (window.StatToolCore && typeof window.StatToolCore.parseInlineYamlArrayMap === 'function') {
        return window.StatToolCore.parseInlineYamlArrayMap(raw);
      }
      return { map: {}, order: [] };
    }

    function parseCsvLine(line) {
      var values = [];
      var current = '';
      var inQuotes = false;
      for (var i = 0; i < line.length; i += 1) {
        var ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i += 1;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === ',' && !inQuotes) {
          values.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
      values.push(current);
      return values;
    }

    function parseCsvRows(raw) {
      var text = String(raw || '').replace(/^\uFEFF/, '');
      var lines = text.split(/\r?\n/).filter(function (line) {
        return String(line || '').trim().length > 0;
      });
      if (!lines.length) return { rows: [], headers: [] };

      var headers = parseCsvLine(lines[0]).map(function (h) { return String(h || '').trim(); });
      var rows = [];
      for (var i = 1; i < lines.length; i += 1) {
        var cells = parseCsvLine(lines[i]);
        var row = {};
        for (var j = 0; j < headers.length; j += 1) {
          row[headers[j]] = String(cells[j] == null ? '' : cells[j]).trim();
        }
        rows.push(row);
      }
      return { rows: rows, headers: headers };
    }

    function toFiniteNumber(value) {
      var n = Number(value);
      return Number.isFinite(n) ? n : NaN;
    }

    function normalizeHeaderKey(value) {
      return String(value == null ? '' : value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
    }

    function asArray(value) {
      if (Array.isArray(value)) return value.slice();
      if (value == null || value === '') return [];
      return [value];
    }

    function resolveHeaderName(headers, candidates) {
      var names = Array.isArray(headers) ? headers : [];
      var cand = asArray(candidates).map(function (c) { return String(c || '').trim(); }).filter(Boolean);
      if (!cand.length || !names.length) return '';

      for (var i = 0; i < cand.length; i += 1) {
        var c0 = cand[i];
        for (var j = 0; j < names.length; j += 1) {
          if (String(names[j] || '').trim() === c0) return names[j];
        }
      }

      var byNorm = {};
      names.forEach(function (h) {
        byNorm[normalizeHeaderKey(h)] = h;
      });
      for (var k = 0; k < cand.length; k += 1) {
        var key = normalizeHeaderKey(cand[k]);
        if (key && Object.prototype.hasOwnProperty.call(byNorm, key)) return byNorm[key];
      }
      return '';
    }

    function buildTableHeaderMap(headers, tableCfg) {
      var map = {};
      var aliases = tableCfg && tableCfg.fieldAliases ? tableCfg.fieldAliases : {};

      function resolveField(fieldName) {
        var field = String(fieldName || '').trim();
        if (!field) return;
        if (Object.prototype.hasOwnProperty.call(map, field)) return;
        var extra = Array.isArray(aliases[field]) ? aliases[field] : [];
        var resolved = resolveHeaderName(headers, [field].concat(extra));
        map[field] = resolved || field;
      }

      var metricCandidates = asArray(tableCfg && tableCfg.metricColumn);
      metricCandidates.forEach(resolveField);

      var factors = Array.isArray(tableCfg && tableCfg.factors) ? tableCfg.factors : [];
      factors.forEach(function (factor) {
        resolveField(factor && factor.field);
      });

      if (tableCfg && tableCfg.groupField) resolveField(tableCfg.groupField);

      var template = tableCfg && typeof tableCfg.modelTemplate === 'string' ? tableCfg.modelTemplate : '';
      template.replace(/\{([^}]+)\}/g, function (_m, field) {
        resolveField(field);
        return _m;
      });

      return map;
    }

    function getRowField(row, fieldName, headerMap) {
      var field = String(fieldName || '').trim();
      if (!field) return '';
      var resolved = headerMap && Object.prototype.hasOwnProperty.call(headerMap, field) ? headerMap[field] : field;
      if (row && Object.prototype.hasOwnProperty.call(row, resolved)) return row[resolved];
      if (row && Object.prototype.hasOwnProperty.call(row, field)) return row[field];
      return '';
    }

    function buildModelKeyFromRow(row, tableCfg, headerMap) {
      var template = tableCfg && typeof tableCfg.modelTemplate === 'string' ? tableCfg.modelTemplate : '';
      if (template) {
        return template.replace(/\{([^}]+)\}/g, function (_m, field) {
          var key = String(field || '').trim();
          var raw = getRowField(row, key, headerMap);
          return String(raw == null ? '' : raw).trim();
        });
      }

      var factors = Array.isArray(tableCfg && tableCfg.factors) ? tableCfg.factors : [];
      var parts = factors.map(function (factor) {
        var field = factor && factor.field ? String(factor.field) : '';
        var label = factor && factor.label ? String(factor.label) : field;
        var raw = getRowField(row, field, headerMap);
        return label + ':' + String(raw == null ? '' : raw).trim();
      }).filter(Boolean);

      return parts.join(' | ');
    }

    function profileTableRows(rows, modelOrder, tableCfg, headerMap) {
      var profile = {
        source: 'table',
        rowsTotal: Array.isArray(rows) ? rows.length : 0,
        modelsCount: Array.isArray(modelOrder) ? modelOrder.length : 0,
        groupingField: tableCfg && tableCfg.groupField ? String(tableCfg.groupField) : '',
        paired: false,
        completeGroups: 0,
        incompleteGroups: 0,
      };

      var groupField = profile.groupingField;
      var resolvedGroupField = groupField ? (headerMap && headerMap[groupField] ? headerMap[groupField] : groupField) : '';
      if (!groupField) return profile;

      var conditionsTotal = profile.modelsCount;
      var groups = {};

      rows.forEach(function (row) {
        var gid = row && Object.prototype.hasOwnProperty.call(row, resolvedGroupField) ? String(row[resolvedGroupField]) : '';
        var model = row && row.__modelKey ? String(row.__modelKey) : '';
        if (!gid || !model) return;
        if (!groups[gid]) groups[gid] = {};
        if (!groups[gid][model]) groups[gid][model] = 0;
        groups[gid][model] += 1;
      });

      Object.keys(groups).forEach(function (gid) {
        var modelCounts = groups[gid];
        var modelKeys = Object.keys(modelCounts);
        var complete = conditionsTotal > 0 && modelKeys.length === conditionsTotal;
        if (complete) {
          for (var i = 0; i < modelKeys.length; i += 1) {
            if (modelCounts[modelKeys[i]] !== 1) {
              complete = false;
              break;
            }
          }
        }
        if (complete) profile.completeGroups += 1;
        else profile.incompleteGroups += 1;
      });

      profile.paired = profile.completeGroups > 0 && profile.incompleteGroups === 0;
      return profile;
    }

    function buildDataFromCsvTable(raw, tableCfg) {
      var parsed = parseCsvRows(raw);
      var rows = parsed.rows || [];
      var headers = parsed.headers || [];
      var headerMap = buildTableHeaderMap(headers, tableCfg || {});
      var metricCandidates = asArray(tableCfg && tableCfg.metricColumn);
      var metricColumn = '';
      for (var mc = 0; mc < metricCandidates.length; mc += 1) {
        var c = String(metricCandidates[mc] || '').trim();
        if (!c) continue;
        var resolved = headerMap[c] || c;
        if (headers.indexOf(resolved) !== -1) {
          metricColumn = resolved;
          break;
        }
      }
      if (!metricColumn) {
        metricColumn = resolveHeaderName(headers, metricCandidates);
      }
      var factors = Array.isArray(tableCfg && tableCfg.factors) ? tableCfg.factors : [];
      var dataByModel = {};
      var order = [];
      var validRows = [];
      var modelFactors = {};
      var displayByModel = {};

      rows.forEach(function (row) {
        var key = buildModelKeyFromRow(row, tableCfg, headerMap);
        if (!key) return;

        var metricValue = toFiniteNumber(row[metricColumn]);
        if (!Number.isFinite(metricValue)) return;

        row.__modelKey = key;
        validRows.push(row);

        if (!Object.prototype.hasOwnProperty.call(dataByModel, key)) {
          dataByModel[key] = [];
          order.push(key);
          var factorObj = {};
          factors.forEach(function (factor) {
            var field = factor && factor.field ? String(factor.field) : '';
            if (!field) return;
            var fv = getRowField(row, field, headerMap);
            factorObj[field] = String(fv == null ? '' : fv).trim();
          });
          modelFactors[key] = factorObj;
          displayByModel[key] = deriveModelDisplayName(key, factorObj);
        }
        dataByModel[key].push(metricValue);
      });

      return {
        map: dataByModel,
        order: order,
        profile: profileTableRows(validRows, order, tableCfg, headerMap),
        conditionMeta: {
          factor_order: factors.map(function (f) { return String(f.field || '').trim(); }).filter(Boolean),
          model_factors: modelFactors,
        },
        displayByModel: displayByModel,
      };
    }

    function getMetricFiles(metricInfo) {
      var files = [];
      if (metricInfo && typeof metricInfo.file === 'string' && metricInfo.file.trim()) {
        files.push(metricInfo.file.trim());
      }
      if (metricInfo && Array.isArray(metricInfo.files)) {
        metricInfo.files.forEach(function (f) {
          if (typeof f === 'string' && f.trim()) files.push(f.trim());
        });
      }
      return files;
    }

    function mergeParsedInto(targetMap, targetOrder, parsed) {
      var map = parsed && parsed.map ? parsed.map : {};
      var order = parsed && Array.isArray(parsed.order) ? parsed.order : Object.keys(map);
      order.forEach(function (model) {
        if (Object.prototype.hasOwnProperty.call(targetMap, model)) return;
        targetMap[model] = Array.isArray(map[model]) ? map[model].slice() : [];
        targetOrder.push(model);
      });
    }

    function mean(values) {
      if (!values.length) return NaN;
      var sum = 0;
      for (var i = 0; i < values.length; i += 1) sum += values[i];
      return sum / values.length;
    }

    function std(values, m) {
      if (values.length < 2) return 0;
      var acc = 0;
      for (var i = 0; i < values.length; i += 1) {
        var d = values[i] - m;
        acc += d * d;
      }
      return Math.sqrt(acc / values.length);
    }

    function median(values) {
      if (!values.length) return NaN;
      var sorted = values.slice().sort(function (a, b) { return a - b; });
      var mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    }

    function sampleSkewness(values, m, s) {
      var n = values.length;
      if (n < 3 || !Number.isFinite(s) || s <= 0) return 0;
      var acc = 0;
      for (var i = 0; i < n; i += 1) {
        var z = (values[i] - m) / s;
        acc += z * z * z;
      }
      return (n / ((n - 1) * (n - 2))) * acc;
    }

    function sampleKurtosisFisher(values, m, s) {
      var n = values.length;
      if (n < 4 || !Number.isFinite(s) || s <= 0) return 0;
      var acc4 = 0;
      for (var i = 0; i < n; i += 1) {
        var z = (values[i] - m) / s;
        acc4 += z * z * z * z;
      }
      var term1 = (n * (n + 1) * acc4) / ((n - 1) * (n - 2) * (n - 3));
      var term2 = (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3));
      return term1 - term2;
    }

    function computeStats(dataByModel) {
      var out = {};
      Object.keys(dataByModel).forEach(function (model) {
        var vals = dataByModel[model] || [];
        var m = mean(vals);
        out[model] = {
          mean: m,
          std: std(vals, m),
          n: vals.length,
          max: vals.length ? Math.max.apply(null, vals) : NaN,
        };
      });
      return out;
    }

    function normalizeFlagToken(value) {
      var v = String(value == null ? '' : value).trim().toLowerCase();
      if (!v) return 'none';
      if (v === 'none' || v === 'false' || v === '0' || v === 'no') return 'none';
      if (v === 'clahe' || v === 'true' || v === '1' || v === 'yes') return 'clahe';
      return v;
    }

    function deriveModelDisplayName(modelKey, factorObj) {
      var key = String(modelKey || '');
      var factors = factorObj && typeof factorObj === 'object' ? factorObj : {};
      var fusion = String(factors.fusion || factors['fusion method'] || '').trim();
      var rgb = normalizeFlagToken(factors.rgb_eq || factors.rgb_equalization || factors['rgb equalization']);
      var th = normalizeFlagToken(factors.th_eq || factors.th_equalization || factors['th equalization']);

      // Normalize known legacy typo variants to the canonical YAML suffixes.
      key = key
        .replace(/_rgb_equalizat(?:oin|on)\b/gi, '_rgb_equalization')
        .replace(/_rgb_th_equalizat(?:oin|on)\b/gi, '_rgb_th_equalization')
        .replace(/_th_equalizat(?:oin|on)\b/gi, '_th_equalization');

      // Accept legacy condition-key styles (e.g. LLVIP_VT_rgb-clahe_th-none)
      // and rewrite them to the canonical selector suffixes.
      var legacyMatch = key.match(/^(LLVIP_[^_]+)_rgb[-_]?([^_]+)_th[-_]?([^_]+)$/i);
      if (legacyMatch) {
        var legacyRgb = normalizeFlagToken(legacyMatch[2]);
        var legacyTh = normalizeFlagToken(legacyMatch[3]);
        if (legacyRgb === 'none' && legacyTh === 'none') return legacyMatch[1] + '_no_equalization';
        if (legacyRgb === 'clahe' && legacyTh === 'none') return legacyMatch[1] + '_rgb_equalization';
        if (legacyRgb === 'none' && legacyTh === 'clahe') return legacyMatch[1] + '_th_equalization';
        if (legacyRgb === 'clahe' && legacyTh === 'clahe') return legacyMatch[1] + '_rgb_th_equalization';
        return legacyMatch[1] + '_rgb_' + legacyRgb + '_th_' + legacyTh;
      }

      if (key.indexOf('LLVIP_') === 0 && fusion) {
        if (rgb === 'none' && th === 'none') return 'LLVIP_' + fusion + '_no_equalization';
        if (rgb === 'clahe' && th === 'none') return 'LLVIP_' + fusion + '_rgb_equalization';
        if (rgb === 'none' && th === 'clahe') return 'LLVIP_' + fusion + '_th_equalization';
        if (rgb === 'clahe' && th === 'clahe') return 'LLVIP_' + fusion + '_rgb_th_equalization';
        return 'LLVIP_' + fusion + '_rgb_' + rgb + '_th_' + th;
      }
      return key;
    }

    function getModelPalette() {
      var histHelper = window.SharedHistogramNormalChart;
      if (histHelper && typeof histHelper.getTokenPalette === 'function') {
        return histHelper.getTokenPalette();
      }
      var legendHelper = window.SharedChartLegend;
      if (legendHelper && typeof legendHelper.getDataPalette === 'function') {
        return legendHelper.getDataPalette();
      }
      return ['#58a6ff', '#d29922', '#3fb950', '#bc8cff', '#f85149', '#6e7681'];
    }

    function rebuildModelColorMap() {
      var palette = getModelPalette();
      var order = Array.isArray(state.dataModelOrder) && state.dataModelOrder.length
        ? state.dataModelOrder
        : Object.keys(state.dataByModel || {});
      var out = {};
      order.forEach(function (model, idx) {
        out[model] = palette[idx % Math.max(1, palette.length)];
      });
      state.modelColorByKey = out;
    }

    function getModelSummarySortConfig() {
      var table = document.getElementById('model-summary-table');
      if (!table) return { table: null, enabled: false, sortableKeys: [] };
      var enabled = String(table.getAttribute('data-sort-enabled') || '').toLowerCase() === 'true';
      var listRaw = String(table.getAttribute('data-sortable-columns') || '');
      var sortableKeys = listRaw
        .split(',')
        .map(function (part) { return String(part || '').trim().toLowerCase(); })
        .filter(Boolean);
      return { table: table, enabled: enabled, sortableKeys: sortableKeys };
    }

    function applyModelSummarySort(rows, sortableKeys) {
      var sort = state.modelSummarySort || { key: '', dir: '' };
      var key = String(sort.key || '').toLowerCase();
      var dir = String(sort.dir || '').toLowerCase();
      if (!key || !dir) return rows;
      if (sortableKeys.indexOf(key) === -1) return rows;

      var mult = dir === 'asc' ? 1 : -1;
      return rows.slice().sort(function (a, b) {
        var av = a[key];
        var bv = b[key];
        var aFinite = Number.isFinite(av);
        var bFinite = Number.isFinite(bv);
        if (!aFinite && !bFinite) return 0;
        if (!aFinite) return 1;
        if (!bFinite) return -1;
        if (av === bv) return 0;
        return av > bv ? mult : -mult;
      });
    }

    function updateModelSummarySortHeaders(sortableKeys) {
      var table = document.getElementById('model-summary-table');
      if (!table) return;
      var current = state.modelSummarySort || { key: '', dir: '' };
      var copy = getCopy() || {};
      var sortHint = String(copy.modelSummarySortHint || 'Click to sort');

      Array.prototype.slice.call(table.querySelectorAll('th[data-sort-key]')).forEach(function (th) {
        var key = String(th.getAttribute('data-sort-key') || '').toLowerCase();
        var enabled = sortableKeys.indexOf(key) !== -1;
        th.classList.toggle('mlva-sortable', enabled);
        th.classList.toggle('mlva-sort-active', enabled && current.key === key && !!current.dir);
        th.setAttribute('title', enabled ? sortHint : '');
        th.setAttribute('aria-sort', enabled && current.key === key
          ? (current.dir === 'asc' ? 'ascending' : current.dir === 'desc' ? 'descending' : 'none')
          : 'none');
      });
    }

    function bindModelSummarySorting() {
      var cfg = getModelSummarySortConfig();
      if (!cfg.table) return;

      var sortableKeys = cfg.enabled ? cfg.sortableKeys : [];
      if (!sortableKeys.length) {
        state.modelSummarySort = { key: '', dir: '' };
      }
      Array.prototype.slice.call(cfg.table.querySelectorAll('th[data-sort-key]')).forEach(function (th) {
        if (th.getAttribute('data-sort-bound') === '1') return;
        th.setAttribute('data-sort-bound', '1');
        th.addEventListener('click', function () {
          var key = String(th.getAttribute('data-sort-key') || '').toLowerCase();
          if (!key || sortableKeys.indexOf(key) === -1) return;

          var current = state.modelSummarySort || { key: '', dir: '' };
          if (current.key !== key) {
            state.modelSummarySort = { key: key, dir: 'desc' };
          } else if (current.dir === 'desc') {
            state.modelSummarySort = { key: key, dir: 'asc' };
          } else if (current.dir === 'asc') {
            state.modelSummarySort = { key: '', dir: '' };
          } else {
            state.modelSummarySort = { key: key, dir: 'desc' };
          }
          renderModelSummaryTable();
        });
      });

      updateModelSummarySortHeaders(sortableKeys);
    }

    function renderModelSummaryTable() {
      var tbody = document.getElementById('model-summary-table-body');
      if (!tbody) return;
      var ordered = modelOrder();
      if (!ordered.length) {
        tbody.innerHTML = '';
        return;
      }

      var cfg = getModelSummarySortConfig();
      var sortableKeys = cfg.enabled ? cfg.sortableKeys : [];

      var rows = ordered.map(function (model) {
        var st = state.statsByModel[model] || { max: NaN, n: 0, mean: NaN, std: NaN };
        var p90 = Number.isFinite(st.mean) && Number.isFinite(st.std)
          ? (st.mean + NORMAL_Z_P90 * st.std)
          : NaN;
        return {
          model: model,
          label: state.modelDisplayByKey[model] || model,
          color: state.modelColorByKey[model] || '#58a6ff',
          best: st.max,
          n: st.n || 0,
          mean: st.mean,
          std: st.std,
          p90: p90,
        };
      });

      var maxBest = -Infinity;
      var maxMean = -Infinity;
      var maxP90 = -Infinity;
      rows.forEach(function (row) {
        if (Number.isFinite(row.best)) maxBest = Math.max(maxBest, row.best);
        if (Number.isFinite(row.mean)) maxMean = Math.max(maxMean, row.mean);
        if (Number.isFinite(row.p90)) maxP90 = Math.max(maxP90, row.p90);
      });

      var shownRows = applyModelSummarySort(rows, sortableKeys);

      function metricCell(value, isMax) {
        var text = escapeHtml(formatMetric(value));
        if (!isMax) return '<td class="shared-cell-num">' + text + '</td>';
        return '<td class="shared-cell-num"><span class="mlva-max-badge">' + text + '</span></td>';
      }

      tbody.innerHTML = shownRows.map(function (row) {
        var bestIsMax = Number.isFinite(row.best) && row.best === maxBest;
        var meanIsMax = Number.isFinite(row.mean) && row.mean === maxMean;
        var p90IsMax = Number.isFinite(row.p90) && row.p90 === maxP90;

        return '<tr>' +
          '<td class="shared-cell-text" title="' + escapeHtml(row.label) + '">' +
            '<span class="mlva-model-with-swatch">' +
              '<span class="mlva-model-swatch" style="--swatch-color:' + escapeHtml(row.color) + ';"></span>' +
              '<span>' + escapeHtml(row.label) + '</span>' +
            '</span>' +
          '</td>' +
          metricCell(row.best, bestIsMax) +
          '<td class="shared-cell-num">' + escapeHtml(String(row.n)) + '</td>' +
          metricCell(row.mean, meanIsMax) +
          '<td class="shared-cell-num">' + escapeHtml(formatMetric(row.std)) + '</td>' +
          metricCell(row.p90, p90IsMax) +
        '</tr>';
      }).join('');

      updateModelSummarySortHeaders(sortableKeys);
    }

    function rankByStatsOrder(models) {
      return models.slice().sort(function (a, b) {
        var byMax = state.statsByModel[b].max - state.statsByModel[a].max;
        if (byMax !== 0) return byMax;
        return state.statsByModel[b].mean - state.statsByModel[a].mean;
      });
    }

    function getConfiguredOrderPolicy() {
      var presetCfg = MODEL_ORDER_POLICY[state.preset] || null;
      if (!presetCfg) return null;
      return presetCfg[state.metric];
    }

    function applyOrderPolicy(availableModels, policy) {
      var yamlOrder = Array.isArray(state.dataModelOrder) && state.dataModelOrder.length
        ? state.dataModelOrder
        : Object.keys(state.dataByModel || {});

      if (window.StatToolCore && typeof window.StatToolCore.applyOrderPolicy === 'function') {
        return window.StatToolCore.applyOrderPolicy({
          availableModels: availableModels,
          policy: policy,
          yamlOrder: yamlOrder,
          ranker: rankByStatsOrder,
        });
      }

      if (policy === 'yaml') return yamlOrder.filter(function (m) { return availableModels.indexOf(m) !== -1; });
      return rankByStatsOrder(availableModels);
    }

    function modelOrder() {
      var available = Object.keys(state.statsByModel);
      var policy = getConfiguredOrderPolicy();
      return applyOrderPolicy(available, policy);
    }

    function resolveAutoselection(orderedModels) {
      if (SELECT_ALL_BY_DEFAULT) return orderedModels.slice();

      var presetCfg = MODEL_AUTOSELECT_POLICY[state.preset] || null;
      var policy = presetCfg ? presetCfg[state.metric] : null;

      if (window.StatToolCore && typeof window.StatToolCore.resolveAutoselection === 'function') {
        return window.StatToolCore.resolveAutoselection({
          orderedModels: orderedModels,
          policy: policy,
          fallbackCount: DEFAULT_AUTOSELECT_COUNT,
        });
      }

      var count = Number(policy);
      if (!Number.isFinite(count)) count = DEFAULT_AUTOSELECT_COUNT;
      count = Math.max(0, Math.floor(count));
      return orderedModels.slice(0, Math.min(count, orderedModels.length));
    }

    function ensureSelectionDefaults() {
      var ordered = modelOrder();
      if (!ordered.length) {
        state.selected.clear();
        return;
      }
      if (!state.hasInitialSelection && state.selected.size === 0) {
        resolveAutoselection(ordered).forEach(function (m) {
          state.selected.add(m);
        });
        state.hasInitialSelection = true;
      }
    }

    function getSelectedOrdered() {
      return modelOrder().filter(function (m) {
        return state.selected.has(m);
      });
    }

    function formatMetric(value) {
      var info = getPresetMetrics()[state.metric] || { scale: 'ratio' };
      if (!Number.isFinite(value)) return 'n/a';
      if (info.scale === 'percent') return value.toFixed(3);
      return value.toFixed(4);
    }

    function formatPct(p) {
      if (!Number.isFinite(p)) return 'n/a';
      if (p > 0 && p < 0.0001) return '<0.01%';
      return (p * 100).toFixed(2) + '%';
    }

    function getMetricLabel(metric, copy) {
      var byKey = {
        accuracy: copy.metricAccuracy,
        map50: copy.metricMap50,
        map5095: copy.metricMap5095,
        precision: copy.metricP,
        recall: copy.metricR,
        ablation_accuracy: copy.metricAblationAccuracy,
        ablation_map50: copy.metricAblationMap50,
        ablation_map5095: copy.metricAblationMap5095,
        ablation_precision: copy.metricAblationP,
        ablation_recall: copy.metricAblationR,
      };
      return byKey[metric] || metric;
    }

    function renderCaseContext(copy) {
      if (!copy) return;
      var html = '';
      if (state.preset === 'detection') html = copy.caseContextDetection || '';
      else if (state.preset === 'mnist') html = copy.caseContextMnist || '';

      if (state.dataProfile && state.dataProfile.source === 'table') {
        var p = state.dataProfile;
        var modeLabel = p.paired
          ? (state.lang === 'es' ? 'modo emparejado' : 'paired mode')
          : (state.lang === 'es' ? 'modo no emparejado' : 'unpaired mode');
        var groupLabel = p.groupingField
          ? (state.lang === 'es' ? ('grupo: ' + p.groupingField) : ('group: ' + p.groupingField))
          : (state.lang === 'es' ? 'sin agrupacion' : 'no grouping field');
        var summaryLabel = state.lang === 'es'
          ? ('Tabla cargada: ' + p.rowsTotal + ' filas, ' + p.modelsCount + ' condiciones, ' + modeLabel + ' (' + groupLabel + ').')
          : ('Table loaded: ' + p.rowsTotal + ' rows, ' + p.modelsCount + ' conditions, ' + modeLabel + ' (' + groupLabel + ').');
        html += '<br><span class="hint">' + summaryLabel + '</span>';
      }

      setHtml('case-context-note', html);
    }

    function renderPresetTabs() {
      var copy = getCopy();
      var root = document.getElementById('preset-tabs');
      if (!root || !copy) return;

      var items = [];
      Object.keys(PRESETS).forEach(function (presetId) {
        var label = presetId === 'mnist' ? (copy.presetMnist || 'MNIST') : (presetId === 'detection' ? (copy.presetDetection || 'Detection') : presetId);
        items.push({ id: presetId, label: label });
      });

      if (window.StatMlvaUiCore && typeof window.StatMlvaUiCore.renderTabButtons === 'function') {
        window.StatMlvaUiCore.renderTabButtons({
          root: root,
          active: state.preset,
          attrName: 'data-preset',
          className: 'shared-tab',
          items: items,
          onSelect: function (preset) {
            if (preset === state.preset) return;
            state.preset = preset;
            var metricKeys = Object.keys(getPresetMetrics());
            state.metric = metricKeys[0] || null;
            renderCaseContext(getCopy());
            renderPresetTabs();
            loadData();
          }
        });
      }
    }

    function renderMetricTabs() {
      var copy = getCopy();
      var root = document.getElementById('metric-tabs');
      if (!root || !copy) return;

      var metrics = Object.keys(getPresetMetrics());
      if (!getPresetMetrics()[state.metric]) state.metric = metrics[0] || null;

      if (window.StatMlvaUiCore && typeof window.StatMlvaUiCore.renderTabButtons === 'function') {
        window.StatMlvaUiCore.renderTabButtons({
          root: root,
          active: state.metric,
          attrName: 'data-metric',
          className: 'shared-tab',
          items: metrics.map(function (metric) {
            return { id: metric, label: getMetricLabel(metric, copy) };
          }),
          onSelect: function (metric) {
            if (metric === state.metric) return;
            state.metric = metric;
            loadData();
          }
        });
      }
    }

    function renderModelList() {
      var root = document.getElementById('model-list');
      if (!root) return;
      var ordered = modelOrder();
      var copy = getCopy();

      if (window.StatMlvaUiCore && typeof window.StatMlvaUiCore.renderModelChecklist === 'function') {
        window.StatMlvaUiCore.renderModelChecklist({
          root: root,
          orderedModels: ordered,
          selectedSet: state.selected,
          statsByModel: state.statsByModel,
          displayNameByModel: state.modelDisplayByKey,
          formatMetric: formatMetric,
          noDataText: copy ? copy.noData : 'No data',
          onToggle: function (model, checked) {
            if (checked) state.selected.add(model);
            else state.selected.delete(model);
            renderModelList();
            renderModelSummaryTable();
            renderChart();
            renderNormalityTable();
            markResultsStale();
          }
        });
      }
    }

    function renderNormalityTable() {
      var tbody = document.getElementById('normality-table-body');
      if (!tbody) return;
      if (!window.StatMlvaNormalityCore || typeof window.StatMlvaNormalityCore.renderTable !== 'function') {
        tbody.innerHTML = '';
        return;
      }

      window.StatMlvaNormalityCore.renderTable({
        tbody: tbody,
        selectedModels: getSelectedOrdered(),
        dataByModel: state.dataByModel,
        statsByModel: state.statsByModel,
        displayNameByModel: state.modelDisplayByKey,
        colorByModel: state.modelColorByKey,
        normalityRows: state.lastNormalityRows,
        formatMetric: formatMetric,
        medianFn: median,
        skewnessFn: sampleSkewness,
        kurtosisFn: sampleKurtosisFisher,
      });
    }

    function drawPlaceholderPlot() {
      var canvas = document.getElementById('standardizing-plot-canvas');
      if (!canvas) return;
      var ctx = canvas.getContext('2d');
      if (!ctx) return;

      var dpr = window.devicePixelRatio || 1;
      var rect = canvas.getBoundingClientRect();
      var width = Math.max(320, Math.floor(rect.width || 720));
      var height = Math.max(300, Math.floor(rect.height || 390));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#7f8c9d';
      ctx.font = '600 16px sans-serif';
      ctx.fillText('Standardization plot placeholder', 20, 40);
      ctx.font = '400 13px sans-serif';
      ctx.fillText('Metric: ' + (state.metric || 'n/a'), 20, 68);
      ctx.fillText('Selected models: ' + getSelectedOrdered().length, 20, 90);

      ctx.strokeStyle = 'rgba(120,130,145,.35)';
      ctx.lineWidth = 1;
      for (var x = 20; x < width - 20; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 110);
        ctx.lineTo(x, height - 20);
        ctx.stroke();
      }
      for (var y = 110; y < height - 20; y += 30) {
        ctx.beginPath();
        ctx.moveTo(20, y);
        ctx.lineTo(width - 20, y);
        ctx.stroke();
      }
    }

    function buildHistogramChart(canvas, assignToModal) {
      if (!canvas || !window.Chart) return;
      var selected = getSelectedOrdered();
      if (!selected.length) {
        if (assignToModal) {
          if (state.modalChart) { state.modalChart.destroy(); state.modalChart = null; }
        } else if (state.chart) {
          state.chart.destroy();
          state.chart = null;
        }
        return;
      }

      var copy = getCopy() || {};
      var series = selected.map(function (model) {
        var st = state.statsByModel[model];
        var label = state.modelDisplayByKey[model] || deriveModelDisplayName(model, null) || model;
        return {
          label: label,
          values: state.dataByModel[model] || [],
          mean: st.mean,
          std: st.std,
        };
      });

      var helper = window.SharedHistogramNormalChart;
      if (!helper || typeof helper.createContinuousHistogramChart !== 'function') return;

      if (assignToModal) {
        if (state.modalChart) {
          if (window.SharedChartInteractions && typeof window.SharedChartInteractions.detach === 'function') {
            window.SharedChartInteractions.detach(canvas);
          }
          state.modalChart.destroy();
        }
      } else if (state.chart) {
        state.chart.destroy();
      }

      var metricLabel = getMetricLabel(state.metric, copy);
      var nextChart = helper.createContinuousHistogramChart({
        canvas: canvas,
        series: series,
        normalLabel: copy.normalLegendLabel || 'Fitted normal (dotted line)',
        xTitle: metricLabel,
        yTitle: 'count',
      });
      if (!nextChart) return;

      if (assignToModal) {
        state.modalChart = nextChart;
        if (window.SharedChartInteractions && typeof window.SharedChartInteractions.attach === 'function') {
          var xScale = nextChart.scales && nextChart.scales.x;
          var yScale = nextChart.scales && nextChart.scales.y;
          window.SharedChartInteractions.attach({
            canvas: canvas,
            getChart: function () { return state.modalChart; },
            defaults: {
              xMin: xScale ? Number(xScale.min) : undefined,
              xMax: xScale ? Number(xScale.max) : undefined,
              yMin: yScale ? Number(yScale.min) : undefined,
              yMax: yScale ? Number(yScale.max) : undefined,
              mode: 'xy',
            }
          });
        }
      } else {
        state.chart = nextChart;
      }
    }

    function renderChart() {
      if (chartMode === 'histogram') buildHistogramChart(document.getElementById('distribution-chart'), false);
      else drawPlaceholderPlot();
    }

    function openChartModal() {
      if (chartMode !== 'histogram') return;
      var overlay = document.getElementById('chart-modal-overlay');
      var modalCanvas = document.getElementById('distribution-chart-modal');
      if (!overlay || !modalCanvas) return;
      overlay.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      if (!state.modalKeydownBound) {
        document.addEventListener('keydown', handleModalKeydown);
        state.modalKeydownBound = true;
      }
      buildHistogramChart(modalCanvas, true);
    }

    function renderDecisionTreeIntoRoot(rootElement, html, done) {
      if (!rootElement) {
        if (typeof done === 'function') done();
        return;
      }
      var rect = rootElement.getBoundingClientRect();
      var parentRect = rootElement.parentElement ? rootElement.parentElement.getBoundingClientRect() : null;
      var widthPx = Math.round(
        (rect && rect.width) ||
        rootElement.offsetWidth ||
        (parentRect && parentRect.width) ||
        900
      );
      widthPx = Math.max(320, widthPx);

      var stage = document.createElement('div');
      stage.style.position = 'fixed';
      stage.style.left = '-20000px';
      stage.style.top = '0';
      stage.style.width = String(widthPx) + 'px';
      stage.style.visibility = 'hidden';
      stage.style.pointerEvents = 'none';
      stage.style.zIndex = '-1';
      stage.innerHTML = html;
      document.body.appendChild(stage);

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          normalizeDecisionChoiceSizes(stage);
          distributeStep1ByLeaves(stage);
          drawDecisionLinksIn(stage);

          rootElement.innerHTML = stage.innerHTML;
          if (stage.parentNode) stage.parentNode.removeChild(stage);
          if (typeof done === 'function') done();
        });
      });
    }

    function runDecisionTreeRenderQueue() {
      if (!Array.isArray(state.decisionTreeRenderQueue) || !state.decisionTreeRenderQueue.length) return;
      var queue = state.decisionTreeRenderQueue.slice();
      state.decisionTreeRenderQueue = [];
      queue.forEach(function (fn) {
        try { if (typeof fn === 'function') fn(); } catch (_e) {}
      });
    }

    function openDecisionTreeModal(factor) {
      var overlay = document.getElementById('decision-tree-modal-overlay');
      var modalRoot = document.getElementById('decision-tree-modal-canvas');
      var treeRoot = document.getElementById('decision-tree-plots');
      var modalTitle = document.getElementById('decision-tree-modal-title');
      var copy = getCopy() || {};
      function verboseFactor(value) {
        var raw = String(value == null ? '' : value);
        if (raw === 'learning_rate') return 'learning rate';
        if (raw === 'batch_size') return 'batch size';
        return raw.replace(/_/g, ' ');
      }
      if (!overlay || !modalRoot || !treeRoot) return;

      if (state.decisionTreeRenderPending) {
        state.decisionTreeRenderQueue.push(function () { openDecisionTreeModal(factor); });
        return;
      }

      var sourceHtml = treeRoot.innerHTML;
      if (factor) {
        var panel = treeRoot.querySelector('.decision-tree-panel[data-factor="' + factor.replace(/"/g, '\\"') + '"]');
        if (panel) {
          var flow = panel.querySelector('.decision-flow');
          var legend = panel.querySelector('.decision-legend-note');
          sourceHtml = '<div class="decision-modal-content">' +
            (flow ? flow.outerHTML : '') +
            (legend ? legend.outerHTML : '') +
          '</div>';
          if (modalTitle) {
            modalTitle.textContent = (copy.fixFactorLabel || 'Fixed parameter') + ': ' + verboseFactor(factor);
          }
        }
      } else if (modalTitle) {
        modalTitle.textContent = copy.decisionTreeTitle || 'Decision path tree';
      }

      overlay.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      if (!state.modalKeydownBound) {
        document.addEventListener('keydown', handleModalKeydown);
        state.modalKeydownBound = true;
      }

      renderDecisionTreeIntoRoot(modalRoot, sourceHtml, function () {
        modalRoot.querySelectorAll('[data-start-key]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var f = String(btn.getAttribute('data-factor') || factor || '');
            if (!f) return;
            var ui = state.decisionUiByFactor[f] || (state.decisionUiByFactor[f] = { start: '', pathSel: {} });
            ui.start = String(btn.getAttribute('data-start-key') || '');
            ui.pathSel = {};
            rerenderFromModal(f);
          });
        });

        modalRoot.querySelectorAll('[data-decision-node]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var f = String(btn.getAttribute('data-factor') || factor || '');
            if (!f) return;
            var ui = state.decisionUiByFactor[f] || (state.decisionUiByFactor[f] = { start: '', pathSel: {} });
            var level = Number(btn.getAttribute('data-level'));
            var nodeId = String(btn.getAttribute('data-node-id') || '');
            if (!Number.isFinite(level) || !nodeId) return;
            if (!ui.pathSel || typeof ui.pathSel !== 'object') ui.pathSel = {};
            ui.pathSel[level] = nodeId;
            Object.keys(ui.pathSel).forEach(function (k) {
              var n = Number(k);
              if (Number.isFinite(n) && n > level) delete ui.pathSel[k];
            });
            rerenderFromModal(f);
          });
        });
      });

      function rerenderFromModal(f) {
        if (!Array.isArray(state.lastDecisionRows)) return;
        renderDecisionTree(state.lastDecisionRows, state.lastDecisionExpectedOrder || []);
        state.decisionTreeRenderQueue.push(function () { openDecisionTreeModal(f || factor); });
      }

      if (!state.modalResizeBound) {
        window.addEventListener('resize', handleModalResize);
        state.modalResizeBound = true;
      }
    }

    function handleModalResize() {
      if (!modalIsOpen('decision-tree-modal-overlay')) return;
      var modalRoot = document.getElementById('decision-tree-modal-canvas');
      if (!modalRoot) return;
      normalizeDecisionChoiceSizes(modalRoot);
      distributeStep1ByLeaves(modalRoot);
      drawDecisionLinksIn(modalRoot);
    }

    function handleModalKeydown(event) {
      if (!(event && event.key === 'Escape')) return;
      closeChartModal();
      closeDecisionTreeModal();
    }

    function modalIsOpen(id) {
      var el = document.getElementById(id);
      return !!(el && !el.classList.contains('hidden'));
    }

    function closeChartModal() {
      var overlay = document.getElementById('chart-modal-overlay');
      if (!overlay) return;
      overlay.classList.add('hidden');
      var treeOpen = modalIsOpen('decision-tree-modal-overlay');
      if (!treeOpen) document.body.style.overflow = '';
      var modalCanvas = document.getElementById('distribution-chart-modal');
      if (modalCanvas && window.SharedChartInteractions && typeof window.SharedChartInteractions.detach === 'function') {
        window.SharedChartInteractions.detach(modalCanvas);
      }
      if (state.modalChart) {
        state.modalChart.destroy();
        state.modalChart = null;
      }
      if (state.modalKeydownBound) {
        var chartOpen = modalIsOpen('chart-modal-overlay');
        var treeStillOpen = modalIsOpen('decision-tree-modal-overlay');
        if (!chartOpen && !treeStillOpen) {
          document.removeEventListener('keydown', handleModalKeydown);
          state.modalKeydownBound = false;
        }
      }
    }

    function closeDecisionTreeModal() {
      var overlay = document.getElementById('decision-tree-modal-overlay');
      var modalRoot = document.getElementById('decision-tree-modal-canvas');
      if (!overlay) return;
      overlay.classList.add('hidden');
      if (modalRoot) modalRoot.innerHTML = '';
      var chartOpen = modalIsOpen('chart-modal-overlay');
      if (!chartOpen) document.body.style.overflow = '';
      if (state.modalKeydownBound) {
        var treeOpen = modalIsOpen('decision-tree-modal-overlay');
        if (!chartOpen && !treeOpen) {
          document.removeEventListener('keydown', handleModalKeydown);
          state.modalKeydownBound = false;
        }
      }

      if (state.modalResizeBound) {
        var treeStillOpen = modalIsOpen('decision-tree-modal-overlay');
        if (!treeStillOpen) {
          window.removeEventListener('resize', handleModalResize);
          state.modalResizeBound = false;
        }
      }
    }

    function setSimulationProgress(text, isBusy, statusType) {
      var progress = document.getElementById('sim-progress');
      if (!progress) return;
      progress.textContent = text || '';
      progress.classList.toggle('is-busy', !!isBusy);
      if (document.body) {
        document.body.classList.toggle('mlva-busy', !!isBusy);
        document.body.setAttribute('aria-busy', isBusy ? 'true' : 'false');
      }
      if (statusType === 'error') progress.dataset.type = 'error';
      else if (statusType === 'ok') progress.dataset.type = 'ok';
      else progress.dataset.type = '';
    }

    function setResultsVisible(visible) {
      var resultsSection = document.getElementById('results-section');
      var resultsBlock = document.getElementById('results-output-block');
      if (resultsSection) resultsSection.classList.toggle('hidden', !visible);
      if (resultsBlock) resultsBlock.classList.toggle('hidden', !visible);
    }

    function setMainResultsTableVisible(visible) {
      var dummy = document.querySelector('#results-output-block .ablation-results-dummy');
      if (dummy) dummy.classList.toggle('hidden', !visible);
    }

    function buildSimulationCacheKey(mcTrials, bsTrials) {
      var selected = getSelectedOrdered().slice();
      return [
        state.preset,
        state.metric,
        selected.join('|'),
        String(mcTrials),
        String(bsTrials),
      ].join('::');
    }

    function readTrialsConfig() {
      var mcTrialsInput = document.getElementById('mc-trials-input');
      var bsTrialsInput = document.getElementById('bs-trials-input');
      var mcTrials = clampInt(mcTrialsInput ? mcTrialsInput.value : 20000, 200, 300000, 20000);
      var bsTrials = clampInt(bsTrialsInput ? bsTrialsInput.value : 20000, 200, 300000, 20000);
      if (mcTrialsInput) mcTrialsInput.value = String(mcTrials);
      if (bsTrialsInput) bsTrialsInput.value = String(bsTrials);
      return { mcTrials: mcTrials, bsTrials: bsTrials };
    }

    function restoreSimulationFromCache() {
      var output = document.getElementById('sim-output');
      var tableBody = document.getElementById('results-table-body');
      if (!output || !tableBody) return false;

      var trials = readTrialsConfig();
      var key = buildSimulationCacheKey(trials.mcTrials, trials.bsTrials);
      var cached = state.simResultsCache[key];
      if (!cached) return false;

      output.innerHTML = cached.outputHtml || '';
      tableBody.innerHTML = cached.tableHtml || '';
      if (resultsMode === 'ablation') setMainResultsTableVisible(false);
      else setMainResultsTableVisible(true);
      state.lastNormalityRows = Array.isArray(cached.normalityRows) ? cached.normalityRows : null;
      renderNormalityTable();
      setResultsVisible(true);
      setSimulationProgress(cached.progressText || '', false, cached.progressType || 'ok');
      return true;
    }

    function cacheCurrentSimulationResult(mcTrials, bsTrials) {
      var output = document.getElementById('sim-output');
      var tableBody = document.getElementById('results-table-body');
      if (!output || !tableBody) return;

      var key = buildSimulationCacheKey(mcTrials, bsTrials);
      state.simResultsCache[key] = {
        outputHtml: output.innerHTML || '',
        tableHtml: tableBody.innerHTML || '',
        normalityRows: Array.isArray(state.lastNormalityRows) ? state.lastNormalityRows.slice() : null,
        progressText: (getCopy() && getCopy().simDone) || 'Results updated.',
        progressType: 'ok',
      };
    }

    function clampInt(value, min, max, fallback) {
      var n = Number(value);
      if (!Number.isFinite(n)) return fallback;
      n = Math.round(n);
      if (n < min) return min;
      if (n > max) return max;
      return n;
    }

    function waitNextTick() {
      if (window.StatMlvaSimulationCore && typeof window.StatMlvaSimulationCore.waitNextTick === 'function') {
        return window.StatMlvaSimulationCore.waitNextTick();
      }
      return new Promise(function (resolve) { setTimeout(resolve, 0); });
    }

    function markResultsStale() {
      state.simJobId += 1;
      setSimulationProgress('', false, '');
      var runBtn = document.getElementById('run-sim');
      if (runBtn) runBtn.disabled = false;
      if (!restoreSimulationFromCache()) {
        var output = document.getElementById('sim-output');
        var tableBody = document.getElementById('results-table-body');
        if (output) output.textContent = '';
        if (tableBody) tableBody.innerHTML = '';
        state.lastNormalityRows = null;
        renderNormalityTable();
        renderDecisionTree([], []);
        if (resultsMode === 'ablation') setMainResultsTableVisible(false);
        else setMainResultsTableVisible(true);
        setResultsVisible(false);
      }
    }

    function computeExpectedOrderByObservedMax(selectedModels) {
      return selectedModels.slice().sort(function (a, b) {
        var maxA = state.statsByModel[a] && Number.isFinite(state.statsByModel[a].max) ? state.statsByModel[a].max : -Infinity;
        var maxB = state.statsByModel[b] && Number.isFinite(state.statsByModel[b].max) ? state.statsByModel[b].max : -Infinity;
        return maxA - maxB;
      });
    }

    function setResultsTableMode(mode, copy) {
      var body = document.getElementById('results-table-body');
      if (!body) return;
      var table = body.closest('table');
      if (!table) return;
      var thead = table.querySelector('thead');
      if (!thead) return;

      if (mode === 'ablation') {
        thead.innerHTML = '<tr>' +
          '<th class="shared-th-ghost" colspan="1" aria-hidden="true"></th>' +
          '<th class="shared-th-cap shared-th-cap--edge-right" colspan="2" scope="colgroup">' +
            escapeHtml((copy && copy.thPReachBestGroup) || 'Path probabilities') +
          '</th>' +
        '</tr>' +
        '<tr>' +
          '<th id="th-n" scope="col">' + escapeHtml((copy && copy.thStartValue) || 'Start') + '</th>' +
          '<th id="th-mc" scope="col">' + escapeHtml((copy && copy.thMonteCarlo) || 'Monte Carlo') + '</th>' +
          '<th id="th-bs" scope="col">' + escapeHtml((copy && copy.thBootstrap) || 'Bootstrap') + '</th>' +
        '</tr>';
        return;
      }

      thead.innerHTML = '<tr>' +
        '<th class="shared-th-ghost" colspan="1" aria-hidden="true"></th>' +
        '<th id="th-p-wrong-group" class="shared-th-cap shared-th-cap--edge-right" colspan="2" scope="colgroup">' +
          escapeHtml((copy && copy.thPWrongGroup) || 'p(!correct order)') +
        '</th>' +
      '</tr>' +
      '<tr>' +
        '<th id="th-n" scope="col">' + escapeHtml((copy && copy.thSamples) || 'N samples/model') + '</th>' +
        '<th id="th-mc" scope="col">' + escapeHtml((copy && copy.thMonteCarlo) || 'Monte Carlo') + '</th>' +
        '<th id="th-bs" scope="col">' + escapeHtml((copy && copy.thBootstrap) || 'Bootstrap') + '</th>' +
      '</tr>';
    }

    function escapeHtml(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function renderDecisionTree(decisionRows, expectedOrder) {
      var block = document.getElementById('decision-tree-block');
      var title = document.getElementById('decision-tree-title');
      var intro = document.getElementById('decision-tree-intro');
      var root = document.getElementById('decision-tree-canvas');
      var plotsRoot = document.getElementById('decision-tree-plots');
      var copy = getCopy() || {};

      if (!block || !root || !plotsRoot || !Array.isArray(decisionRows) || !decisionRows.length) {
        if (block) block.classList.add('hidden');
        if (root) root.innerHTML = '';
        if (plotsRoot) {
          plotsRoot.innerHTML = '';
          plotsRoot.classList.add('hidden');
        }
        state.decisionTreeRenderPending = false;
        runDecisionTreeRenderQueue();
        return;
      }

      state.lastDecisionRows = decisionRows;
      state.lastDecisionExpectedOrder = expectedOrder;

      if (title) title.textContent = copy.decisionTreeTitle || 'Decision path tree';
      if (intro) {
        intro.textContent = copy.decisionTreeIntro ||
          'Starting from each fixed condition, this view shows the probability of reaching the global best condition.';
      }

      var byFactor = {};
      decisionRows.forEach(function (row) {
        var factor = String(row && row.start_factor ? row.start_factor : 'start');
        if (!byFactor[factor]) byFactor[factor] = [];
        byFactor[factor].push(row);
      });
      var factors = Object.keys(byFactor).sort();

      function compactToken(value) {
        var s = String(value == null ? '' : value);
        s = s.replace(/learning_rate/gi, 'learning rate');
        s = s.replace(/batch_size/gi, 'batch size');
        s = s.replace(/\s*=\s*/g, ' = ');
        s = s.replace(/\s*\|\s*/g, ' | ');
        return s;
      }

      function compactLeafToken(value) {
        var s = compactToken(value);
        if (state.preset === 'detection') {
          s = s.replace(/\bfusion\s*[:=]\s*/gi, '');
          s = s.replace(/\bfusion\s*method\s*[:=]\s*/gi, '');
          s = s.replace(/\brgb[_\s-]*eq(?:ualization)?\s*[:=]\s*clahe\b/gi, 'RGB EQ: ✓');
          s = s.replace(/\brgb[_\s-]*eq(?:ualization)?\s*[:=]\s*(none|false)\b/gi, 'RGB EQ: ✗');
          s = s.replace(/\bth[_\s-]*eq(?:ualization)?\s*[:=]\s*clahe\b/gi, 'TH EQ: ✓');
          s = s.replace(/\bth[_\s-]*eq(?:ualization)?\s*[:=]\s*(none|false)\b/gi, 'TH EQ: ✗');
          s = s.replace(/\bequali[sz]ation\s*[:=]\s*clahe\b/gi, 'EQ: ✓');
          s = s.replace(/\bequali[sz]ation\s*[:=]\s*(none|false)\b/gi, 'EQ: ✗');
          s = s.replace(/\bequali[sz]ation\s*[:=]\s*none\b/gi, 'EQ: ✗');
          s = s.replace(/\bequali[sz]ation\s*[:=]\s*clahe\b/gi, 'EQ: ✓');
          s = s.replace(/\bequali[sz]ation\s*[:=]\s*true\b/gi, 'EQ: ✓');
          s = s.replace(/\bequali[sz]ation\s*[:=]\s*false\b/gi, 'EQ: ✗');
          s = s.replace(/\s{2,}/g, ' ').trim();
          return s;
        }
        s = s.replace(/learning\s*rate/gi, 'LR');
        s = s.replace(/batch\s*size/gi, 'BS');
        s = s.replace(/\bLR\s*=\s*/g, 'LR: ');
        s = s.replace(/\bBS\s*=\s*/g, 'BS: ');
        return s;
      }

      function compactFactorLabel(value) {
        var raw = String(value == null ? '' : value);
        if (state.preset === 'detection') {
          return '';
        }
        if (raw === 'learning_rate') return 'LR';
        if (raw === 'batch_size') return 'BS';
        return compactToken(raw);
      }

      function prettyFactorName(value) {
        var raw = String(value == null ? '' : value);
        if (raw === 'learning_rate') return 'LR';
        if (raw === 'batch_size') return 'BS';
        return compactToken(raw);
      }

      function verboseFactorName(value) {
        var raw = String(value == null ? '' : value);
        if (raw === 'fusion') return 'fusion method';
        if (raw === 'rgb_eq') return 'RGB equalization';
        if (raw === 'th_eq') return 'thermal equalization';
        if (raw === 'rgb_equalization') return 'RGB equalization';
        if (raw === 'th_equalization') return 'thermal equalization';
        if (raw === 'learning_rate') return 'learning rate';
        if (raw === 'batch_size') return 'batch size';
        return compactToken(raw);
      }

      function getFactorUiState(factor) {
        if (!state.decisionUiByFactor[factor]) {
          state.decisionUiByFactor[factor] = { start: '', pathSel: {} };
        }
        if (!state.decisionUiByFactor[factor].pathSel || typeof state.decisionUiByFactor[factor].pathSel !== 'object') {
          state.decisionUiByFactor[factor].pathSel = {};
        }
        return state.decisionUiByFactor[factor];
      }

      function splitDecisionParts(value) {
        return compactToken(value)
          .split(/\s*\|\s*/)
          .map(function (token) {
            var raw = String(token || '').trim();
            var label = String(compactLeafToken(raw) || '').trim();
            if (!label) return null;
            return { raw: raw, label: label };
          })
          .filter(Boolean);
      }

      var summaryRowsHtml = factors.map(function (factor) {
        var rows = (byFactor[factor] || []).slice().sort(function (a, b) {
          var va = Number(a && a.start_value);
          var vb = Number(b && b.start_value);
          if (Number.isFinite(va) && Number.isFinite(vb)) return va - vb;
          return String(a && (a.start_label || a.start) || '').localeCompare(String(b && (b.start_label || b.start) || ''));
        });
        return rows.map(function (row) {
          var startTxt = verboseFactorName(factor) + ' = ' + compactToken(String(row && (row.start_value || row.start_label || row.start) || 'n/a'));
          var mcReach = Number.isFinite(row && row.montecarlo_p_reach_best) ? formatPct(row.montecarlo_p_reach_best) : 'n/a';
          var bsReach = Number.isFinite(row && row.bootstrap_p_reach_best) ? formatPct(row.bootstrap_p_reach_best) : 'n/a';
          return '<tr>' +
            '<td class="shared-cell-text">' + escapeHtml(startTxt) + '</td>' +
            '<td class="shared-cell-num">' + mcReach + '</td>' +
            '<td class="shared-cell-num">' + bsReach + '</td>' +
          '</tr>';
        }).join('');
      }).join('');

      var summaryTableHtml =
        '<div class="decision-mini-table-wrap shared-results-table-wrap shared-results-table-wrap--raised-head">' +
          '<table class="results-table shared-results-table shared-results-table--head-center shared-results-table--num shared-results-table--zebra shared-results-table--hover shared-results-table--cap-right">' +
            '<thead>' +
              '<tr><th class="shared-th-ghost" colspan="1" aria-hidden="true"></th><th class="shared-th-cap shared-th-cap--edge-right" colspan="2" scope="colgroup">' +
                escapeHtml((copy.thPReachBestGroup || 'p(reach global best)')) +
              '</th></tr>' +
              '<tr><th scope="col">' + escapeHtml((copy.thStartValue || 'Start')) + '</th><th scope="col">Monte Carlo</th><th scope="col">Bootstrap</th></tr>' +
            '</thead>' +
            '<tbody>' + summaryRowsHtml + '</tbody>' +
          '</table>' +
        '</div>';

      var panelsHtml = factors.map(function (factor) {
        var rows = (byFactor[factor] || []).slice().sort(function (a, b) {
          var va = Number(a && a.start_value);
          var vb = Number(b && b.start_value);
          if (Number.isFinite(va) && Number.isFinite(vb)) return va - vb;
          return String(a && (a.start_label || a.start) || '').localeCompare(String(b && (b.start_label || b.start) || ''));
        });

        var ui = getFactorUiState(factor);
        var startRow = rows.find(function (r) {
          return String(r && (r.start || r.start_label) || '') === String(ui.start || '');
        }) || rows[0] || null;
        ui.start = String(startRow && (startRow.start || startRow.start_label) || '');

        var branches = Array.isArray(startRow && startRow.branches) ? startRow.branches.slice() : [];
        branches.sort(function (a, b) {
          return String(a && (a.step1_label || a.step1_key) || '').localeCompare(String(b && (b.step1_label || b.step1_key) || ''));
        });

        var pathRows = [];
        branches.forEach(function (branch) {
          var step1Tokens = splitDecisionParts(String(branch && (branch.step1_label || branch.step1_key) || ''));
          var branchMc = Number.isFinite(branch && branch.montecarlo_p_step1) ? branch.montecarlo_p_step1 : 0;
          var branchBs = Number.isFinite(branch && branch.bootstrap_p_step1) ? branch.bootstrap_p_step1 : 0;
          var options = Array.isArray(branch && branch.step2_options) ? branch.step2_options.slice() : [];
          if (!options.length) {
            pathRows.push({
              step1Key: String(branch && (branch.step1_key || branch.step1_label) || ''),
              tokens: step1Tokens,
              pMcFirst: branchMc,
              pBsFirst: branchBs,
              pMcReach: branchMc,
              pBsReach: branchBs,
              isBest: !!(branch && branch.is_global_best_step1),
            });
            return;
          }
          options.sort(function (a, b) {
            return String(a && (a.step2_value || a.step2_label) || '').localeCompare(String(b && (b.step2_value || b.step2_label) || ''));
          });
          options.forEach(function (opt) {
            var step2Tokens = splitDecisionParts(String(opt && (opt.step2_label || opt.step2_value) || ''));
            var pStep2Mc = Number.isFinite(opt && opt.montecarlo_p_step2) ? opt.montecarlo_p_step2 : 0;
            var pStep2Bs = Number.isFinite(opt && opt.bootstrap_p_step2) ? opt.bootstrap_p_step2 : 0;
            pathRows.push({
              step1Key: String(branch && (branch.step1_key || branch.step1_label) || ''),
              tokens: step1Tokens.concat(step2Tokens),
              pMcFirst: branchMc,
              pBsFirst: branchBs,
              pMcReach: branchMc * pStep2Mc,
              pBsReach: branchBs * pStep2Bs,
              isBest: !!opt.is_global_best_step2 && !!(branch && branch.is_global_best_step1),
            });
          });
        });

        // The API provides probabilities at step-1 and final reach.
        // When labels expand into extra visual levels (split by "|"),
        // derive intermediate node probabilities by aggregating each path prefix.
        var nodeProbById = {};
        var seenStep1Contrib = {};
        pathRows.forEach(function (path) {
          var tokens = Array.isArray(path.tokens) ? path.tokens.filter(Boolean) : [];
          if (!tokens.length) return;
          var parentId = 'start::' + ui.start;
          tokens.forEach(function (token, idx) {
            var tokenId = String((token && token.raw) || (token && token.label) || '');
            if (!tokenId) return;
            var nodeId = parentId + '>>' + tokenId;
            if (!nodeProbById[nodeId]) nodeProbById[nodeId] = { mc: 0, bs: 0 };

            if (idx === 0) {
              var step1DedupKey = nodeId + '||' + String(path.step1Key || '');
              if (!seenStep1Contrib[step1DedupKey]) {
                nodeProbById[nodeId].mc += Number.isFinite(path.pMcFirst) ? path.pMcFirst : 0;
                nodeProbById[nodeId].bs += Number.isFinite(path.pBsFirst) ? path.pBsFirst : 0;
                seenStep1Contrib[step1DedupKey] = true;
              }
            } else {
              nodeProbById[nodeId].mc += Number.isFinite(path.pMcReach) ? path.pMcReach : 0;
              nodeProbById[nodeId].bs += Number.isFinite(path.pBsReach) ? path.pBsReach : 0;
            }

            parentId = nodeId;
          });
        });

        var nodesByLevel = [];
        var nodeMap = {};
        var nextNodeOrder = 0;
        pathRows.forEach(function (path) {
          var tokens = Array.isArray(path.tokens) ? path.tokens.filter(Boolean) : [];
          if (!tokens.length) return;
          var parentId = 'start::' + ui.start;
          tokens.forEach(function (token, idx) {
            var tokenId = String((token && token.raw) || (token && token.label) || '');
            var tokenLabel = String((token && token.label) || tokenId || '');
            if (!tokenId || !tokenLabel) return;
            if (!nodesByLevel[idx]) nodesByLevel[idx] = [];
            var nodeId = parentId + '>>' + tokenId;
            var node = nodeMap[nodeId];
            if (!node) {
              node = {
                id: nodeId,
                parentId: parentId,
                level: idx,
                label: tokenLabel,
                mc: null,
                bs: null,
                best: false,
                orderIndex: nextNodeOrder,
              };
              nextNodeOrder += 1;
              nodeMap[nodeId] = node;
              nodesByLevel[idx].push(node);
            }
            if (idx === 0 && node.mc == null) {
              node.mc = path.pMcFirst;
              node.bs = path.pBsFirst;
            }
            if (path.isBest) {
              node.best = true;
            }
            if (idx === tokens.length - 1) {
              node.mc = path.pMcReach;
              node.bs = path.pBsReach;
              node.best = node.best || !!path.isBest;
            }
            parentId = nodeId;
          });
        });

        Object.keys(nodeMap).forEach(function (id) {
          var node = nodeMap[id];
          var agg = nodeProbById[id];
          if (!node || !agg) return;
          if (Number.isFinite(agg.mc)) node.mc = agg.mc;
          if (Number.isFinite(agg.bs)) node.bs = agg.bs;
        });

        // Keep descendants grouped under their parent chain so links stay visually ordered.
        if (nodesByLevel[0]) {
          nodesByLevel[0].sort(function (a, b) { return a.orderIndex - b.orderIndex; });
        }
        for (var lvlSort = 1; lvlSort < nodesByLevel.length; lvlSort += 1) {
          var prevLevel = nodesByLevel[lvlSort - 1] || [];
          var parentRank = {};
          prevLevel.forEach(function (node, idx) {
            parentRank[node.id] = idx;
          });
          (nodesByLevel[lvlSort] || []).sort(function (a, b) {
            var ra = Object.prototype.hasOwnProperty.call(parentRank, a.parentId) ? parentRank[a.parentId] : Number.MAX_SAFE_INTEGER;
            var rb = Object.prototype.hasOwnProperty.call(parentRank, b.parentId) ? parentRank[b.parentId] : Number.MAX_SAFE_INTEGER;
            if (ra !== rb) return ra - rb;
            return a.orderIndex - b.orderIndex;
          });
        }

        var selectedByLevel = [];
        var selectedParentId = 'start::' + ui.start;
        for (var lvl = 0; lvl < nodesByLevel.length; lvl += 1) {
          var candidates = (nodesByLevel[lvl] || []).filter(function (n) { return n.parentId === selectedParentId; });
          if (!candidates.length) break;
          var previous = String(ui.pathSel[lvl] || '');
          var selectedNode = candidates.find(function (n) { return n.id === previous; }) || candidates[0];
          ui.pathSel[lvl] = selectedNode.id;
          selectedByLevel[lvl] = selectedNode.id;
          selectedParentId = selectedNode.id;
        }
        Object.keys(ui.pathSel).forEach(function (k) {
          var nk = Number(k);
          if (!Number.isFinite(nk) || nk >= selectedByLevel.length) delete ui.pathSel[k];
        });

        var startButtonsHtml = rows.map(function (row) {
          var key = String(row && (row.start || row.start_label) || '');
          var active = key === ui.start;
          var factorLabel = compactFactorLabel(factor);
          var valueLabel = compactLeafToken(String(row && (row.start_value || row.start_label || key) || key));
          var startLabel = factorLabel ? (factorLabel + ': ' + valueLabel) : valueLabel;
          return '<button type="button" class="decision-choice decision-start-choice' + (active ? ' is-active' : '') + '" data-factor="' + escapeHtml(factor) + '" data-start-key="' + escapeHtml(key) + '">' +
            '<span class="decision-choice-title">' + escapeHtml(startLabel) + '</span>' +
          '</button>';
        }).join('');

        var levelColumnsHtml = nodesByLevel.map(function (nodes, levelIndex) {
          var selectedParent = levelIndex === 0 ? ('start::' + ui.start) : String(selectedByLevel[levelIndex - 1] || '');
          var buttonsHtml = nodes.map(function (node) {
            var active = String(ui.pathSel[levelIndex] || '') === String(node.id);
            var parentActive = levelIndex === 0 ? true : String(node.parentId) === selectedParent;
            var mcText = Number.isFinite(node.mc) ? formatPct(node.mc) : '';
            var bsText = Number.isFinite(node.bs) ? formatPct(node.bs) : '';
            return '<button type="button" class="decision-choice decision-level-choice' + (active ? ' is-active' : '') + (parentActive ? ' is-parent-active' : '') + (node.best ? ' decision-choice--best' : '') + '" data-decision-node="1" data-factor="' + escapeHtml(factor) + '" data-level="' + String(levelIndex) + '" data-node-id="' + escapeHtml(node.id) + '" data-parent-node-id="' + escapeHtml(node.parentId) + '">' +
              '<span class="decision-choice-title">' + escapeHtml(node.label) + '</span>' +
              '<span class="decision-choice-prob">MC: <strong>' + escapeHtml(mcText || '·') + '</strong></span>' +
              '<span class="decision-choice-prob">Boot: <strong>' + escapeHtml(bsText || '·') + '</strong></span>' +
            '</button>';
          }).join('');
          return '<div class="decision-column decision-column--level" data-level-index="' + String(levelIndex) + '"><div class="decision-choice-list decision-level-list">' + (buttonsHtml || '<p class="hint">n/a</p>') + '</div></div>';
        }).join('');

        var legendText = state.preset === 'detection'
          ? (copy.decisionLegendNoteDetection || 'EQ: ✓ means equalization enabled (CLAHE), EQ: ✗ disabled. MC=Monte Carlo, Boot=Bootstrap. Green cards mark the global-best path.')
          : (copy.decisionLegendNote || 'BS=batch size, LR=learning rate, MC=Monte Carlo, Boot=Bootstrap. Green cards mark the global-best path.');

        return '<section class="panel panel-chart card shared-plot-card decision-tree-panel" data-factor="' + escapeHtml(factor) + '">' +
          '<div class="card-headline shared-plot-headline">' +
            '<h4 class="shared-plot-title decision-panel-title">' + escapeHtml((copy.fixFactorLabel || 'Fixed parameter') + ': ' + verboseFactorName(factor)) + '</h4>' +
            '<button class="btn-outline btn-chart-expand" type="button" data-expand-factor="' + escapeHtml(factor) + '" aria-label="' + escapeHtml(copy.expand || 'Expand') + '">' + escapeHtml(copy.expand || 'Expand') + '</button>' +
          '</div>' +
          '<div class="decision-flow" style="grid-template-columns: repeat(' + String(Math.max(2, 1 + nodesByLevel.length)) + ', minmax(0, 1fr));">' +
            '<svg class="decision-links" aria-hidden="true"></svg>' +
            '<div class="decision-column decision-column--start"><div class="decision-choice-list decision-start-list">' + (startButtonsHtml || '<p class="hint">n/a</p>') + '</div></div>' +
            levelColumnsHtml +
          '</div>' +
          '<p class="decision-legend-note">' +
            escapeHtml(legendText) +
          '</p>' +
        '</section>';
      }).join('');

      var bestHtml = '';
      if (Array.isArray(expectedOrder) && expectedOrder.length) {
        var globalBestModel = String(expectedOrder[expectedOrder.length - 1] || '');
        var globalBestLabel = state.modelDisplayByKey[globalBestModel] || deriveModelDisplayName(globalBestModel, null) || globalBestModel;
        bestHtml = '<div class="decision-best-chip">' +
          (copy.globalBestConditionLabel || 'Global best condition') + ': <strong>' + escapeHtml(globalBestLabel) + '</strong>' +
        '</div>';
      }

      var summaryHtml = '<div class="decision-tree-meta">' + bestHtml + '</div><div class="decision-summary-grid">' + summaryTableHtml + '</div>';
      root.innerHTML = summaryHtml;
      block.classList.remove('hidden');
      plotsRoot.classList.remove('hidden');
      state.decisionTreeRenderPending = true;

      renderDecisionTreeIntoRoot(plotsRoot, '<div class="decision-tree-grid">' + panelsHtml + '</div>', function () {
        plotsRoot.querySelectorAll('[data-start-key]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var factor = String(btn.getAttribute('data-factor') || '');
            if (!factor) return;
            var ui = state.decisionUiByFactor[factor] || (state.decisionUiByFactor[factor] = { start: '', pathSel: {} });
            ui.start = String(btn.getAttribute('data-start-key') || '');
            ui.pathSel = {};
            renderDecisionTree(decisionRows, expectedOrder);
          });
        });

        plotsRoot.querySelectorAll('[data-decision-node]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var factor = String(btn.getAttribute('data-factor') || '');
            if (!factor) return;
            var ui = state.decisionUiByFactor[factor] || (state.decisionUiByFactor[factor] = { start: '', pathSel: {} });
            var level = Number(btn.getAttribute('data-level'));
            var nodeId = String(btn.getAttribute('data-node-id') || '');
            if (!Number.isFinite(level) || !nodeId) return;
            if (!ui.pathSel || typeof ui.pathSel !== 'object') ui.pathSel = {};
            ui.pathSel[level] = nodeId;
            Object.keys(ui.pathSel).forEach(function (k) {
              var n = Number(k);
              if (Number.isFinite(n) && n > level) delete ui.pathSel[k];
            });
            renderDecisionTree(decisionRows, expectedOrder);
          });
        });
        plotsRoot.querySelectorAll('[data-expand-factor]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var factor = String(btn.getAttribute('data-expand-factor') || '');
            if (!factor) return;
            openDecisionTreeModal(factor);
          });
        });
        state.decisionTreeRenderPending = false;
        runDecisionTreeRenderQueue();
      });
    }

    async function requestPythonAnalysis(selected, mcTrials, bsTrials) {
      if (window.StatMlvaSimulationCore && typeof window.StatMlvaSimulationCore.requestAnalysis === 'function') {
        return window.StatMlvaSimulationCore.requestAnalysis({
          apiBaseUrl: getApiBaseUrl(),
          selectedModels: selected,
          dataByModel: state.dataByModel,
          montecarloTrials: mcTrials,
          bootstrapTrials: bsTrials,
          nSamplesMin: 1,
          nSamplesMax: 5,
          analysisMode: resultsMode,
          pairingMode: state.dataProfile && state.dataProfile.paired ? 'paired' : 'unpaired',
          groupingField: state.dataProfile && state.dataProfile.groupingField ? state.dataProfile.groupingField : '',
          conditionMeta: state.conditionMeta,
          timeoutMs: 25000,
        });
      }
      throw new Error('Simulation core unavailable');
    }

    async function runSimulation() {
      var copy = getCopy() || {};
      var output = document.getElementById('sim-output');
      var tableBody = document.getElementById('results-table-body');
      var resultsBlock = document.getElementById('results-output-block');
      var resultsSection = document.getElementById('results-section');
      var runBtn = document.getElementById('run-sim');
      var jobId = ++state.simJobId;

      if (runBtn) runBtn.disabled = true;
      if (resultsMode === 'ablation') setMainResultsTableVisible(false);
      else setMainResultsTableVisible(true);
      renderDecisionTree([], []);
      if (tableBody) tableBody.innerHTML = '';
      setSimulationProgress(copy.simComputing || 'Computing...', true, '');
      await waitNextTick();

      var selected = getSelectedOrdered();
      if (selected.length < 2) {
        if (resultsSection) resultsSection.classList.add('hidden');
        if (resultsBlock) resultsBlock.classList.add('hidden');
        if (output) output.textContent = '';
        if (tableBody) tableBody.innerHTML = '';
        state.lastNormalityRows = null;
        renderNormalityTable();
        renderDecisionTree([], []);
        if (runBtn) runBtn.disabled = false;
        setSimulationProgress(copy.notEnoughModels || 'Select at least two models.', false, 'error');
        return;
      }

      var trials = readTrialsConfig();
      var mcTrials = trials.mcTrials;
      var bsTrials = trials.bsTrials;

      if (resultsSection) resultsSection.classList.remove('hidden');
      if (resultsBlock) resultsBlock.classList.remove('hidden');
      if (output) {
        var tpl = copy.resultsSummary || 'Selected conditions: {count}. Trials: Monte Carlo={mcTrials}, Bootstrap={bsTrials}.';
        output.innerHTML = tpl
          .replace('{count}', String(selected.length))
          .replace('{mcTrials}', String(mcTrials))
          .replace('{bsTrials}', String(bsTrials));
      }

      if (!tableBody) {
        if (runBtn) runBtn.disabled = false;
        setSimulationProgress('', false, '');
        return;
      }

      try {
        var apiResult = await requestPythonAnalysis(selected, mcTrials, bsTrials);
        if (jobId !== state.simJobId) return;

        state.lastNormalityRows = Array.isArray(apiResult && apiResult.normality) ? apiResult.normality : null;
        renderNormalityTable();

        var switchedRows = Array.isArray(apiResult && apiResult.switched) ? apiResult.switched : [];
        var decisionRows = Array.isArray(apiResult && apiResult.decision_paths) ? apiResult.decision_paths : [];

        if (decisionRows.length) {
          setResultsTableMode('ablation', copy);
          tableBody.innerHTML = '';
          setMainResultsTableVisible(false);
          renderDecisionTree(decisionRows, apiResult && apiResult.expected_order);
          cacheCurrentSimulationResult(mcTrials, bsTrials);
          if (runBtn) runBtn.disabled = false;
          setSimulationProgress(copy.simDone || 'Results updated.', false, 'ok');
          return;
        }

        if (resultsMode === 'ablation') {
          tableBody.innerHTML = '';
          setMainResultsTableVisible(false);
          renderDecisionTree([], []);
          if (output) {
            output.innerHTML = copy.simAblationSchemaPending || 'Awaiting ablation decision-path results from API.';
          }
          if (runBtn) runBtn.disabled = false;
          setSimulationProgress(copy.simAblationSchemaPending || 'Awaiting ablation decision-path results from API.', false, 'error');
          return;
        }

        if (switchedRows.length) {
          setResultsTableMode('switched', copy);
          setMainResultsTableVisible(true);
          renderDecisionTree([], []);
          tableBody.innerHTML = switchedRows.map(function (row) {
            return '<tr>' +
              '<td class="shared-cell-num">' + row.n_samples + '</td>' +
              '<td class="shared-cell-num">' + formatPct(row.montecarlo_p_switched) + '</td>' +
              '<td class="shared-cell-num">' + formatPct(row.bootstrap_p_switched) + '</td>' +
            '</tr>';
          }).join('');
          cacheCurrentSimulationResult(mcTrials, bsTrials);
          if (runBtn) runBtn.disabled = false;
          setSimulationProgress(copy.simDone || 'Results updated.', false, 'ok');
          return;
        }

        if (runBtn) runBtn.disabled = false;
        if (resultsMode === 'ablation') setMainResultsTableVisible(false);
        else setMainResultsTableVisible(true);
        setSimulationProgress(copy.simApiUnavailable || 'Python API unavailable.', false, 'error');
      } catch (_err) {
        state.lastNormalityRows = null;
        renderNormalityTable();
        if (tableBody) tableBody.innerHTML = '';
        renderDecisionTree([], []);
        if (runBtn) runBtn.disabled = false;
        if (resultsMode === 'ablation') setMainResultsTableVisible(false);
        else setMainResultsTableVisible(true);
        setSimulationProgress(copy.simApiUnavailable || 'Python API unavailable.', false, 'error');
      }
    }

    function bindEvents() {
      bindModelSummarySorting();

      var btnAll = document.getElementById('btn-all');
      var btnClear = document.getElementById('btn-clear');
      var btnRun = document.getElementById('run-sim');

      if (btnAll) {
        btnAll.addEventListener('click', function () {
          state.selected.clear();
          modelOrder().forEach(function (m) { state.selected.add(m); });
          renderModelList();
          renderChart();
          renderNormalityTable();
          markResultsStale();
        });
      }

      if (btnClear) {
        btnClear.addEventListener('click', function () {
          state.selected.clear();
          renderModelList();
          renderChart();
          renderNormalityTable();
          markResultsStale();
        });
      }

      if (btnRun) btnRun.addEventListener('click', runSimulation);

      var distCanvas = document.getElementById('distribution-chart');
      if (distCanvas) {
        distCanvas.addEventListener('click', function (event) {
          if (!window.SharedChartInteractions.isInsideChartArea(event, state.chart, distCanvas)) return;
          openChartModal();
        });
        distCanvas.addEventListener('mousemove', function (event) {
          distCanvas.style.cursor = window.SharedChartInteractions.isInsideChartArea(event, state.chart, distCanvas) ? 'zoom-in' : 'default';
        });
        distCanvas.addEventListener('mouseleave', function () {
          distCanvas.style.cursor = '';
        });
      }
      var expandChartBtn = document.getElementById('btn-expand-chart');
      if (expandChartBtn) expandChartBtn.addEventListener('click', openChartModal);
      var closeModalBtn = document.getElementById('btn-close-chart-modal');
      if (closeModalBtn) closeModalBtn.addEventListener('click', closeChartModal);
      var closeTreeModalBtn = document.getElementById('btn-close-decision-tree-modal');
      if (closeTreeModalBtn) closeTreeModalBtn.addEventListener('click', closeDecisionTreeModal);

      document.querySelectorAll('[data-step-target]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var target = document.getElementById(btn.dataset.stepTarget);
          if (!target) return;
          var step = Number(btn.dataset.step || 0);
          var min = Number(target.min || 0);
          var max = Number(target.max || Number.MAX_SAFE_INTEGER);
          var next = Math.max(min, Math.min(max, Number(target.value || 0) + step));
          target.value = next;
          markResultsStale();
        });
      });

      document.querySelectorAll('details[data-collapsible-default="closed"]').forEach(function (el) {
        el.open = false;
        el.removeAttribute('open');
      });

      var prechecksTitle = document.getElementById('prechecks-title');
      if (prechecksTitle) {
        var prechecksDetails = prechecksTitle.closest('details');
        if (prechecksDetails) {
          prechecksDetails.open = false;
          prechecksDetails.removeAttribute('open');
        }
      }
    }

    function applyLanguage() {
      var copy = getCopy();
      if (!copy) return;

      document.documentElement.lang = state.lang;
      document.title = copy.pageTitle || document.title;
      setText('site-subtitle', copy.subtitle);
      setText('intro-title', copy.introTitle);
      setText('intro-text', copy.introText);
      renderCaseContext(copy);
      setText('config-title', copy.configTitle);
      setText('models-label', copy.modelsLabel);
      setText('btn-all', copy.selectAll);
      setText('btn-clear', copy.clearAll);
      setText('chart-title', copy.chartTitle);
      setText('btn-expand-chart', copy.expand);
      setText('btn-close-chart-modal', copy.close);
      setText('chart-modal-title', copy.chartTitle);
      setText('btn-close-decision-tree-modal', copy.close);
      setText('decision-tree-modal-title', copy.decisionTreeTitle);
      setText('results-title', copy.resultsTitle);
      setText('prechecks-title', copy.prechecksTitle);
      setText('official-results-title', copy.officialResultsTitle);
      setText('results-intro', copy.resultsIntro);
      setText('sim-config-title', copy.simConfigTitle);
      setText('sim-config-text', copy.simConfigText);
      setText('mc-trials-label', copy.mcTrialsLabel);
      setText('bs-trials-label', copy.bsTrialsLabel);
      setText('run-sim', copy.runSim);
      setText('th-n', copy.thSamples);
      setText('th-p-wrong-group', copy.thPWrongGroup);
      setText('th-mc', copy.thMonteCarlo);
      setText('th-bs', copy.thBootstrap);
      setText('th-model', copy.thModel);
      setText('th-median', copy.thMedian);
      setText('th-mean', copy.thMean2);
      setText('th-skewness', copy.thSkewness);
      setText('th-kurtosis', copy.thKurtosis);
      setText('th-shapiro-group', copy.thShapiroGroup);
      setText('th-shapiro-w', copy.thShapiroW);
      setText('th-shapiro-p', copy.thShapiroP);
      setText('model-summary-title', copy.modelSummaryTitle || 'Model Summary');
      setText('model-summary-th-model', copy.thModel || 'Model');
      setText('model-summary-th-best', copy.thBestValue || 'Best value');
      setText('model-summary-th-n', copy.thModelN || 'N');
      setText('model-summary-th-mean', copy.thMean2 || 'Mean');
      setText('model-summary-th-std', copy.thStdDev || 'Std. dev.');
      setText('model-summary-th-p90', copy.thNormP90 || 'Normal P90');
      setText('results-method-note', copy.resultsMethodNote);
      setHtml('normality-note', copy.normalityNote);
      setText('footer-report-problem', copy.reportProblem);

      if (resultsMode === 'ablation') setResultsTableMode('ablation', copy);
      else if (resultsMode === 'switched') setResultsTableMode('switched', copy);

      if (window.SharedUiCore && window.SharedUiCore.setLangSwitcherState) {
        window.SharedUiCore.setLangSwitcherState(state.lang, '#lang-switcher');
      }

      renderPresetTabs();
      renderMetricTabs();
      renderModelList();
      renderModelSummaryTable();
      renderChart();
      renderNormalityTable();
    }

    function loadData() {
      var metricInfo = getPresetMetrics()[state.metric];
      if (!metricInfo) return;

      if (metricInfo.table && metricInfo.table.file) {
        fetch(metricInfo.table.file, { cache: 'no-store' })
          .then(function (res) { return res.text(); })
          .then(function (raw) {
            var parsed = buildDataFromCsvTable(raw, metricInfo.table);
            state.dataByModel = parsed.map;
            state.dataModelOrder = parsed.order;
            state.statsByModel = computeStats(state.dataByModel);
            state.modelDisplayByKey = parsed.displayByModel || {};
            state.dataModelOrder.forEach(function (model) {
              if (!state.modelDisplayByKey[model]) {
                state.modelDisplayByKey[model] = deriveModelDisplayName(model, null) || model;
              }
            });
            rebuildModelColorMap();
            state.dataProfile = parsed.profile || null;
            state.conditionMeta = parsed.conditionMeta || null;
            state.hasInitialSelection = false;
            state.selected.clear();
            ensureSelectionDefaults();
            renderCaseContext(getCopy());
            renderMetricTabs();
            renderModelList();
            renderModelSummaryTable();
            renderChart();
            renderNormalityTable();
            markResultsStale();
          })
          .catch(function () {
            state.dataByModel = {};
            state.dataModelOrder = [];
            state.statsByModel = {};
            state.modelDisplayByKey = {};
            state.modelColorByKey = {};
            state.dataProfile = null;
            state.conditionMeta = null;
            state.selected.clear();
            renderCaseContext(getCopy());
            renderModelList();
            renderModelSummaryTable();
            renderChart();
            renderNormalityTable();
            markResultsStale();
          });
        return;
      }

      var files = getMetricFiles(metricInfo);
      if (!files.length) return;

      Promise.all(files.map(function (path) {
        return fetch(path, { cache: 'no-store' }).then(function (res) { return res.text(); });
      }))
        .then(function (rawBlocks) {
          var mergedMap = {};
          var mergedOrder = [];
          rawBlocks.forEach(function (raw) {
            var parsed = parseYamlArrayMap(raw);
            mergeParsedInto(mergedMap, mergedOrder, parsed);
          });

          state.dataByModel = mergedMap;
          state.dataModelOrder = mergedOrder;
          state.statsByModel = computeStats(state.dataByModel);
          state.modelDisplayByKey = {};
          mergedOrder.forEach(function (m) { state.modelDisplayByKey[m] = deriveModelDisplayName(m, null) || m; });
          rebuildModelColorMap();
          state.dataProfile = null;
          state.conditionMeta = null;
          state.hasInitialSelection = false;
          state.selected.clear();
          ensureSelectionDefaults();
          renderCaseContext(getCopy());
          renderMetricTabs();
          renderModelList();
          renderModelSummaryTable();
          renderChart();
          renderNormalityTable();
          markResultsStale();
        })
        .catch(function () {
          state.dataByModel = {};
          state.dataModelOrder = [];
          state.statsByModel = {};
          state.modelDisplayByKey = {};
          state.modelColorByKey = {};
          state.dataProfile = null;
          state.conditionMeta = null;
          state.selected.clear();
          renderCaseContext(getCopy());
          renderModelList();
          renderModelSummaryTable();
          renderChart();
          renderNormalityTable();
          markResultsStale();
        });
    }

    function run() {
      var metricKeys = Object.keys(getPresetMetrics());
      state.metric = metricKeys[0] || null;

      var shell = window.StatMlvaPageShell && window.StatMlvaPageShell.initToolPage
        ? window.StatMlvaPageShell.initToolPage({
            toolTitle: toolTitle,
            toolId: toolId,
            fallbackLang: fallbackLang,
            themeButtonId: 'btn-theme',
            langSwitcherSelector: '#lang-switcher',
            i18nApi: i18nApi,
            onApplyLanguage: function (_copy, lang) {
              state.lang = lang;
              applyLanguage();
            },
            onApplyTheme: function (_theme) {
              if (window.SharedUiCore && typeof window.SharedUiCore.setThemeForDocument === 'function') {
                window.SharedUiCore.setThemeForDocument(_theme, { themeButtonId: 'btn-theme', syncDataTheme: true });
              } else {
                document.body.classList.toggle('dark', _theme === 'dark');
              }
              renderChart();
            },
          })
        : null;

      if (!shell) {
        console.error('[' + toolId + '] SharedToolPageShell.initToolPage is required but unavailable.');
        return;
      }

      state.lang = shell.lang;
      bindEvents();
      shell.applyTheme();
      shell.applyLanguage();
      loadData();
      restoreSimulationFromCache();

      window[appNamespace] = {
        closeChartModal: closeChartModal,
        closeDecisionTreeModal: closeDecisionTreeModal,
      };
    }

    document.addEventListener('DOMContentLoaded', run);
  }

  window.StatMlvaComparisonCore = {
    init: init,
  };
})();