(function () {
  if (window.DIFMHRunner) return;

  var MH_PY = `
import json, numpy as np
from scipy.stats import chi2 as _chi2

def _mh_dichot(item_resp, matched, ref_mask, foc_mask):
    strata = np.unique(matched)
    num, den = 0.0, 0.0
    stat_num, stat_den = 0.0, 0.0
    for s in strata:
        m = matched == s
        n_s = int(m.sum())
        if n_s < 2: continue
        r_m = m & ref_mask; f_m = m & foc_mask
        n_r = int(r_m.sum()); n_f = int(f_m.sum())
        if n_r == 0 or n_f == 0: continue
        a = int((item_resp[r_m] == 1).sum())
        b = n_r - a
        c = int((item_resp[f_m] == 1).sum())
        d = n_f - c
        num += a * d / n_s
        den += b * c / n_s
        E_a = n_r * (a + c) / n_s
        V_a = n_r * n_f * (a + c) * (b + d) / (n_s ** 2 * max(n_s - 1, 1))
        if V_a > 0:
            stat_num += a - E_a
            stat_den += V_a
    if den < 1e-15 or stat_den < 1e-15:
        return None, None, None
    or_mh = num / den
    chi2_stat = (abs(stat_num) - 0.5) ** 2 / stat_den
    p_val = float(1.0 - _chi2.cdf(chi2_stat, df=1))
    return float(or_mh), float(chi2_stat), p_val

def _mh_polytomus(item_resp, matched, ref_mask, foc_mask):
    strata = np.unique(matched)
    cats = np.unique(item_resp[~np.isnan(item_resp)])
    K = len(cats)
    if K < 2:
        return None, None, None
    # Liu-Agresti common odds ratio
    num_la, den_la = 0.0, 0.0
    # CMH mean score statistic
    cmh_num, cmh_den = 0.0, 0.0
    for s in strata:
        m = matched == s
        n_s = int(m.sum())
        if n_s < 2: continue
        r_m = m & ref_mask; f_m = m & foc_mask
        n_r = int(r_m.sum()); n_f = int(f_m.sum())
        if n_r == 0 or n_f == 0: continue
        resp_r = item_resp[r_m]; resp_f = item_resp[f_m]
        resp_all = item_resp[m]
        # Liu-Agresti: sum over adjacent category splits
        for j in range(K - 1):
            cut = cats[j]
            n_r_above = int((resp_r > cut).sum())
            n_r_below = n_r - n_r_above
            n_f_above = int((resp_f > cut).sum())
            n_f_below = n_f - n_f_above
            num_la += n_f_above * n_r_below / n_s
            den_la += n_f_below * n_r_above / n_s
        # CMH mean score contribution
        mean_all = resp_all.mean()
        mean_r = resp_r.mean()
        var_s = resp_all.var(ddof=0)
        cmh_num += n_r * (mean_r - mean_all)
        if n_s > 1:
            cmh_den += n_r * n_f * var_s / (n_s - 1)
    or_la = (num_la / den_la) if den_la > 1e-15 else None
    if cmh_den < 1e-15:
        return or_la, None, None
    chi2_stat = float(cmh_num ** 2 / cmh_den)
    p_val = float(1.0 - _chi2.cdf(chi2_stat, df=1))
    return (float(or_la) if or_la is not None else None), chi2_stat, p_val

def _run_one_item(responses_arr, groups_arr, item_idx, anchor_idx, is_dichot, cats):
    matched = responses_arr[:, anchor_idx].sum(axis=1)
    item_resp = responses_arr[:, item_idx].astype(float)
    ref_mask = groups_arr == 0
    foc_mask = groups_arr == 1
    if is_dichot:
        return _mh_dichot(item_resp.astype(int), matched, ref_mask, foc_mask)
    else:
        return _mh_polytomus(item_resp, matched, ref_mask, foc_mask)

def _is_variant(or_val, p_adj, or_thr, p_thr):
    if or_val is None or p_adj is None:
        return False
    return (or_val > or_thr or or_val < 1.0 / or_thr) and p_adj < p_thr

def analyze(payload_json):
    payload = json.loads(payload_json)
    item_names = payload['item_names']
    responses_dict = payload['responses']
    groups = np.array(payload['groups'], dtype=int)
    is_dichot = bool(payload.get('is_dichot', False))
    max_iter = int(payload.get('max_iter', 50))
    or_thr = float(payload.get('or_threshold', 1.25))
    p_thr = float(payload.get('p_threshold', 0.05))
    dimension = payload.get('dimension', None)

    # Build responses array (N x n_items)
    n = len(groups)
    n_items = len(item_names)
    responses_arr = np.full((n, n_items), np.nan)
    for j, name in enumerate(item_names):
        vals = responses_dict.get(name, [])
        for i in range(min(n, len(vals))):
            if vals[i] is not None and not (isinstance(vals[i], float) and np.isnan(vals[i])):
                responses_arr[i, j] = float(vals[i])

    # Remove rows with any NaN in anchor candidates
    valid_rows = ~np.isnan(responses_arr).any(axis=1) & (groups >= 0)
    responses_arr = responses_arr[valid_rows]
    groups_arr = groups[valid_rows]

    cats = None
    if not is_dichot:
        cats = np.unique(responses_arr[~np.isnan(responses_arr)])

    anchor_set = set(range(n_items))
    converged = False
    iterations = 0
    results = []

    for iteration in range(max_iter):
        prev_anchors = frozenset(anchor_set)
        iter_results = []
        for i in range(n_items):
            # Matching score uses full anchor set including item i (standard MH)
            match_idx = sorted(anchor_set) if anchor_set else list(range(n_items))
            or_val, chi2_val, p_raw = _run_one_item(responses_arr, groups_arr, i, match_idx, is_dichot, cats)
            p_adj = min(p_raw * n_items, 1.0) if p_raw is not None else None
            variant = _is_variant(or_val, p_adj, or_thr, p_thr)
            iter_results.append({
                'item': item_names[i],
                'or': or_val,
                'chi2': chi2_val,
                'p_raw': p_raw,
                'p_adj': p_adj,
                'variant': variant,
            })
        results = iter_results
        new_anchors = set(i for i, r in enumerate(iter_results) if not r['variant'])
        if len(new_anchors) == 0:
            new_anchors = set(range(n_items))
        if new_anchors == prev_anchors:
            converged = True
            iterations = iteration + 1
            break
        anchor_set = new_anchors
        iterations = iteration + 1

    return json.dumps({
        'results': results,
        'iterations': iterations,
        'converged': converged,
        'dimension': dimension,
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
