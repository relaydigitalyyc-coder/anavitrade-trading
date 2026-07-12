import { useEffect, useMemo, useRef, useState } from "react";

interface TradeChartSnapshotProps {
  pair: string;
  entryPrice: number;
  exitPrice: number | null;
  period?: string | null;
  openedAt?: Date | string | null;
  closedAt?: Date | string | null;
  height?: number;
  showPrices?: boolean;
  positive?: boolean;
}

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

const INTERVAL_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
  "1w": 7 * 24 * 60 * 60_000,
};

function toBinanceSymbol(pair: string): string {
  return pair.replace("/", "").toUpperCase();
}

function normalizePeriod(period?: string | null): keyof typeof INTERVAL_MS {
  switch (period) {
    case "5m":
    case "5min":
      return "5m";
    case "15m":
    case "15min":
      return "15m";
    case "30m":
    case "30min":
      return "30m";
    case "1h":
      return "1h";
    case "4h":
      return "4h";
    case "1D":
    case "1d":
      return "1d";
    case "1W":
    case "1w":
      return "1w";
    default:
      return "4h";
  }
}

function toDate(value?: Date | string | null): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function rangeForTrade(openedAt: Date | null, closedAt: Date | null, interval: keyof typeof INTERVAL_MS) {
  const intervalMs = INTERVAL_MS[interval];
  const now = Date.now();
  const openMs = openedAt?.getTime() ?? now - intervalMs * 80;
  const closeMs = closedAt?.getTime() ?? Math.max(openMs + intervalMs * 12, now);
  const durationMs = Math.max(intervalMs, closeMs - openMs);
  const padding = Math.max(intervalMs * 8, Math.min(durationMs * 0.35, intervalMs * 80));
  let startTime = openMs - padding;
  let endTime = closeMs + padding;
  const maxBars = 900;
  const maxWindowMs = intervalMs * maxBars;
  if (endTime - startTime > maxWindowMs) {
    const mid = openMs + durationMs / 2;
    startTime = mid - maxWindowMs / 2;
    endTime = mid + maxWindowMs / 2;
  }
  return { startTime: Math.max(0, Math.floor(startTime)), endTime: Math.floor(endTime), openMs, closeMs };
}

async function fetchKlines(symbol: string, interval: keyof typeof INTERVAL_MS, startTime: number, endTime: number): Promise<Candle[]> {
  const params = new URLSearchParams({
    symbol,
    interval,
    startTime: String(startTime),
    endTime: String(endTime),
    limit: "1000",
  });
  const res = await fetch(`https://api.binance.com/api/v3/klines?${params.toString()}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((k: any[]) => ({
    time: Math.floor(Number(k[0]) / 1000),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
  })).filter((c: Candle) => Number.isFinite(c.open) && Number.isFinite(c.time));
}

function nearestCandle(candles: Candle[], targetMs: number | null): Candle | null {
  if (!candles.length || targetMs == null) return null;
  const targetSec = Math.floor(targetMs / 1000);
  let nearest = candles[0];
  let min = Math.abs(candles[0].time - targetSec);
  for (const candle of candles) {
    const diff = Math.abs(candle.time - targetSec);
    if (diff < min) {
      nearest = candle;
      min = diff;
    }
  }
  return nearest;
}

function fmtPrice(value: number): string {
  if (value >= 1000) return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (value >= 1) return `$${value.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })}`;
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 5, maximumFractionDigits: 8 })}`;
}

function fmtDateTime(value: Date | null): string {
  if (!value) return "Open";
  return value.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TradeChartSnapshotInner({
  pair,
  entryPrice,
  exitPrice,
  period,
  openedAt,
  closedAt,
  height = 160,
  showPrices = true,
  positive = true,
}: TradeChartSnapshotProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const symbol = toBinanceSymbol(pair);
  const interval = normalizePeriod(period);
  const openDate = useMemo(() => toDate(openedAt), [openedAt]);
  const closeDate = useMemo(() => toDate(closedAt), [closedAt]);
  const dateLabel = `${fmtDateTime(openDate)} -> ${fmtDateTime(closeDate)}`;
  const exitColor = exitPrice != null
    ? (exitPrice >= entryPrice ? "text-green-400 border-green-500/30 bg-green-500/10" : "text-red-400 border-red-500/30 bg-red-500/10")
    : "text-muted-foreground border-white/10 bg-white/5";

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let chart: any;
    let resizeObserver: ResizeObserver | null = null;
    setLoading(true);
    setError(false);

    async function init() {
      try {
        const { createChart, LineStyle } = await import("lightweight-charts");
        if (!container || disposed) return;
        const { startTime, endTime, openMs, closeMs } = rangeForTrade(openDate, closeDate, interval);
        const candles = await fetchKlines(symbol, interval, startTime, endTime);
        if (disposed) return;
        if (candles.length === 0) throw new Error("No candles returned");

        chart = createChart(container, {
          width: container.clientWidth,
          height,
          layout: { background: { color: "#0a0f1a" }, textColor: "rgba(255,255,255,0.55)" },
          grid: { vertLines: { color: "rgba(255,255,255,0.035)" }, horzLines: { color: "rgba(255,255,255,0.035)" } },
          crosshair: { mode: 0 },
          rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.16, bottom: 0.18 } },
          timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, minBarSpacing: 4 },
          handleScroll: false,
          handleScale: false,
        });

        const series = chart.addCandlestickSeries({
          upColor: "#22c55e",
          downColor: "#ef4444",
          borderDownColor: "#ef4444",
          borderUpColor: "#22c55e",
          wickDownColor: "#ef4444",
          wickUpColor: "#22c55e",
          priceLineVisible: false,
        });
        series.setData(candles);

        const entryCandle = nearestCandle(candles, openMs);
        const exitCandle = nearestCandle(candles, closeDate ? closeMs : null);
        const markers: any[] = [];
        if (entryCandle) {
          markers.push({ time: entryCandle.time, position: "belowBar", color: "#60a5fa", shape: "arrowUp", text: "ENTRY" });
        }
        if (exitCandle && exitPrice != null) {
          markers.push({ time: exitCandle.time, position: exitPrice >= entryPrice ? "aboveBar" : "belowBar", color: exitPrice >= entryPrice ? "#22c55e" : "#ef4444", shape: exitPrice >= entryPrice ? "arrowDown" : "arrowUp", text: "EXIT" });
        }
        if (markers.length) series.setMarkers(markers);

        if (Number.isFinite(entryPrice) && entryPrice > 0) {
          series.createPriceLine({ price: entryPrice, color: "#60a5fa", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "Entry" });
        }
        if (exitPrice != null && Number.isFinite(exitPrice) && exitPrice > 0) {
          series.createPriceLine({ price: exitPrice, color: exitPrice >= entryPrice ? "#22c55e" : "#ef4444", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "Exit" });
        }

        chart.timeScale().setVisibleRange({ from: Math.floor(startTime / 1000), to: Math.floor(endTime / 1000) });
        resizeObserver = new ResizeObserver(() => {
          if (!container || !chart) return;
          chart.applyOptions({ width: container.clientWidth, height });
        });
        resizeObserver.observe(container);
        setLoading(false);
      } catch {
        if (!disposed) {
          setError(true);
          setLoading(false);
        }
      }
    }

    init();
    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      if (chart) chart.remove();
    };
  }, [symbol, interval, openDate?.getTime(), closeDate?.getTime(), entryPrice, exitPrice, height]);

  return (
    <div className="relative w-full rounded-lg overflow-hidden border border-white/10 bg-[#0a0f1a]" style={{ height }}>
      <div ref={containerRef} className="w-full h-full" />
      {(loading || error) && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0f1a] text-xs text-muted-foreground">
          {error ? "Chart unavailable" : "Loading trade window..."}
        </div>
      )}

      <div className="absolute top-2 left-2 pointer-events-none">
        <div className="rounded-md border border-white/10 bg-black/60 backdrop-blur-sm px-2 py-1">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{interval} trade window</div>
          <div className="text-[10px] text-white/80">{dateLabel}</div>
        </div>
      </div>

      {showPrices && (
        <>
          <div className="absolute bottom-2 left-2 pointer-events-none">
            <div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-black/60 backdrop-blur-sm px-2 py-1">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span className="text-[10px] text-muted-foreground">Entry</span>
              <span className="text-xs font-mono font-medium text-white">{fmtPrice(entryPrice)}</span>
            </div>
          </div>
          <div className="absolute bottom-2 right-2 pointer-events-none">
            <div className={`flex items-center gap-1.5 rounded-md border px-2 py-1 backdrop-blur-sm ${exitColor}`}>
              <span className={`w-2 h-2 rounded-full ${exitPrice != null ? (positive ? "bg-green-400" : "bg-red-400") : "bg-muted-foreground"}`} />
              <span className="text-[10px] text-muted-foreground">Exit</span>
              <span className="text-xs font-mono font-medium">{exitPrice != null ? fmtPrice(exitPrice) : "Open"}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function TradeChartSnapshot(props: TradeChartSnapshotProps) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const h = props.height ?? 160;
  if (!visible) {
    return <div ref={ref} className="rounded-lg bg-white/[0.02] animate-pulse border border-white/5" style={{ height: h }} />;
  }
  return <div ref={ref}><TradeChartSnapshotInner {...props} /></div>;
}
