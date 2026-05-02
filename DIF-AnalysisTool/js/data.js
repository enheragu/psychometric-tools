(function () {
  if (window.DIFData) return;

  var ITEM_RE = /^([A-Za-z]+)(\d+)$/;

  function detectDelimiter(text) {
    var sample = text.slice(0, 2000);
    var counts = { ',': 0, ';': 0, '\t': 0 };
    [',', ';', '\t'].forEach(function (d) { counts[d] = (sample.match(new RegExp('\\' + (d === '\t' ? 't' : d), 'g')) || []).length; });
    return Object.keys(counts).reduce(function (a, b) { return counts[a] >= counts[b] ? a : b; });
  }

  function parseCSV(text, delimiter) {
    var lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    var rows = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var cells;
      if (delimiter === ',') {
        cells = line.split(',').map(function (c) { return c.replace(/^"|"$/g, '').trim(); });
      } else if (delimiter === ';') {
        cells = line.split(';').map(function (c) { return c.replace(/^"|"$/g, '').trim(); });
      } else {
        cells = line.split('\t').map(function (c) { return c.replace(/^"|"$/g, '').trim(); });
      }
      rows.push(cells);
    }
    return rows;
  }

  function detectItemType(itemValues) {
    var allVals = new Set();
    itemValues.forEach(function (col) { col.forEach(function (v) { allVals.add(v); }); });
    var nums = Array.from(allVals).map(Number).filter(function (n) { return !isNaN(n); });
    if (nums.length === 0) return 'unknown';
    var min = Math.min.apply(null, nums);
    var max = Math.max.apply(null, nums);
    if (min >= 0 && max <= 1 && nums.every(function (n) { return n === 0 || n === 1; })) return 'dichot';
    return 'polytomus';
  }

  function parse(text, delimiterOverride) {
    var delimiter = delimiterOverride || detectDelimiter(text);
    var rows = parseCSV(text, delimiter);
    if (rows.length < 2) return { error: 'too_few_rows' };

    var header = rows[0];
    var dataRows = rows.slice(1);

    var itemCols = [];
    var nonItemCols = [];
    header.forEach(function (name, idx) {
      if (ITEM_RE.test(name)) itemCols.push({ name: name, idx: idx });
      else nonItemCols.push({ name: name, idx: idx });
    });

    // Reclassify any "item" column whose values are mostly non-numeric back to metadata
    itemCols = itemCols.filter(function (col) {
      var vals = dataRows.map(function (row) { return parseInt(row[col.idx], 10); });
      var numericCount = vals.filter(function (v) { return !isNaN(v); }).length;
      if (numericCount / Math.max(vals.length, 1) < 0.5) {
        nonItemCols.push(col);
        return false;
      }
      return true;
    });

    if (itemCols.length === 0) return { error: 'no_items' };
    if (nonItemCols.length === 0) return { error: 'no_groups' };

    var dimensions = {};
    itemCols.forEach(function (col) {
      var m = ITEM_RE.exec(col.name);
      var dimKey = m[1].toUpperCase();
      if (!dimensions[dimKey]) dimensions[dimKey] = [];
      dimensions[dimKey].push(col.name);
    });

    Object.keys(dimensions).forEach(function (dim) {
      dimensions[dim].sort(function (a, b) {
        return parseInt(ITEM_RE.exec(a)[2], 10) - parseInt(ITEM_RE.exec(b)[2], 10);
      });
    });

    var responses = {};
    itemCols.forEach(function (col) {
      responses[col.name] = dataRows.map(function (row) {
        return parseInt(row[col.idx], 10);
      });
    });

    var metaCols = {};
    nonItemCols.forEach(function (col) {
      metaCols[col.name] = dataRows.map(function (row) { return row[col.idx]; });
    });

    var itemValues = itemCols.map(function (col) { return responses[col.name]; });
    var detectedType = detectItemType(itemValues);

    var nCats = 2;
    if (detectedType === 'polytomus') {
      var allVals = new Set();
      itemValues.forEach(function (col) { col.forEach(function (v) { if (!isNaN(v)) allVals.add(v); }); });
      nCats = Math.max.apply(null, Array.from(allVals).map(Number).filter(function (n) { return !isNaN(n); })) -
              Math.min.apply(null, Array.from(allVals).map(Number).filter(function (n) { return !isNaN(n); })) + 1;
    }

    return {
      ok: true,
      delimiter: delimiter,
      nRows: dataRows.length,
      itemNames: itemCols.map(function (c) { return c.name; }),
      dimensions: dimensions,
      responses: responses,
      metaCols: metaCols,
      metaColNames: nonItemCols.map(function (c) { return c.name; }),
      detectedType: detectedType,
      nCats: nCats,
    };
  }

  function groupValues(metaCols, colName) {
    var vals = metaCols[colName] || [];
    var seen = [];
    var set = new Set();
    vals.forEach(function (v) {
      if (!set.has(v)) { set.add(v); seen.push(v); }
    });
    return seen.sort();
  }

  function filterByNested(parsed, nestedVar, nestedValue) {
    if (!nestedVar || !nestedValue) return parsed;
    var metaVals = parsed.metaCols[nestedVar];
    if (!metaVals) return parsed;

    var keepIdx = [];
    metaVals.forEach(function (v, i) { if (String(v) === String(nestedValue)) keepIdx.push(i); });

    var responses = {};
    parsed.itemNames.forEach(function (name) {
      responses[name] = keepIdx.map(function (i) { return parsed.responses[name][i]; });
    });
    var metaCols = {};
    parsed.metaColNames.forEach(function (name) {
      metaCols[name] = keepIdx.map(function (i) { return parsed.metaCols[name][i]; });
    });

    return Object.assign({}, parsed, { responses: responses, metaCols: metaCols, nRows: keepIdx.length });
  }

  function buildPayload(parsed, opts) {
    var groupVar = opts.groupVar;
    var groupRef = opts.groupRef;
    var groupFoc = opts.groupFoc;

    var groups = parsed.metaCols[groupVar] || [];
    var refMask = groups.map(function (v) { return String(v) === String(groupRef) ? 0 : (String(v) === String(groupFoc) ? 1 : -1); });

    var responses = {};
    parsed.itemNames.forEach(function (name) {
      responses[name] = refMask.map(function (g, i) {
        if (g === -1) return null;
        return parsed.responses[name][i];
      }).filter(function (_, i) { return refMask[i] !== -1; });
    });
    var validIdx = refMask.map(function (g, i) { return g !== -1 ? i : -1; }).filter(function (i) { return i !== -1; });
    var groupsFiltered = validIdx.map(function (i) { return refMask[i]; });

    return {
      responses: responses,
      groups: groupsFiltered,
      item_names: parsed.itemNames,
      dimensions: parsed.dimensions,
      is_dichot: opts.itemType === 'dichot',
      n_cats: parsed.nCats,
      max_iter: opts.maxIter || 50,
      or_threshold: opts.orThreshold || 1.25,
      p_threshold: opts.pThreshold || 0.05,
    };
  }

  window.DIFData = { parse: parse, groupValues: groupValues, filterByNested: filterByNested, buildPayload: buildPayload };
})();
