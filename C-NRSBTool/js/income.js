/**
 * income.js — Income-group representation analysis.
 *
 * Random subsampling test: for a user-selected sample of N countries,
 * draws N countries without replacement from the universe (sovereign
 * countries with income classification) many times, and returns the
 * empirical distribution of per-group share so the observed share can
 * be compared against it. It is NOT a bootstrap (which would resample
 * WITH replacement from the observed sample), nor a Monte Carlo
 * integration — just a randomization / subsampling null reference.
 *
 * Pure module: no DOM, no Chart.js. Returns plain objects.
 */
const Income = (() => {

  const DEFAULT_RESAMPLES = 20000;

  /**
   * Sample `k` distinct elements from `arr` without replacement
   * (Fisher–Yates partial shuffle, in-place on a working copy).
   */
  function _sampleWithoutReplacement(arr, k, scratch) {
    const n = arr.length;
    if (k >= n) return arr.slice();
    // Reuse a scratch index buffer to avoid per-iteration allocation.
    for (let i = 0; i < n; i++) scratch[i] = i;
    const out = new Array(k);
    for (let i = 0; i < k; i++) {
      const j = i + Math.floor(Math.random() * (n - i));
      const tmp = scratch[i];
      scratch[i] = scratch[j];
      scratch[j] = tmp;
      out[i] = arr[scratch[i]];
    }
    return out;
  }

  function _percentile(sortedArr, p) {
    if (!sortedArr.length) return null;
    const idx = (sortedArr.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sortedArr[lo];
    const t = idx - lo;
    return sortedArr[lo] * (1 - t) + sortedArr[hi] * t;
  }

  /**
   * Run the bootstrap analysis.
   *
   * @param {Set<string>} selectedIso3 - user-selected ISO-3 codes
   * @param {{ resamples?: number, groupOrder?: string[] }} [opts]
   * @returns {Object} result with universe info, observed counts and CIs
   */
  function analyse(selectedIso3, opts = {}) {
    const iterations = Math.max(1, opts.iterations ?? opts.resamples ?? DEFAULT_RESAMPLES);
    const groupOrder = opts.groupOrder ?? Data.INCOME_GROUP_ORDER;

    // Universe: sovereign countries (HDI list) that have an income-group
    // classification. Built from COUNTRY_DATA to keep the selectable list,
    // the map and the null-reference universe consistent.
    const universe = [];
    for (const row of Data.COUNTRY_DATA) {
      if (row.incomeGroup) universe.push(row.incomeGroup);
    }
    const universeSize = universe.length;

    // User sample restricted to countries with income-group data.
    const includedIso3 = [];
    const excludedIso3 = [];
    for (const iso3 of selectedIso3) {
      const row = Data.COUNTRY_BY_ISO3[iso3];
      if (row && row.incomeGroup) includedIso3.push(iso3);
      else if (row) excludedIso3.push(iso3);
    }
    const sampleSize = includedIso3.length;

    // Observed group counts in the user's sample.
    const observedCounts = Object.fromEntries(groupOrder.map(g => [g, 0]));
    for (const iso3 of includedIso3) {
      const g = Data.COUNTRY_BY_ISO3[iso3]?.incomeGroup;
      if (g && g in observedCounts) observedCounts[g] += 1;
    }
    const observedPct = Object.fromEntries(
      groupOrder.map(g => [g, sampleSize > 0 ? (observedCounts[g] / sampleSize) * 100 : 0])
    );

    // Universe baseline (% per group across all countries with income data).
    const universeCounts = Object.fromEntries(groupOrder.map(g => [g, 0]));
    for (const g of universe) if (g in universeCounts) universeCounts[g] += 1;
    const universePct = Object.fromEntries(
      groupOrder.map(g => [g, universeSize > 0 ? (universeCounts[g] / universeSize) * 100 : 0])
    );

    // Edge cases that make the analysis meaningless.
    if (sampleSize === 0 || universeSize === 0 || sampleSize > universeSize) {
      return {
        error: sampleSize === 0 ? 'no_sample' : (universeSize === 0 ? 'no_universe' : 'sample_too_big'),
        sampleSize,
        universeSize,
        includedIso3,
        excludedIso3,
        observedCounts,
        observedPct,
        universeCounts,
        universePct,
        groupOrder,
        iterations,
      };
    }

    // Random subsampling: draw `sampleSize` items without replacement,
    // count groups, store percentages.
    const distributions = Object.fromEntries(groupOrder.map(g => [g, new Float64Array(iterations)]));
    const scratch = new Int32Array(universeSize);
    const counts = Object.create(null);
    for (const g of groupOrder) counts[g] = 0;

    for (let r = 0; r < iterations; r++) {
      for (const g of groupOrder) counts[g] = 0;
      const draw = _sampleWithoutReplacement(universe, sampleSize, scratch);
      for (let i = 0; i < draw.length; i++) {
        const g = draw[i];
        if (g in counts) counts[g] += 1;
      }
      for (const g of groupOrder) {
        distributions[g][r] = (counts[g] / sampleSize) * 100;
      }
    }

    // Sort each distribution once and extract percentiles.
    const groups = groupOrder.map(g => {
      const sorted = Float64Array.from(distributions[g]).sort();
      const p025 = _percentile(sorted, 0.025);
      const p975 = _percentile(sorted, 0.975);
      return {
        key: g,
        observedPct: observedPct[g],
        observedCount: observedCounts[g],
        universePct: universePct[g],
        universeCount: universeCounts[g],
        p025,
        p50:  _percentile(sorted, 0.5),
        p975,
        outsideCi: observedPct[g] < p025 || observedPct[g] > p975,
        // Sorted distribution kept for the violin plot.
        distribution: sorted,
      };
    });

    return {
      sampleSize,
      universeSize,
      includedIso3,
      excludedIso3,
      observedCounts,
      observedPct,
      universeCounts,
      universePct,
      groupOrder,
      groups,
      iterations,
    };
  }

  return { analyse, DEFAULT_ITERATIONS: DEFAULT_RESAMPLES };
})();
