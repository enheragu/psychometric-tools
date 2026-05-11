(function () {
  if (window.DIFMHRunner) return;

  var MH_PY = `
import json, numpy as np
from scipy.stats import chi2 as _chi2

def _holm_correction(p_arr):
    """Holm-Bonferroni step-down correction."""
    n = len(p_arr)
    if n == 0:
        return np.array([], dtype=float)
    order = np.argsort(p_arr)
    result = np.ones(n)
    run_max = 0.0
    for rank, idx in enumerate(order):
        c = float((n - rank) * p_arr[idx])
        run_max = max(run_max, c)
        result[idx] = min(1.0, run_max)
    return result

def _compute_matched(resp_arr, item_idx, anchor_idx, restscore):
    """Sum across anchor items; restscore excludes item_idx from the sum."""
    cols = [j for j in anchor_idx if j != item_idx] if restscore else list(anchor_idx)
    if not cols:
        return np.zeros(resp_arr.shape[0])
    return np.nansum(resp_arr[:, cols], axis=1)

def _mh_genMH_dichot(item_resp, matched, grp_arr, n_groups):
    """Generalized Mantel-Haenszel for dichotomous items (any number of groups).
    grp_arr: 0 = reference, 1..n_groups-1 = focal groups.
    Matches R genMantelHaenszel. df = n_groups - 1.
    Returns (statistic, p_value).
    """
    nr = n_groups - 1
    if nr < 1:
        return None, None
    strata = np.unique(matched[np.isfinite(matched)])
    a_tot = np.zeros(nr)
    e_tot = np.zeros(nr)
    v_tot = np.zeros((nr, nr))
    for s in strata:
        mask = matched == s
        n_ppk = int(mask.sum())
        if n_ppk < 2:
            continue
        item_m = item_resp[mask]
        grp_m  = grp_arr[mask]
        n_0 = int((item_m == 0).sum())
        n_1 = int((item_m == 1).sum())
        if n_0 == 0 or n_1 == 0:
            continue
        rk = np.array([int((grp_m == g + 1).sum()) for g in range(nr)], dtype=float)
        ak = np.array([int(((grp_m == g + 1) & (item_m == 0)).sum()) for g in range(nr)], dtype=float)
        ek = n_0 * rk / n_ppk
        vk = (n_0 * n_1 / ((n_ppk - 1) * n_ppk ** 2)) * (n_ppk * np.diag(rk) - np.outer(rk, rk))
        a_tot += ak
        e_tot += ek
        v_tot += vk
    diff = a_tot - e_tot
    try:
        gmh = float(np.dot(diff, np.linalg.solve(v_tot, diff)))
    except np.linalg.LinAlgError:
        return None, None
    gmh = max(0.0, gmh)
    return gmh, float(1.0 - _chi2.cdf(gmh, df=nr))

def _mh_or_dichot(item_resp, matched, ref_mask, foc_mask):
    """Standard MH odds ratio for 2-group dichotomous comparison (display only)."""
    strata = np.unique(matched[np.isfinite(matched)])
    num, den = 0.0, 0.0
    for s in strata:
        m = matched == s
        if int(m.sum()) < 2:
            continue
        r_m = m & ref_mask
        f_m = m & foc_mask
        if not r_m.any() or not f_m.any():
            continue
        a = int((item_resp[r_m] == 1).sum())
        b = int(r_m.sum()) - a
        c = int((item_resp[f_m] == 1).sum())
        d = int(f_m.sum()) - c
        num += a * d / int(m.sum())
        den += b * c / int(m.sum())
    return float(num / den) if den > 1e-15 else None

def _mh_polytomus(item_resp, matched, ref_mask, foc_mask):
    """CMH mean score statistic for polytomous items (2 groups).
    Exactly matches R difMantel.poly formula.
    Returns (chi2_stat, p_val, psi_la) where psi_la is the Liu-Agresti common OR.
    """
    strata = np.unique(matched[np.isfinite(matched)])
    S_num = 0.0   # sum of (S_Fm - exp_S_Fm) across strata
    S_den = 0.0   # sum of var_S_Fm across strata
    la_num, la_den = 0.0, 0.0  # Liu-Agresti numerator/denominator
    for s in strata:
        m = matched == s
        f_m = m & foc_mask
        r_m = m & ref_mask
        if not f_m.any() or not r_m.any():
            continue
        temp_F = item_resp[f_m]
        temp_R = item_resp[r_m]
        temp   = item_resp[m]
        temp_F = temp_F[np.isfinite(temp_F)]
        temp_R = temp_R[np.isfinite(temp_R)]
        temp   = temp[np.isfinite(temp)]
        N_Fm = len(temp_F)
        N_Rm = len(temp_R)
        N_m  = N_Fm + N_Rm
        if N_Fm < 1 or N_Rm < 1 or N_m < 2:
            continue
        # CMH mean score (R difMantel.poly formula)
        c_vals_F, cnt_F = np.unique(temp_F, return_counts=True)
        S_Fm     = float(np.dot(c_vals_F, cnt_F))   # observed focal sum
        exp_S_Fm = N_Fm * float(np.mean(temp))      # expected focal sum
        c_vals, cnt = np.unique(temp, return_counts=True)
        if N_m > 1:
            var_p2   = N_m * float(np.dot(c_vals ** 2, cnt)) - float(np.dot(c_vals, cnt)) ** 2
            var_S_Fm = (N_Fm * N_Rm / (N_m ** 2 * (N_m - 1))) * var_p2
        else:
            var_S_Fm = 0.0
        S_num += S_Fm - exp_S_Fm
        if var_S_Fm > 0:
            S_den += var_S_Fm
        # Liu-Agresti common OR (cumulative adjacent-category splits)
        K = len(c_vals)
        for j in range(K - 1):
            cut = c_vals[j]
            nf_above = int((temp_F > cut).sum())
            nr_above = int((temp_R > cut).sum())
            la_num += nf_above * (N_Rm - nr_above) / N_m
            la_den += (N_Fm - nf_above) * nr_above / N_m
    if S_den < 1e-15:
        return None, None, None
    chi2 = S_num ** 2 / S_den
    p_val = float(1.0 - _chi2.cdf(chi2, df=1))
    psi = float(la_num / la_den) if la_den > 1e-15 else None
    return float(chi2), p_val, psi

def analyze(payload_json):
    payload    = json.loads(payload_json)
    item_names = payload['item_names']
    resp_dict  = payload['responses']
    groups     = np.array(payload['groups'], dtype=int)
    is_dichot  = bool(payload.get('is_dichot', False))
    max_iter   = int(payload.get('max_iter', 50))
    or_thr     = float(payload.get('or_threshold', 1.25))
    p_thr      = float(payload.get('p_threshold', 0.05))
    n_groups   = int(payload.get('n_groups', 2))
    dimension  = payload.get('dimension', None)

    n_items = len(item_names)
    n       = len(groups)
    resp_arr = np.full((n, n_items), np.nan)
    for j, name in enumerate(item_names):
        vals = resp_dict.get(name, [])
        for i in range(min(n, len(vals))):
            v = vals[i]
            if v is not None and not (isinstance(v, float) and np.isnan(v)):
                resp_arr[i, j] = float(v)

    valid    = ~np.isnan(resp_arr).any(axis=1) & (groups >= 0)
    resp_arr = resp_arr[valid]
    grp_arr  = groups[valid]
    ref_mask = grp_arr == 0
    foc_mask = grp_arr == 1  # first focal group (used for 2-group OR and polytomous)

    def _run_iter(anchor_set, restscore=False):
        anchor_idx = sorted(anchor_set)
        rows = []
        for item_idx in range(n_items):
            matched = _compute_matched(resp_arr, item_idx, anchor_idx, restscore)
            if is_dichot:
                chi2, p_raw = _mh_genMH_dichot(
                    resp_arr[:, item_idx].astype(int), matched, grp_arr, n_groups)
                df   = n_groups - 1
                or_v = (_mh_or_dichot(resp_arr[:, item_idx].astype(int), matched, ref_mask, foc_mask)
                        if n_groups == 2 else None)
                psi  = None
            else:
                chi2, p_raw, psi = _mh_polytomus(
                    resp_arr[:, item_idx].astype(float), matched, ref_mask, foc_mask)
                df   = 1
                or_v = psi
            rows.append({
                'item': item_names[item_idx],
                'chi2': chi2, 'p_raw': p_raw, 'df': df, 'or': or_v, 'psi': psi,
            })

        # p-value adjustment:
        #   polytomous → Holm (per R difMantel.poly: p.adjust(..., method="holm"))
        #   dichot     → Bonferroni
        p_raw_arr = np.array([r['p_raw'] if r['p_raw'] is not None else 1.0 for r in rows])
        if is_dichot:
            p_adj_arr = np.minimum(1.0, p_raw_arr * n_items)
        else:
            p_adj_arr = _holm_correction(p_raw_arr)

        for j, r in enumerate(rows):
            r['p_adj'] = float(p_adj_arr[j]) if r['p_raw'] is not None else None
            dif_by_p = (r['p_adj'] is not None) and (r['p_adj'] < p_thr)
            if is_dichot and n_groups == 2 and r['or'] is not None and or_thr > 1:
                r['variant'] = dif_by_p and (r['or'] > or_thr or r['or'] < 1.0 / or_thr)
            else:
                r['variant'] = dif_by_p
        return rows

    # Iterative purification
    anchor_set = set(range(n_items))
    converged  = False
    iterations = 0
    results    = []

    for it in range(max_iter):
        prev    = frozenset(anchor_set)
        results = _run_iter(anchor_set)

        # Anchor-update rule:
        #   polytomous → raw p-value (per R difMantel.poly purification)
        #   dichot     → Bonferroni-adjusted p-value
        if is_dichot:
            new_anch = {j for j, r in enumerate(results)
                        if r['p_adj'] is None or r['p_adj'] >= p_thr}
        else:
            new_anch = {j for j, r in enumerate(results)
                        if r['p_raw'] is None or r['p_raw'] >= p_thr}

        if len(new_anch) == 0:
            # All items flagged as DIF → restscore fallback (no purification)
            results = _run_iter(set(range(n_items)), restscore=True)
            return json.dumps({
                'results': results, 'iterations': it + 1,
                'converged': False, 'all_dif': True, 'match': 'restscore',
                'dimension': dimension, 'is_dichot': is_dichot,
                'anchor_items': item_names,
            })

        if new_anch == prev:
            converged  = True
            iterations = it + 1
            break
        anchor_set = new_anch
        iterations = it + 1

    return json.dumps({
        'results': results, 'iterations': iterations,
        'converged': converged, 'all_dif': False, 'match': 'score',
        'dimension': dimension, 'is_dichot': is_dichot,
        'anchor_items': [item_names[i] for i in sorted(anchor_set)],
    })
`;

  var _pool = null;

  function getPool() {
    if (!_pool) _pool = window.DIFWorkerPool.getMHPool(MH_PY);
    return _pool;
  }

  function runDimension(dimensionPayload, onProgress) {
    if (onProgress) onProgress(dimensionPayload.dimension || '');
    return getPool().dispatch(0, dimensionPayload);
  }

  function runAll(payloadBase, dims, onProgress) {
    var promises = Object.keys(dims).map(function (dim) {
      var dimItems = dims[dim];
      var dimResponses = {};
      dimItems.forEach(function (name) { dimResponses[name] = payloadBase.responses[name]; });
      var dimPayload = Object.assign({}, payloadBase, {
        item_names: dimItems,
        responses: dimResponses,
        dimension: dim,
      });
      return runDimension(dimPayload, onProgress);
    });
    return Promise.all(promises);
  }

  window.DIFMHRunner = { runAll: runAll, runDimension: runDimension };
})();
