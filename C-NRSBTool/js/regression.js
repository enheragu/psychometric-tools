/**
 * regression.js — Logistic regression engine.
 *
 * Model: logit(p) = β₀ + β₁·hdi
 * Training: gradient descent (Newton-Raphson for faster convergence)
 * Stats: Wald test (z, p-value), AUC-ROC
 */
const Regression = (() => {

  const sigmoid = z => 1 / (1 + Math.exp(-z));

  // Standard normal CDF approximation (Abramowitz & Stegun 26.2.17)
  function normCDF(z) {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const poly = t * (0.319381530
      + t * (-0.356563782
      + t * (1.781477937
      + t * (-1.821255978
      + t *  1.330274429))));
    const p = 1 - 0.3989422803 * Math.exp(-0.5 * z * z) * poly;
    return z >= 0 ? p : 1 - p;
  }

  /**
   * Fit a logistic regression model via gradient descent.
   * @param {Array<{hdi: number, label: number}>} samples
   * @param {Object} opts
   * @returns {{ beta0, beta1, iterations }}
   */
  function fit(samples, { lr = 1.0, maxIter = 500, tol = 1e-7 } = {}) {
    let b0 = 0, b1 = 0;

    for (let iter = 0; iter < maxIter; iter++) {
      let g0 = 0, g1 = 0;
      for (const { hdi, label } of samples) {
        const p = sigmoid(b0 + b1 * hdi);
        const err = p - label;
        g0 += err;
        g1 += err * hdi;
      }
      const n = samples.length;
      const db0 = g0 / n;
      const db1 = g1 / n;
      b0 -= lr * db0;
      b1 -= lr * db1;
      if (Math.abs(db0) < tol && Math.abs(db1) < tol) break;
    }

    return { beta0: b0, beta1: b1 };
  }

  /**
   * Compute Wald statistic and p-value for β₁.
   * Uses Fisher information: H = X'WX, SE = sqrt(H⁻¹[1,1]).
   */
  function waldTest(samples, beta0, beta1) {
    let h00 = 0, h01 = 0, h11 = 0;
    for (const { hdi } of samples) {
      const p = sigmoid(beta0 + beta1 * hdi);
      const w = p * (1 - p);
      h00 += w;
      h01 += w * hdi;
      h11 += w * hdi * hdi;
    }
    // Invert 2×2 matrix [[h00, h01],[h01, h11]]
    const det = h00 * h11 - h01 * h01;
    if (Math.abs(det) < 1e-12) return { se: Infinity, z: 0, pValue: 1 };
    const seB1 = Math.sqrt(h00 / det);        // (H⁻¹)[1,1] = h00/det
    const z = beta1 / seB1;
    const pValue = 2 * (1 - normCDF(Math.abs(z)));
    return { se: seB1, z, pValue };
  }

  /**
   * Compute AUC-ROC via Wilcoxon–Mann–Whitney statistic.
   * O(n₁·n₀) — fine for n≤200.
   */
  function aucROC(samples, beta0, beta1) {
    const pos = [], neg = [];
    for (const { hdi, label } of samples) {
      const score = sigmoid(beta0 + beta1 * hdi);
      (label === 1 ? pos : neg).push(score);
    }
    if (!pos.length || !neg.length) return 0.5;

    let concordant = 0;
    for (const sp of pos) {
      for (const sn of neg) {
        if (sp > sn)        concordant += 1;
        else if (sp === sn) concordant += 0.5;
      }
    }
    return concordant / (pos.length * neg.length);
  }

  /**
   * Build ROC curve points {fpr, tpr} sorted by threshold.
   */
  function rocCurve(samples, beta0, beta1) {
    const scored = samples.map(({ hdi, label }) => ({
      score: sigmoid(beta0 + beta1 * hdi),
      label,
    })).sort((a, b) => b.score - a.score);

    const P = samples.filter(s => s.label === 1).length;
    const N = samples.length - P;
    const points = [{ fpr: 0, tpr: 0, threshold: 1 }];
    let tp = 0, fp = 0;

    for (const { label, score } of scored) {
      if (label === 1) tp++; else fp++;
      points.push({ fpr: fp / N, tpr: tp / P, threshold: score });
    }
    return points;
  }

  /**
   * Sigmoid curve samples for plotting.
   * Returns array of {x, y} spanning [hdiMin - 0.02, hdiMax + 0.02].
   */
  function sigmoidCurve(beta0, beta1, hdiMin, hdiMax, steps = 120) {
    const points = [];
    for (let i = 0; i <= steps; i++) {
      const x = hdiMin + (i / steps) * (hdiMax - hdiMin);
      points.push({ x, y: sigmoid(beta0 + beta1 * x) });
    }
    return points;
  }

  /**
   * Main entry: run full analysis.
   * @param {Set<string>} selectedIso3 - set of selected ISO-3 codes
   * @returns {Object} full result object
   */
  function analyse(selectedIso3) {
    const samples = Data.HDI_DATA.map(({ country, iso3, hdi }) => ({
      country,
      hdi,
      iso3,
      label: selectedIso3.has(iso3) ? 1 : 0,
    }));

    const n1 = samples.filter(s => s.label === 1).length;
    const n0 = samples.length - n1;

    if (n1 === 0 || n0 === 0) {
      return { error: 'degenerate', n1, n0, total: samples.length };
    }

    const meanHdiSel  = samples.filter(s => s.label===1).reduce((a,s) => a+s.hdi, 0) / n1;
    const meanHdiNsel = samples.filter(s => s.label===0).reduce((a,s) => a+s.hdi, 0) / n0;

    const { beta0, beta1 } = fit(samples);
    const { se, z, pValue } = waldTest(samples, beta0, beta1);
    const auc = aucROC(samples, beta0, beta1);

    return {
      samples,
      n1, n0,
      total: samples.length,
      meanHdiSel,
      meanHdiNsel,
      beta0, beta1,
      se, z, pValue,
      auc,
      significant: pValue < 0.05,
      sigmoidCurve: sigmoidCurve(beta0, beta1, 0, 1),
      rocCurve: rocCurve(samples, beta0, beta1),
    };
  }

  return { analyse, sigmoid, normCDF };
})();
