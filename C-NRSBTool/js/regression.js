/**
 * regression.js — Logistic regression engine.
 *
 * Model: logit(p) = β₀ + β₁·hdi
 * Fit:   maximum likelihood via IRLS (Newton–Raphson ≡ Fisher scoring for the
 *        logit link). If the data show complete or quasi-complete separation
 *        (the ML estimate does not exist) or IRLS does not converge, the model is
 *        refitted with Firth's penalized likelihood (Firth 1993; Heinze &
 *        Schemper 2002), which always yields finite estimates.
 * Stats: ML → Wald test (z, p-value). Firth → penalized likelihood-ratio test
 *        (χ², 1 df), as in R's logistf. SE = sqrt((X'WX)⁻¹[1,1]) at the
 *        estimate in both cases. AUC-ROC.
 */
const Regression = (() => {

  const sigmoid = z => 1 / (1 + Math.exp(-z));
  // log(1 + eᶻ) without overflow
  const softplus = z => Math.max(z, 0) + Math.log1p(Math.exp(-Math.abs(z)));

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
   * Log-likelihood, score X'(y − p) and Fisher information X'WX at (β₀, β₁),
   * with W = diag(p(1−p)). X'WX = [[h00, h01],[h01, h11]].
   */
  function _info(samples, b0, b1) {
    let ll = 0, g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0;
    for (const { hdi, label } of samples) {
      const eta = b0 + b1 * hdi;
      const p = sigmoid(eta);
      const w = p * (1 - p);
      ll += label * eta - softplus(eta);
      g0 += label - p;
      g1 += (label - p) * hdi;
      h00 += w;
      h01 += w * hdi;
      h11 += w * hdi * hdi;
    }
    return { ll, g0, g1, h00, h01, h11, det: h00 * h11 - h01 * h01 };
  }

  // Firth's penalized log-likelihood: l*(β) = l(β) + ½·log|X'WX|
  function _penLogLik(samples, b0, b1) {
    const { ll, det } = _info(samples, b0, b1);
    return ll + 0.5 * Math.log(det);
  }

  // Step-halving test. The slack absorbs round-off near the optimum, where
  // halving on noise would stall convergence; NaN counts as worse.
  const _worse = (next, cur) => !(next >= cur - 1e-12 * (1 + Math.abs(cur)));

  /**
   * Separation check (Albert & Anderson 1984). With a single predictor it is
   * exact: the ML estimate exists only if the HDI ranges of selected and
   * non-selected countries overlap in more than one point.
   *   complete       — an HDI threshold splits both groups strictly
   *   quasi-complete — the groups only touch at the threshold (tied HDI value)
   * @returns {'none'|'complete'|'quasi-complete'}
   */
  function detectSeparation(samples) {
    let min1 = Infinity, max1 = -Infinity, min0 = Infinity, max0 = -Infinity;
    for (const { hdi, label } of samples) {
      if (label === 1) { min1 = Math.min(min1, hdi); max1 = Math.max(max1, hdi); }
      else             { min0 = Math.min(min0, hdi); max0 = Math.max(max0, hdi); }
    }
    if (min1 > max0 || max1 < min0) return 'complete';
    if (min1 === max0 || max1 === min0) return 'quasi-complete';
    return 'none';
  }

  /**
   * Maximum likelihood via IRLS: β ← β + (X'WX)⁻¹·X'(y − p), halving the step
   * if the log-likelihood does not increase.
   * @returns {{ beta0, beta1, iterations, converged }}
   */
  function fitIRLS(samples, { maxIter = 50, tol = 1e-9 } = {}) {
    let b0 = 0, b1 = 0;
    let cur = _info(samples, b0, b1);

    for (let iter = 1; iter <= maxIter; iter++) {
      if (!(cur.det > 1e-12 * cur.h00 * cur.h11)) break;
      let s0 = (cur.h11 * cur.g0 - cur.h01 * cur.g1) / cur.det;
      let s1 = (cur.h00 * cur.g1 - cur.h01 * cur.g0) / cur.det;
      const newton = Math.max(Math.abs(s0), Math.abs(s1));
      let next = _info(samples, b0 + s0, b1 + s1);
      for (let k = 0; k < 20 && _worse(next.ll, cur.ll); k++) {
        s0 /= 2; s1 /= 2;
        next = _info(samples, b0 + s0, b1 + s1);
      }
      b0 += s0; b1 += s1; cur = next;
      if (newton < tol) return { beta0: b0, beta1: b1, iterations: iter, converged: true };
    }
    return { beta0: b0, beta1: b1, iterations: maxIter, converged: false };
  }

  /**
   * Firth's penalized likelihood. Newton steps on the modified score
   * U*ⱼ = Σ (yᵢ − pᵢ + hᵢ(½ − pᵢ))·xᵢⱼ, where hᵢ = wᵢ·xᵢ'(X'WX)⁻¹xᵢ are the
   * diagonal elements of the hat matrix. As in logistf, the step is capped at
   * `maxStep`; it is also halved if l* does not increase.
   * @returns {{ beta0, beta1, iterations, converged }}
   */
  function fitFirth(samples, { maxIter = 500, tol = 1e-9, maxStep = 5 } = {}) {
    let b0 = 0, b1 = 0;
    let curPll = _penLogLik(samples, b0, b1);

    for (let iter = 1; iter <= maxIter; iter++) {
      const { h00, h01, h11, det } = _info(samples, b0, b1);
      const i00 = h11 / det, i01 = -h01 / det, i11 = h00 / det;   // (X'WX)⁻¹
      let u0 = 0, u1 = 0;
      for (const { hdi, label } of samples) {
        const p = sigmoid(b0 + b1 * hdi);
        const h = p * (1 - p) * (i00 + 2 * i01 * hdi + i11 * hdi * hdi);
        const r = label - p + h * (0.5 - p);
        u0 += r;
        u1 += r * hdi;
      }
      let s0 = i00 * u0 + i01 * u1;
      let s1 = i01 * u0 + i11 * u1;
      const newton = Math.max(Math.abs(s0), Math.abs(s1));
      if (newton > maxStep) { s0 *= maxStep / newton; s1 *= maxStep / newton; }
      let nextPll = _penLogLik(samples, b0 + s0, b1 + s1);
      for (let k = 0; k < 20 && _worse(nextPll, curPll); k++) {
        s0 /= 2; s1 /= 2;
        nextPll = _penLogLik(samples, b0 + s0, b1 + s1);
      }
      b0 += s0; b1 += s1; curPll = nextPll;
      if (newton < tol) return { beta0: b0, beta1: b1, iterations: iter, converged: true };
    }
    return { beta0: b0, beta1: b1, iterations: maxIter, converged: false };
  }

  /**
   * Fit the model: ML via IRLS unless separation is detected or IRLS does not
   * converge; then Firth's penalized likelihood.
   * Both fits run on standardized HDI, (hdi − mean)/sd, to decorrelate β₀ and
   * β₁ (far fewer iterations when estimates are large); ML and Firth estimates
   * are equivariant under this affine change, so β is mapped back exactly.
   * @param {Array<{hdi: number, label: number}>} samples
   * @returns {{ beta0, beta1, iterations, converged, method: 'ml-irls'|'firth', separation }}
   */
  function fit(samples) {
    const separation = detectSeparation(samples);
    const n = samples.length;
    const mean = samples.reduce((a, s) => a + s.hdi, 0) / n;
    const sd = Math.sqrt(samples.reduce((a, s) => a + (s.hdi - mean) ** 2, 0) / n) || 1;
    const scaled = samples.map(({ hdi, label }) => ({ hdi: (hdi - mean) / sd, label }));
    const unscale = ({ beta0, beta1, ...rest }) =>
      ({ beta0: beta0 - beta1 * mean / sd, beta1: beta1 / sd, ...rest });

    if (separation === 'none') {
      const ml = fitIRLS(scaled);
      if (ml.converged) return { ...unscale(ml), method: 'ml-irls', separation };
    }
    return { ...unscale(fitFirth(scaled)), method: 'firth', separation };
  }

  /**
   * Penalized likelihood-ratio test for β₁ = 0 (Heinze & Schemper 2002; logistf):
   * χ² = 2·[l*(β̂) − l*(β̃₀, 0)], 1 df, keeping the full-model penalty. Under
   * β₁ = 0 all pᵢ are equal and the penalty reduces to log(p(1−p)) + const, so
   * the restricted maximum is p = (n₁ + 1)/(n + 2).
   */
  function penalizedLRTest(samples, beta0, beta1, n1) {
    const p0 = (n1 + 1) / (samples.length + 2);
    const restricted = _penLogLik(samples, Math.log(p0 / (1 - p0)), 0);
    const chi2 = Math.max(0, 2 * (_penLogLik(samples, beta0, beta1) - restricted));
    const pValue = 2 * (1 - normCDF(Math.sqrt(chi2)));   // P(χ²₁ > c) = P(|Z| > √c)
    return { chi2, pValue };
  }

  /**
   * Compute Wald statistic and p-value for β₁.
   * Uses Fisher information: H = X'WX, SE = sqrt(H⁻¹[1,1]).
   */
  function waldTest(samples, beta0, beta1) {
    const { h00, h11, det } = _info(samples, beta0, beta1);
    // Relative singularity check: det/(h00·h11) = 1 − r² is scale-free, so tiny
    // weights (large |β| under Firth) do not trigger it
    if (!(det > 1e-12 * h00 * h11)) return { se: Infinity, z: 0, pValue: 1 };
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
    // A single selected (or non-selected) country carries no usable information
    // on the HDI slope: β₁ would only reflect where that one country lies
    if (n1 === 1 || n0 === 1) {
      return { error: n1 === 1 ? 'single_selected' : 'single_unselected', n1, n0, total: samples.length };
    }

    const meanHdiSel  = samples.filter(s => s.label===1).reduce((a,s) => a+s.hdi, 0) / n1;
    const meanHdiNsel = samples.filter(s => s.label===0).reduce((a,s) => a+s.hdi, 0) / n0;

    const { beta0, beta1, iterations, converged, method, separation } = fit(samples);
    const { se, z, pValue: pWald } = waldTest(samples, beta0, beta1);
    const { test, chi2, pValue } = method === 'firth'
      ? { test: 'penalized-lr', ...penalizedLRTest(samples, beta0, beta1, n1) }
      : { test: 'wald', chi2: null, pValue: pWald };
    const auc = aucROC(samples, beta0, beta1);

    const hdiValues = samples.map(s => s.hdi);
    const hdiMin = Math.min(...hdiValues);
    const hdiMax = Math.max(...hdiValues);

    return {
      samples,
      n1, n0,
      total: samples.length,
      meanHdiSel,
      meanHdiNsel,
      method, separation, iterations, converged,
      beta0, beta1,
      se, z,
      test, chi2, pValue,
      auc,
      significant: pValue < 0.05,
      hdiMin,
      hdiMax,
      sigmoidCurve: sigmoidCurve(beta0, beta1, hdiMin, hdiMax),
      rocCurve: rocCurve(samples, beta0, beta1),
    };
  }

  return { analyse, sigmoid, normCDF };
})();
