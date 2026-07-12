type MiniMarket = {
  symbol: string;
  label: string;
};

const defaultMarkets: MiniMarket[] = [
  { symbol: "BINANCE:BTCUSDT", label: "BTC" },
  { symbol: "BINANCE:ETHUSDT", label: "ETH" },
  { symbol: "BINANCE:SOLUSDT", label: "SOL" },
  { symbol: "BINANCE:VANRYUSDT", label: "VANRY" },
];

function widgetHtml(symbol: string) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; width: 100%; height: 100%; background: #0a0f1a; overflow: hidden; }
      .tradingview-widget-container, .tradingview-widget-container__widget { width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <div class="tradingview-widget-container">
      <div class="tradingview-widget-container__widget"></div>
      <script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js" async>
      {
        "symbol": "${symbol}",
        "width": "100%",
        "height": "100%",
        "locale": "en",
        "dateRange": "1D",
        "colorTheme": "dark",
        "isTransparent": true,
        "autosize": true,
        "largeChartUrl": ""
      }
      </script>
    </div>
  </body>
</html>`;
}

export default function TradingViewMiniWidgets({ markets = defaultMarkets }: { markets?: MiniMarket[] }) {
  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-8">
      {markets.map((market) => (
        <div
          key={market.symbol}
          className="rounded-2xl overflow-hidden bg-[#0a0f1a] border border-white/10"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
            <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-white/45">
              {market.label}
            </span>
            <span className="text-[10px] text-emerald-300/70">TradingView</span>
          </div>
          <iframe
            title={`${market.label} TradingView chart`}
            srcDoc={widgetHtml(market.symbol)}
            className="h-[146px] w-full block"
            loading="lazy"
          />
        </div>
      ))}
    </section>
  );
}
