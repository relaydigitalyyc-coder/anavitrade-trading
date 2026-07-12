import { motion } from "framer-motion";
import { RefreshCw, BarChart3, Activity, TrendingUp, TrendingDown } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";

interface PortfolioChartPanelProps {
  isDemoMode: boolean;
  anyConnected: boolean;
  demoPortfolioSeries: { label?: string; value: number }[] | undefined;
  portfolioData: { day: string; value: number }[];
  demoStartingCapital: number;
  totalPnl: number;
  pnlPct: string;
  syncPending: boolean;
  onSync: () => void;
}

export default function PortfolioChartPanel({
  isDemoMode, anyConnected, demoPortfolioSeries, portfolioData,
  demoStartingCapital, totalPnl, pnlPct, syncPending, onSync,
}: PortfolioChartPanelProps) {
  return (
    <div className="lg:col-span-2 p-6 rounded-2xl border relative overflow-hidden"
      style={{ background: "linear-gradient(145deg, oklch(0.12 0.022 250 / 0.90), oklch(0.09 0.018 255 / 0.95))", borderColor: "oklch(0.60 0.22 220 / 0.18)", backdropFilter: "blur(16px)" }}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{isDemoMode ? "Demo Portfolio Growth" : "Portfolio Growth"}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isDemoMode ? "Simulated equity curve from signal history" : (anyConnected ? "Live account equity curve" : "Connect a wallet to see your real equity curve")}
          </p>
        </div>
        {isDemoMode && (
          <button
            onClick={onSync}
            disabled={syncPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all disabled:opacity-50"
            style={{ borderColor: "oklch(0.60 0.22 220 / 0.25)" }}
          >
            <RefreshCw className={`w-3 h-3 ${syncPending ? "animate-spin" : ""}`} />
            {syncPending ? "Syncing..." : "Sync Signals"}
          </button>
        )}
        {!isDemoMode && anyConnected && (
          <div className={`flex items-center gap-1.5 text-sm font-semibold ${totalPnl >= 0 ? "text-primary" : "text-red-400"}`}>
            {totalPnl >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {totalPnl >= 0 ? "+" : ""}{pnlPct}%
          </div>
        )}
      </div>

      {isDemoMode && demoPortfolioSeries && demoPortfolioSeries.length > 0 ? (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={demoPortfolioSeries}>
            <defs>
              <linearGradient id="demoGradChart" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.82 0.16 85)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="oklch(0.82 0.16 85)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.06)" opacity={0.4} />
            <XAxis dataKey="label" tick={{ fill: "oklch(0.50 0.015 260)", fontSize: 10 }} tickLine={false} axisLine={false} interval={6} />
            <YAxis domain={["dataMin", "dataMax"]} tick={{ fill: "oklch(0.50 0.015 260)", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              contentStyle={{ background: "oklch(0.10 0.018 250 / 0.96)", border: "1px solid oklch(0.60 0.22 220 / 0.25)", borderRadius: "12px", fontSize: "12px" }}
              labelStyle={{ color: "oklch(0.62 0.020 240)" }}
              formatter={(v: number) => [`$${v.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, "Balance"]}
            />
            <ReferenceLine y={demoStartingCapital} stroke="oklch(1 0 0 / 0.15)" strokeDasharray="3 3" />
            <Area type="monotone" dataKey="value" stroke="oklch(0.82 0.16 85)" strokeWidth={2.5} fill="url(#demoGradChart)" dot={false} isAnimationActive animationDuration={1200} animationEasing="ease-out" />
          </AreaChart>
        </ResponsiveContainer>
      ) : isDemoMode && syncPending ? (
        <div className="flex items-center justify-center h-[200px] gap-2 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span className="text-sm">Syncing demo signals...</span>
        </div>
      ) : isDemoMode ? (
        <div className="flex flex-col items-center justify-center h-[200px] gap-3 text-center">
          <BarChart3 className="w-8 h-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No demo trades yet. Click "Sync Signals" above to get started.</p>
        </div>
      ) : anyConnected && portfolioData.length > 0 ? (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={portfolioData}>
            <defs>
              <linearGradient id="dashGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.60 0.22 220)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="oklch(0.60 0.22 220)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis dataKey="day" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} interval={6} />
            <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: "12px" }}
              labelStyle={{ color: "hsl(var(--muted-foreground))" }}
              itemStyle={{ color: "hsl(var(--primary))" }}
              formatter={(v: number) => [`$${v.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, "Balance"]}
            />
            <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#dashGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex flex-col items-center justify-center h-[200px] gap-3 text-center">
          <Activity className="w-8 h-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {anyConnected ? "No trade history yet — equity curve will appear once trades execute" : "Connect a wallet above to start copy-trading and see your real equity curve here"}
          </p>
          {!anyConnected && (
            <button
              onClick={() => document.querySelector<HTMLButtonElement>('[data-wallet-connect-btn]')?.click()}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Connect Wallet →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
