import { ArrowDown, ArrowUp, Flame, Radio, Sparkles } from "lucide-react";

type TickerItem = {
  symbol: string;
  label: string;
  price: string;
  change: number;
  source: "market" | "signal";
};

type SignalLike = {
  id?: number;
  marketName?: string;
  price?: string | number;
  percentage24?: string | number | null;
  qualityTier?: string | null;
};

const fallbackTicker: TickerItem[] = [
  { symbol: "BTC/USDT", label: "Bitcoin", price: "$118,420", change: 2.14, source: "market" },
  { symbol: "ETH/USDT", label: "Ethereum", price: "$3,640", change: 1.42, source: "market" },
  { symbol: "SOL/USDT", label: "Solana", price: "$184.20", change: 4.86, source: "market" },
  { symbol: "BNB/USDT", label: "BNB", price: "$812.10", change: -0.72, source: "market" },
  { symbol: "VANRY/USDT", label: "Vanar", price: "$0.0432", change: 7.38, source: "market" },
  { symbol: "SUI/USDT", label: "Sui", price: "$4.18", change: 3.05, source: "market" },
];

function formatPrice(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "Signal";
  if (n < 0.001) return `$${n.toFixed(6)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  if (n < 1000) return `$${n.toFixed(2)}`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fromSignals(signals: SignalLike[]): TickerItem[] {
  return signals
    .filter((signal) => signal.marketName)
    .slice(0, 6)
    .map((signal) => {
      const change = Number(signal.percentage24 ?? 0);
      const symbol = String(signal.marketName).replace("USDT", "/USDT");
      return {
        symbol,
        label: signal.qualityTier === "A" ? "Tier A signal" : "Signal watch",
        price: formatPrice(signal.price),
        change: Number.isFinite(change) ? change : 0,
        source: "signal",
      };
    });
}

function TickerPill({ item, decorative = false }: { item: TickerItem; decorative?: boolean }) {
  const positive = item.change >= 0;
  const Icon = positive ? ArrowUp : ArrowDown;

  return (
    <li className="ticker-pill" aria-hidden={decorative || undefined}>
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
            item.source === "signal"
              ? "border-gold-30 bg-gold-10 text-gold"
              : "border-primary/20 bg-primary/10 text-primary"
          }`}
          aria-hidden="true"
        >
          {item.source === "signal" ? <Flame className="h-3.5 w-3.5" /> : <Radio className="h-3.5 w-3.5" />}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-mono text-xs font-bold text-foreground tabular">{item.symbol}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{item.label}</span>
        </span>
      </div>
      <div className="text-right">
        <div className="font-mono text-xs font-semibold text-foreground tabular">{item.price}</div>
        <div className={`inline-flex items-center justify-end gap-1 font-mono text-[11px] font-semibold tabular ${positive ? "text-primary" : "text-red-400"}`}>
          <Icon className="h-3 w-3" />
          <span>{positive ? "+" : ""}{item.change.toFixed(2)}%</span>
        </div>
      </div>
    </li>
  );
}

export default function MarketTickerRail({ topSignals = [] }: { topSignals?: SignalLike[] }) {
  const signalTicker = fromSignals(topSignals);
  const tickerItems = signalTicker.length >= 4
    ? signalTicker
    : [
        ...signalTicker,
        ...fallbackTicker.filter((item) => !signalTicker.some((signal) => signal.symbol === item.symbol)),
      ].slice(0, 6);
  const loopItems = [...tickerItems, ...tickerItems];

  return (
    <section className="glass-card mb-6 overflow-hidden rounded-2xl border-border/50" aria-labelledby="market-ticker-heading">
      <div className="flex flex-col gap-3 border-b border-border/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h2 id="market-ticker-heading" className="text-sm font-semibold text-foreground">Market Pulse</h2>
            <p className="text-xs text-muted-foreground">Live watchlist and top signal momentum</p>
          </div>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-gold-30 bg-gold-10 px-3 py-1 text-xs font-semibold text-gold">
          <Flame className="h-3.5 w-3.5" />
          Winners highlighted
        </div>
      </div>

      <div className="ticker-mask" aria-label="Current market and signal highlights">
        <ul className="ticker-track">
          {loopItems.map((item, index) => (
            <TickerPill key={`${item.symbol}-${index}`} item={item} decorative={index >= tickerItems.length} />
          ))}
        </ul>
      </div>
    </section>
  );
}
