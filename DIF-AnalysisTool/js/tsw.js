(function () {
  if (window.DIFTSWRunner) return;

  var TSW_PY = `
import json
import numpy as np
from scipy.optimize import minimize
from scipy.stats import chi2 as _chi2
from scipy.special import roots_hermitenorm

# Fewer quadrature points for speed; 31 gives good accuracy for GRM
_QUAD_N = 31
_NODES, _WEIGHTS = roots_hermitenorm(_QUAD_N)
_WEIGHTS = _WEIGHTS / _WEIGHTS.sum()

# ── GRM utilities ─────────────────────────────────────────────────────────────

def _grm_probs(a, b, theta):
    b = np.asarray(b, dtype=float)
    K = len(b) + 1
    Q = len(theta)
    z = np.clip(-a * (theta[None, :] - b[:, None]), -500.0, 500.0)
    cum = 1.0 / (1.0 + np.exp(z))
    P_geq = np.vstack([np.ones((1, Q)), cum, np.zeros((1, Q))])
    return np.clip(P_geq[:-1] - P_geq[1:], 1e-12, 1.0)

def _expected_score(a, b, theta, min_cat):
    P = _grm_probs(a, b, theta)
    cats = np.arange(min_cat, min_cat + len(b) + 1, dtype=float)
    return (P.T * cats).sum(axis=1)

def _decode_params(v, n_cats):
    a = float(np.exp(np.clip(v[0], -5.0, 5.0)))
    b = np.zeros(n_cats - 1)
    b[0] = float(v[1])
    for i in range(1, n_cats - 1):
        b[i] = b[i - 1] + float(np.exp(np.clip(v[i + 1], -5.0, 5.0)))
    return a, b.tolist()

def _init_item_params(resp, n_cats, min_cat):
    K = n_cats
    arr = np.array(resp, dtype=float)
    fracs = np.linspace(1.0 / K, 1.0 - 1.0 / K, K - 1)
    b0 = np.quantile(arr, fracs) - (min_cat + (K - 1) / 2.0)
    raw_b = np.zeros(K - 1)
    raw_b[0] = b0[0]
    for i in range(1, K - 1):
        raw_b[i] = np.log(max(float(b0[i] - b0[i - 1]), 0.01))
    return np.concatenate([[np.log(1.2)], raw_b])

# ── Parameter management ─────────────────────────────────────────────────────

def _nip(n_cats):
    return 1 + (n_cats - 1)

def _count_params(n_items, n_cats_list, n_groups, free_set):
    return (
        sum(_nip(K) for K in n_cats_list)
        + sum(_nip(n_cats_list[j]) for j in free_set) * (n_groups - 1)
        + 2 * (n_groups - 1)
    )

def _build_x0(responses_arr, n_items, n_cats_list, min_cats, n_groups, free_set):
    parts = [
        _init_item_params(responses_arr[:, j].tolist(), n_cats_list[j], min_cats[j])
        for j in range(n_items)
    ]
    for j in sorted(free_set):
        init_j = _init_item_params(responses_arr[:, j].tolist(), n_cats_list[j], min_cats[j])
        for _ in range(n_groups - 1):
            parts.append(init_j.copy())
    for _ in range(n_groups - 1):
        parts.append(np.array([0.0, 0.0]))
    return np.concatenate(parts)

def _extend_x0(base_x0, n_items, n_cats_list, n_groups, old_free_set, new_j):
    """Extend a fitted param vector to add free focal params for item new_j."""
    nip = [_nip(K) for K in n_cats_list]
    n_shared = sum(nip)
    old_sorted = sorted(old_free_set)
    old_free_size = sum(nip[j] * (n_groups - 1) for j in old_sorted)

    shared = base_x0[:n_shared]
    free_sec = base_x0[n_shared:n_shared + old_free_size]
    grp_sec = base_x0[n_shared + old_free_size:]

    item_off = sum(nip[:new_j])
    new_p = np.tile(shared[item_off:item_off + nip[new_j]], n_groups - 1)

    new_sorted = sorted(list(old_free_set) + [new_j])
    ins = new_sorted.index(new_j)

    free_parts = []
    off = 0
    for j2 in old_sorted:
        sz = nip[j2] * (n_groups - 1)
        free_parts.append(free_sec[off:off + sz])
        off += sz

    new_parts = free_parts[:ins] + [new_p] + free_parts[ins:]
    return np.concatenate([shared] + new_parts + [grp_sec])

def _extract_params_for_group(x0, n_items, n_cats_list, n_groups, free_set, g):
    nip = [_nip(K) for K in n_cats_list]
    free_sorted = sorted(free_set)
    off = 0
    shared = {}
    for j in range(n_items):
        shared[j] = _decode_params(x0[off:off + nip[j]], n_cats_list[j])
        off += nip[j]
    focal = {}
    for j in free_sorted:
        focal[j] = {}
        for gi in range(1, n_groups):
            focal[j][gi] = _decode_params(x0[off:off + nip[j]], n_cats_list[j])
            off += nip[j]
    return [focal[j][g] if (g > 0 and j in focal and g in focal[j]) else shared[j]
            for j in range(n_items)]

def _extract_group_params(x0, n_items, n_cats_list, n_groups, free_set):
    nip = [_nip(K) for K in n_cats_list]
    off = sum(nip) + sum(nip[j] * (n_groups - 1) for j in free_set)
    grps = [(0.0, 1.0)]
    for _ in range(1, n_groups):
        mu = float(x0[off])
        sigma = float(np.exp(np.clip(x0[off + 1], -3.0, 3.0)))
        grps.append((mu, sigma))
        off += 2
    return grps

# ── Joint log-likelihood ──────────────────────────────────────────────────────

def _neg_loglik(x0, responses_arr, groups_arr, n_groups, n_items,
                n_cats_list, min_cats, theta_base, weights_base, free_set):
    nip = [_nip(K) for K in n_cats_list]
    free_sorted = sorted(free_set)
    off = 0
    shared_params = []
    for j in range(n_items):
        shared_params.append(_decode_params(x0[off:off + nip[j]], n_cats_list[j]))
        off += nip[j]
    focal_params = {}
    for j in free_sorted:
        focal_params[j] = {}
        for gi in range(1, n_groups):
            focal_params[j][gi] = _decode_params(x0[off:off + nip[j]], n_cats_list[j])
            off += nip[j]
    grp_params = [(0.0, 1.0)]
    for _ in range(1, n_groups):
        mu = float(x0[off])
        sigma = float(np.exp(np.clip(x0[off + 1], -3.0, 3.0)))
        grp_params.append((mu, sigma))
        off += 2

    total_ll = 0.0
    for g in range(n_groups):
        mu_g, sigma_g = grp_params[g]
        theta_g = mu_g + sigma_g * theta_base
        mask_g = groups_arr == g
        if not np.any(mask_g):
            continue
        resp_g = responses_arr[mask_g]
        N_g, Q = resp_g.shape[0], len(theta_g)
        log_lik = np.zeros((N_g, Q))
        for j in range(n_items):
            if j in focal_params and g in focal_params[j]:
                a_j, b_j = focal_params[j][g]
            else:
                a_j, b_j = shared_params[j]
            P = _grm_probs(a_j, b_j, theta_g)
            resp_j = np.clip(
                np.array(resp_g[:, j], dtype=int) - min_cats[j], 0, n_cats_list[j] - 1
            )
            log_lik += np.log(P[resp_j, :])
        log_joint = log_lik + np.log(np.maximum(weights_base, 1e-300))[None, :]
        mx = log_joint.max(axis=1, keepdims=True)
        marg = np.log(np.exp(log_joint - mx).sum(axis=1)) + mx[:, 0]
        total_ll += marg.sum()
    return -total_ll

def _fit_model(responses_arr, groups_arr, n_groups, n_items, n_cats_list, min_cats,
               theta_base, weights_base, free_set=None, x0=None, maxiter=300):
    if free_set is None:
        free_set = set()
    if x0 is None:
        x0 = _build_x0(responses_arr, n_items, n_cats_list, min_cats, n_groups, free_set)
    try:
        res = minimize(
            _neg_loglik, x0,
            args=(responses_arr, groups_arr, n_groups, n_items, n_cats_list, min_cats,
                  theta_base, weights_base, free_set),
            method='L-BFGS-B',
            options={'maxiter': maxiter, 'ftol': 1e-7, 'gtol': 1e-5},
        )
        return float(res.fun), res.x, bool(res.success)
    except Exception:
        return float('inf'), x0, False

def _sabic(neg_ll, n_params, N):
    return 2.0 * neg_ll + n_params * float(np.log((N + 2.0) / 24.0))

# ── EAP scoring ───────────────────────────────────────────────────────────────

def _eap_scores(responses, item_params, min_cats, theta_g, weights_g):
    N, J = responses.shape
    Q = len(theta_g)
    log_lik = np.zeros((N, Q))
    for j, (a_j, b_j) in enumerate(item_params):
        P = _grm_probs(a_j, b_j, theta_g)
        resp_j = np.clip(
            np.array(responses[:, j], dtype=int) - min_cats[j], 0, len(b_j)
        )
        log_lik += np.log(P[resp_j, :])
    log_joint = log_lik + np.log(np.maximum(weights_g, 1e-300))[None, :]
    mx = log_joint.max(axis=1, keepdims=True)
    post = np.exp(log_joint - mx)
    post /= post.sum(axis=1, keepdims=True)
    return post @ theta_g

# ── empirical_ES ──────────────────────────────────────────────────────────────

def _cohen_d(v1, v2):
    v1, v2 = np.asarray(v1, dtype=float), np.asarray(v2, dtype=float)
    n1, n2 = len(v1), len(v2)
    if n1 < 2 or n2 < 2:
        return 0.0
    pooled_var = ((n1 - 1) * np.var(v1, ddof=1) + (n2 - 1) * np.var(v2, ddof=1)) / (n1 + n2 - 2)
    return float((np.mean(v1) - np.mean(v2)) / np.sqrt(max(pooled_var, 1e-10)))

def _empirical_es(params_ref, params_foc, theta_eap_foc, theta_norm, w_norm, min_cats, item_names):
    J = len(item_names)
    E_ref_obs = np.array([_expected_score(a, b, theta_eap_foc, min_cats[j])
                          for j, (a, b) in enumerate(params_ref)])
    E_foc_obs = np.array([_expected_score(a, b, theta_eap_foc, min_cats[j])
                          for j, (a, b) in enumerate(params_foc)])
    E_ref_nrm = np.array([_expected_score(a, b, theta_norm, min_cats[j])
                          for j, (a, b) in enumerate(params_ref)])
    E_foc_nrm = np.array([_expected_score(a, b, theta_norm, min_cats[j])
                          for j, (a, b) in enumerate(params_foc)])

    def _max_d_obs(diff):
        idx = int(np.argmax(np.abs(diff)))
        return float(theta_eap_foc[idx]), float(diff[idx])

    item_es = []
    for j in range(J):
        d_obs = E_foc_obs[j] - E_ref_obs[j]
        d_nrm = E_foc_nrm[j] - E_ref_nrm[j]
        th_md, md = _max_d_obs(d_obs)
        item_es.append({
            'item': item_names[j],
            'SIDS': float(np.mean(d_obs)),
            'UIDS': float(np.mean(np.abs(d_obs))),
            'SIDN': float(np.dot(d_nrm, w_norm)),
            'UIDN': float(np.dot(np.abs(d_nrm), w_norm)),
            'ESSD': _cohen_d(E_foc_obs[j], E_ref_obs[j]),
            'theta_maxD': th_md,
            'maxD': md,
            'mean_ES_foc': float(np.mean(E_foc_obs[j])),
            'mean_ES_ref': float(np.mean(E_ref_obs[j])),
        })

    ETS_foc = E_foc_obs.sum(axis=0)
    ETS_ref = E_ref_obs.sum(axis=0)
    ETS_diff = ETS_foc - ETS_ref
    ETS_foc_n = E_foc_nrm.sum(axis=0)
    ETS_ref_n = E_ref_nrm.sum(axis=0)
    ETS_diff_n = ETS_foc_n - ETS_ref_n

    idx_test = int(np.argmax(np.abs(ETS_diff)))
    test_es = {
        'STDS': float(sum(r['SIDS'] for r in item_es)),
        'UTDS': float(sum(r['UIDS'] for r in item_es)),
        'UETSDS': float(np.mean(np.abs(ETS_diff))),
        'ETSSD': _cohen_d(ETS_foc, ETS_ref),
        'Starks_DTFR': float(np.dot(ETS_diff_n, w_norm)),
        'UDTFR': float(np.dot(np.abs(ETS_diff_n), w_norm)),
        'UETSDN': float(np.dot(np.abs(ETS_diff_n), w_norm)),
        'theta_maxD_test': float(theta_eap_foc[idx_test]),
        'test_maxD': float(ETS_diff[idx_test]),
    }
    return item_es, test_es

# ── Main ──────────────────────────────────────────────────────────────────────

def analyze(payload_json):
    payload = json.loads(payload_json)
    item_names = payload['item_names']
    responses_dict = payload['responses']
    groups = np.array(payload['groups'], dtype=int)
    n_cats_u = int(payload.get('n_cats', 5))
    min_cat_u = int(payload.get('min_cat', 1))
    dimension = payload.get('dimension', None)
    max_iter = int(payload.get('max_iter', 50))
    p_thr = float(payload.get('p_threshold', 0.05))

    n_items = len(item_names)
    n_cats_list = [n_cats_u] * n_items
    min_cats = [min_cat_u] * n_items

    n_total = len(groups)
    responses_arr = np.full((n_total, n_items), np.nan)
    for j, name in enumerate(item_names):
        vals = responses_dict.get(name, [])
        for i in range(min(n_total, len(vals))):
            if vals[i] is not None:
                responses_arr[i, j] = float(vals[i])

    valid = ~np.isnan(responses_arr).any(axis=1)
    responses_arr = responses_arr[valid]
    groups_arr = groups[valid]
    N = len(groups_arr)

    unique_g = sorted(int(x) for x in np.unique(groups_arr))
    g_map = {g: i for i, g in enumerate(unique_g)}
    groups_arr = np.array([g_map[int(g)] for g in groups_arr], dtype=int)
    n_groups = len(unique_g)

    if n_groups < 2:
        return json.dumps({'error': 'need_two_groups', 'dimension': dimension})

    theta_base = _NODES
    weights_base = _WEIGHTS

    # ── Step 1: Fit invariant model ───────────────────────────────────────────
    inv_ll, inv_x0, inv_ok = _fit_model(
        responses_arr, groups_arr, n_groups, n_items, n_cats_list, min_cats,
        theta_base, weights_base, free_set=set(), maxiter=500)
    n_inv = _count_params(n_items, n_cats_list, n_groups, set())
    sabic_inv = _sabic(inv_ll, n_inv, N)

    # ── Step 2: First-iteration DIF test (invariant model as baseline) ────────
    first_iter = {}
    for j in range(n_items):
        x0_j = _extend_x0(inv_x0, n_items, n_cats_list, n_groups, set(), j)
        unc_ll, _, unc_ok = _fit_model(
            responses_arr, groups_arr, n_groups, n_items, n_cats_list, min_cats,
            theta_base, weights_base, free_set={j}, x0=x0_j, maxiter=300)
        n_unc = _count_params(n_items, n_cats_list, n_groups, {j})
        sabic_unc = _sabic(unc_ll, n_unc, N)
        df = n_unc - n_inv
        X2 = max(0.0, 2.0 * (inv_ll - unc_ll))
        p_raw = float(_chi2.sf(X2, df=max(df, 1)))
        delta_sabic = sabic_inv - sabic_unc
        first_iter[j] = {
            'item': item_names[j],
            'X2': float(X2), 'df': int(df), 'p': float(p_raw),
            'SABIC_base': float(sabic_inv), 'SABIC_free': float(sabic_unc),
            'delta_SABIC': float(delta_sabic),
            'dif': delta_sabic > 0,
            'converged': bool(unc_ok),
        }

    initial_dif = {j for j in range(n_items) if first_iter[j]['dif']}

    # All items show DIF — return first-iteration stats with warning
    if len(initial_dif) == n_items:
        return json.dumps({
            'results': [first_iter[j] for j in range(n_items)],
            'all_dif': True,
            'iterations': 1,
            'converged': False,
            'dimension': dimension,
            'anchor_items': [],
            'test_level': None,
            'group_params': None,
            'message': 'all_items_dif',
        })

    # No DIF — skip sequential loop
    if len(initial_dif) == 0:
        current_dif = set()
        iterations = 1
        converged = True
    else:
        # ── drop_sequential: iteratively add items to the DIF set ─────────────
        current_dif = set(initial_dif)
        iterations = 1
        converged = False

        for it in range(1, max_iter):
            base_ll, base_x0, _ = _fit_model(
                responses_arr, groups_arr, n_groups, n_items, n_cats_list, min_cats,
                theta_base, weights_base, free_set=current_dif, maxiter=400)
            n_base = _count_params(n_items, n_cats_list, n_groups, current_dif)
            sabic_base = _sabic(base_ll, n_base, N)

            new_dif = set(current_dif)
            for j in range(n_items):
                if j in current_dif:
                    continue
                test_set = current_dif | {j}
                x0_j = _extend_x0(base_x0, n_items, n_cats_list, n_groups, current_dif, j)
                unc_ll, _, _ = _fit_model(
                    responses_arr, groups_arr, n_groups, n_items, n_cats_list, min_cats,
                    theta_base, weights_base, free_set=test_set, x0=x0_j, maxiter=250)
                n_unc_j = _count_params(n_items, n_cats_list, n_groups, test_set)
                sabic_unc_j = _sabic(unc_ll, n_unc_j, N)
                if sabic_base - sabic_unc_j > 0:
                    new_dif.add(j)

            iterations = it + 1
            if new_dif == current_dif:
                converged = True
                break
            current_dif = new_dif

    # ── Step 3: Fit anchor model (DIF items freed) ────────────────────────────
    if len(current_dif) == 0:
        anc_ll, anc_x0, anc_ok = inv_ll, inv_x0, inv_ok
    else:
        anc_ll, anc_x0, anc_ok = _fit_model(
            responses_arr, groups_arr, n_groups, n_items, n_cats_list, min_cats,
            theta_base, weights_base, free_set=current_dif, maxiter=500)

    params_ref = _extract_params_for_group(anc_x0, n_items, n_cats_list, n_groups, current_dif, 0)
    params_foc = _extract_params_for_group(anc_x0, n_items, n_cats_list, n_groups, current_dif, 1)
    grp_params = _extract_group_params(anc_x0, n_items, n_cats_list, n_groups, current_dif)
    mu_foc, sigma_foc = grp_params[1]

    # ── Step 4: EAP scores for focal group ────────────────────────────────────
    foc_mask = groups_arr == 1
    foc_resp = responses_arr[foc_mask]
    theta_foc_grid = mu_foc + sigma_foc * theta_base
    theta_eap = _eap_scores(foc_resp, params_foc, min_cats, theta_foc_grid, weights_base)

    # Normal grid centred at focal group observed mean (for SIDN/UIDN)
    foc_mean_obs = float(np.mean(theta_eap))
    theta_norm = np.linspace(-6.0, 6.0, 61)
    dens = np.exp(-0.5 * ((theta_norm - foc_mean_obs) ** 2)) / np.sqrt(2.0 * np.pi)
    w_norm = dens / dens.sum()

    # ── Step 5: empirical_ES ──────────────────────────────────────────────────
    item_es, test_es = _empirical_es(
        params_ref, params_foc, theta_eap, theta_norm, w_norm, min_cats, item_names)

    # Merge DIF detection stats into effect-size results
    anchor_names = [item_names[j] for j in range(n_items) if j not in current_dif]
    for j in range(n_items):
        fi = first_iter[j]
        es = item_es[j]
        es.update({
            'X2': fi['X2'], 'df': fi['df'], 'p': fi['p'],
            'delta_SABIC': fi['delta_SABIC'],
            'SABIC_base': fi['SABIC_base'], 'SABIC_free': fi['SABIC_free'],
            'dif': j in current_dif,
            'variant': j in current_dif,
            'a_ref': float(params_ref[j][0]),
            'b_ref': [float(x) for x in params_ref[j][1]],
            'a_foc': float(params_foc[j][0]),
            'b_foc': [float(x) for x in params_foc[j][1]],
        })

    return json.dumps({
        'results': item_es,
        'all_dif': False,
        'iterations': iterations,
        'converged': converged,
        'dimension': dimension,
        'anchor_items': anchor_names,
        'test_level': test_es,
        'group_params': [{'mu': float(g[0]), 'sigma': float(g[1])} for g in grp_params],
        'message': None,
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
      var dimPayload = Object.assign({}, payloadBase, {
        item_names: dimItems,
        responses: dimResponses,
        dimension: dim,
        min_cat: 1,
      });
      // anchor_items from MH are available but the new Python code recomputes them internally;
      // pass them anyway for any future use.
      if (anchorsByDim && anchorsByDim[dim]) {
        dimPayload.anchor_items = anchorsByDim[dim];
      }

      if (onProgress) onProgress(dim, 0, dimItems.length);

      return pool.dispatch(idx, dimPayload).then(function (result) {
        if (onProgress) onProgress(dim, dimItems.length, dimItems.length);
        return result;
      });
    });

    return Promise.all(promises);
  }

  window.DIFTSWRunner = { runAll: runAll };
})();
