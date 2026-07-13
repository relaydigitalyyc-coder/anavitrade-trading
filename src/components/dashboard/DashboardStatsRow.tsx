import { motion, useReducedMotion } from "framer-motion";
import {
  Activity, CirclePause, DollarSign, Shield, TrendingDown, TrendingUp, WifiOff,
} from "lucide-react";

interface StatsCard {
  label: string;
  value: string;
  icon: React.ReactNode;
  sub: string;
  tone: "azure" | "gold" | "neutral" | "danger";
  status: string;
}

interface DashboardStatsRowProps {
  isDemoMode: boolean;
  demoCurrentBalance: number;
  demoTotalPnl: number;
  demoPnlPercent: string;
  anyConnected: boolean;
  killActive: boolean;
  web3Connected: boolean;
  currentBalance: number;
  totalPnl: number;
  pnlPct: string;
}

export default function DashboardStatsRow({
  isDemoMode, demoCurrentBalance, demoTotalPnl, demoPnlPercent,
  anyConnected, killActive, web3Connected,
  currentBalance, totalPnl, pnlPct,
}: DashboardStatsRowProps) {
  const prefersReducedMotion = useReducedMotion();
  const effectivePnl = isDemoMode ? demoTotalPnl : totalPnl;

  const stats: StatsCard[] = [
    {
      label: isDemoMode ? "Demo Balance" : "Portfolio Balance",
      value: isDemoMode
        ? `$${demoCurrentBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `$${currentBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: <DollarSign className="w-4 h-4" />,
      sub: isDemoMode ? "Simulated paper balance" : (anyConnected ? "Live account value" : "Connect wallet to track"),
      tone: isDemoMode ? "gold" : "azure",
      status: isDemoMode ? "Demo" : anyConnected ? "Live" : "Setup",
    },
    {
      label: "Total P&L",
      value: isDemoMode
        ? `${demoTotalPnl >= 0 ? "+" : ""}$${demoTotalPnl.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : (anyConnected
          ? `${totalPnl >= 0 ? "+" : ""}$${totalPnl.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : "—"),
      icon: (isDemoMode ? demoTotalPnl : totalPnl) >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />,
      sub: isDemoMode ? `${demoPnlPercent}% all time` : (anyConnected ? `${pnlPct}% all time` : "No live data yet"),
      tone: effectivePnl > 0 || isDemoMode ? "gold" : effectivePnl < 0 ? "danger" : "neutral",
      status: effectivePnl > 0 ? "Positive" : effectivePnl < 0 ? "Drawdown" : "Flat",
    },
    {
      label: "Open Positions",
      value: "0",
      icon: <Activity className="w-4 h-4" />,
      sub: "Active trades",
      tone: "neutral",
      status: "Idle",
    },
    {
      label: "Trading Status",
      value: killActive ? "Paused" : anyConnected ? "Active" : "Offline",
      icon: killActive ? <CirclePause className="w-4 h-4" /> : anyConnected ? <Shield className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />,
      sub: anyConnected
        ? killActive ? "Kill switch on" : web3Connected ? "Ledger/Web3 ready" : "Aster agent active"
        : "No wallet connected",
      tone: killActive ? "danger" : anyConnected ? "azure" : "neutral",
      status: killActive ? "Halted" : anyConnected ? "Ready" : "Offline",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 mb-8 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={{ delay: prefersReducedMotion ? 0 : i * 0.04, duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
          className="group relative"
        >
          <div className={`
            relative min-h-[148px] overflow-hidden rounded-2xl border p-4 transition-all duration-200
            hover:-translate-y-0.5 hover:shadow-lg motion-reduce:hover:translate-y-0
            ${stat.tone === "gold"
              ? "border-gold-30 bg-gradient-to-br from-gold-10 to-card shadow-gold-10/20"
              : stat.tone === "azure"
                ? "border-primary/25 bg-gradient-to-br from-card to-card/80 shadow-primary/10"
                : stat.tone === "danger"
                  ? "border-red-500/25 bg-gradient-to-br from-red-500/10 to-card"
                  : "border-border/50 bg-card hover:border-border/80"
            }
          `}>
            {stat.tone !== "neutral" && (
              <div
                className="absolute left-4 right-4 top-0 h-px bg-gradient-to-r from-transparent via-current to-transparent opacity-40"
                style={{ color: stat.tone === "gold" ? "oklch(0.82 0.16 85)" : stat.tone === "danger" ? "oklch(0.65 0.22 25)" : "oklch(0.60 0.22 220)" }}
              />
            )}

            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="block truncate text-xs font-medium uppercase text-muted-foreground">{stat.label}</span>
                <span className={`
                  mt-2 inline-flex min-h-6 items-center rounded-full border px-2 text-[11px] font-semibold
                  ${stat.tone === "gold"
                    ? "border-gold-30 bg-gold-10 text-gold"
                    : stat.tone === "azure"
                      ? "border-primary/20 bg-primary/10 text-primary"
                      : stat.tone === "danger"
                        ? "border-red-500/25 bg-red-500/10 text-red-400"
                        : "border-border/50 bg-muted/20 text-muted-foreground"
                  }
                `}>
                  {stat.status}
                </span>
              </div>
              <div className={`
                flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border
                ${stat.tone === "gold"
                  ? "border-gold-30 bg-gold-10 text-gold"
                  : stat.tone === "azure"
                    ? "border-primary/20 bg-primary/10 text-primary"
                    : stat.tone === "danger"
                      ? "border-red-500/25 bg-red-500/10 text-red-400"
                      : "border-border/50 bg-muted/30 text-muted-foreground"
                }
              `}>
                {stat.icon}
              </div>
            </div>

            <div className={`
              mb-1 font-heading text-2xl font-bold tracking-tight tabular
              ${stat.tone === "gold" ? "text-gold" : stat.tone === "danger" ? "text-red-400" : "text-foreground"}
            `}>
              {stat.value}
            </div>

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground/75">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-40" aria-hidden="true" />
              {stat.sub}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
