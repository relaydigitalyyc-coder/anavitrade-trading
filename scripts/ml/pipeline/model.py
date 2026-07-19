"""LightGBM training + Platt calibration + adversarial risk model.

Trains on feature dicts + labels → produces calibrated P(win) predictions.
Uses Platt scaling (sigmoid) instead of isotonic to avoid probability collapse.

NOTE: This module's train_chronological() test-set metrics are iteration-only
signal. The threshold is selected on the validation partition (not on test) to
avoid test-set leakage, but test metrics are NOT produced by the locked gate in
locked-walkforward-backtest.py.  See docs/prd/2026-07-17-honest-ml-validation-gate.md
for the diagnosis and docs/prd/2026-07-18-completion.md §Thread B3 for the fix."""

import json, pickle, numpy as np
from pathlib import Path
from typing import List, Dict, Tuple
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, roc_auc_score
import lightgbm as lgb

from .config import PipelineConfig, DEFAULT
from .validation import purged_chronological_split, select_threshold_on_validation

META_COLS = {'symbol', 'timestamp', 'direction'}
LABEL_COLS = {'hitTP', 'hitStop', 'maxFavorableR', 'maxAdverseR', 'pnlR', 'barsToOutcome', '_bar_index'}


def rows_to_matrix(rows: List[Dict]) -> Tuple[np.ndarray, np.ndarray, np.ndarray, List[str]]:
    """Convert feature dicts → X, y_win, y_pnl matrices."""
    feature_names = sorted(set(rows[0].keys()) - META_COLS - LABEL_COLS)
    X = np.array([[float(r.get(c, 0) or 0) for c in feature_names] for r in rows], dtype=np.float32)
    y_win = np.array([1 if r.get('hitTP') else 0 for r in rows], dtype=np.int32)
    y_pnl = np.array([float(r.get('pnlR', 0) or 0) for r in rows], dtype=np.float32)
    return X, y_win, y_pnl, feature_names


def train_chronological(rows: List[Dict], cfg: PipelineConfig = DEFAULT) -> Dict:
    """Train with purged chronological 70/15/15 split.

    The threshold is selected on the validation partition *only* (no test-set
    leakage).  Test metrics printed or returned are iteration-only signal — they
    are NOT produced by the locked gate and MUST NOT be cited as validated
    results.

    Returns model artifacts dict with ``is_locked_result`` set to ``False``.
    """
    # Sort by timestamp
    rows_sorted = sorted(rows, key=lambda r: r['timestamp'])

    # Purged chronological split: train 70%, validation 15%, test 15%
    train_idx, val_idx, test_idx = purged_chronological_split(
        rows_sorted,
        train_ratio=0.70,
        validation_ratio=0.15,
    )

    X_all, y_all, _, feature_names = rows_to_matrix(rows_sorted)
    X_train = X_all[train_idx]
    y_train = y_all[train_idx]
    X_val = X_all[val_idx]
    y_val = y_all[val_idx]
    X_test = X_all[test_idx]
    y_test = y_all[test_idx]

    # Split train into actual-train and calibration-holdout
    cal_split = int(len(X_train) * 0.8)
    X_t, X_cal = X_train[:cal_split], X_train[cal_split:]
    y_t, y_cal = y_train[:cal_split], y_train[cal_split:]

    # Train classifier
    clf = lgb.LGBMClassifier(
        n_estimators=cfg.lgbm_estimators, max_depth=cfg.lgbm_max_depth,
        num_leaves=min(63, 2 ** cfg.lgbm_max_depth - 1),
        learning_rate=cfg.lgbm_learning_rate,
        subsample=cfg.lgbm_subsample, colsample_bytree=cfg.lgbm_colsample,
        min_child_samples=cfg.lgbm_min_child,
        reg_alpha=cfg.lgbm_reg_alpha, reg_lambda=cfg.lgbm_reg_lambda,
        class_weight='balanced', random_state=42, verbose=-1,
        force_col_wise=True,
    )
    clf.fit(X_t, y_t)

    # Calibrate via Platt scaling (sigmoid) — avoids isotonic collapse
    probs_cal = clf.predict_proba(X_cal)[:, 1]
    platt = LogisticRegression(C=1.0, class_weight='balanced', random_state=42)
    platt.fit(probs_cal.reshape(-1, 1), y_cal)

    # ── Validation partition: score + select threshold ─────────────────────
    probs_val_raw = clf.predict_proba(X_val)[:, 1]
    probs_val = platt.predict_proba(probs_val_raw.reshape(-1, 1))[:, 1]

    # Calibration quality check
    probs_unique_val = len(np.unique(np.round(probs_val, 1)))
    if probs_unique_val < 3:
        print("NOT A RESULT (iteration signal only): WARNING — Calibration collapsed on validation")
        probs_val = probs_val_raw.copy()

    diff_frac_val = np.mean(np.abs(probs_val - probs_val_raw) > 0.1)
    if diff_frac_val < 0.1:
        print(f"NOT A RESULT (iteration signal only): WARNING — Calibration changed only {diff_frac_val*100:.1f}% of validation predictions by >0.1")
        probs_val = probs_val_raw.copy()

    # Select threshold from validation partition only
    pnl_val = np.array([float(rows_sorted[i].get('pnlR', 0) or 0) for i in val_idx])
    thresholds = np.arange(cfg.threshold_min, cfg.threshold_max, cfg.threshold_step)
    selected = select_threshold_on_validation(
        probs_val, pnl_val,
        thresholds=thresholds,
        min_trades=20,
        metric="sharpe",
    )
    best_t = selected["threshold"]
    print(f"NOT A RESULT (iteration signal only): Selected threshold={best_t:.4f} from validation "
          f"(trades={selected['trades']}, WR={selected['wr']*100:.1f}%, "
          f"PF={selected['pf']:.2f}, Sharpe={selected['sharpe']:.2f})")

    # ── Test partition: evaluate at the locked threshold ───────────────────
    probs_test_raw = clf.predict_proba(X_test)[:, 1]
    probs_test = platt.predict_proba(probs_test_raw.reshape(-1, 1))[:, 1]

    probs_unique_test = len(np.unique(np.round(probs_test, 1)))
    if probs_unique_test < 3:
        print("NOT A RESULT (iteration signal only): WARNING — Calibration collapsed on test")
        probs_test = probs_test_raw.copy()

    diff_frac_test = np.mean(np.abs(probs_test - probs_test_raw) > 0.1)
    if diff_frac_test < 0.1:
        print(f"NOT A RESULT (iteration signal only): WARNING — Calibration changed only {diff_frac_test*100:.1f}% of test predictions by >0.1")
        probs_test = probs_test_raw.copy()

    auc = roc_auc_score(y_test, probs_test)
    brier = brier_score_loss(y_test, probs_test)

    # Locked-threshold test metrics
    test_mask = probs_test >= best_t
    pnl_test = np.array([float(rows_sorted[i].get('pnlR', 0) or 0) for i in test_idx])
    p_best = pnl_test[test_mask]
    wr_test = y_test[test_mask].mean() if test_mask.sum() > 0 else 0
    gp = p_best[p_best > 0].sum(); gl = abs(p_best[p_best < 0].sum())
    pf_test = gp / gl if gl > 0 else 999.0
    p_test = p_best
    sharpe_test = (p_test.mean() / p_test.std() * np.sqrt(len(p_test))
                   if len(p_test) > 1 and p_test.std() > 0 else 0.0)

    # Train adversarial risk model
    y_adv = np.array([1 if float(rows_sorted[i].get('maxAdverseR', 0) or 0) > 2.0
                      else 0 for i in range(len(rows_sorted))], dtype=np.int32)
    adv = lgb.LGBMClassifier(n_estimators=100, max_depth=5, num_leaves=31,
        learning_rate=0.02, subsample=0.8, class_weight='balanced',
        random_state=42, verbose=-1, force_col_wise=True)
    adv.fit(X_all[train_idx], y_adv[train_idx])

    return {
        'classifier': clf, 'calibrator': platt, 'adversary': adv,
        'feature_names': feature_names,
        'best_threshold': best_t,
        'test_auc': float(auc), 'test_brier': float(brier),
        'test_wr': float(wr_test), 'test_pf': float(pf_test),
        'test_sharpe': float(sharpe_test),
        'test_trades': int(test_mask.sum()),
        'test_pass_rate': float(test_mask.sum() / len(y_test) * 100),
        'train_rows': len(X_train), 'test_rows': len(X_test),
        'val_rows': len(X_val),
        'is_locked_result': False,
        'split_ts': int(rows_sorted[test_idx[0]]['timestamp']) if len(test_idx) else 0,
    }


def save_model(artifacts: Dict, model_dir: Path):
    """Persist model artifacts to disk."""
    model_dir.mkdir(parents=True, exist_ok=True)
    artifacts['classifier'].booster_.save_model(str(model_dir / 'lgbm_base.txt'))
    with open(model_dir / 'lgbm_base.pkl', 'wb') as f:
        pickle.dump(artifacts['classifier'], f)
    with open(model_dir / 'calibrator.pkl', 'wb') as f:
        pickle.dump(artifacts['calibrator'], f)
    with open(model_dir / 'lgbm_adversary.pkl', 'wb') as f:
        pickle.dump(artifacts['adversary'], f)
    with open(model_dir / 'feature_names.json', 'w') as f:
        json.dump(artifacts['feature_names'], f)

    # Save training config + metrics
    meta = {k: v for k, v in artifacts.items()
            if k not in ('classifier', 'calibrator', 'adversary')}
    with open(model_dir / 'training_results.json', 'w') as f:
        json.dump(meta, f, indent=2, default=str)

    label = "NOT A RESULT (iteration signal only):"
    print(f"{label} Model saved to {model_dir}")
    print(f"{label}   Features: {len(artifacts['feature_names'])}")
    print(f"{label}   Train rows: {artifacts['train_rows']}, Test rows: {artifacts['test_rows']}")
    print(f"{label}   AUC: {artifacts['test_auc']:.4f}, Brier: {artifacts['test_brier']:.4f}")
    print(f"{label}   Best threshold: {artifacts['best_threshold']:.4f}")
    print(f"{label}   Test WR: {artifacts['test_wr']*100:.1f}%, PF: {artifacts['test_pf']:.2f}, Sharpe: {artifacts['test_sharpe']:.2f}")
    print(f"{label}   Trades: {artifacts['test_trades']} ({artifacts['test_pass_rate']:.1f}% pass rate)")


def load_model(model_dir: Path) -> Dict:
    """Load model artifacts."""
    with open(model_dir / 'lgbm_base.pkl', 'rb') as f:
        clf = pickle.load(f)
    with open(model_dir / 'calibrator.pkl', 'rb') as f:
        cal = pickle.load(f)
    with open(model_dir / 'feature_names.json') as f:
        features = json.load(f)
    return {'classifier': clf, 'calibrator': cal, 'feature_names': features}
