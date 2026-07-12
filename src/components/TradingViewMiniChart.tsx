import { useEffect, useRef, useState } from "react";

interface MiniChartProps {
  symbol?: string;
  entryPrice?: number | string;
  exitPrice?: number | string;
  market?: string;
}

export default function TradingViewMiniChart({ symbol = "BTCUSDT", entryPrice, exitPrice, market }: MiniChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const [error, setError] = useState(false);

  const resolvedSymbol = market || symbol;

  useEffect(() => {
    if (!containerRef.current || error) return;

    let chart: any;
    let candleSeries: any;

    async function init() {
      try {
        const { createChart, LineStyle } = await import("lightweight-charts");
        if (!containerRef.current) return;

        chart = createChart(containerRef.current, {
          width: containerRef.current.clientWidth,
          height: 120,
          layout: { background: { color: "transparent" }, textColor: "#6b7280" },
          grid: { vertLines: { color: "rgba(255,255,255,0.03)" }, horzLines: { color: "rgba(255,255,255,0.03)" } },
          crosshair: { mode: 0 },
          rightPriceScale: { visible: false },
          timeScale: { visible: false },
          handleScroll: false,
          handleScale: false,
        });

        candleSeries = chart.addCandlestickSeries({
          upColor: "#22c55e", downColor: "#ef4444", borderDownColor: "#ef4444", borderUpColor: "#22c55e",
          wickDownColor: "#ef4444", wickUpColor: "#22c55e",
        });

        const candles = await fetchKlines(resolvedSymbol);
        if (candles.length > 0) {
          candleSeries.setData(candles);
        }

        // Entry/exit markers
        const markers: any[] = [];
        if (entryPrice) {
          const price = typeof entryPrice === "string" ? parseFloat(entryPrice) : entryPrice;
          const bisect = findNearestTime(candles, price);
          if (bisect) markers.push({ time: bisect.time, position: "belowBar", color: "#22c55e", shape: "arrowUp", text: "ENTRY" });
        }
        if (exitPrice) {
          const price = typeof exitPrice === "string" ? parseFloat(exitPrice) : exitPrice;
          const bisect = findNearestTime(candles, price);
          if (bisect) markers.push({ time: bisect.time, position: "aboveBar", color: "#ef4444", shape: "arrowDown", text: "EXIT" });
        }
        if (markers.length > 0) candleSeries.setMarkers(markers);

        chartRef.current = chart;
      } catch {
        setError(true);
      }
    }

    init();

    return () => {
      if (chart) chart.remove();
    };
  }, [resolvedSymbol, entryPrice, exitPrice, error]);

  if (error) return <div className="h-[120px] flex items-center justify-center text-xs text-muted-foreground bg-muted/30 rounded">Chart unavailable</div>;

  return <div ref={containerRef} className="w-full h-[120px]" />;
}

async function fetchKlines(symbol: string, interval = "15m", limit = 30) {
  try {
    const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((k: any) => ({
      time: Math.floor(k[0] / 1000) as any,
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
    }));
  } catch { return []; }
}

function findNearestTime(candles: any[], price: number) {
  let nearest = candles[0];
  let minDiff = Infinity;
  for (const c of candles) {
    const diff = Math.abs(c.close - price);
    if (diff < minDiff) { minDiff = diff; nearest = c; }
  }
  return nearest;
}
