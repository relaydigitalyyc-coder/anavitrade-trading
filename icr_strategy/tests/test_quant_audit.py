from pathlib import Path

from icr.audit import question_bank, run_quant_audit, write_audit_reports
from icr.backtester import Backtester
from icr.config import BacktestConfig, StrategyConfig
from icr.data_loader import load_many
from icr.sample_data import generate_sample_csv


def test_question_bank_has_200_unique_questions():
    qs = question_bank()
    assert len(qs) == 200
    assert len({q.id for q in qs}) == 200
    assert qs[0].id == "Q001"
    assert qs[-1].id == "Q200"


def test_quant_audit_writes_reports(tmp_path: Path):
    sample = generate_sample_csv(tmp_path / "sample.csv")
    cfg = StrategyConfig()
    bt_cfg = BacktestConfig(output_dir=tmp_path)
    markets = load_many(sample)
    result = Backtester(cfg, bt_cfg).run_many(markets)
    bundle = run_quant_audit(result, markets, cfg, bt_cfg)
    assert len(bundle.scorecard) == 200
    assert {"PASS", "WARN"}.intersection(set(bundle.scorecard["status"]))
    assert not bundle.ablations.empty
    assert not bundle.stress.empty
    paths = write_audit_reports(bundle, tmp_path / "audit")
    for path in paths.values():
        assert path.exists()
