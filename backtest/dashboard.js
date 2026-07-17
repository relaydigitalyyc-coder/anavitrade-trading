// ============================================================
// BACKTEST DASHBOARD — Standalone SPA
// React via CDN + htm for JSX-like syntax
// ============================================================

// --- Access Gate ---
(function () {
  var ALLOWED_KEYS = ['anavitrade-founder-2026'];
  var params = new URLSearchParams(window.location.search);
  if (!ALLOWED_KEYS.includes(params.get('key'))) {
    document.getElementById('root').innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0b0b12;color:#e2e8f0;font-family:system-ui,sans-serif;flex-direction:column;gap:0.75rem;padding:2rem;text-align:center;">' +
      '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
      '<h1 style="font-size:1.5rem;font-weight:600;color:#f1f5f9;">Access Denied</h1>' +
      '<p style="color:#888;">This dashboard is for authorized founders only.</p>' +
      '<p style="color:#555;font-size:0.875rem;">Provide a valid <code style="color:#3b82f6;">?key=</code> parameter to access.</p>' +
      '</div>';
    throw new Error('Unauthorized access to backtest dashboard');
  }
})();

// --- Imports ---
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import htm from 'htm';
var html = htm.bind(React.createElement);

// --- Utility ---
var fmt = {
  pct: function (v) { return (v * 100).toFixed(2) + '%'; },
  pctRaw: function (v) { return v.toFixed(2) + '%'; },
  num: function (v) { return Number(v).toLocaleString('en-US'); },
  dec2: function (v) { return Number(v).toFixed(2); },
  dec3: function (v) { return Number(v).toFixed(3); },
  usd: function (v) { return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
  sh: function (v) { return Number(v).toFixed(2); },
  valClass: function (v) { return v > 0 ? 'val-pos' : v < 0 ? 'val-neg' : 'val-neutral'; },
  timeFromTimestamp: function (ts) {
    // ts is like "20260716_183352"
    if (!ts || ts.length < 8) return ts;
    var y = ts.slice(0, 4), m = ts.slice(4, 6), d = ts.slice(6, 8);
    return y + '-' + m + '-' + d;
  }
};

// --- Icons (inline SVG) ---
var Icons = {
  trendingUp: html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
  trendingDown: html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`,
  trades: html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  chart: html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
  activity: html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  shield: html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  target: html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`
};

// --- Format value with color ---
function Val(props) {
  var v = props.value;
  var dec = props.decimals || 2;
  var prefix = props.prefix || '';
  var suffix = props.suffix || '';
  var formatted;
  if (props.type === 'pct') formatted = (v * 100).toFixed(dec) + '%';
  else if (props.type === 'usd') formatted = '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 });
  else if (props.type === 'rawPct') formatted = Number(v).toFixed(dec) + '%';
  else formatted = Number(v).toFixed(dec);

  var cls = (v > 0 && props.colored !== false) ? 'val-pos' : (v < 0 && props.colored !== false) ? 'val-neg' : '';
  return html`<span class="${cls}">${prefix}${formatted}${suffix}</span>`;
}

// ============================================================
// COMPONENTS
// ============================================================

// --- Loading Spinner ---
function LoadingSpinner() {
  return html`
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;gap:1.5rem;">
      <div class="spinner"></div>
      <p style="color:#888;font-size:0.9rem;">Loading backtest data...</p>
    </div>
  `;
}

// --- Error State ---
function ErrorState(props) {
  return html`
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;gap:1rem;padding:2rem;text-align:center;">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
      <h2 style="color:#f1f5f9;font-size:1.25rem;font-weight:600;">Failed to Load Data</h2>
      <p style="color:#888;max-width:400px;font-size:0.875rem;">${props.message || 'Could not fetch backtest-dashboard-data.json. Ensure the file exists and is valid JSON.'}</p>
      <button onClick=${props.onRetry} style="margin-top:0.5rem;padding:0.6rem 1.5rem;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#e2e8f0;cursor:pointer;font-size:0.875rem;">Retry</button>
    </div>
  `;
}

// --- Summary Card ---
function SummaryCard(props) {
  return html`
    <div class="glass" style="padding:1.25rem;display:flex;flex-direction:column;gap:0.5rem;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <span class="stat-label">${props.label}</span>
        <span style="opacity:0.6;">${props.icon}</span>
      </div>
      <span class="stat-value" style="color:${props.color || '#f1f5f9'};">${props.value}</span>
      ${props.subtext ? html`<span style="font-size:0.75rem;color:#888;">${props.subtext}</span>` : null}
    </div>
  `;
}

// --- Summary Cards Grid ---
function SummaryCards(props) {
  var m = props.metrics;
  if (!m) return null;

  var cards = [
    {
      label: 'Total Trades',
      value: fmt.num(m.total_trades),
      subtext: m.wins + ' wins / ' + m.losses + ' losses',
      color: '#3b82f6',
      icon: Icons.trades
    },
    {
      label: 'Win Rate',
      value: fmt.pct(m.wr),
      subtext: 'Target: >50%',
      color: m.wr >= 0.5 ? '#22c55e' : '#ef4444',
      icon: Icons.target
    },
    {
      label: 'Profit Factor',
      value: fmt.dec2(m.pf),
      subtext: m.pf >= 1.0 ? 'Profitable' : 'Not profitable',
      color: m.pf >= 1.0 ? '#22c55e' : '#ef4444',
      icon: Icons.chart
    },
    {
      label: 'Sharpe Ratio',
      value: fmt.dec2(m.sharpe),
      subtext: m.sharpe >= 1.0 ? 'Good' : m.sharpe >= 0 ? 'Marginal' : 'Negative',
      color: m.sharpe >= 1.0 ? '#22c55e' : m.sharpe >= 0 ? '#facc15' : '#ef4444',
      icon: Icons.activity
    },
    {
      label: 'Max Drawdown',
      value: fmt.dec2(m.max_dd_pct) + '%',
      subtext: 'From peak equity',
      color: '#a78bfa',
      icon: Icons.shield
    },
    {
      label: 'Net Return',
      value: '${fmt.dec2(m.return_pct)}%',
      subtext: fmt.usd(m.total_return_usd) + ' profit',
      color: m.return_pct >= 0 ? '#22c55e' : '#ef4444',
      icon: m.return_pct >= 0 ? Icons.trendingUp : Icons.trendingDown
    }
  ];

  return html`
    <section>
      <h2 style="font-size:1.1rem;font-weight:600;margin-bottom:1rem;color:#f1f5f9;">Summary Statistics</h2>
      <div class="card-grid">
        ${cards.map(function (c) {
          return html`<${SummaryCard} key=${c.label} label=${c.label} value=${c.value} subtext=${c.subtext} color=${c.color} icon=${c.icon} />`;
        })}
      </div>
    </section>
  `;
}

// --- Equity Curve (Lightweight-Charts) ---
function EquityChart(props) {
  var containerRef = useRef(null);
  var chartRef = useRef(null);
  var curve = props.equityCurve;

  useEffect(function () {
    if (!containerRef.current || !curve || curve.length < 2) return;
    if (typeof LightweightCharts === 'undefined') {
      console.warn('LightweightCharts not loaded');
      return;
    }

    var container = containerRef.current;
    var chart = LightweightCharts.createChart(container, {
      layout: {
        background: { color: 'transparent' },
        textColor: '#888',
        fontSize: 11
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' }
      },
      width: container.clientWidth,
      height: 400,
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: { color: 'rgba(255,255,255,0.12)', width: 1, style: 2, labelBackgroundColor: '#333' },
        horzLine: { color: 'rgba(255,255,255,0.12)', width: 1, style: 2, labelBackgroundColor: '#333' }
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        tickMarkFormatter: function (time) { return '#' + time; }
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.06)',
      },
      handleScroll: { vertTouchDrag: false },
    });

    var lineSeries = chart.addLineSeries({
      color: '#22c55e',
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBackgroundColor: '#22c55e',
      priceFormat: {
        type: 'custom',
        formatter: function (p) { return '$' + p.toFixed(2); }
      },
      lastValueVisible: true,
      priceLineVisible: false,
    });

    var chartData = curve.map(function (v, i) {
      return { time: i, value: v };
    });
    lineSeries.setData(chartData);
    chart.timeScale().fitContent();
    chartRef.current = chart;

    // Baseline at $10,000
    var baselineSeries = chart.addLineSeries({
      color: 'rgba(255,255,255,0.08)',
      lineWidth: 1,
      lineStyle: 2,
      priceFormat: { type: 'custom', formatter: function (p) { return '$' + p.toFixed(2); } },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    baselineSeries.setData([
      { time: 0, value: 10000 },
      { time: curve.length - 1, value: 10000 }
    ]);

    function onResize() {
      if (chartRef.current && container) {
        chartRef.current.applyOptions({ width: container.clientWidth });
      }
    }
    window.addEventListener('resize', onResize);

    return function () {
      window.removeEventListener('resize', onResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [curve]);

  return html`<section>
    <h2 style="font-size:1.1rem;font-weight:600;margin-bottom:1rem;color:#f1f5f9;">Equity Curve</h2>
    <div class="glass" style="padding:0.5rem;overflow:hidden;">
      <div ref=${containerRef} class="chart-container"></div>
    </div>
  </section>`;
}

// --- Sortable Table Hook-like helpers ---
function useSort(initialKey, initialDir) {
  initialKey = initialKey || '';
  initialDir = initialDir || 'asc';
  var state = React.useState({ key: initialKey, dir: initialDir });
  var sortState = state[0];
  var setSortState = state[1];

  var toggle = useCallback(function (key) {
    setSortState(function (prev) {
      if (prev.key === key) {
        return { key: key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { key: key, dir: 'asc' };
    });
  }, []);

  var sorted = useCallback(function (items, accessor) {
    return [].concat(items).sort(function (a, b) {
      var va = accessor ? accessor(a, sortState.key) : a[sortState.key];
      var vb = accessor ? accessor(b, sortState.key) : b[sortState.key];
      if (va == null) return 1;
      if (vb == null) return -1;
      var cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortState.dir === 'asc' ? cmp : -cmp;
    });
  }, [sortState]);

  return { sortKey: sortState.key, sortDir: sortState.dir, toggle: toggle, sorted: sorted };
}

// --- Sortable Table Header ---
function SortTH(props) {
  var active = props.sortKey === props.colKey;
  var arrow = active ? (props.sortDir === 'asc' ? ' ▴' : ' ▾') : '';
  var arrowCls = active ? 'sort-arrow active' : 'sort-arrow';
  return html`
    <th onClick=${function () { props.onSort(props.colKey); }} style="min-width:${props.minWidth || 'auto'};">
      ${props.label}
      <span class="${arrowCls}"></span>
    </th>
  `;
}

// --- Threshold Sweep Table ---
function ThresholdSweepTable(props) {
  var sweep = props.sweep || [];
  var bestThresh = props.bestThreshold;
  var bestPf = props.bestPfThreshold;
  var sort = useSort('threshold', 'asc');

  var sortedData = sort.sorted(sweep);

  return html`
    <section>
      <h2 style="font-size:1.1rem;font-weight:600;margin-bottom:1rem;color:#f1f5f9;">
        Threshold Sweep
        <span style="font-weight:400;font-size:0.8rem;color:#888;margin-left:0.5rem;">
          (${sweep.length} thresholds)
        </span>
      </h2>
      <div class="glass" style="overflow:hidden;">
        <div class="table-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <${SortTH} label="Threshold" colKey="threshold" sortKey=${sort.sortKey} sortDir=${sort.sortDir} onSort=${sort.toggle} />
                <${SortTH} label="Pass %" colKey="pass_pct" sortKey=${sort.sortKey} sortDir=${sort.sortDir} onSort=${sort.toggle} />
                <${SortTH} label="Trades" colKey="trades" sortKey=${sort.sortKey} sortDir=${sort.sortDir} onSort=${sort.toggle} />
                <${SortTH} label="Win Rate" colKey="wr" sortKey=${sort.sortKey} sortDir=${sort.sortDir} onSort=${sort.toggle} />
                <${SortTH} label="Profit Factor" colKey="pf" sortKey=${sort.sortKey} sortDir=${sort.sortDir} onSort=${sort.toggle} />
                <${SortTH} label="Sharpe" colKey="sharpe" sortKey=${sort.sortKey} sortDir=${sort.sortDir} onSort=${sort.toggle} />
                <${SortTH} label="Max DD %" colKey="max_dd" sortKey=${sort.sortKey} sortDir=${sort.sortDir} onSort=${sort.toggle} />
              </tr>
            </thead>
            <tbody>
              ${sortedData.map(function (row) {
                var isBest = bestThresh && Math.abs(row.threshold - bestThresh.threshold) < 0.001;
                var isBestPf = bestPf && Math.abs(row.threshold - bestPf.threshold) < 0.001;
                var cls = isBest ? 'highlight' : isBestPf ? 'best-pf' : '';
                return html`
                  <tr key=${row.threshold} class="${cls}">
                    <td style="font-weight:600;">${fmt.dec2(row.threshold)}${isBest ? html` <span class="badge badge-green">best</span>` : ''}${isBestPf && !isBest ? html` <span class="badge badge-blue">best pf</span>` : ''}</td>
                    <td>${fmt.dec2(row.pass_pct)}%</td>
                    <td>${fmt.num(row.trades)}</td>
                    <td class="${fmt.valClass(row.wr - 0.5)}">${fmt.pct(row.wr)}</td>
                    <td class="${fmt.valClass(row.pf - 1)}">${fmt.dec2(row.pf)}</td>
                    <td class="${fmt.valClass(row.sharpe)}">${fmt.dec2(row.sharpe)}</td>
                    <td class="${row.max_dd >= 30 ? 'val-neg' : 'val-neutral'}">${fmt.dec2(row.max_dd)}%</td>
                  </tr>
                `;
              })}
            </tbody>
          </table>
        </div>
      </div>
      ${bestThresh ? html`
        <div style="margin-top:0.75rem;display:flex;gap:1rem;flex-wrap:wrap;font-size:0.8rem;color:#888;">
          <span><span class="badge badge-green" style="margin-right:0.5rem;">best</span> Best Sharpe threshold: ${fmt.dec2(bestThresh.threshold)} (WR ${fmt.pct(bestThresh.wr)}, PF ${fmt.dec2(bestThresh.pf)})</span>
          ${bestPf ? html`
            <span><span class="badge badge-blue" style="margin-right:0.5rem;">best pf</span> Best PF threshold: ${fmt.dec2(bestPf.threshold)} (WR ${fmt.pct(bestPf.wr)}, PF ${fmt.dec2(bestPf.pf)})</span>
          ` : null}
        </div>
      ` : null}
    </section>
  `;
}

// --- Per-Pair Breakdown ---
function PerPairTable(props) {
  var pairs = props.pairs || [];
  var sort = useSort('trades', 'desc');
  var PAGE_SIZE = 10;
  var pageState = React.useState(0);
  var page = pageState[0];
  var setPage = pageState[1];

  var sortedData = sort.sorted(pairs);
  var totalPages = Math.max(1, Math.ceil(sortedData.length / PAGE_SIZE));
  var pagedData = sortedData.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page when data changes
  useEffect(function () { setPage(0); }, [pairs.length]);

  return html`
    <section>
      <h2 style="font-size:1.1rem;font-weight:600;margin-bottom:1rem;color:#f1f5f9;">
        Per-Pair Breakdown
        <span style="font-weight:400;font-size:0.8rem;color:#888;margin-left:0.5rem;">
          (${pairs.length} pairs)
        </span>
      </h2>
      <div class="glass" style="overflow:hidden;">
        <div class="table-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <${SortTH} label="Symbol" colKey="symbol" sortKey=${sort.sortKey} sortDir=${sort.sortDir} onSort=${sort.toggle} />
                <${SortTH} label="Trades" colKey="trades" sortKey=${sort.sortKey} sortDir=${sort.sortDir} onSort=${sort.toggle} />
                <${SortTH} label="Win Rate" colKey="wr" sortKey=${sort.sortKey} sortDir=${sort.sortDir} onSort=${sort.toggle} />
                <${SortTH} label="Profit Factor" colKey="pf" sortKey=${sort.sortKey} sortDir=${sort.sortDir} onSort=${sort.toggle} />
                <${SortTH} label="Net PnL (R)" colKey="net_pnl_r" sortKey=${sort.sortKey} sortDir=${sort.sortDir} onSort=${sort.toggle} minWidth="120px" />
                <${SortTH} label="Sharpe" colKey="sharpe" sortKey=${sort.sortKey} sortDir=${sort.sortDir} onSort=${sort.toggle} />
              </tr>
            </thead>
            <tbody>
              ${pagedData.length === 0 ? html`
                <tr><td colspan="6" style="text-align:center;padding:2rem;color:#666;">No per-pair data available</td></tr>
              ` : pagedData.map(function (row) {
                return html`
                  <tr key=${row.symbol}>
                    <td style="font-weight:600;">${row.symbol}</td>
                    <td>${fmt.num(row.trades)}</td>
                    <td class="${fmt.valClass(row.wr - 0.5)}">${fmt.pct(row.wr)}</td>
                    <td class="${fmt.valClass(row.pf - 1)}">${fmt.dec2(row.pf)}</td>
                    <td class="${fmt.valClass(row.net_pnl_r)}">${row.net_pnl_r >= 0 ? '+' : ''}${fmt.dec2(row.net_pnl_r)}</td>
                    <td class="${fmt.valClass(row.sharpe)}">${fmt.dec2(row.sharpe)}</td>
                  </tr>
                `;
              })}
            </tbody>
          </table>
        </div>
      </div>
      ${totalPages > 1 ? html`
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:0.75rem;">
          <span style="font-size:0.8rem;color:#888;">Page ${page + 1} of ${totalPages}</span>
          <div style="display:flex;gap:0.5rem;">
            <button class="page-btn" disabled=${page === 0} onClick=${function () { setPage(Math.max(0, page - 1)); }}>Prev</button>
            ${Array.from({ length: totalPages }, function (_, i) {
              return html`<button key=${i} class="page-btn ${i === page ? 'active' : ''}" onClick=${function () { setPage(i); }}>${i + 1}</button>`;
            })}
            <button class="page-btn" disabled=${page >= totalPages - 1} onClick=${function () { setPage(Math.min(totalPages - 1, page + 1)); }}>Next</button>
          </div>
        </div>
      ` : null}
    </section>
  `;
}

// --- Feature Importance (SVG Bar Chart) ---
function FeatureImportance(props) {
  var features = props.features || {};
  var entries = useMemo(function () {
    return Object.entries(features)
      .map(function (e) { return { name: e[0], value: e[1] }; })
      .sort(function (a, b) { return b.value - a.value; })
      .slice(0, 20); // Top 20 features
  }, [features]);

  if (entries.length === 0) {
    return html`<section>
      <h2 style="font-size:1.1rem;font-weight:600;margin-bottom:1rem;color:#f1f5f9;">Feature Importance</h2>
      <div class="glass" style="padding:2rem;text-align:center;color:#666;">No feature importance data available</div>
    </section>`;
  }

  var maxVal = entries[0].value;
  var BAR_HEIGHT = 24;
  var ROW_GAP = 4;
  var ROW_HEIGHT = BAR_HEIGHT + ROW_GAP;
  var LABEL_WIDTH = 180;
  var VALUE_WIDTH = 60;
  var SVG_HEIGHT = entries.length * ROW_HEIGHT + 10;
  var BAR_MAX_WIDTH = 600;

  return html`
    <section>
      <h2 style="font-size:1.1rem;font-weight:600;margin-bottom:1rem;color:#f1f5f9;">
        Feature Importance
        <span style="font-weight:400;font-size:0.8rem;color:#888;margin-left:0.5rem;">
          (top ${entries.length} features)
        </span>
      </h2>
      <div class="glass" style="padding:1.25rem;">
        <svg viewBox="0 0 ${LABEL_WIDTH + BAR_MAX_WIDTH + VALUE_WIDTH} ${SVG_HEIGHT}" style="width:100%;height:auto;">
          <defs>
            <linearGradient id="featGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#3b82f6" />
              <stop offset="100%" stop-color="#22c55e" />
            </linearGradient>
          </defs>
          ${entries.map(function (f, i) {
            var y = i * ROW_HEIGHT + 4;
            var barW = (f.value / maxVal) * BAR_MAX_WIDTH;
            return html`
              <g key=${f.name} transform="translate(0, ${y})">
                <text x="${LABEL_WIDTH - 8}" y="15" fill="#888" font-size="11" text-anchor="end" font-family="system-ui,sans-serif">${f.name}</text>
                <rect x="${LABEL_WIDTH}" y="1" width="${Math.max(barW, 2)}" height="${BAR_HEIGHT - 2}" fill="url(#featGrad)" rx="3" class="feat-bar" />
                <text x="${LABEL_WIDTH + barW + 8}" y="15" fill="#e2e8f0" font-size="11" font-family="system-ui,sans-serif">${f.value}</text>
              </g>
            `;
          })}
        </svg>
      </div>
    </section>
  `;
}

// --- Model Info ---
function ModelInfo(props) {
  var model = props.model;
  var split = props.split;
  var data = props.data;
  if (!model) return null;

  return html`
    <section>
      <h2 style="font-size:1.1rem;font-weight:600;margin-bottom:1rem;color:#f1f5f9;">Model Configuration</h2>
      <div class="glass" style="padding:1.25rem;">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1rem;">
          <div>
            <div style="font-size:0.7rem;color:#888;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.25rem;">Model Type</div>
            <div style="font-weight:600;">${model.type || 'N/A'}</div>
          </div>
          <div>
            <div style="font-size:0.7rem;color:#888;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.25rem;">Trees</div>
            <div style="font-weight:600;">${model.trees || 'N/A'}</div>
          </div>
          <div>
            <div style="font-size:0.7rem;color:#888;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.25rem;">Data Pairs</div>
            <div style="font-weight:600;">${data ? data.pairs : 'N/A'}</div>
          </div>
          <div>
            <div style="font-size:0.7rem;color:#888;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.25rem;">Total Rows</div>
            <div style="font-weight:600;">${data ? fmt.num(data.total_rows) : 'N/A'}</div>
          </div>
          <div>
            <div style="font-size:0.7rem;color:#888;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.25rem;">Baseline WR</div>
            <div style="font-weight:600;">${data ? fmt.pct(data.baseline_wr) : 'N/A'}</div>
          </div>
          <div>
            <div style="font-size:0.7rem;color:#888;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.25rem;">Split Method</div>
            <div style="font-weight:600;">${split ? split.method : 'N/A'}</div>
          </div>
          ${split ? html`
            <div>
              <div style="font-size:0.7rem;color:#888;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.25rem;">Train / Val / Test</div>
              <div style="font-weight:600;">${fmt.num(split.train_rows)} / ${fmt.num(split.val_rows)} / ${fmt.num(split.test_rows)}</div>
            </div>
            <div style="grid-column:1/-1;">
              <div style="font-size:0.7rem;color:#888;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.25rem;">Time Range</div>
              <div style="font-weight:600;">Train: ${split.train_start} to ${split.train_end}</div>
              <div style="font-weight:600;color:#888;font-size:0.85rem;">Test: ${split.test_start} to ${split.test_end}</div>
            </div>
          ` : null}
        </div>
      </div>
    </section>
  `;
}

// --- Regime Breakdown ---
function RegimeBreakdown(props) {
  var regime = props.regime;
  if (!regime) return null;
  var labels = { momentum: 'Momentum', reversal: 'Reversal', other: 'Other' };
  var colors = { momentum: '#3b82f6', reversal: '#a78bfa', other: '#facc15' };

  return html`
    <section>
      <h2 style="font-size:1.1rem;font-weight:600;margin-bottom:1rem;color:#f1f5f9;">Market Regime Performance</h2>
      <div class="card-grid">
        ${Object.keys(regime).map(function (key) {
          var r = regime[key];
          var label = labels[key] || key;
          var color = colors[key] || '#888';
          return html`
            <div key=${key} class="glass regime-card">
              <div style="font-size:0.7rem;color:#888;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.5rem;">${label}</div>
              <div style="display:flex;justify-content:center;gap:1.5rem;flex-wrap:wrap;">
                <div>
                  <div style="font-size:0.65rem;color:#555;text-transform:uppercase;margin-bottom:0.15rem;">Trades</div>
                  <div style="font-weight:700;font-size:1.1rem;color:${color};">${fmt.num(r.trades)}</div>
                </div>
                <div>
                  <div style="font-size:0.65rem;color:#555;text-transform:uppercase;margin-bottom:0.15rem;">Win Rate</div>
                  <div style="font-weight:700;font-size:1.1rem;color:${color};">${fmt.pct(r.wr)}</div>
                </div>
                <div>
                  <div style="font-size:0.65rem;color:#555;text-transform:uppercase;margin-bottom:0.15rem;">PF</div>
                  <div style="font-weight:700;font-size:1.1rem;color:${color};">${fmt.dec2(r.pf)}</div>
                </div>
              </div>
            </div>
          `;
        })}
      </div>
    </section>
  `;
}

// --- Header ---
function Header(props) {
  var d = props.data;
  var ts = d ? fmt.timeFromTimestamp(d.timestamp) : '';
  return html`
    <header style="padding:2rem 0 1.5rem;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
        <div>
          <h1 style="font-size:1.75rem;font-weight:700;color:#f1f5f9;margin-bottom:0.25rem;">Backtest Dashboard</h1>
          <p style="color:#888;font-size:0.875rem;">
            ${ts ? 'Report: ' + ts : ''}
            ${d && d.version ? html`<span style="margin-left:0.75rem;padding:0.15rem 0.5rem;background:rgba(255,255,255,0.04);border-radius:4px;font-size:0.75rem;">${d.version}</span>` : ''}
          </p>
        </div>
        ${d && d.detailed_metrics ? html`
          <div style="text-align:right;">
            <div style="font-size:1.25rem;font-weight:700;" class="${fmt.valClass(d.detailed_metrics.return_pct)}">
              ${d.detailed_metrics.return_pct >= 0 ? '+' : ''}${fmt.dec2(d.detailed_metrics.return_pct)}%
            </div>
            <div style="font-size:0.75rem;color:#888;">Total Return</div>
          </div>
        ` : null}
      </div>
      <div class="accent-stripe" style="margin-top:1rem;"></div>
    </header>
  `;
}

// --- Footer ---
function Footer() {
  return html`
    <footer style="padding:1.5rem 0;text-align:center;font-size:0.75rem;color:#555;">
      Anavitrade Backtest Dashboard &mdash; Powered by ML Pipeline v1 &mdash;
      <a href="#" style="color:#3b82f6;text-decoration:none;" onClick=${function (e) { e.preventDefault(); window.location.reload(); }}>Reload</a>
    </footer>
  `;
}

// ============================================================
// APP — Root Component
// ============================================================
function App() {
  var state = React.useState('loading'); // loading | error | loaded
  var loadState = state[0];
  var setLoadState = state[1];
  var dataState = React.useState(null);
  var data = dataState[0];
  var setData = dataState[1];

  var fetchData = useCallback(function () {
    setLoadState('loading');
    fetch('./backtest-dashboard-data.json')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + res.statusText);
        return res.json();
      })
      .then(function (json) {
        setData(json);
        setLoadState('loaded');
      })
      .catch(function (err) {
        console.error('Failed to load backtest data:', err);
        setLoadState('error');
      });
  }, []);

  useEffect(function () { fetchData(); }, []);

  if (loadState === 'loading') return html`<${LoadingSpinner} />`;
  if (loadState === 'error') return html`<${ErrorState} onRetry=${fetchData} />`;

  var d = data;
  if (!d || !d.detailed_metrics) {
    return html`<${ErrorState} message="Backtest data is missing required fields." onRetry=${fetchData} />`;
  }

  var metrics = d.detailed_metrics;

  return html`
    <div class="container">
      <${Header} data=${d} />

      <div style="display:flex;flex-direction:column;gap:2rem;padding-bottom:2rem;">
        <${SummaryCards} metrics=${metrics} />
        <${ModelInfo} model=${d.model} split=${d.split} data=${d.data} />
        <${EquityChart} equityCurve=${metrics.equity_curve} />
        <${ThresholdSweepTable} sweep=${d.threshold_sweep} bestThreshold=${d.best_threshold} bestPfThreshold=${d.best_pf_threshold} />
        <${PerPairTable} pairs=${metrics.per_pair} />
        <${FeatureImportance} features=${d.feature_importance} />
        ${metrics.regime_breakdown ? html`<${RegimeBreakdown} regime=${metrics.regime_breakdown} />` : null}
      </div>

      <${Footer} />
    </div>
  `;
}

// ============================================================
// MOUNT
// ============================================================
var rootEl = document.getElementById('root');
if (rootEl) {
  var root = createRoot(rootEl);
  root.render(html`<${App} />`);
}
