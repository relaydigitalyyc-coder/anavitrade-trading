# ICR 200 Quant Litmus Tests

These are executable acceptance checks for the April ICR trading system and its later Exness/ICT/divergence/multi-timeframe/meta-labeling extensions. Each row maps to one metric in `icr/audit.py` and becomes PASS, WARN, FAIL, or N/A in `audit_scorecard.csv`.

## data_integrity

- **Q001** `required_columns_ok`: Do all loaded markets contain the required OHLCV columns? Threshold: PASS if true. Improvement: Reject bad CSVs before indicator generation.
- **Q002** `timestamps_monotonic`: Are timestamps parseable, timezone-normalized, and monotonic after sorting? Threshold: PASS if true. Improvement: Normalize timestamps and drop/repair bad rows.
- **Q003** `duplicate_timestamp_count`: Are duplicate timestamps removed or absent? Threshold: PASS if 0. Improvement: Deduplicate by timestamp before backtest.
- **Q004** `positive_prices_ok`: Are all OHLC prices positive? Threshold: PASS if true. Improvement: Reject or repair non-positive prices.
- **Q005** `ohlc_high_valid`: Does every high exceed or equal open, close, and low? Threshold: PASS if true. Improvement: Reject impossible candles.
- **Q006** `ohlc_low_valid`: Does every low sit below or equal open, close, and high? Threshold: PASS if true. Improvement: Reject impossible candles.
- **Q007** `volume_nonnegative`: Are volumes non-negative? Threshold: PASS if true. Improvement: Reject negative volumes.
- **Q008** `sufficient_bars`: Is there enough bar history for MA99, ATR, pivots, and compression? Threshold: PASS if true. Improvement: Use longer samples before trusting results.
- **Q009** `min_market_bars`: Is the minimum market length above the warmup requirement? Threshold: PASS if >= warmup_bars. Improvement: Increase history length or reduce warmup only with justification.
- **Q010** `non_recursive_loader`: Is there direct-folder loading only, with no recursive scan behavior? Threshold: PASS if true. Improvement: Keep non-recursive input guards.
- **Q011** `spread_data_available`: Are optional spread columns present when spread filters are requested? Threshold: WARN if filter requested but data absent. Improvement: Add bid/ask or spread_bps columns for execution realism.
- **Q012** `bid_ask_valid`: Are optional bid/ask rows internally valid? Threshold: PASS if true or N/A. Improvement: Reject rows where ask is below bid.
- **Q013** `zero_volume_ratio`: Are zero-volume bars rare enough to avoid dead-market false signals? Threshold: PASS if <= 1%. Improvement: Filter symbols/sessions with dead volume.
- **Q014** `median_range_positive`: Is median candle range positive and stable? Threshold: PASS if true. Improvement: Remove flatlined/corrupt markets.
- **Q015** `max_gap_multiple`: Are there obvious timestamp gaps that could invalidate ATR/compression? Threshold: PASS if <= 3x median gap. Improvement: Split sessions or model gaps explicitly.
- **Q016** `symbol_names_ok`: Are all markets assigned non-empty symbols? Threshold: PASS if true. Improvement: Infer or require explicit symbol names.
- **Q017** `timeframe_labels_ok`: Are all markets assigned a timeframe label? Threshold: PASS if true. Improvement: Require timeframe metadata.
- **Q018** `data_sorted_before_indicators`: Is data sorted before indicator calculation? Threshold: PASS if true. Improvement: Sort once at load time.
- **Q019** `source_file_preservation`: Does the audit preserve raw candles instead of overwriting source files? Threshold: PASS if true. Improvement: Write reports only to output paths.
- **Q020** `sample_size_reported`: Is sample size explicitly reported before interpreting edge? Threshold: PASS if true. Improvement: Never quote edge without sample size.

## feature_causality

- **Q021** `rolling_features_causal`: Do MA7/MA25/MA99 use only current and past candles? Threshold: PASS if true. Improvement: Use trailing rolling windows only.
- **Q022** `atr_causal`: Does ATR use only current and past candles? Threshold: PASS if true. Improvement: Use trailing true-range windows.
- **Q023** `rsi_causal`: Does RSI avoid future bars? Threshold: PASS if true. Improvement: Use causal EWMA calculation.
- **Q024** `bollinger_causal`: Are Bollinger bands trailing rather than centered? Threshold: PASS if true. Improvement: Use trailing rolling mean/std.
- **Q025** `pivot_confirmation_guard`: Are centered fractal pivots excluded until confirmed? Threshold: PASS if true. Improvement: Exclude the right-side confirmation span from decision candles.
- **Q026** `divergence_confirmed_only`: Does divergence read only confirmed pivots before the decision candle? Threshold: PASS if true. Improvement: Disallow unconfirmed pivots for live-equivalent signals.
- **Q027** `mtf_uses_past_slice`: Does MTF confluence resample only candles up to the decision index? Threshold: PASS if true. Improvement: Slice base data through i before resampling.
- **Q028** `mtf_timestamp_guard`: Does MTF selection avoid future higher-timeframe closes? Threshold: PASS if true. Improvement: Use higher timestamp <= decision timestamp only.
- **Q029** `zscore_causal`: Are z-score features trailing? Threshold: PASS if true. Improvement: Use trailing rolling mean/std.
- **Q030** `volume_zscore_causal`: Are volume z-score features trailing? Threshold: PASS if true. Improvement: Use trailing rolling windows.
- **Q031** `fvg_past_only`: Does ICT FVG detection avoid future candles? Threshold: PASS if true. Improvement: Search only prior completed candles.
- **Q032** `order_block_past_only`: Does order-block proximity use historical impulse context only? Threshold: PASS if true. Improvement: Anchor OB search before impulse start.
- **Q033** `sweep_past_only`: Does liquidity sweep logic evaluate only the trigger candle plus prior lookback? Threshold: PASS if true. Improvement: No future sweep validation.
- **Q034** `close_position_causal`: Is close-position computed from the completed trigger candle only? Threshold: PASS if true. Improvement: Enter after candle close.
- **Q035** `displacement_causal`: Is displacement computed from known candle body and ATR only? Threshold: PASS if true. Improvement: Use current closed candle only.
- **Q036** `deterministic_features`: Are derived features deterministic for repeated runs? Threshold: PASS if true. Improvement: Avoid random features in signal path.
- **Q037** `nan_guard_present`: Are NaNs handled before signal decisions? Threshold: PASS if true. Improvement: Reject incomplete indicator rows.
- **Q038** `warmup_guard_ok`: Is the warmup index high enough to avoid incomplete feature rows? Threshold: PASS if true. Improvement: Set min_index above slow MA and structure lookback.
- **Q039** `confluence_is_optional`: Are optional confluence modules prevented from replacing the base gate? Threshold: PASS if true. Improvement: Keep base ICR as final execution gate.
- **Q040** `feature_docs_present`: Are indicator definitions documented enough to reproduce? Threshold: PASS if true. Improvement: Document formulas and default parameters.

## signal_logic

- **Q041** `long_ma_stack_gate`: Does every long require MA7 > MA25 > MA99? Threshold: PASS if true. Improvement: Hard-gate long trend stack.
- **Q042** `short_ma_stack_gate`: Does every short require MA7 < MA25 < MA99? Threshold: PASS if true. Improvement: Hard-gate short trend stack.
- **Q043** `sequential_setup_gate`: Does every signal require an impulse before pullback/compression? Threshold: PASS if true. Improvement: Reject compression that predates impulse.
- **Q044** `impulse_atr_gate`: Does impulse range exceed the ATR threshold? Threshold: PASS if true. Improvement: Keep impulse_atr_mult tested in robustness.
- **Q045** `impulse_volume_gate`: Does impulse volume expansion matter? Threshold: PASS if true. Improvement: Require volume expansion or justify disabling.
- **Q046** `pullback_volume_decay_gate`: Does pullback volume decay relative to impulse? Threshold: PASS if true. Improvement: Reject high-volume adverse pullbacks.
- **Q047** `pullback_origin_guard`: Does pullback structure preserve impulse origin? Threshold: PASS if true. Improvement: Use hard invalidation at impulse origin.
- **Q048** `compression_range_gate`: Does compression require range contraction? Threshold: PASS if true. Improvement: Keep range contraction as score component.
- **Q049** `compression_atr_gate`: Does compression require ATR contraction? Threshold: PASS if true. Improvement: Keep ATR contraction as score component.
- **Q050** `compression_volume_gate`: Does compression require volume contraction? Threshold: PASS if true. Improvement: Avoid chasing distribution.
- **Q051** `decisive_trigger_gate`: Does trigger require a decisive reclaim/breakdown close? Threshold: PASS if true. Improvement: Enter only after close through compression/MA7 level.
- **Q052** `trigger_close_position_gate`: Does trigger candle position validate close quality? Threshold: PASS if true. Improvement: Reject wick-only fakeouts.
- **Q053** `trigger_volume_gate`: Does trigger volume exceed compression baseline? Threshold: PASS if true. Improvement: Require participation on reclaim.
- **Q054** `min_rr_gate`: Does every signal satisfy minimum RR? Threshold: PASS if true. Improvement: Reject wide-stop/poor-target setups.
- **Q055** `score_threshold_gate`: Is score threshold enforced after all confluence deltas? Threshold: PASS if true. Improvement: Reject sub-threshold setups.
- **Q056** `long_short_conflict_resolution`: Are long and short conflicts resolved deterministically? Threshold: PASS if true. Improvement: Choose higher score on conflict.
- **Q057** `stop_beyond_compression`: Does stop sit beyond compression extreme? Threshold: PASS if true. Improvement: Anchor stops where setup is invalid.
- **Q058** `target_monotonicity`: Are targets monotonic in the correct direction? Threshold: PASS if true. Improvement: Reject malformed TP ladders.
- **Q059** `signals_exported`: Are signals exported for post-trade analysis? Threshold: PASS if true. Improvement: Keep signals.csv complete.
- **Q060** `signal_reasons_present`: Are signal reasons human-readable? Threshold: PASS if true. Improvement: Preserve reason strings for debugging.

## execution_fills

- **Q061** `next_candle_execution`: Does entry occur only after trigger candle close? Threshold: PASS if true. Improvement: Resolve exits starting i+1.
- **Q062** `same_candle_stop_first`: Is same-candle stop/target ambiguity handled conservatively? Threshold: PASS if true. Improvement: Assume stop first when both hit.
- **Q063** `fee_model_enabled`: Are fees included in R calculation? Threshold: PASS if fee_rate >= 0. Improvement: Keep fee-rate stress tests.
- **Q064** `slippage_model_enabled`: Is slippage included at entry and exit? Threshold: PASS if slippage_bps >= 0. Improvement: Stress slippage sensitivity.
- **Q065** `partial_exit_model`: Are partial exits modeled by fraction? Threshold: PASS if true. Improvement: Keep fraction sum validated.
- **Q066** `breakeven_after_close`: Does breakeven activate only after closed-candle R threshold? Threshold: PASS if true. Improvement: Upgrade stops after candle close only.
- **Q067** `runner_trail_guard`: Does MA25 runner trail activate only after TP2 and BE? Threshold: PASS if true. Improvement: Avoid premature trail logic.
- **Q068** `end_of_data_exit`: Does end-of-data mark open positions explicitly? Threshold: PASS if true. Improvement: Label unresolved trades as end_of_data.
- **Q069** `adverse_stop_slippage`: Are stop fills slippage-adjusted adversely? Threshold: PASS if true. Improvement: Use direction-aware slippage.
- **Q070** `adverse_target_slippage`: Are target fills slippage-adjusted adversely? Threshold: PASS if true. Improvement: Use direction-aware slippage.
- **Q071** `exit_fraction_guard`: Can trade fractions never exceed 100%? Threshold: PASS if true. Improvement: Raise if exits exceed one whole trade.
- **Q072** `effective_entry_risk`: Is risk unit based on effective entry after slippage? Threshold: PASS if true. Improvement: Position size from slipped entry.
- **Q073** `all_trades_closed`: Is every trade closed or marked by test end? Threshold: PASS if true. Improvement: Do not leave invisible open exposure.
- **Q074** `exit_reasons_present`: Are exit reasons retained? Threshold: PASS if true. Improvement: Keep exit reason audit trail.
- **Q075** `execution_configurable`: Are execution assumptions configurable? Threshold: PASS if true. Improvement: Expose fee/slippage/risk parameters.
- **Q076** `intrabar_uncertainty_policy`: Is intrabar path uncertainty acknowledged? Threshold: PASS if true. Improvement: Keep stop-first conservative policy.
- **Q077** `no_live_execution`: Does the engine avoid live broker order placement? Threshold: PASS if true. Improvement: Keep package research-only.
- **Q078** `spread_filter_guard`: Does spread filtering run only when spread data exists? Threshold: PASS if true. Improvement: Treat absent spread as skipped, not invented.
- **Q079** `stress_suite_present`: Are commissions and slippage stress-tested? Threshold: PASS if true. Improvement: Run stress report every backtest.
- **Q080** `execution_assumptions_reported`: Are execution assumptions reported with outputs? Threshold: PASS if true. Improvement: Write audit summary with fee/slip/risk.

## risk_portfolio

- **Q081** `position_sizing_by_stop`: Is position size derived from equity risk and stop distance? Threshold: PASS if true. Improvement: Never size from leverage alone.
- **Q082** `risk_pct_bounded`: Is risk per trade configurable and bounded? Threshold: PASS if 0 < risk <= 100%. Improvement: Use 0.25%-1% for real research unless proven.
- **Q083** `max_daily_loss_defined`: Is max daily loss defined? Threshold: PASS if > 0. Improvement: Implement hard session circuit breaker in live layer.
- **Q084** `max_open_positions_defined`: Is max open position count defined? Threshold: PASS if >= 1. Improvement: Portfolio engine should enforce concurrency.
- **Q085** `portfolio_chronology_enforced`: Does current engine enforce portfolio chronology across symbols? Threshold: WARN until implemented. Improvement: Build event-driven multi-symbol scheduler.
- **Q086** `daily_loss_enforced`: Does current engine enforce daily loss stop during backtest? Threshold: WARN until implemented. Improvement: Add per-day R circuit breaker.
- **Q087** `correlation_limit_enforced`: Does current engine enforce correlation exposure limits? Threshold: WARN until implemented. Improvement: Use currency/asset-cluster caps.
- **Q088** `directional_exposure_reported`: Are long and short exposures tracked separately? Threshold: PASS if reported. Improvement: Report long/short expectancy.
- **Q089** `per_symbol_stats_exported`: Are symbol-level stats exported? Threshold: PASS if true. Improvement: Keep per_symbol_stats.csv.
- **Q090** `drawdown_quote_reported`: Is drawdown reported in quote terms? Threshold: PASS if true. Improvement: Add R drawdown too.
- **Q091** `drawdown_r_reported`: Is drawdown reported in R terms? Threshold: PASS if true. Improvement: Track cumulative R curve.
- **Q092** `risk_of_ruin_reported`: Is risk-of-ruin estimated? Threshold: PASS if computed. Improvement: Add bootstrap risk-of-ruin.
- **Q093** `losing_streak_reported`: Is losing streak reported? Threshold: PASS if computed. Improvement: Monitor psychological and prop-firm risk.
- **Q094** `hold_time_reported`: Is avg hold time reported? Threshold: PASS if computed. Improvement: Measure capital lockup.
- **Q095** `breakevens_separated`: Are breakevens separated from wins/losses? Threshold: PASS if true. Improvement: Keep scratch trades distinct.
- **Q096** `partial_exit_r_visible`: Are partial-exit R contributions visible? Threshold: PASS if exits serialized. Improvement: Keep exit-level R details.
- **Q097** `leverage_not_edge`: Is leverage excluded from edge calculation? Threshold: PASS if true. Improvement: Measure edge in R, not nominal leverage.
- **Q098** `equity_compounding_reported`: Is equity compounding explicit? Threshold: PASS if true. Improvement: State starting and ending equity.
- **Q099** `per_symbol_cap_enforced`: Is max per-symbol allocation controlled? Threshold: WARN until implemented. Improvement: Add symbol concentration limits.
- **Q100** `april_audit_reference_reported`: Is real account audit target tracked? Threshold: PASS if reference included. Improvement: Compare future live stats to April audit baseline.

## statistics_edge

- **Q101** `trade_count`: Is total trade count reported? Threshold: PASS if reported. Improvement: Never infer edge without N.
- **Q102** `min_sample_30_trades`: Is minimum statistical sample size met? Threshold: PASS if >= 30. Improvement: Collect more trades before conclusions.
- **Q103** `robust_sample_100_trades`: Is robust sample size target met? Threshold: PASS if >= 100. Improvement: Use 100+ trades for parameter decisions.
- **Q104** `win_rate_total_reported`: Is win rate reported including breakevens? Threshold: PASS if true. Improvement: Also report non-BE win rate.
- **Q105** `expectancy_r_reported`: Is expectancy in R reported? Threshold: PASS if true. Improvement: Prioritize expectancy over win rate.
- **Q106** `profit_factor_reported`: Is profit factor reported? Threshold: PASS if true. Improvement: Treat infinite PF on tiny sample as unproven.
- **Q107** `average_win_reported`: Is average win R reported? Threshold: PASS if true. Improvement: Track payoff shape.
- **Q108** `average_loss_reported`: Is average loss R reported? Threshold: PASS if true. Improvement: Verify stop discipline.
- **Q109** `net_r_reported`: Is net R reported? Threshold: PASS if true. Improvement: Main edge metric.
- **Q110** `median_r_reported`: Is median trade R reported? Threshold: PASS if computed. Improvement: Detect runner-driven skew.
- **Q111** `r_std_reported`: Is R standard deviation reported? Threshold: PASS if computed. Improvement: Needed for confidence intervals.
- **Q112** `confidence_interval_reported`: Is t-stat or confidence interval estimated? Threshold: PASS if computed. Improvement: Use bootstrap/normal approximation.
- **Q113** `bootstrap_ci_reported`: Is bootstrap expectancy interval estimated? Threshold: PASS if computed. Improvement: Run deterministic bootstrap.
- **Q114** `first_second_half_reported`: Is edge persistence measured by halves? Threshold: PASS if computed. Improvement: Compare first half vs second half.
- **Q115** `long_expectancy_reported`: Is long-only expectancy separated? Threshold: PASS if computed. Improvement: Separate long and short edges.
- **Q116** `short_expectancy_reported`: Is short-only expectancy separated? Threshold: PASS if computed. Improvement: Separate long and short edges.
- **Q117** `score_bucket_reported`: Is score bucket expectancy measured? Threshold: PASS if computed. Improvement: Validate score monotonicity.
- **Q118** `exit_reason_distribution`: Is target-path distribution measured? Threshold: PASS if computed. Improvement: Know whether edge comes from TP1, TP2, runner, or stops.
- **Q119** `overfit_risk_flag`: Is overfitting risk explicitly flagged? Threshold: PASS if reported. Improvement: Downgrade confidence on tiny samples.
- **Q120** `april_baseline_comparison`: Is performance compared to the April audit baseline? Threshold: PASS if reported. Improvement: Track drift from 72-trade reference.

## robustness

- **Q121** `ablation_base_only`: Is baseline vs base-only ablation run? Threshold: PASS if present. Improvement: Verify ICT/div/MTF add value.
- **Q122** `ablation_no_ict`: Is no-ICT ablation run? Threshold: PASS if present. Improvement: Check ICT contribution.
- **Q123** `ablation_no_divergence`: Is no-divergence ablation run? Threshold: PASS if present. Improvement: Check divergence contribution.
- **Q124** `ablation_no_mtf`: Is no-MTF ablation run? Threshold: PASS if present. Improvement: Check MTF contribution.
- **Q125** `ablation_threshold_80`: Is stricter score threshold stress run? Threshold: PASS if present. Improvement: Check score sensitivity.
- **Q126** `ablation_threshold_85`: Is very strict score threshold stress run? Threshold: PASS if present. Improvement: Check signal quality vs scarcity.
- **Q127** `ablation_rr_3`: Is higher RR minimum stress run? Threshold: PASS if present. Improvement: Validate asymmetric setup quality.
- **Q128** `stress_high_fee`: Is fee stress run? Threshold: PASS if present. Improvement: Model worse venues.
- **Q129** `stress_high_slippage`: Is slippage stress run? Threshold: PASS if present. Improvement: Model thin alts/exotics.
- **Q130** `stress_fee_slippage`: Is combined fee/slippage stress run? Threshold: PASS if present. Improvement: Check execution fragility.
- **Q131** `stress_expectancy_positive`: Does strategy remain positive under stress? Threshold: PASS if all stress expectancy > 0. Improvement: Treat failure as execution-edge dependency.
- **Q132** `base_only_not_catastrophic`: Does strategy avoid collapse when confluence modules disabled? Threshold: PASS if base-only net_r not far worse. Improvement: Refit confluence weights if base-only collapses.
- **Q133** `parameter_sweep_present`: Is parameter sweep output written? Threshold: PASS if present. Improvement: Run threshold/RR sweep.
- **Q134** `walk_forward_present`: Is walk-forward train/test split run? Threshold: PASS if present. Improvement: Reject edge that dies out of sample.
- **Q135** `walk_forward_train_exp`: Is train expectancy reported? Threshold: PASS if computed. Improvement: Compare train/test.
- **Q136** `walk_forward_test_exp`: Is test expectancy reported? Threshold: PASS if computed. Improvement: Compare train/test.
- **Q137** `walk_forward_test_trades`: Is test trade count reported? Threshold: PASS if computed. Improvement: Avoid empty test conclusions.
- **Q138** `deterministic_sample`: Is sample-generation deterministic? Threshold: PASS if true. Improvement: Fix seeds for reproducible tests.
- **Q139** `execution_tests_present`: Are tests covering execution ambiguity? Threshold: PASS if true. Improvement: Keep same-candle tests.
- **Q140** `integrated_tests_present`: Are tests covering integrated modules? Threshold: PASS if true. Improvement: Keep ICT/div/MTF/matrix tests.

## regime_market

- **Q141** `regime_thesis_documented`: Is trend-continuation regime explicitly targeted? Threshold: PASS if true. Improvement: Keep strategy out of chop.
- **Q142** `chop_avoidance_reported`: Is chop avoidance measured? Threshold: WARN until synthetic/real chop tests exist. Improvement: Add no-trade expectation in chop regimes.
- **Q143** `dead_volume_filter_reported`: Is dead-volume avoidance measured? Threshold: WARN unless volume filters active. Improvement: Use min_volume_ma20 by venue.
- **Q144** `spread_sensitivity_reported`: Is spread sensitivity measured? Threshold: PASS if stress present. Improvement: Run max_spread_bps scenarios.
- **Q145** `volatility_regime_reported`: Is volatility regime captured? Threshold: PASS if ATR metrics exist. Improvement: Bucket trades by ATR percentile.
- **Q146** `session_performance_reported`: Is session/kilzone performance tracked? Threshold: WARN until trade session stats added. Improvement: Report NY/London/Asia edge.
- **Q147** `scanner_timeframes_documented`: Is M5/M15/H1 scanner intent represented? Threshold: PASS if true. Improvement: Keep matrix outputs per timeframe label.
- **Q148** `exness_universe_present`: Is Exness-style universe metadata included? Threshold: PASS if true. Improvement: Maintain majors/minors/exotics/metals/crypto/indices.
- **Q149** `currency_strength_present`: Is currency strength derivation implemented? Threshold: PASS if true. Improvement: Use pair returns to rank currencies.
- **Q150** `synthetic_assets_future_work`: Are synthetic assets documented as future work? Threshold: PASS if true. Improvement: Add robust synthetic cross construction later.
- **Q151** `symbol_edge_reported`: Is symbol-level edge separated? Threshold: PASS if true. Improvement: Drop symbols with negative expectancy.
- **Q152** `timeframe_edge_reported`: Is timeframe-level edge separated? Threshold: PASS if true. Improvement: Compare M5/M15/H1 results separately.
- **Q153** `asset_class_split_reported`: Are crypto alt conditions treated differently from FX? Threshold: WARN until asset-class parser expands. Improvement: Separate FX, metals, crypto, indices.
- **Q154** `news_filter_present`: Is news/event risk excluded or flagged? Threshold: N/A offline. Improvement: Add calendar/news filter before live trading.
- **Q155** `rollover_weekend_reported`: Is weekend/rollover behavior handled? Threshold: WARN until session calendar added. Improvement: Avoid rollover/spread expansion.
- **Q156** `microcap_slippage_flag`: Is high-beta microcap slippage acknowledged? Threshold: PASS if stress present. Improvement: Demand harsher slippage for microcaps.
- **Q157** `regime_drift_reported`: Is market regime drift monitored? Threshold: WARN until rolling metrics added. Improvement: Track rolling expectancy by month/regime.
- **Q158** `liquidity_target_documented`: Is liquidity target definition exportable? Threshold: PASS if target model documented. Improvement: Store prior high/low/external target fields.
- **Q159** `external_target_separation`: Are external liquidity targets separated from fixed R targets? Threshold: WARN until explicit field added. Improvement: Add target_type metadata.
- **Q160** `opportunity_cost_reported`: Is no-trade quality measured? Threshold: WARN until false-negative set built. Improvement: Sample non-trades for missed moves.

## confluence_meta

- **Q161** `ict_score_exported`: Are ICT scores exported per signal? Threshold: PASS if true. Improvement: Use ablation to validate value.
- **Q162** `divergence_score_exported`: Are divergence scores exported per signal? Threshold: PASS if true. Improvement: Use meta-labeling to follow/fade.
- **Q163** `mtf_score_exported`: Are MTF scores exported per signal? Threshold: PASS if true. Improvement: Validate HTF agreement.
- **Q164** `meta_labels_exported`: Is meta_labels.csv produced? Threshold: PASS if true. Improvement: Train second-stage classifier later.
- **Q165** `follow_fade_labels`: Does meta-label include follow/fade labels? Threshold: PASS if true. Improvement: Use label_follow and label_fade.
- **Q166** `meta_total_r`: Does meta-label include R outcome? Threshold: PASS if true. Improvement: Use total_r as target/regression label.
- **Q167** `meta_feature_components`: Does meta-label include score components? Threshold: PASS if true. Improvement: Preserve explainability.
- **Q168** `rl_research_only`: Is RL framed as research-only, not live execution? Threshold: PASS if true. Improvement: Do not let RL place trades directly.
- **Q169** `predictive_tags_not_entries`: Are predictive tags clearly marked as tags, not hard entries? Threshold: PASS if true. Improvement: Keep deterministic gate primary.
- **Q170** `ict_cap_present`: Is confluence cap applied so ICT cannot dominate? Threshold: PASS if true. Improvement: Limit confluence score impact.
- **Q171** `mtf_conflict_penalty`: Is MTF conflict penalty applied? Threshold: PASS if true. Improvement: Penalize contradictory HTF.
- **Q172** `divergence_cap_present`: Is divergence capped? Threshold: PASS if true. Improvement: Prevent oscillator overfitting.
- **Q173** `confluence_ablation_mandatory`: Is confluence ablation mandatory in audit? Threshold: PASS if ablation present. Improvement: Never trust add-ons without ablation.
- **Q174** `score_monotonicity_test`: Is score monotonicity tested? Threshold: WARN until enough trades. Improvement: Higher score should not produce lower expectancy.
- **Q175** `ml_leakage_guard`: Is feature leakage checked before ML export? Threshold: PASS if causality checks pass. Improvement: Train only on known-at-entry features.
- **Q176** `meta_label_balance_reported`: Is class imbalance reported for labels? Threshold: PASS if computed. Improvement: Handle skew in follow/fade labels.
- **Q177** `meta_schema_stable`: Is feature schema stable for future RL? Threshold: PASS if true. Improvement: Keep versioned feature keys.
- **Q178** `rl_reward_in_r`: Is reward defined in R units? Threshold: PASS if true. Improvement: Use R not dollars for stationarity.
- **Q179** `offline_dry_run_priority`: Is offline dry-run prioritized over live action? Threshold: PASS if true. Improvement: No live trading from research package.
- **Q180** `meta_labels_match_trades`: Is meta-labeling audited against actual trade results? Threshold: PASS if row count matches trades/signals. Improvement: Ensure label alignment by entry key.

## production_ops

- **Q181** `compile_passed`: Does the package compile cleanly? Threshold: PASS if true. Improvement: Run compileall before shipping.
- **Q182** `pytest_passed`: Does the test suite pass? Threshold: PASS if true. Improvement: Do not ship failing tests.
- **Q183** `dependencies_pinned`: Are dependencies pinned? Threshold: PASS if true. Improvement: Pin exact dependency versions.
- **Q184** `no_api_keys`: Is there no API-key handling in the package? Threshold: PASS if true. Improvement: Keep research package offline.
- **Q185** `no_broker_login`: Is there no broker login handling in the package? Threshold: PASS if true. Improvement: Separate research from execution.
- **Q186** `explicit_output_paths`: Are output paths explicit? Threshold: PASS if true. Improvement: Never write outside requested output dir.
- **Q187** `human_readable_reports`: Are reports human-readable? Threshold: PASS if true. Improvement: Write CSV/JSON/PNG outputs.
- **Q188** `readme_audit_docs`: Is README updated with audit workflow? Threshold: PASS if true. Improvement: Document audit commands.
- **Q189** `question_bank_versioned`: Is the 200-question bank versioned? Threshold: PASS if true. Improvement: Keep docs/QUANT_AUDIT_200.md and CSV.
- **Q190** `no_destructive_fs`: Does the package avoid destructive filesystem actions? Threshold: PASS if true. Improvement: Do not delete user files.
- **Q191** `sample_run_available`: Is there a sample deterministic execution path? Threshold: PASS if true. Improvement: Keep --generate-sample.
- **Q192** `recommendations_exported`: Does audit write recommendations? Threshold: PASS if true. Improvement: Turn failures into action items.
- **Q193** `status_granularity`: Does audit distinguish FAIL/WARN/N/A? Threshold: PASS if true. Improvement: Do not fake certainty.
- **Q194** `limitations_reported`: Does audit report limitations clearly? Threshold: PASS if true. Improvement: State when sample is too small.
- **Q195** `zip_reproducible`: Is final zip reproducible from local files? Threshold: PASS if true. Improvement: Build zip from project directory only.
- **Q196** `examples_no_secrets`: Are examples included without secrets? Threshold: PASS if true. Improvement: Keep sample data synthetic.
- **Q197** `comments_useful`: Are code comments focused on trading assumptions? Threshold: PASS if true. Improvement: Document why conservative choices exist.
- **Q198** `live_deployment_excluded`: Is live deployment explicitly excluded? Threshold: PASS if true. Improvement: Do not imply production execution.
- **Q199** `codex_prompt_present`: Is next research prompt included for Codex? Threshold: PASS if true. Improvement: Keep docs/CODEX_NEXT_PROMPT.md.
- **Q200** `audit_execution_log`: Is audit execution log stored? Threshold: PASS if true. Improvement: Write sample_run.log or audit_summary.json.
