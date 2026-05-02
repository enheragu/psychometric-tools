(function () {
  if (window.DIFTSWRunner) return;

  var TSW_PY = `
import json, numpy as np
from scipy.optimize import minimize
from scipy.stats import chi2 as _chi2
from scipy.special import roots_hermitenorm

_QUAD_N = 41
_NODES, _WEIGHTS = roots_hermitenorm(_QUAD_N)
_WEIGHTS = _WEIGHTS / _WEIGHTS.sum()

def _grm_probs(a, b, theta):
    # Returns (K, Q): P(Y=k|theta) for k=0..K-1
    b = np.asarray(b, dtype=float)
    K = len(b) + 1
    Q = len(theta)
    cum = 1.0 / (1.0 + np.exp(-a * (theta[None, :] - b[:, None])))  # (K-1, Q)
    ones = np.ones((1, Q))
    zeros = np.zeros((1, Q))
    P_geq = np.vstack([ones, cum, zeros])  # (K+1, Q)
    P = np.clip(P_geq[:-1] - P_geq[1:], 1e-12, 1.0)  # (K, Q)
    return P

def _expected_score(a, b, theta, min_cat):
    P = _grm_probs(a, b, theta)  # (K, Q)
    cats = np.arange(min_cat, min_cat + len(b) + 1, dtype=float)
    return (P.T * cats).sum(axis=1)  # (Q,)

def _marginal_loglik(params, responses, theta, weights, n_cats, min_cat):
    # params: [log_a, b0, b1-b0, b2-b1, ...] (log to enforce a>0, diffs to enforce ordering)
    log_a = params[0]
    a = np.exp(log_a)
    K = n_cats
    raw_b = params[1:]
    b = np.zeros(K - 1)
    b[0] = raw_b[0]
    for i in range(1, K - 1):
        b[i] = b[i - 1] + np.exp(raw_b[i])
    P = _grm_probs(a, b, theta)  # (K, Q)
    resp_arr = np.array(responses, dtype=int) - min_cat  # 0-indexed
    resp_arr = np.clip(resp_arr, 0, K - 1)
    P_n = P[resp_arr, :]  # (N, Q)
    marg = P_n @ weights  # (N,)
    marg = np.clip(marg, 1e-300, None)
    return -np.sum(np.log(marg))

def _marginal_loglik_two_groups(params, resp_ref, resp_foc, theta, weights, n_cats, min_cat, constrained):
    K = n_cats
    n_par = 1 + (K - 1)  # log_a + b params
    if constrained:
        ll_ref = _marginal_loglik(params[:n_par], resp_ref, theta, weights, n_cats, min_cat)
        ll_foc = _marginal_loglik(params[:n_par], resp_foc, theta, weights, n_cats, min_cat)
    else:
        ll_ref = _marginal_loglik(params[:n_par], resp_ref, theta, weights, n_cats, min_cat)
        ll_foc = _marginal_loglik(params[n_par:], resp_foc, theta, weights, n_cats, min_cat)
    return ll_ref + ll_foc

def _init_params(resp, n_cats, min_cat):
    resp_arr = np.array(resp, dtype=float)
    K = n_cats
    log_a = np.log(1.2)
    # Threshold starting points from quantiles
    sorted_resp = np.sort(resp_arr)
    fracs = np.linspace(1.0 / K, 1.0 - 1.0 / K, K - 1)
    b0 = np.quantile(sorted_resp, fracs) - (min_cat + (K - 1) / 2.0)
    raw_b = np.zeros(K - 1)
    raw_b[0] = b0[0]
    for i in range(1, K - 1):
        diff = b0[i] - b0[i - 1]
        raw_b[i] = np.log(max(diff, 0.01))
    return np.concatenate([[log_a], raw_b])

def _decode_params(params, n_cats):
    a = float(np.exp(params[0]))
    raw_b = params[1:]
    b = np.zeros(n_cats - 1)
    b[0] = raw_b[0]
    for i in range(1, n_cats - 1):
        b[i] = b[i - 1] + float(np.exp(raw_b[i]))
    return a, b.tolist()

def _fit_item(resp_ref, resp_foc, n_cats, min_cat, theta, weights, constrained):
    n_par = 1 + (n_cats - 1)
    p0 = _init_params(resp_ref + resp_foc, n_cats, min_cat)
    if constrained:
        x0 = p0
    else:
        x0 = np.concatenate([p0, p0])
    opts = {'maxiter': 500, 'ftol': 1e-8, 'gtol': 1e-6}
    try:
        res = minimize(
            _marginal_loglik_two_groups,
            x0,
            args=(resp_ref, resp_foc, theta, weights, n_cats, min_cat, constrained),
            method='L-BFGS-B',
            options=opts,
        )
        return res.fun, res.x
    except Exception:
        return np.inf, x0

def _compute_dif_metrics(a_ref, b_ref, a_foc, b_foc, theta, weights, min_cat):
    E_ref = _expected_score(a_ref, b_ref, theta, min_cat)  # (Q,)
    E_foc = _expected_score(a_foc, b_foc, theta, min_cat)  # (Q,)
    diff = E_foc - E_ref
    sids = float(np.sum(diff * weights))
    uids = float(np.sum(np.abs(diff) * weights))
    dmax = float(np.max(np.abs(diff)))
    return sids, uids, dmax

def analyze(payload_json):
    payload = json.loads(payload_json)
    item_names = payload['item_names']
    responses_dict = payload['responses']
    groups = np.array(payload['groups'], dtype=int)
    n_cats = int(payload.get('n_cats', 5))
    min_cat = int(payload.get('min_cat', 1))
    anchor_items = payload.get('anchor_items', item_names)
    dimension = payload.get('dimension', None)
    max_iter = int(payload.get('max_iter', 50))
    or_thr = float(payload.get('or_threshold', 1.25))
    p_thr = float(payload.get('p_threshold', 0.05))

    theta = _NODES
    weights = _WEIGHTS

    n = len(groups)
    n_items = len(item_names)
    responses_arr = np.full((n, n_items), np.nan)
    for j, name in enumerate(item_names):
        vals = responses_dict.get(name, [])
        for i in range(min(n, len(vals))):
            if vals[i] is not None:
                responses_arr[i, j] = float(vals[i])

    valid_rows = ~np.isnan(responses_arr).any(axis=1)
    responses_arr = responses_arr[valid_rows]
    groups_arr = groups[valid_rows]

    ref_mask = groups_arr == 0
    foc_mask = groups_arr == 1

    anchor_set = set(anchor_items)
    item_results = []
    converged = False
    iterations = 0

    for iteration in range(max_iter):
        prev_anchor_set = frozenset(anchor_set)
        iter_results = []

        for j, name in enumerate(item_names):
            resp_ref = responses_arr[ref_mask, j].tolist()
            resp_foc = responses_arr[foc_mask, j].tolist()

            if len(resp_ref) < 10 or len(resp_foc) < 10:
                iter_results.append({'item': name, 'error': 'too_few', 'variant': False})
                continue

            ll_c, params_c = _fit_item(resp_ref, resp_foc, n_cats, min_cat, theta, weights, constrained=True)
            ll_u, params_u = _fit_item(resp_ref, resp_foc, n_cats, min_cat, theta, weights, constrained=False)

            n_par = 1 + (n_cats - 1)
            G2 = float(2.0 * (ll_c - ll_u))
            G2 = max(G2, 0.0)
            df = n_par  # df = extra params in unconstrained
            p_raw = float(1.0 - _chi2.cdf(G2, df=df))
            p_adj = min(p_raw * n_items, 1.0)
            variant = (G2 > 0) and (p_adj < p_thr)

            a_ref, b_ref = _decode_params(params_u[:n_par], n_cats)
            a_foc, b_foc = _decode_params(params_u[n_par:], n_cats)
            a_c, b_c = _decode_params(params_c[:n_par], n_cats)

            sids, uids, dmax = _compute_dif_metrics(a_ref, b_ref, a_foc, b_foc, theta, weights, min_cat)

            iter_results.append({
                'item': name,
                'G2': G2,
                'df': df,
                'p_raw': p_raw,
                'p_adj': p_adj,
                'variant': variant,
                'a_ref': a_ref, 'b_ref': b_ref,
                'a_foc': a_foc, 'b_foc': b_foc,
                'a_c': a_c, 'b_c': b_c,
                'sids': sids, 'uids': uids, 'dmax': dmax,
            })

        item_results = iter_results
        new_anchor_set = set(r['item'] for r in iter_results if not r.get('variant', False) and 'error' not in r)
        if len(new_anchor_set) == 0:
            new_anchor_set = set(item_names)
        if new_anchor_set == prev_anchor_set:
            converged = True
            iterations = iteration + 1
            break
        anchor_set = new_anchor_set
        iterations = iteration + 1

    # Compute ESSD for each item and test-level metrics
    # SD_test: SD of expected total score under N(0,1) using constrained params
    E_total_ref = np.zeros(len(theta))
    for r in item_results:
        if 'a_ref' in r:
            E_total_ref += _expected_score(r['a_ref'], r['b_ref'], theta, min_cat)
    mean_E_total = float(np.sum(E_total_ref * weights))
    var_E_total = float(np.sum((E_total_ref - mean_E_total) ** 2 * weights))
    sd_test = float(np.sqrt(max(var_E_total, 1e-10)))

    stds = 0.0; utds = 0.0
    for r in item_results:
        if 'sids' in r:
            # Per-item SD from constrained (pooled) model — correct denominator for ESSD
            E_item_c = _expected_score(r['a_c'], r['b_c'], theta, min_cat)
            mean_E_item = float(np.sum(E_item_c * weights))
            var_E_item = float(np.sum((E_item_c - mean_E_item) ** 2 * weights))
            sd_item = float(np.sqrt(max(var_E_item, 1e-10)))
            r['essd'] = r['sids'] / sd_item
            stds += r['sids']
            utds += r['uids']

    etsd = stds / sd_test
    uetsd = utds / sd_test

    return json.dumps({
        'results': item_results,
        'iterations': iterations,
        'converged': converged,
        'dimension': dimension,
        'anchor_items': list(anchor_set),
        'test_level': {'stds': stds, 'utds': utds, 'etsd': etsd, 'uetsd': uetsd, 'sd_test': sd_test},
    })
`;

  var _pool = null;

  function getPool(nDims) {
    _pool = window.DIFWorkerPool.getTSWPool(TSW_PY, nDims);
    return _pool;
  }

  function runAll(payloadBase, dims, anchorsByDim, onProgress) {
    var dimKeys = Object.keys(dims);
    var pool = getPool(dimKeys.length);

    var promises = dimKeys.map(function (dim, idx) {
      var dimItems = dims[dim];
      var dimResponses = {};
      dimItems.forEach(function (name) { dimResponses[name] = payloadBase.responses[name]; });
      var anchorItems = anchorsByDim[dim] || dimItems;
      var dimPayload = Object.assign({}, payloadBase, {
        item_names: dimItems,
        responses: dimResponses,
        anchor_items: anchorItems,
        dimension: dim,
        min_cat: 1,
      });

      if (onProgress) {
        onProgress(dim, 0, dimItems.length);
      }

      return pool.dispatch(idx, dimPayload).then(function (result) {
        if (onProgress) onProgress(dim, dimItems.length, dimItems.length);
        return result;
      });
    });

    return Promise.all(promises);
  }

  window.DIFTSWRunner = { runAll: runAll };
})();
