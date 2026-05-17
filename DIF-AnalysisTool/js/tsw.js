(function () {
  if (window.DIFTSWRunner) return;

  var TSW_PY = `
import json
import numpy as np
from scipy.optimize import minimize
from scipy.stats import chi2 as _chi2
from scipy.special import roots_hermitenorm

def _holm_correction(p_vals):
    n = len(p_vals)
    if n == 0: return np.array([])
    order = np.argsort(p_vals)
    adj_p = np.zeros(n)
    run_max = 0.0
    for rank, idx in enumerate(order):
        val = p_vals[idx] * (n - rank)
        run_max = max(run_max, val)
        adj_p[idx] = min(1.0, run_max)
    return adj_p

# Fewer quadrature points for speed; 31 gives good accuracy for GRM
_QUAD_N = 31
_NODES, _WEIGHTS = roots_hermitenorm(_QUAD_N)
_WEIGHTS = _WEIGHTS / _WEIGHTS.sum()

# ── GRM utilities ─────────────────────────────────────────────────────────────

def _get_probs(a, b, theta, n_cats):
    Q = len(theta)
    if n_cats == 2:
        z = np.clip(-a * (theta - float(b[0])), -500.0, 500.0)
        P_1 = np.clip(1.0 / (1.0 + np.exp(z)), 1e-12, 1.0 - 1e-12)
        return np.vstack([1.0 - P_1, P_1])
    else:
        b_arr = np.asarray(b, dtype=float)
        z = np.clip(-a * (theta[None, :] - b_arr[:, None]), -500.0, 500.0)
        cum = 1.0 / (1.0 + np.exp(z))
        P_geq = np.vstack([np.ones((1, Q)), cum, np.zeros((1, Q))])
        return np.clip(P_geq[:-1] - P_geq[1:], 1e-12, 1.0)

def _expected_score(a, b, theta, min_cat, n_cats):
    P = _get_probs(a, b, theta, n_cats)
    cats = np.arange(min_cat, min_cat + n_cats, dtype=float)
    return (P.T * cats).sum(axis=1)

def _decode_params(v, n_cats):
    # 2PL: a is unrestricted (can be negative, matching mirt). GRM: a = exp(v[0]) > 0.
    if n_cats == 2:
        a = float(v[0])
    else:
        a = float(np.exp(np.clip(v[0], -5.0, 5.0)))
    b = np.zeros(n_cats - 1)
    b[0] = float(v[1])
    for i in range(1, n_cats - 1):
        b[i] = b[i - 1] + float(np.exp(np.clip(v[i + 1], -5.0, 5.0)))
    return a, b.tolist()

def _init_item_params(resp, n_cats, min_cat):
    K = n_cats
    arr = np.array(resp, dtype=float)
    if K == 2:
        # 2PL: a is direct (not log), b = logit(1-p). a=1.0 is a good start.
        p = float(np.clip(np.mean(arr >= (min_cat + 1)), 0.01, 0.99))
        b = float(np.log((1.0 - p) / p))
        return np.array([1.0, b])
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

def _build_x0(responses_arr, n_items, n_cats_list, min_cats, n_groups, free_set, groups_arr=None):
    # For item params: use reference-group (g=0) responses when available.
    # This avoids bias from mixing groups with different latent distributions.
    if groups_arr is not None:
        ref_mask = groups_arr == 0
        ref_resp = responses_arr[ref_mask] if ref_mask.any() else responses_arr
    else:
        ref_resp = responses_arr

    parts = [
        _init_item_params(ref_resp[:, j].tolist(), n_cats_list[j], min_cats[j])
        for j in range(n_items)
    ]
    for j in sorted(free_set):
        init_j = _init_item_params(responses_arr[:, j].tolist(), n_cats_list[j], min_cats[j])
        for _ in range(n_groups - 1):
            parts.append(init_j.copy())

    # Estimate focal group mean from logit differences (much better than mu=0).
    if groups_arr is not None and n_groups > 1:
        logit_diffs = []
        for gi in range(1, n_groups):
            foc_mask = groups_arr == gi
            diffs = []
            for j in range(n_items):
                p_ref = np.clip(np.mean(ref_resp[:, j] >= min_cats[j] + 1), 0.02, 0.98)
                p_foc = np.clip(np.mean(responses_arr[foc_mask, j] >= min_cats[j] + 1), 0.02, 0.98)
                diffs.append(np.log(p_foc / (1 - p_foc)) - np.log(p_ref / (1 - p_ref)))
            mu_est = float(np.clip(np.median(diffs), -3.0, 3.0))
            logit_diffs.append(mu_est)
        for mu_est in logit_diffs:
            parts.append(np.array([mu_est, 0.0]))
    else:
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
            P = _get_probs(a_j, b_j, theta_g, n_cats_list[j])
            resp_j = np.clip(
                np.array(resp_g[:, j], dtype=int) - min_cats[j], 0, n_cats_list[j] - 1
            )
            log_lik += np.log(P[resp_j, :])
        log_joint = log_lik + np.log(np.maximum(weights_base, 1e-300))[None, :]
        mx = log_joint.max(axis=1, keepdims=True)
        marg = np.log(np.exp(log_joint - mx).sum(axis=1)) + mx[:, 0]
        total_ll += marg.sum()
    return -total_ll

def _build_bounds(n_items, n_cats_list, n_groups, free_set):
    bds = []
    for j in range(n_items):
        if n_cats_list[j] == 2:
            bds.append((-5.0, 5.0))              # a direct, unrestricted 2PL
        else:
            bds.append((np.log(0.05), np.log(4.0)))  # log_a for GRM
        bds.append((-15.0, 15.0))                # b0
        for _ in range(n_cats_list[j] - 2):
            bds.append((-6.0, 6.0))              # log(Δb) for GRM
    for j in sorted(free_set):
        if n_cats_list[j] == 2:
            bds.append((-5.0, 5.0))
        else:
            bds.append((np.log(0.05), np.log(4.0)))
        bds.append((-15.0, 15.0))
        for _ in range(n_cats_list[j] - 2):
            bds.append((-6.0, 6.0))
    for _ in range(n_groups - 1):
        bds.append((-3.0, 3.0))   # mu_focal
        bds.append((-1.5, 1.5))   # log_sigma_focal → sigma ∈ (0.22, 4.48)
    return bds

def _em_warmup(responses_arr, groups_arr, n_items, n_cats_list, min_cats,
               theta_base, weights_base, n_groups, maxiter=40, tol=1e-4):
    """EM for the fully-invariant multigroup model.
    Returns (neg_ll, x0) in _fit_model format, ready to polish with L-BFGS-B.
    EM monotonically increases LL so it escapes local minima that L-BFGS-B gets stuck in."""
    Q = len(theta_base)
    ref_mask = groups_arr == 0

    # Initialise focal group params from logit differences
    mu = np.zeros(n_groups)
    sigma = np.ones(n_groups)
    item_logit_diffs = np.zeros((n_groups, n_items))
    for gi in range(1, n_groups):
        foc_mask = groups_arr == gi
        diffs = []
        for j in range(n_items):
            p_ref = float(np.clip(np.mean(responses_arr[ref_mask, j] >= min_cats[j]+1), 0.02, 0.98))
            p_foc = float(np.clip(np.mean(responses_arr[foc_mask, j] >= min_cats[j]+1), 0.02, 0.98))
            d = np.log(p_foc/(1-p_foc)) - np.log(p_ref/(1-p_ref))
            diffs.append(d)
            item_logit_diffs[gi, j] = d
        mu[gi] = float(np.clip(np.median(diffs), -3.0, 3.0))

    # Initialise item params: for binary items with paradoxical pattern (logit diff opposes
    # mu_foc), use the analytical 2PL solution (a = d/mu_foc, b = -logit_ref/a) as starting
    # point. This avoids the wrong-sign local minimum that standard a=±1 init falls into.
    a = np.ones(n_items)
    b = np.zeros(n_items)
    for j in range(n_items):
        p = float(np.clip(np.mean(responses_arr[ref_mask, j] >= min_cats[j] + 1), 0.02, 0.98))
        logit_ref = float(np.log(p / (1.0 - p)))
        b[j] = -logit_ref  # = log((1-p)/p), correct for a=+1
        if n_cats_list[j] == 2 and n_groups > 1 and abs(mu[1]) > 0.1:
            d = item_logit_diffs[1, j]
            if mu[1] * d < 0:
                # Analytical solution given observed p_ref, p_foc, and estimated mu_foc
                a_anal = d / mu[1]
                b_anal = -logit_ref / a_anal
                a[j] = float(np.clip(a_anal, -5.0, 5.0))
                b[j] = float(np.clip(b_anal, -15.0, 15.0))

    prev_ll = -np.inf
    for _ in range(maxiter):
        # ── E-step ───────────────────────────────────────────────────────────
        R_jgq = np.zeros((n_items, n_groups, Q))  # expected # at top category
        N_gq = np.zeros((n_groups, Q))             # expected # respondents
        total_ll = 0.0
        for g in range(n_groups):
            theta_g = mu[g] + sigma[g] * theta_base
            mask_g = groups_arr == g
            if not mask_g.any(): continue
            resp_g = responses_arr[mask_g]
            resp_int = np.clip(resp_g - np.array(min_cats)[None, :],
                               0, np.array(n_cats_list)[None, :] - 1).astype(int)
            # P_jq: probability of max category for item j at quadrature point q
            P_jq = np.zeros((n_items, Q))
            for j in range(n_items):
                P_jq[j] = np.clip(1.0/(1.0+np.exp(-a[j]*(theta_g - b[j]))), 1e-12, 1-1e-12)
            log_lik_g = np.zeros((resp_g.shape[0], Q))
            for j in range(n_items):
                top = n_cats_list[j] - 1
                y_j = resp_int[:, j]
                log_lik_g += np.where(y_j[:, None] == top,
                                      np.log(P_jq[j][None, :]),
                                      np.log(1.0 - P_jq[j][None, :]))
            log_joint = log_lik_g + np.log(np.maximum(weights_base, 1e-300))[None, :]
            mx = log_joint.max(axis=1, keepdims=True)
            post = np.exp(log_joint - mx)
            post_sum = post.sum(axis=1, keepdims=True)
            post /= post_sum
            total_ll += (np.log(post_sum[:, 0]) + mx[:, 0]).sum()
            N_gq[g] = post.sum(axis=0)
            for j in range(n_items):
                top = n_cats_list[j] - 1
                R_jgq[j, g] = ((resp_int[:, j] == top)[:, None] * post).sum(axis=0)
        if abs(total_ll - prev_ll) < tol:
            break
        prev_ll = total_ll
        # ── M-step: group params ──────────────────────────────────────────────
        for gi in range(1, n_groups):
            theta_gi = mu[gi] + sigma[gi] * theta_base
            n_q = N_gq[gi]; s = n_q.sum()
            if s > 0:
                mu_new = float(np.dot(theta_gi, n_q) / s)
                var_new = float(np.dot((theta_gi - mu_new)**2, n_q) / s)
                mu[gi] = float(np.clip(mu_new, -3.0, 3.0))
                sigma[gi] = float(np.clip(np.sqrt(max(var_new, 0.04)), 0.2, 5.0))
        # ── M-step: item params (one item at a time, much faster) ─────────────
        for j in range(n_items):
            binary = n_cats_list[j] == 2
            def neg_item_ll(params, j=j, binary=binary):
                a_j = float(params[0]) if binary else float(np.exp(np.clip(params[0], np.log(0.05), np.log(4.0))))
                b_j = float(params[1])
                ll = 0.0
                for g in range(n_groups):
                    theta_g = mu[g] + sigma[g] * theta_base
                    P = np.clip(1.0/(1.0+np.exp(-a_j*(theta_g-b_j))), 1e-12, 1-1e-12)
                    ll += (R_jgq[j,g]*np.log(P) + (N_gq[g]-R_jgq[j,g])*np.log(1-P)).sum()
                return -ll
            a_bnd = [(-5.0, 5.0)] if binary else [(np.log(0.05), np.log(4.0))]
            x0_j = [a[j] if binary else np.log(max(a[j], 0.05)), b[j]]
            res_j = minimize(neg_item_ll, x0_j, method='L-BFGS-B',
                             bounds=a_bnd + [(-15.0, 15.0)],
                             options={'maxiter': 30, 'ftol': 1e-6})
            if np.isfinite(res_j.fun):
                if binary:
                    a[j] = float(np.clip(res_j.x[0], -5.0, 5.0))
                else:
                    a[j] = float(np.exp(np.clip(res_j.x[0], np.log(0.05), np.log(4.0))))
                b[j] = float(np.clip(res_j.x[1], -15.0, 15.0))

    # Convert EM solution to _fit_model x0 format (binary: direct a; GRM: log_a)
    parts = []
    for j in range(n_items):
        parts.append([a[j] if n_cats_list[j] == 2 else np.log(max(a[j], 0.05)), b[j]])
    for gi in range(1, n_groups):
        parts.append([mu[gi], np.log(np.clip(sigma[gi], 0.22, 4.48))])
    return -total_ll, np.concatenate([np.array(p) for p in parts])

def _fit_model(responses_arr, groups_arr, n_groups, n_items, n_cats_list, min_cats,
               theta_base, weights_base, free_set=None, x0=None, maxiter=300, ftol=1e-7):
    if free_set is None:
        free_set = set()
    if x0 is None:
        x0 = _build_x0(responses_arr, n_items, n_cats_list, min_cats, n_groups, free_set, groups_arr)
    bds = _build_bounds(n_items, n_cats_list, n_groups, free_set)
    try:
        res = minimize(
            _neg_loglik, x0,
            args=(responses_arr, groups_arr, n_groups, n_items, n_cats_list, min_cats,
                  theta_base, weights_base, free_set),
            method='L-BFGS-B',
            bounds=bds,
            options={'maxiter': maxiter, 'ftol': ftol, 'gtol': 1e-4},
        )
        return float(res.fun), res.x, bool(res.success)
    except Exception:
        return float('inf'), x0, False

def _sabic(neg_ll, n_params, N):
    return 2.0 * neg_ll + n_params * float(np.log((N + 2.0) / 24.0))

# ── EAP scoring ───────────────────────────────────────────────────────────────

def _eap_scores(responses, item_params, min_cats, n_cats_list, theta_g, weights_g):
    N, J = responses.shape
    Q = len(theta_g)
    log_lik = np.zeros((N, Q))
    for j, (a_j, b_j) in enumerate(item_params):
        P = _get_probs(a_j, b_j, theta_g, n_cats_list[j])
        resp_j = np.clip(
            np.array(responses[:, j], dtype=int) - min_cats[j], 0, n_cats_list[j] - 1
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

def _empirical_es(params_ref, params_foc, theta_eap_foc, theta_norm, w_norm, min_cats, n_cats_list, item_names):
    J = len(item_names)
    E_ref_obs = np.array([_expected_score(a, b, theta_eap_foc, min_cats[j], n_cats_list[j])
                          for j, (a, b) in enumerate(params_ref)])
    E_foc_obs = np.array([_expected_score(a, b, theta_eap_foc, min_cats[j], n_cats_list[j])
                          for j, (a, b) in enumerate(params_foc)])
    E_ref_nrm = np.array([_expected_score(a, b, theta_norm, min_cats[j], n_cats_list[j])
                          for j, (a, b) in enumerate(params_ref)])
    E_foc_nrm = np.array([_expected_score(a, b, theta_norm, min_cats[j], n_cats_list[j])
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
    dimension = payload.get('dimension', None)
    max_iter = int(payload.get('max_iter', 50))
    p_thr = float(payload.get('p_threshold', 0.05))
    mh_anchor_names = payload.get('anchor_items', None)

    n_items = len(item_names)
    responses_arr = np.full((len(groups), n_items), np.nan)
    for j, name in enumerate(item_names):
        vals = responses_dict.get(name, [])
        for i in range(min(len(groups), len(vals))):
            if vals[i] is not None:
                responses_arr[i, j] = float(vals[i])

    valid = ~np.isnan(responses_arr).any(axis=1)
    responses_arr = responses_arr[valid]
    groups_arr = groups[valid]
    N = len(groups_arr)

    n_cats_list, min_cats = [], []
    for j in range(n_items):
        v = responses_arr[:, j]
        min_c = int(np.min(v))
        min_cats.append(min_c)
        n_cats_list.append(max(2, int(np.max(v)) - min_c + 1))

    unique_g = sorted(int(x) for x in np.unique(groups_arr))
    g_map = {g: i for i, g in enumerate(unique_g)}
    groups_arr = np.array([g_map[int(g)] for g in groups_arr], dtype=int)
    n_groups = len(unique_g)

    if n_groups < 2:
        return json.dumps({'error': 'need_two_groups', 'dimension': dimension})

    # MH-anchored mode: when the caller supplies a non-DIF item list (e.g. from a
    # prior Mantel-Haenszel screen), treat those as fixed anchors and skip the
    # internal drop_sequential/purification search. Mirrors the R workflow in
    # mirt::multipleGroup(invariance=c(anchor_items, 'free_means', 'free_variances')).
    mh_anchors = None
    if mh_anchor_names and isinstance(mh_anchor_names, list):
        anchor_set_names = set(mh_anchor_names)
        cand = {j for j, name in enumerate(item_names) if name in anchor_set_names}
        if 0 < len(cand) < n_items:
            mh_anchors = cand

    theta_base, weights_base = _NODES, _WEIGHTS

    # ── Step 1: Fit fully-constrained (invariant) model ──────────────────────
    _, em_x0 = _em_warmup(responses_arr, groups_arr, n_items, n_cats_list, min_cats,
                           theta_base, weights_base, n_groups)
    inv_ll, inv_x0, _ = _fit_model(
        responses_arr, groups_arr, n_groups, n_items, n_cats_list, min_cats,
        theta_base, weights_base, free_set=set(), x0=em_x0, maxiter=200)
    n_inv = _count_params(n_items, n_cats_list, n_groups, set())
    sabic_inv = _sabic(inv_ll, n_inv, N)

    # ── Step 2: First pass — test each item against invariant model ───────────
    item_stats = [None] * n_items
    p_raws, x2_vals = [], []
    unc_x0s = {}  # save unconstrained x0 per item for warm-starting base models
    for j in range(n_items):
        x0_j = _extend_x0(inv_x0, n_items, n_cats_list, n_groups, set(), j)
        unc_ll, unc_x0_j, _ = _fit_model(
            responses_arr, groups_arr, n_groups, n_items, n_cats_list, min_cats,
            theta_base, weights_base, free_set={j}, x0=x0_j, maxiter=120, ftol=1e-6)
        unc_x0s[j] = unc_x0_j
        n_unc = _count_params(n_items, n_cats_list, n_groups, {j})
        df = n_unc - n_inv
        X2 = max(0.0, 2.0 * (inv_ll - unc_ll))
        p = float(_chi2.sf(X2, df=max(df, 1)))
        sabic_unc = _sabic(unc_ll, n_unc, N)
        p_raws.append(p)
        x2_vals.append(X2)
        item_stats[j] = {'X2': X2, 'df': int(df), 'p_raw': p, 'delta_SABIC': sabic_inv - sabic_unc}

    adj_p = _holm_correction(p_raws)
    for j in range(n_items):
        item_stats[j]['p_adj'] = float(adj_p[j])

    # ── Step 3: drop_sequential — release ONE item per iteration (largest X²) ─
    # Mirrors mirt's drop_sequential with p.adjust='holm'.
    # When MH anchors are supplied, skip the search entirely.
    current_dif = set()
    converged = False
    iterations = 1
    base_x0 = inv_x0  # fallback for step 4 if sequential never runs

    if mh_anchors is not None:
        current_dif = set(range(n_items)) - mh_anchors
        converged = True
        iterations = 0
        seen = set()
        for j in sorted(current_dif):
            base_x0 = _extend_x0(base_x0, n_items, n_cats_list, n_groups, seen, j)
            seen = seen | {j}
    else:
        best_first = int(np.argmax(x2_vals))
        if adj_p[best_first] < p_thr:
            current_dif = {best_first}
        else:
            converged = True
    for it in range(1, max_iter):
        if converged:
            break
        base_ll, base_x0, _ = _fit_model(
            responses_arr, groups_arr, n_groups, n_items, n_cats_list, min_cats,
            theta_base, weights_base, free_set=current_dif, maxiter=150, ftol=1e-6)
        n_base = _count_params(n_items, n_cats_list, n_groups, current_dif)
        sabic_base = _sabic(base_ll, n_base, N)

        test_items = [j for j in range(n_items) if j not in current_dif]
        if not test_items:
            converged = True
            break

        p_loop_raw, x2_loop, unc_x0s_loop = [], [], []
        for j in test_items:
            test_set = current_dif | {j}
            x0_j = _extend_x0(base_x0, n_items, n_cats_list, n_groups, current_dif, j)
            unc_ll, unc_x0_loop_j, _ = _fit_model(
                responses_arr, groups_arr, n_groups, n_items, n_cats_list, min_cats,
                theta_base, weights_base, free_set=test_set, x0=x0_j, maxiter=100, ftol=1e-5)
            unc_x0s_loop.append(unc_x0_loop_j)
            n_unc_j = _count_params(n_items, n_cats_list, n_groups, test_set)
            df_j = n_unc_j - n_base
            X2 = max(0.0, 2.0 * (base_ll - unc_ll))
            p = float(_chi2.sf(X2, df=max(df_j, 1)))
            sabic_unc = _sabic(unc_ll, n_unc_j, N)
            p_loop_raw.append(p)
            x2_loop.append(X2)
            # Update per-item stats to reflect the latest test
            item_stats[j].update({'X2': X2, 'df': int(df_j), 'delta_SABIC': sabic_base - sabic_unc})

        p_loop_adj = _holm_correction(p_loop_raw)
        for idx, j in enumerate(test_items):
            item_stats[j]['p_adj'] = float(p_loop_adj[idx])

        # Release the single most significant item if it passes the threshold
        best_idx = int(np.argmax(x2_loop))
        if p_loop_adj[best_idx] < p_thr:
            new_j = test_items[best_idx]
            current_dif = current_dif | {new_j}
        else:
            converged = True
            break
        iterations = it + 1

    # ── Step 3b: Iterative purification ──────────────────────────────────────
    # After drop_sequential, re-test all remaining items simultaneously from the
    # current anchor model. Add ALL newly significant items at once, then repeat
    # until the DIF set is stable. Breaks circularity from anchor contamination.
    all_dif = len(current_dif) == n_items
    for purify_it in range(max_iter):
        if all_dif or not current_dif or mh_anchors is not None:
            break
        prev_dif = current_dif.copy()

        base_ll, base_x0, _ = _fit_model(
            responses_arr, groups_arr, n_groups, n_items, n_cats_list, min_cats,
            theta_base, weights_base, free_set=current_dif, x0=base_x0, maxiter=150, ftol=1e-6)
        n_base = _count_params(n_items, n_cats_list, n_groups, current_dif)
        sabic_base = _sabic(base_ll, n_base, N)

        test_items = [j for j in range(n_items) if j not in current_dif]
        if not test_items:
            break

        p_purify_raw, x2_purify = [], []
        for j in test_items:
            test_set = current_dif | {j}
            x0_j = _extend_x0(base_x0, n_items, n_cats_list, n_groups, current_dif, j)
            unc_ll, _, _ = _fit_model(
                responses_arr, groups_arr, n_groups, n_items, n_cats_list, min_cats,
                theta_base, weights_base, free_set=test_set, x0=x0_j, maxiter=120, ftol=1e-5)
            n_unc_j = _count_params(n_items, n_cats_list, n_groups, test_set)
            df_j = n_unc_j - n_base
            X2 = max(0.0, 2.0 * (base_ll - unc_ll))
            p = float(_chi2.sf(X2, df=max(df_j, 1)))
            sabic_unc = _sabic(unc_ll, n_unc_j, N)
            p_purify_raw.append(p)
            x2_purify.append(X2)
            item_stats[j].update({'X2': X2, 'df': int(df_j), 'delta_SABIC': sabic_base - sabic_unc})

        p_purify_adj = _holm_correction(p_purify_raw)
        for idx, j in enumerate(test_items):
            item_stats[j]['p_adj'] = float(p_purify_adj[idx])

        # Add ALL items that pass the threshold simultaneously, extending x0 as we go
        newly_added = [test_items[idx] for idx, p in enumerate(p_purify_adj) if p < p_thr]
        if not newly_added:
            break  # Stable
        for j in newly_added:
            base_x0 = _extend_x0(base_x0, n_items, n_cats_list, n_groups, current_dif, j)
            current_dif = current_dif | {j}
        all_dif = len(current_dif) == n_items
        iterations += 1

    all_dif = len(current_dif) == n_items

    # ── Step 4: Fit anchor model ──────────────────────────────────────────────
    if len(current_dif) > 0 and not all_dif:
        anc_ll, anc_x0, _ = _fit_model(
            responses_arr, groups_arr, n_groups, n_items, n_cats_list, min_cats,
            theta_base, weights_base, free_set=current_dif, x0=base_x0, maxiter=200)
    else:
        anc_ll, anc_x0 = inv_ll, inv_x0

    params_ref = _extract_params_for_group(anc_x0, n_items, n_cats_list, n_groups, current_dif, 0)
    params_foc = _extract_params_for_group(anc_x0, n_items, n_cats_list, n_groups, current_dif, 1)
    grp_params = _extract_group_params(anc_x0, n_items, n_cats_list, n_groups, current_dif)
    mu_foc, sigma_foc = grp_params[1]

    # ── Step 5: EAP scores for focal group ────────────────────────────────────
    foc_mask = groups_arr == 1
    foc_resp = responses_arr[foc_mask]
    theta_foc_grid = mu_foc + sigma_foc * theta_base
    theta_eap = _eap_scores(foc_resp, params_foc, min_cats, n_cats_list, theta_foc_grid, weights_base)

    foc_mean_obs = float(np.mean(theta_eap))
    theta_norm = np.linspace(-6.0, 6.0, 61)
    dens = np.exp(-0.5 * ((theta_norm - foc_mean_obs) ** 2)) / np.sqrt(2.0 * np.pi)
    w_norm = dens / dens.sum()

    # ── Step 6: empirical_ES ──────────────────────────────────────────────────
    item_es, test_es = _empirical_es(
        params_ref, params_foc, theta_eap, theta_norm, w_norm, min_cats, n_cats_list, item_names)

    for j in range(n_items):
        st = item_stats[j]
        item_es[j].update({
            'X2': st['X2'], 'df': st['df'], 'p': st['p_adj'],
            'delta_SABIC': st['delta_SABIC'],
            'dif': j in current_dif, 'variant': j in current_dif,
            'a_ref': float(params_ref[j][0]), 'b_ref': [float(x) for x in params_ref[j][1]],
            'a_foc': float(params_foc[j][0]), 'b_foc': [float(x) for x in params_foc[j][1]],
        })

    return json.dumps({
        'results': item_es, 'all_dif': all_dif, 'iterations': iterations, 'converged': converged,
        'dimension': dimension, 'anchor_items': [item_names[j] for j in range(n_items) if j not in current_dif],
        'test_level': test_es if not all_dif else None,
        'group_params': [{'mu': float(g[0]), 'sigma': float(g[1])} for g in grp_params],
        'message': 'all_items_dif' if all_dif else None,
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
      });
      // When MH provided anchors (non-DIF items), pass them so the Python side
      // uses them as fixed anchors (skipping internal drop_sequential search).
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
