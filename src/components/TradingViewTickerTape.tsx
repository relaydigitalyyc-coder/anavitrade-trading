import { useEffect, useRef } from "react";

export default function TradingViewTickerTape() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbols: [
        { description: "BTC/USDT", proName: "BINANCE:BTCUSDT" },
        { description: "ETH/USDT", proName: "BINANCE:ETHUSDT" },
        { description: "SOL/USDT", proName: "BINANCE:SOLUSDT" },
        { proName: "BINANCE:VANRYUSDT" },
        { proName: "BINANCE:BLURUSDT" },
        { proName: "BINANCE:HEMIUSDT" },
        { proName: "BINANCE:LINKUSDT" },
        { proName: "BINANCE:DOGEUSDT" },
      ],
      showSymbolLogo: true,
      colorTheme: "dark",
      isTransparent: true,
      displayMode: "compact",
      locale: "en",
    });
    containerRef.current.appendChild(script);
    return () => { script.remove(); };
  }, []);

  return <div ref={containerRef} className="tradingview-ticker-tape w-full h-[48px]" />;
}
